/**
 * 战斗特效状态机（T08 · 拆分⑥）。
 *
 * 【来源】自 `BattleScreen.tsx` **逐字抽取**：`hitstop` / `shake` / `hurt` / `warn` / `showHint` /
 * `lotus` / `relicFlows` / `relicGhosts` / `fxConsumed`，以及 `handleRelicDiscard` /
 * `handleRelicBurst` 与 4 个相关 `useEffect`。
 *
 * 【为什么必须由同屏层持有】归墟流光 / 莲花演出**不能挂在归墟面板里** —— 面板在化完最后一张的
 * 瞬间随 `phase` 切换而卸载，动画会被硬生生切断（实测流光元素数为 0，等于这个演出从来没播过）。
 * 抽成 Hook 只是把「持有者」从组件挪到同一屏的 Hook，生命周期与渲染位置完全等价。
 *
 * 【铁律逐字保留】
 * - 特效消费：`fxConsumed` 去重、`dispatch({ type:'CONSUME_FX' })` 与 `setHitstop(0)` 的
 *   **850ms** 定时、以及返回的 `window.clearTimeout` 清理函数。
 *   【T09 唯一改动】`fxKey` 在原「伤害数字 id 串 | 卡帧 | 弹反」之后**追加** `pendingFusion?.key`，
 *   使融合演出也走同一条去重 / 消费通道（拼接顺序其余部分不变，不引入回归）。
 * - 受击 `hurt`：由 `prevHpRef` 前后比对触发（只在掉血时 +1）。
 * - `showHint`：`state.turn > 1` 时自动收起。
 * - `warn`：**1600ms** 自动消失。
 * - 归墟流光清理延迟 **`RELIC_FLOW_MS + 1700`**；莲花演出 **1600ms**。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { BattleAction } from '../../game/engine/battle';
import type { BattleState } from '../../game/types';
import { playSfx } from '../../game/audio';
import type { FxHandle } from '../fx/Effects';
import type { DiscardFlow } from '../RelicPhase';
import { QI_BAR_TARGET, RELIC_FLOW_MS } from './constants';

/** 归墟流光：由弃牌点飞向底部阴阳炁条的一枚水墨光点 */
export interface RelicFlow {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  yang: boolean;
}

/** 归墟弃牌残影：半透明停留片刻，表示对手也看得到你弃了什么（留牌的心理战） */
export interface RelicGhost {
  id: number;
  name: string;
  yang: boolean;
}

/** 「大量归墟」金色水墨莲花演出的当前场次（`key` 用于重复触发时重放入场动画） */
export interface LotusBurst {
  key: number;
  yang: boolean;
}

/** `useBattleFx` 的返回值 */
export interface BattleFx {
  /** 卡帧剩余时长（ms，0 = 无卡帧） */
  hitstop: number;
  /** 震屏计数器（每次命中 +1，供 CSS 动画 key 重放） */
  shake: number;
  /** 玩家受击计数器 */
  hurt: number;
  /** 警告文案（不同系无法合体等），空串表示无 */
  warn: string;
  /** 警告文案写入器（供手牌交互复用） */
  setWarn: Dispatch<SetStateAction<string>>;
  /** 是否显示行内教学提示 */
  showHint: boolean;
  /** 教学提示开关写入器 */
  setShowHint: Dispatch<SetStateAction<boolean>>;
  /** 莲花演出（null = 未播放） */
  lotus: LotusBurst | null;
  /** 飞行中的归墟流光 */
  relicFlows: RelicFlow[];
  /** 停留中的弃牌残影 */
  relicGhosts: RelicGhost[];
  /** 归墟化去一张牌 → 生成流光与残影 */
  handleRelicDiscard: (flow: DiscardFlow) => void;
  /** 归墟一次化去足够多 → 绽放莲花 */
  handleRelicBurst: (discarded: number, yang: boolean) => void;
}

/**
 * 战斗特效状态机：卡帧 / 震屏 / 受击 / 警告 / 教学提示 / 归墟流光与莲花。
 *
 * @param state    战斗状态（读取待消费特效、玩家气血、回合数、日志）
 * @param dispatch 战斗 action 派发器（消费特效用）
 * @param fxRef    粒子层句柄（伤害数字爆裂用）
 * @returns 全部特效状态与两个归墟演出回调
 */
export function useBattleFx(
  state: BattleState,
  dispatch: (a: BattleAction) => void,
  fxRef: RefObject<FxHandle | null>,
): BattleFx {
  const [hitstop, setHitstop] = useState(0);
  const [shake, setShake] = useState(0);
  const [hurt, setHurt] = useState(0);
  const [warn, setWarn] = useState('');
  const [showHint, setShowHint] = useState(true);
  /** 「大量归墟」金色水墨莲花演出（key 用于重复触发时重放入场动画） */
  const [lotus, setLotus] = useState<LotusBurst | null>(null);
  const lotusSeq = useRef(0);
  /** 归墟流光 / 弃牌残影：必须由本 Hook 持有 —— 归墟面板化完最后一张就卸载了 */
  const [relicFlows, setRelicFlows] = useState<RelicFlow[]>([]);
  const [relicGhosts, setRelicGhosts] = useState<RelicGhost[]>([]);
  const relicSeq = useRef(0);
  const fxConsumed = useRef<string>('');

  /**
   * 归墟化去一张牌：生成飞向阴阳炁条的流光。
   *
   * 流光**不能**挂在归墟面板里 —— 面板在化完最后一张的瞬间随 phase 切换而卸载，
   * 动画会被硬生生切断（实测流光元素数为 0，等于这个演出从来没播过）。
   */
  const handleRelicDiscard = useCallback((flow: DiscardFlow) => {
    const id = ++relicSeq.current;
    const dx = QI_BAR_TARGET.x - flow.origin.x;
    const dy = QI_BAR_TARGET.y - flow.origin.y;
    setRelicFlows((f) => [...f, { id, x: flow.origin.x, y: flow.origin.y, dx, dy, yang: flow.yang }]);
    // 残影：对手也看得到你弃了什么（留牌的心理战）
    setRelicGhosts((g) => [...g, { id, name: flow.name, yang: flow.yang }]);
    window.setTimeout(() => {
      setRelicFlows((f) => f.filter((v) => v.id !== id));
      setRelicGhosts((g) => g.filter((v) => v.id !== id));
    }, RELIC_FLOW_MS + 1700);
  }, []);

  /** 归墟一次化去足够多 → 绽放莲花。归墟面板卸载后这层仍在，所以演出不会被切断 */
  const handleRelicBurst = useCallback((_discarded: number, yang: boolean) => {
    playSfx('lotus');
    const key = ++lotusSeq.current;
    setLotus({ key, yang });
    window.setTimeout(() => setLotus((cur) => (cur?.key === key ? null : cur)), 1600);
  }, []);

  /* ---------- 特效消费 ---------- */
  // 【T09】`fxKey` 追加 `pendingFusion.key`，让融合演出也走同一条「去重 + 消费」通道。
  // 融合产物打出后立刻进弃牌堆，UI 只能靠这条通道得知「刚发生了什么」。
  const fxKey = `${state.pendingNumbers.map((n) => n.id).join(',')}|${state.pendingHitstopMs}|${state.pendingParryGlyph}|${state.pendingFusion?.key ?? ''}`;
  useEffect(() => {
    if (fxKey === '' || fxKey === fxConsumed.current) return;
    fxConsumed.current = fxKey;

    for (const n of state.pendingNumbers) {
      // 按伤害类别分形分色（物理=墨点+碎石；术法/奥义=对应五行火花；暴击/真伤=金箔+冲击波）
      fxRef.current?.burst(n.x, n.y, n.crit ? 3 : 1.2, n.kind);
    }
    if (state.pendingFusion) {
      fxRef.current?.fuseBurst(state.pendingFusion);
    }
    if (state.pendingHitstopMs > 0) {
      setHitstop(state.pendingHitstopMs);
      setShake((s) => s + 1);
    }
    const t = window.setTimeout(() => {
      dispatch({ type: 'CONSUME_FX' });
      setHitstop(0);
    }, 850);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxKey, dispatch, fxRef]);

  /* ---------- 玩家受击反馈 ---------- */
  const prevHpRef = useRef(state.player.hp);
  useEffect(() => {
    if (state.player.hp < prevHpRef.current) setHurt((h) => h + 1);
    prevHpRef.current = state.player.hp;
  }, [state.player.hp]);

  /* ---------- 提示语：首回合后自动收起 ---------- */
  useEffect(() => {
    if (state.turn > 1) setShowHint(false);
  }, [state.turn]);

  /* ---------- 警告提示自动消失 ---------- */
  useEffect(() => {
    if (!warn) return;
    const t = window.setTimeout(() => setWarn(''), 1600);
    return () => window.clearTimeout(t);
  }, [warn]);

  return {
    hitstop,
    shake,
    hurt,
    warn,
    setWarn,
    showHint,
    setShowHint,
    lotus,
    relicFlows,
    relicGhosts,
    handleRelicDiscard,
    handleRelicBurst,
  };
}
