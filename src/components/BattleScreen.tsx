/**
 * 战斗界面 · v3（对齐用户 13 条批注 + 参考图一/图二的收拢展开）
 *
 * 尺寸预算（390×844）：
 *   天时条 36 / 敌方区 238 / 架势条 38 / 我方面板 104 / 手牌区 flex / 操作栏 auto
 *
 * v3 改动要点：
 * 1. 敌方区改为「三行定高」结构：意图卡 48 + 立绘盒 116 + 信息板 66 = 230。
 *    此前意图卡被挤出可视区（敌方区 260 装不下 意图卡 + 1.35×size 的立绘），
 *    又因 zIndex 低于天时条而被整个盖住 —— 玩家根本看不到敌人要出什么招。
 * 2. 敌人名字/血条移入半透明暗色信息板，立绘后加径向暗色压边，解决「美术复杂
 *    导致文字辨识度低」；三个敌人的血条尺寸、字号、信息板高度全部统一。
 * 3. 手牌按参考图重做：收拢态重度叠压只露左侧一条边（步进 32px，最右一张完整
 *    可见）；选中后整手摊开、被选中的牌上浮放大。金框=可融合、红框=可组合，
 *    并加外发光环，未参与组合的牌降透明以突出可选目标。
 * 4. 战斗日志改为深色底板 + 高亮文字（此前浅底灰字，几乎看不清）。
 * 5. 「结束回合」移到右下角并加二次确认；「阴阳逆转」移到左侧。
 * 6. 中央教学文字收进「?」按钮，首回合后自动隐藏。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleAction } from '../game/engine/battle';
import { canFuse, canPlayCard, cardCost, regulateOutcome } from '../game/engine/battle';
import type { BattleState, Card, StanceId } from '../game/types';
import { CHARACTER_MAP } from '../game/data/actors';
import { LUNAR_MONTH_MAP, SOLAR_TERM_MAP, STANCES } from '../game/data/world';
import { SHI_SHEN_MAP } from '../game/data/world';
import { EQUIPMENT_MAP, findCombo } from '../game/data/cards';
import { PARRY_TELEGRAPH_MS, PARRY_TOTAL_MS, SHI_CAP, WUSHENG_KAITIAN_STACKS } from '../game/constants';
import { KIND_KEY, STATUS_TIP_KEY, t, WUXING_KEY } from '../i18n';
import { CharacterFigure, EnemyFigure } from './svg/Figure';
import { BaguaPlatform, StatusGlyph, WuXingGlyph, WuXingSeal, WX_STROKE } from './svg/Glyphs';
import { JadeButton, FlowBar } from './ui/Primitives';
import { Tip, WUXING_TIP } from './ui/Tip';
import { RelicPhase } from './RelicPhase';
import type { DiscardFlow } from './RelicPhase';
import { playSfx } from '../game/audio';
import type { FxHandle } from './fx/Effects';

const BASE = import.meta.env.BASE_URL;

/** 阴阳炁条在屏幕上的大致位置：归墟流光一律飞向这里（与 CSS 变量 --dx/--dy 配合） */
const QI_BAR_TARGET = { x: 292, y: 386 };
/** 归墟流光飞行时长，必须与 global.css 的 relicFlow 动画时长一致 */
const RELIC_FLOW_MS = 700;

/** 敌方区三段定高（意图卡 / 立绘盒 / 信息板）—— 三个敌人共用，保证横向对齐 */
const INTENT_H = 48;
const FIGBOX_H = 116;
const INFO_H = 66;

/** 手牌尺寸与收拢参数 */
const CARD_W = 78;
const CARD_H = 112;
/** 收拢态每张牌露出的宽度（参考图一：只露左侧一条边） */
const FOLD_STEP = 32;
/** 上拖超过此距离 → 选中 */
const SELECT_LIFT_PX = 46;
/** 下拖超过此距离 → 取消选中 */
const RELEASE_BACK_PX = 30;
/** 指针位移超过此距离才算「拖动」而非「轻点」（此前是 4px，手指轻微抖动就被误判成拖动，
 *  于是「轻点已选中的牌去合体」永远走不到合体分支，反而把选中取消了） */
const MOVE_SLOP_PX = 12;

interface Props {
  state: BattleState;
  dispatch: (a: BattleAction) => void;
  fxRef: React.RefObject<FxHandle | null>;
  onExit?: () => void;
}

export function BattleScreen({ state, dispatch, fxRef, onExit }: Props) {
  const char = CHARACTER_MAP[state.characterId];
  const month = LUNAR_MONTH_MAP[state.lunarMonthId];
  const term = SOLAR_TERM_MAP[state.solarTermId];

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [hitstop, setHitstop] = useState(0);
  const [shake, setShake] = useState(0);
  const [hurt, setHurt] = useState(0);
  const [warn, setWarn] = useState('');
  const [showHint, setShowHint] = useState(true);
  /** 架势预选：点击架势只改这里，必须再按「确认」才真正下发 SWITCH_STANCE */
  const [pendingStance, setPendingStance] = useState<StanceId | null>(null);
  /** 「大量归墟」金色水墨莲花演出（key 用于重复触发时重放入场动画） */
  const [lotus, setLotus] = useState<{ key: number; yang: boolean } | null>(null);
  const lotusSeq = useRef(0);
  /** 归墟流光 / 弃牌残影：必须由本组件持有 —— 归墟面板化完最后一张就卸载了 */
  const [relicFlows, setRelicFlows] = useState<
    { id: number; x: number; y: number; dx: number; dy: number; yang: boolean }[]
  >([]);
  const [relicGhosts, setRelicGhosts] = useState<{ id: number; name: string; yang: boolean }[]>([]);
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

  /* 回合推进后清掉架势预选，避免上一回合的选择残留到新回合 */
  useEffect(() => {
    setPendingStance(null);
  }, [state.turn]);

  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const targetId = selectedTarget ?? aliveEnemies[0]?.id ?? null;

  /* ---------- 特效消费 ---------- */
  const fxKey = `${state.pendingNumbers.map((n) => n.id).join(',')}|${state.pendingHitstopMs}|${state.pendingParryGlyph}`;
  useEffect(() => {
    if (fxKey === '' || fxKey === fxConsumed.current) return;
    fxConsumed.current = fxKey;

    for (const n of state.pendingNumbers) {
      fxRef.current?.burst(n.x, n.y, n.crit ? 3 : 1.2);
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

  /* ---------- 敌方前摇：CSS 动画驱动 ---------- */
  const telegraphStartRef = useRef(0);
  const actDispatched = useRef(false);
  const [inWindow, setInWindow] = useState(false);

  useEffect(() => {
    if (state.phase !== 'enemyTelegraph') {
      actDispatched.current = false;
      setInWindow(false);
      return;
    }
    telegraphStartRef.current = performance.now();
    setInWindow(false);
    const t1 = window.setTimeout(() => setInWindow(true), PARRY_TELEGRAPH_MS);
    const t2 = window.setTimeout(() => {
      if (!actDispatched.current) {
        actDispatched.current = true;
        dispatch({ type: 'ENEMY_ACT' });
      }
    }, PARRY_TOTAL_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [state.phase, state.turn, dispatch]);

  const handleParry = useCallback(() => {
    if (state.parried || state.phase !== 'enemyTelegraph') return;
    dispatch({ type: 'PARRY', elapsedMs: performance.now() - telegraphStartRef.current });
  }, [state.parried, state.phase, dispatch]);

  /* ---------- 手牌：收拢/展开 + 选中 + 融合 ---------- */
  const dragRef = useRef<{ uid: string; startY: number; startX: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ uid: string; dy: number } | null>(null);

  /** 手牌是否处于展开态（有选中牌即展开） */
  const handExpanded = selectedCards.length > 0;

  /** 可融合的牌（未选中任何牌时用金框标出） */
  const fusibleUids = useMemo(() => {
    const set = new Set<string>();
    const hand = state.hand;
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (canFuse(hand[i]!, hand[j]!)) {
          set.add(hand[i]!.uid ?? hand[i]!.id);
          set.add(hand[j]!.uid ?? hand[j]!.id);
        }
      }
    }
    return set;
  }, [state.hand]);

  /** 选中一张牌后，能与它组合的牌（红框） */
  const partnerUids = useMemo(() => {
    if (selectedCards.length !== 1) return new Set<string>();
    const a = state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
    if (!a) return new Set<string>();
    return new Set(
      state.hand.filter((c) => (c.uid ?? c.id) !== (a.uid ?? a.id) && canFuse(a, c)).map((c) => c.uid ?? c.id),
    );
  }, [selectedCards, state.hand]);

  /** 融合两张牌；返回是否成功 */
  const tryFuse = useCallback(
    (uidA: string, uidB: string) => {
      const a = state.hand.find((c) => (c.uid ?? c.id) === uidA);
      const b = state.hand.find((c) => (c.uid ?? c.id) === uidB);
      if (!a || !b) return false;
      if (!canFuse(a, b)) return false;
      dispatch({ type: 'FUSE', cardAId: uidA, cardBId: uidB, targetId: targetId ?? undefined });
      setSelectedCards([]);
      return true;
    },
    [state.hand, dispatch, targetId],
  );

  /**
   * 选中一张牌的**唯一入口**（轻点、上拖都走这里）。
   *
   * 三种结果：
   * 1. 点的是已选中的牌 → 取消选中（收回手牌）
   * 2. 已有一张选中牌且本张可与它融合 → 立刻合体
   * 3. 其余情况 → 改选本张
   */
  const pickCard = useCallback(
    (uid: string) => {
      const card = state.hand.find((c) => (c.uid ?? c.id) === uid);
      if (!card) return;

      if (selectedCards.includes(uid)) {
        setSelectedCards((prev) => prev.filter((x) => x !== uid));
        return;
      }

      if (selectedCards.length === 1) {
        const cur = selectedCards[0]!;
        if (tryFuse(cur, uid)) return;
        const a = state.hand.find((c) => (c.uid ?? c.id) === cur);
        // 不可组合时不能「点了没反应」——明确告知原因，再改选本张
        if (a) setWarn(`「${a.name}」×「${card.name}」不同系，无法合体`);
        setSelectedCards([uid]);
        return;
      }

      setSelectedCards([uid]);
    },
    [state.hand, selectedCards, tryFuse],
  );

  const handleCardPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, card: Card) => {
    const uid = card.uid ?? card.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { uid, startY: e.clientY, startX: e.clientX, moved: false };
    setDrag({ uid, dy: 0 });
  }, []);

  const handleCardPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > MOVE_SLOP_PX || Math.abs(e.clientX - d.startX) > MOVE_SLOP_PX) d.moved = true;
    setDrag({ uid: d.uid, dy });
  }, []);

  const handleCardPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;

      const dy = e.clientY - d.startY;

      // 轻点（未拖动）→ 选中 / 取消 / 合体
      if (!d.moved) {
        pickCard(d.uid);
        return;
      }
      // 上拖 → 选中
      if (dy < -SELECT_LIFT_PX) {
        pickCard(d.uid);
        return;
      }
      // 下拖 → 归位（取消选中）
      if (dy > RELEASE_BACK_PX && selectedCards.includes(d.uid)) {
        setSelectedCards((prev) => prev.filter((x) => x !== d.uid));
      }
    },
    [pickCard, selectedCards],
  );

  const playSelected = useCallback(() => {
    const uid = selectedCards[0];
    if (!uid) return;
    dispatch({ type: 'PLAY_CARD', cardId: uid, targetId: targetId ?? undefined });
    setSelectedCards([]);
  }, [selectedCards, dispatch, targetId]);

  /** 兜底：选中一张后，若有可组合的牌则合体 */
  const fuseHint = useMemo(() => {
    if (selectedCards.length !== 1) return null;
    const a = state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
    if (!a) return null;
    return state.hand.find((b) => (b.uid ?? b.id) !== (a.uid ?? a.id) && canFuse(a, b)) ?? null;
  }, [selectedCards, state.hand]);

  /* ---------- 派生 ---------- */
  const isTelegraph = state.phase === 'enemyTelegraph';
  const combo = findCombo(state.equipment[0], state.equipment[1]) ?? findCombo(state.equipment[1], state.equipment[0]);
  const bladeCount = state.equipment.filter((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade').length;
  /**
   * 转换方向：从较多的那种炁扣（并列时扣阳炁，与引擎语义一致）。
   *
   * 【单一真源】调息的一切判定（能不能转、扣多少、给多少、为什么不能）**全部**来自引擎的
   * regulateOutcome —— UI 不再自算一套。
   * 历史缺陷：这里曾是双真源（引擎算一套、UI 算一套），本轮把引擎的 floor 改成 ceil 时
   * UI 侧漏改，于是春分下界面显示「换得 1 点」而引擎实际给 2 点 —— 界面在骗玩家。
   * 根治办法就是让两边都只能问同一个函数。
   */
  const regFrom: 'yang' | 'yin' = state.yang >= state.yin ? 'yang' : 'yin';
  const regOutcome = regulateOutcome(state, regFrom);
  const regRatio = regOutcome.cost;
  const regGain = regOutcome.gain;
  /** 引擎侧还额外要求「非敌方前摇」，UI 一并纳入可用性判断 */
  const canRegulate = regOutcome.canDo && !isTelegraph;
  const regFromCN = regFrom === 'yang' ? '阳炁' : '阴炁';
  const regToCN = regFrom === 'yang' ? '阴炁' : '阳炁';
  /** 不可用的原因文案：由引擎给出的 reason 驱动，界面不再自己猜 */
  const regDisabledTip =
    regOutcome.reason === 'targetFull'
      ? `${regToCN}已满，无法再转换。`
      : `${regFromCN}不足 ${regOutcome.cost} 点，无法转换。`;

  const selectedCard =
    selectedCards.length === 1 ? state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]) : undefined;
  const canPlaySelected = selectedCard ? canPlayCard(state, selectedCard) : false;

  /** 引擎在 enemyAct 用 (turn-1) 取意图，UI 展示必须与之一致 */
  const intentOf = (intents: { type: string; label: string }[], turn: number) =>
    intents[(turn - 1) % intents.length];

  /* ============================== 渲染 ============================== */
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/*
        战斗背景：只挂 bg_战场.png。
        此前写成 `url(bg_主界面.png), url(bg_战场.png)` —— CSS 多背景中**第一个在最上层**，
        不透明的主界面图把战场图整个盖住了，所以战斗中根本看不到战场背景。
      */}
      <div
        className="cloud-drift"
        style={{
          position: 'absolute',
          inset: '-4%',
          backgroundImage: `url(${BASE}art/bg_战场.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'saturate(0.9) brightness(0.98)',
          opacity: 0.96,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* 明暗罩：上方压暗提高敌人区文字对比，下方提亮让手牌区透气 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(28,20,12,0.44) 0%, rgba(60,42,24,0.18) 30%, rgba(247,242,228,0.08) 62%, rgba(251,247,236,0.32) 100%)',
        }}
      />

      {hurt > 0 && <div key={hurt} className="hurt-flash" style={{ position: 'absolute', inset: 0, zIndex: 65 }} />}
      {hitstop > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 70,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at 50% 45%, rgba(245,197,24,0.2), transparent 64%)',
            animation: `hitstopFlash ${hitstop}ms steps(1) 1`,
          }}
        />
      )}

      {/* ============ 天时条 ============ */}
      <div
        style={{
          height: 36,
          flex: '0 0 36px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          background: 'linear-gradient(180deg, rgba(72,45,24,0.96), rgba(58,36,19,0.92))',
          borderBottom: '1.5px solid var(--color-miaojin)',
          fontSize: 11,
          zIndex: 20,
          boxShadow: '0 2px 8px rgba(20,12,6,0.5)',
        }}
      >
        <Tip
          text={`月令·${month?.label ?? state.lunarMonthId}\n${month?.desc ?? ''}\n${(month?.defMul ?? 1) > 1 ? '本月防御倍率 ×' + month?.defMul : '本月防御无额外加成'}`}
          placement="bottom"
        >
          <span
            style={{
              color: 'var(--color-miaojin-light)',
              fontFamily: 'var(--font-brush)',
              textShadow: '0 1px 3px rgba(0,0,0,0.85)',
            }}
          >
            {month?.label ?? state.lunarMonthId}
          </span>
        </Tip>
        <span style={{ color: 'rgba(236,203,122,0.5)' }}>│</span>
        <Tip
          text={`节气·${term?.name ?? state.solarTermId}（${term?.season ?? ''}）\n${term?.desc ?? ''}\n${term?.implemented ? '本节气效果已实装，会在符合条件时自动触发。' : '本节气为留位数据，尚未实装效果。'}`}
          placement="bottom"
        >
          <span
            style={{
              color: 'var(--color-miaojin-light)',
              fontFamily: 'var(--font-brush)',
              textShadow: '0 1px 3px rgba(0,0,0,0.85)',
            }}
          >
            炁候·{term?.name ?? state.solarTermId}
          </span>
        </Tip>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tip
            text={`第 ${state.turn} 回合\n你出牌或结束回合 → 敌方行动 → 进入下一回合。\n每回合抽牌并回炁。`}
            placement="bottom"
          >
            <span
              style={{
                color: 'var(--color-miaojin-light)',
                fontVariantNumeric: 'tabular-nums',
                textShadow: '0 1px 3px rgba(0,0,0,0.85)',
              }}
            >
              第 {state.turn} 回合
            </span>
          </Tip>
          {onExit && (
            <Tip text="撤退\n退出当前战斗，返回主界面（本局进度不保留）。" placement="bottom">
              <button
                onClick={onExit}
                aria-label="撤退"
                style={{
                  // 刻意弱化：避免和「结束回合」抢注意力
                  color: 'rgba(236,203,122,0.55)',
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: '1px solid rgba(236,203,122,0.26)',
                  background: 'transparent',
                }}
              >
                ✕ 撤退
              </button>
            </Tip>
          )}
        </div>
      </div>

      {/* ============ 敌方区：意图卡 / 立绘 / 信息板 三段定高 ============ */}
      <div
        key={`enemy-${shake}`}
        className={shake > 0 && state.pendingNumbers.some((n) => n.targetId !== 'player') ? 'shake' : undefined}
        style={{
          height: 238,
          flex: '0 0 238px',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 6,
          paddingTop: 6,
          zIndex: 25,
        }}
      >
        {state.enemies.map((e) => {
          const dead = e.hp <= 0;
          const hasFlaw = e.statuses.some((s) => s.id === 'flaw');
          const isTarget = e.id === targetId && !dead;
          const intent = intentOf(e.intents, state.turn);
          const willAttack = isTelegraph && (intent?.type === 'attack' || intent?.type === 'aoe') && !dead;
          const grade = (intent as { grade?: string })?.grade ?? 'base';

          const colW = e.isBoss ? 126 : 112;
          const figH = e.isBoss ? 112 : 90;

          return (
            <div
              key={e.id}
              onClick={() => !dead && setSelectedTarget(e.id)}
              style={{
                width: colW,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: dead ? 'default' : 'pointer',
                position: 'relative',
              }}
            >
              {/* ① 意图卡：定高，始终占位，保证三列横向对齐 */}
              <div style={{ height: INTENT_H, width: '100%', display: 'flex', alignItems: 'center' }}>
                {!dead && (
                  <IntentCard
                    label={intent?.label ?? '——'}
                    grade={grade}
                    active={isTelegraph}
                    willAttack={willAttack}
                    note={(intent as { note?: string })?.note}
                    shi={e.shi}
                    shiCap={e.shiCap}
                  />
                )}
              </div>

              {/* ② 立绘盒：定高 + 径向暗色压边 */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: FIGBOX_H,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 10,
                    background:
                      'radial-gradient(ellipse at 50% 58%, rgba(24,16,9,0.5), rgba(24,16,9,0.12) 62%, transparent 78%)',
                    animation: hasFlaw ? 'flawPulse 1.4s ease-in-out infinite' : undefined,
                    boxShadow: isTarget ? 'inset 0 0 0 2px rgba(212,168,67,0.85)' : 'none',
                    pointerEvents: 'none',
                  }}
                />
                <BaguaPlatform size={e.isBoss ? 112 : 94} wuxing={e.wuxing} />

                <EnemyFigure
                  enemyId={e.id.replace('enemy_', '')}
                  shape={e.shape}
                  wuxing={e.wuxing}
                  size={figH / 1.35}
                  dim={dead}
                  charging={willAttack}
                />

                {isTarget && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: 9,
                      padding: '0 5px',
                      borderRadius: 3,
                      background: 'var(--color-miaojin)',
                      color: 'var(--color-card-title)',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ▼ 目标
                  </div>
                )}
                {hasFlaw && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      fontSize: 9,
                      background: 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))',
                      color: 'var(--color-card-title)',
                      padding: '0 4px',
                      borderRadius: 3,
                      fontWeight: 700,
                      border: '1px solid var(--color-xuanzhi-warm)',
                    }}
                  >
                    破绽
                  </div>
                )}
              </div>

              {/* ③ 信息板：统一规格的暗色底板 */}
              <EnemyInfoPanel enemy={e} dead={dead} />
            </div>
          );
        })}
      </div>

      {/* ============ 架势条 ============ */}
      <div
        style={{
          height: 38,
          flex: '0 0 38px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          fontSize: 11,
          zIndex: 10,
        }}
      >
        {STANCES.map((s) => {
          const active = state.stance === s.id;
          const pending = pendingStance === s.id;
          return (
            <Tip
              key={s.id}
              text={`${s.name}\n${s.desc}${
                active
                  ? '\n（当前架势）'
                  : pending
                    ? '\n（已选中，按右侧「确认」才真正切换）'
                    : '\n点击只是查看该架势，需再按右侧「确认」才会切换。'
              }`}
              placement="top"
              style={{ flex: 1 }}
            >
              <button
                onClick={() => setPendingStance(pending || active ? null : (s.id as StanceId))}
                style={{
                  width: '100%',
                  padding: '5px 2px',
                  borderRadius: 5,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-brush)',
                  letterSpacing: 1,
                  cursor: 'pointer',
                  border: `1.5px solid ${
                    active
                      ? 'var(--color-miaojin-light)'
                      : pending
                        ? 'var(--color-minghuang)'
                        : 'rgba(212,168,67,0.45)'
                  }`,
                  background: active
                    ? 'linear-gradient(180deg, var(--color-zhuhong-light), var(--color-zhuhong))'
                    : pending
                      ? 'linear-gradient(180deg, rgba(245,197,24,0.92), rgba(212,168,67,0.88))'
                      : 'linear-gradient(180deg, rgba(251,247,236,0.92), rgba(236,217,171,0.85))',
                  color: active ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-text-sub)',
                  textShadow: active ? '0 1px 2px rgba(80,20,10,0.5)' : 'none',
                  boxShadow: active
                    ? '0 0 10px rgba(212,168,67,0.5)'
                    : pending
                      ? '0 0 12px rgba(245,197,24,0.9)'
                      : 'none',
                  transition: 'border-color 140ms, background 140ms, box-shadow 140ms',
                }}
              >
                {s.name.split('·')[0]}
              </button>
            </Tip>
          );
        })}

        {/*
          确认键：架势切换的**唯一**生效入口。
          点击架势只做预选（明黄高亮），必须再按这里才 dispatch —— 防止误触改掉整套打法。
          位置常驻不隐藏，避免预选时整排按钮横向跳位。
        */}
        <Tip
          text={
            `确认切换架势\n架势决定整套打法，误触代价高，因此点选之后需要在这里再确认一次。\n` +
            (state.stanceSwitched
              ? '本回合已经切换过架势，下回合才能再换。'
              : pendingStance
                ? `确认后切换为「${STANCES.find((x) => x.id === pendingStance)?.name ?? pendingStance}」。`
                : '尚未选中要切换的架势（点上方三个按钮预选）。')
          }
          placement="top"
          style={{ flex: '0 0 50px' }}
        >
          <button
            disabled={!pendingStance || state.stanceSwitched}
            onClick={() => {
              if (!pendingStance) return;
              dispatch({ type: 'SWITCH_STANCE', stance: pendingStance });
              setPendingStance(null);
            }}
            style={{
              width: '100%',
              padding: '5px 2px',
              borderRadius: 5,
              fontSize: 10.5,
              fontFamily: 'var(--font-brush)',
              letterSpacing: 1,
              cursor: pendingStance && !state.stanceSwitched ? 'pointer' : 'not-allowed',
              border: `1.5px solid ${
                pendingStance && !state.stanceSwitched ? 'var(--color-miaojin-light)' : 'rgba(212,168,67,0.4)'
              }`,
              background:
                pendingStance && !state.stanceSwitched
                  ? 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))'
                  : 'linear-gradient(180deg, rgba(251,247,236,0.8), rgba(236,217,171,0.7))',
              color: 'var(--color-card-title)',
              fontWeight: 700,
              opacity: pendingStance && !state.stanceSwitched ? 1 : 0.45,
              boxShadow:
                pendingStance && !state.stanceSwitched ? '0 0 12px rgba(212,168,67,0.9)' : 'none',
              animation:
                pendingStance && !state.stanceSwitched ? 'ctaPulse 1.5s ease-in-out infinite' : undefined,
            }}
          >
            确认
          </button>
        </Tip>
      </div>

      {/* ============ 我方面板 ============ */}
      <div
        style={{
          height: 104,
          flex: '0 0 104px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          margin: '0 8px',
          borderRadius: 8,
          background: 'linear-gradient(160deg, rgba(251,247,236,0.96), rgba(236,217,171,0.9))',
          border: '1.5px solid var(--color-miaojin)',
          boxShadow: '0 3px 12px rgba(120,90,40,0.3), inset 0 1px 0 rgba(255,246,220,0.85)',
          zIndex: 10,
        }}
      >
        <CharacterFigure
          characterId={state.characterId}
          robe={char?.palette.robe ?? 'var(--color-shiqing)'}
          trim={char?.palette.trim ?? 'var(--color-hupo)'}
          hair={char?.palette.hair ?? 'var(--color-yaqing)'}
          weapon={state.equipment.some((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade') ? 'blade' : 'artifact'}
          size={84}
          flat
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {/* 名字 + 命格标签压成同一行，字号下调 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-brush)',
                color: 'var(--color-card-title)',
                fontSize: 13,
                flex: '0 0 auto',
              }}
            >
              {char?.name}
            </span>
            <Tip text={`日主·${char?.rizhu}\n该角色的本命五行，决定其感受节气与月令加成的方式。`} placement="top">
              <span
                style={{
                  fontSize: 8.5,
                  background: 'var(--color-zhuhong)',
                  color: 'var(--color-xuanzhi-warm)',
                  padding: '0 3px',
                  borderRadius: 2,
                }}
              >
                {char?.rizhu}
              </span>
            </Tip>
            {char?.shishen.map((s) => {
              const info = SHI_SHEN_MAP[s];
              return (
                <Tip
                  key={s}
                  text={`十神·${info?.name ?? s}（${info?.category ?? ''}）\n${info?.desc ?? ''}${info && !info.implemented ? '\n（尚未实装，敬请期待）' : ''}`}
                  placement="top"
                >
                  <span
                    style={{
                      fontSize: 8.5,
                      padding: '0 3px',
                      borderRadius: 2,
                      background: 'rgba(11,46,89,0.8)',
                      color: 'var(--color-yuebai)',
                      opacity: info && !info.implemented ? 0.55 : 1,
                    }}
                  >
                    {info?.name ?? s}
                  </span>
                </Tip>
              );
            })}
          </div>

          <Tip
            text={`气血 ${state.player.hp}/${state.player.maxHp}${
              state.player.shield > 0 ? `\n护盾 ${state.player.shield} 点（优先被扣，条上绿色一段）` : ''
            }\n归零即战败。受击先扣护盾，再扣气血。`}
            placement="top"
            style={{ display: 'block' }}
          >
            <FlowBar
              label="气血"
              value={state.player.hp}
              cap={state.player.maxHp}
              shield={state.player.shield}
              color="linear-gradient(90deg, var(--color-hp-grad-a), var(--color-hp-grad-b))"
              height={12}
            />
          </Tip>

          {/* 阴阳资源：大号数字 + 分段条 + 发光，与血条在视觉上区分开 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <QiResource
              label="阳"
              value={state.yang}
              cap={state.yangCap}
              color="var(--color-hupo)"
              tip={`阳炁 ${state.yang}/${state.yangCap}\n出物理牌消耗。攻击命中、调息可积累，是「性命双修」中炼「命」的一面。`}
            />
            <QiResource
              label="阴"
              value={state.yin}
              cap={state.yinCap}
              color="var(--color-shishui)"
              tip={`阴炁 ${state.yin}/${state.yinCap}\n出术法牌消耗。受击与术法相生可积累，是炼「性」的一面。`}
            />
          </div>
        </div>

        <div style={{ width: 60, textAlign: 'center', fontSize: 10, flex: '0 0 auto' }}>
          {state.stance === 'tixiu' && (
            <Tip
              text={`势 ${state.shi}／${SHI_CAP}\n体修专属资源：每打出一张物理牌积攒 1 层。\n满 ${SHI_CAP} 层解锁「破军」，下张物理牌造成 攻击×层数 的真实伤害。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-hupo)', fontSize: 18, fontFamily: 'var(--font-brush)' }}>
                  {state.shi}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)', fontSize: 9 }}>势／{SHI_CAP}</div>
              </div>
            </Tip>
          )}
          {state.stance === 'sanxiu' && (
            <Tip
              text={`阴阳差 ${Math.abs(state.yang - state.yin)}\n散修核心：阴阳炁差值越大，暴击率与暴击伤害越高。\n差值达上限触发「剑走偏锋」：本回合伤害 +100%，回合结束自损 30% 当前气血。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-zhuhong)', fontSize: 18, fontFamily: 'var(--font-brush)' }}>
                  {Math.abs(state.yang - state.yin)}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)', fontSize: 9 }}>阴阳差</div>
              </div>
            </Tip>
          )}
          {state.stance === 'faxiu' && (
            <Tip
              text={`五行轮转：${state.lastSpellWuxing ? '相生（已进入轮转）' : '起手（本回合尚未出术法）'}\n法修按五行相生顺序（${t('label.wuxingChain')}）连续出术法牌，每张费用减半且伤害递增 10%。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-wx-shui)', fontSize: 14, fontFamily: 'var(--font-brush)' }}>
                  {state.lastSpellWuxing ? '相生' : '起手'}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)', fontSize: 9 }}>五行</div>
              </div>
            </Tip>
          )}
          {bladeCount >= 2 && (
            <Tip
              text={`纯阳开天 ${state.wushengStacks}/${WUSHENG_KAITIAN_STACKS}\n双持兵刃时积累的叠层，满层释放「纯阳开天」奥义。`}
              placement="top"
            >
              <div style={{ color: 'var(--color-card-title)', fontSize: 9, marginTop: 2 }}>
                纯阳 {state.wushengStacks}/{WUSHENG_KAITIAN_STACKS}
              </div>
            </Tip>
          )}
          {combo && bladeCount === 1 && (
            <Tip text={`连携技「${combo.skillName}」\n同时佩戴对应兵刃与法器时生效的被动。`} placement="top">
              <div style={{ color: 'var(--color-hupo)', fontSize: 9, marginTop: 2 }}>{combo.skillName}</div>
            </Tip>
          )}
        </div>
      </div>

      {/* ============ 手牌区 / 弹反区 ============ */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          padding: '6px 0 0',
          // 高于操作栏：卡片上浮后会盖在按钮之上
          zIndex: 40,
        }}
      >
        {!isTelegraph ? (
          <>
            {/* 手牌扇形：收拢（重度叠压）/ 展开（摊开） */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                height: '100%',
                paddingTop: 34,
                paddingBottom: 8,
                // 必须 visible：选中的牌会上浮，被裁剪就看不见了
                overflow: 'visible',
              }}
            >
              {state.hand.map((c, i) => {
                const cost = cardCost(state, c);
                const playable = canPlayCard(state, c);
                const uid = c.uid ?? c.id;
                const sel = selectedCards.includes(uid);
                const dragging = drag?.uid === uid;
                const fusible = selectedCards.length === 0 && fusibleUids.has(uid);
                const partner = partnerUids.has(uid);
                /** 展开态下，既不选中也不可组合的牌降透明，让可选目标跳出来 */
                const dimmed = handExpanded && !sel && !partner;

                const n = state.hand.length;
                const mid = (n - 1) / 2;
                /** 均分步进：让 n 张牌正好铺满手牌区可用宽度（marginLeft 用负值抵消） */
                const even = Math.floor((344 - CARD_W) / Math.max(1, n - 1));
                /**
                 * 收拢态：步进上限 FOLD_STEP(32)，重度叠压，每张只露左侧一条边。
                 * 展开态：用均分步进尽量摊开。
                 *
                 * 【曾经的致命 Bug】展开态写成 `step = 0`，于是 overlap = CARD_W - 0 = 78，
                 * marginLeft = -78 —— 每张牌往左挪满一整个身位，**所有手牌精确重叠在同一坐标**。
                 * 选中第一张后，其余牌瞬间叠成一摞，第二张根本点不到 —— 这就是
                 * 「很难同时选中两张卡牌 / 选中的牌触发不了融合」的真正原因。
                 */
                const step = handExpanded
                  ? Math.max(20, Math.min(CARD_W + 6, even))
                  : Math.max(16, Math.min(FOLD_STEP, even));
                const overlap = Math.max(0, CARD_W - step);
                // 扇形弧度：展开态角度更大
                const rotMax = handExpanded ? 7 : 5;
                const rot = n <= 1 ? 0 : ((i - mid) / Math.max(1, mid)) * rotMax;
                const arc = handExpanded ? Math.abs(i - mid) * 3 : Math.abs(i - mid) * 1.2;

                let transform = `rotate(${rot}deg) translateY(${arc}px)`;
                let z = i;
                if (sel) {
                  transform = 'rotate(0deg) translateY(-58px) scale(1.12)';
                  z = 300;
                } else if (partner) {
                  transform = `rotate(${rot}deg) translateY(-22px) scale(1.06)`;
                  z = 200 + i;
                }
                if (dragging) z = 400;

                return (
                  <div
                    key={uid}
                    onPointerDown={(e) => handleCardPointerDown(e, c)}
                    onPointerMove={handleCardPointerMove}
                    onPointerUp={handleCardPointerUp}
                    onPointerCancel={handleCardPointerUp}
                    style={{
                      flex: '0 0 auto',
                      marginLeft: i === 0 ? 0 : -overlap,
                      transform,
                      // margin-left 也要过渡：否则「收拢→摊开」时整排手牌会瞬移，
                      // 手指下的牌突然换位，第二次点击自然点空。
                      transition: dragging
                        ? 'none'
                        : 'transform 190ms cubic-bezier(0.2, 0.9, 0.3, 1.05), margin-left 190ms cubic-bezier(0.2, 0.9, 0.3, 1.05)',
                      zIndex: z,
                      position: 'relative',
                      touchAction: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <GameCard
                      card={c}
                      cost={cost}
                      playable={playable}
                      selected={sel}
                      fusible={fusible}
                      partner={partner}
                      dimmed={dimmed}
                    />
                  </div>
                );
              })}
              {state.hand.length === 0 && (
                <div
                  style={{
                    color: 'var(--color-card-text)',
                    fontSize: 12,
                    padding: 12,
                    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                  }}
                >
                  手牌已空
                </div>
              )}
            </div>

            {/* 教学提示：收进「?」，首回合后自动隐藏，不再挡住画面中心 */}
            <div
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 9.5,
              }}
            >
              <Tip
                text={
                  '操作提示\n· 轻点或上拖卡牌 = 选中，整排手牌会摊开\n· 再点一次 / 下拖 = 收回手牌\n· 牌左边缘的金条 = 手牌里有能跟它合体的牌\n· 选中后，脉动朱红环 = 点它即刻合体成奥义\n· 选好之后按下方「出牌」打出'
                }
                placement="top"
              >
                <button
                  onClick={() => setShowHint((v) => !v)}
                  aria-label="操作提示"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    fontSize: 11,
                    lineHeight: '15px',
                    flex: '0 0 auto',
                    background: 'rgba(38,29,18,0.85)',
                    border: '1px solid var(--color-miaojin)',
                    color: 'var(--color-miaojin-light)',
                  }}
                >
                  ?
                </button>
              </Tip>
              {showHint && (
                <div style={{ color: 'var(--color-xuanzhi-warm)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                  轻点或上拖卡牌选中 · 点红框牌合体
                </div>
              )}
              {warn && (
                <div style={{ color: 'var(--color-miaojin-light)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                  {warn}
                </div>
              )}
            </div>
          </>
        ) : (
          /* 弹反面板 */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              paddingTop: 10,
            }}
          >
            <Tip
              text={
                '弹反时序\n游标自左向右划过：\n· 红色区按下 = 普通格挡（减伤 60%）\n· 金色区按下 = 完美弹反（免疫这一记攻击并追击）\n· 一次弹反只能抵挡一记攻击，多只敌人同时出手时其余照常命中'
              }
              placement="top"
              style={{ display: 'block', width: 334 }}
            >
              <div
                style={{
                  width: 334,
                  height: 26,
                  borderRadius: 13,
                  background: 'rgba(90,60,30,0.55)',
                  position: 'relative',
                  overflow: 'hidden',
                  border: '1.5px solid var(--color-miaojin)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: `${(PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100}%`,
                    top: 0,
                    bottom: 0,
                    background: 'rgba(194,59,34,0.45)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${(PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100}%`,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    background: inWindow
                      ? 'linear-gradient(90deg, rgba(245,197,24,0.9), rgba(236,203,122,0.55))'
                      : 'rgba(245,197,24,0.3)',
                    transition: 'background 120ms',
                  }}
                />
                {state.phase === 'enemyTelegraph' && !state.parried && (
                  <div className="parry-cursor" style={{ animationDuration: `${PARRY_TOTAL_MS}ms` }} />
                )}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: inWindow ? 'var(--color-card-title)' : 'var(--color-xuanzhi-warm)',
                    textShadow: inWindow ? 'none' : '0 1px 3px rgba(0,0,0,0.7)',
                    fontWeight: inWindow ? 700 : 400,
                  }}
                >
                  {state.parried
                    ? state.parryResult === 'perfect'
                      ? '弹反成功！'
                      : state.parryResult === 'early'
                        ? '过早 · 仅格挡'
                        : '未格挡'
                    : inWindow
                      ? '此刻！按下去'
                      : '蓄力中…等金色'}
                </div>
              </div>
            </Tip>

            <Tip
              text={
                '格挡\n敌方出招前的瞬间点击：\n· 游标进入金色区点击 = 完美弹反（免疫这一记）\n· 红色区点击 = 普通格挡（减伤 60%）\n注意：一次只能抵挡一记攻击。'
              }
              placement="top"
              style={{ display: 'block', width: 334 }}
            >
              <button
                disabled={state.parried}
                onClick={handleParry}
                style={{
                  width: 334,
                  height: 104,
                  borderRadius: 10,
                  fontFamily: 'var(--font-brush)',
                  fontSize: 30,
                  letterSpacing: 10,
                  border: `2px solid ${inWindow && !state.parried ? 'var(--color-xuanzhi-warm)' : 'var(--color-miaojin)'}`,
                  background:
                    inWindow && !state.parried
                      ? 'radial-gradient(circle at 50% 50%, rgba(236,203,122,0.95), var(--color-miaojin))'
                      : 'linear-gradient(180deg, rgba(201,169,97,0.9), rgba(166,124,46,0.92))',
                  color: inWindow && !state.parried ? 'var(--color-card-title)' : 'var(--color-xuanzhi-warm)',
                  boxShadow:
                    inWindow && !state.parried
                      ? '0 0 34px rgba(245,197,24,0.7), inset 0 1px 0 rgba(255,246,220,0.9)'
                      : '0 3px 10px rgba(120,90,40,0.35), inset 0 1px 0 rgba(255,246,220,0.5)',
                  transform: inWindow && !state.parried ? 'scale(1.03)' : 'scale(1)',
                  transition: 'all 100ms',
                }}
              >
                格　挡
              </button>
            </Tip>
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--color-xuanzhi-warm)',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              金色区按下 = 完美弹反 · 红色区按下 = 减伤 60% · 一次只挡一记
            </div>
          </div>
        )}
      </div>

      {/* ============ 操作栏 ============ */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '0 10px 8px',
          gap: 6,
          zIndex: 10,
        }}
      >
        {/* 主操作：出牌 / 合并奥义（可用时发光提示） */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Tip
            text={
              '出牌\n选中一张（上拖或轻点）后点此打出。\n物理牌耗阳炁，术法牌耗阴炁。\n' +
              (selectedCard
                ? canPlaySelected
                  ? '当前这张可以打出。'
                  : '当前这张炁量不足或已被沉默。'
                : '尚未选中卡牌。')
            }
            placement="top"
            style={{ flex: 1 }}
          >
            <JadeButton
              onClick={playSelected}
              disabled={!canPlaySelected}
              variant="primary"
              size="sm"
              style={{
                width: '100%',
                boxShadow: canPlaySelected ? '0 0 14px rgba(216,84,58,0.7), 0 2px 6px rgba(120,90,40,0.3)' : undefined,
                animation: canPlaySelected ? 'ctaPulse 1.6s ease-in-out infinite' : undefined,
              }}
            >
              出　牌
            </JadeButton>
          </Tip>
          <Tip
            text={
              '合并奥义\n两张同系牌（双物理 / 同五行术法 / 双功能）可合体，效果合并并放大。\n牌左边缘有金条 = 手牌里有能跟它合体的牌；选中后脉动朱红环 = 可直接点它合体。\n' +
              (fuseHint ? `点击可直接与「${fuseHint.name}」合体。` : '当前选中牌没有可组合对象。')
            }
            placement="top"
            style={{ flex: 1 }}
          >
            <JadeButton
              onClick={() => {
                if (!fuseHint) return;
                const a = selectedCards[0];
                if (!a) return;
                tryFuse(a, fuseHint.uid ?? fuseHint.id);
              }}
              disabled={!fuseHint}
              variant="gold"
              size="sm"
              style={{
                width: '100%',
                boxShadow: fuseHint ? '0 0 14px rgba(212,168,67,0.8), 0 2px 6px rgba(120,90,40,0.3)' : undefined,
                animation: fuseHint ? 'ctaPulse 1.6s ease-in-out infinite' : undefined,
              }}
            >
              {fuseHint
                ? `合并 · ${fuseHint.name}`
                : selectedCards.length === 1
                  ? '无同系可合体'
                  : '合并奥义'}
            </JadeButton>
          </Tip>
        </div>

        {/* 次级操作：「阴阳逆转」在左（辅助），「结束回合」在右下（主操作，防误触需连点两次） */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tip
            text={
              `阴阳逆转\n把较多的那种炁，按 ${regRatio} : ${regGain} 的比例转换成另一种炁，用于凑齐出牌费用。\n每回合限一次；敌方前摇时不可用。\n` +
              (state.regulated
                ? '本回合已经用过了。'
                : isTelegraph
                  ? '敌方前摇中，不可调息。'
                  : canRegulate
                    ? `本次消耗 ${regRatio} 点${regFromCN}，换得 ${regGain} 点${regToCN}。`
                    : regDisabledTip)
            }
            placement="top"
            style={{ flex: 1 }}
          >
            <JadeButton
              onClick={() => dispatch({ type: 'REGULATE', from: regFrom })}
              disabled={!canRegulate}
              variant="ghost"
              size="sm"
              style={{ width: '100%' }}
            >
              {state.regulated
                ? '☯ 阴阳逆转（已用）'
                : isTelegraph
                  ? '☯ 阴阳逆转·前摇中'
                  : canRegulate
                    ? `☯ 阴阳逆转 ${regRatio}:${regGain}`
                    : regOutcome.reason === 'targetFull'
                      ? '☯ 阴阳逆转·目标已满'
                      : `☯ 阴阳逆转·${regFrom === 'yang' ? '阳' : '阴'}不足`}
            </JadeButton>
          </Tip>
          <Tip
            text={'结束回合\n放弃本回合剩余行动。\n若手牌超过上限，会先进入「归墟」阶段处理多余的牌，再交给敌方行动。'}
            placement="top"
            style={{ flex: 1.15 }}
          >
            <JadeButton
              onClick={() => dispatch({ type: 'END_TURN' })}
              disabled={isTelegraph}
              variant="primary"
              size="sm"
              style={{ width: '100%' }}
            >
              结 束 回 合
            </JadeButton>
          </Tip>
        </div>

        {/* 战报：深色底板 + 高亮文字（此前浅底灰字，对比度极低） */}
        <Tip
          text={'战报\n本场战斗的逐条记录：出牌、伤害、状态变化、弹反结果都会写在这里。\n最新的在最上方。'}
          placement="top"
          style={{ display: 'block' }}
        >
          <div
            style={{
              height: 82,
              overflowY: 'auto',
              fontSize: 10.5,
              lineHeight: 1.6,
              color: 'var(--color-mibai)',
              background: 'linear-gradient(180deg, rgba(38,28,17,0.9), rgba(26,19,11,0.92))',
              border: '1px solid rgba(212,168,67,0.55)',
              borderLeft: '3px solid var(--color-miaojin)',
              borderRadius: 5,
              padding: '5px 8px',
              textShadow: '0 1px 2px rgba(0,0,0,0.75)',
            }}
          >
            {state.log
              .slice(-40)
              .reverse()
              .slice(0, 12)
              .map((l, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.05 }}>
                  {l}
                </div>
              ))}
          </div>
        </Tip>
      </div>

      {/* ============ 归墟阶段：手牌超上限时的弃牌面板 ============ */}
      {state.phase === 'relic' && (
        <RelicPhase
          state={state}
          dispatch={dispatch}
          onBurst={handleRelicBurst}
          onDiscard={handleRelicDiscard}
        />
      )}

      {/* ---------- 归墟流光：物理=朱红，术法=月白，飞入底部阴阳炁条 ---------- */}
      {relicFlows.map((f) => (
        <div
          key={f.id}
          style={
            {
              position: 'absolute',
              left: f.x - 26,
              top: f.y - 26,
              width: 52,
              height: 52,
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 94,
              background: f.yang
                ? 'radial-gradient(circle, rgba(214,236,255,1) 0%, rgba(159,196,221,0.85) 45%, rgba(106,158,196,0) 72%)'
                : 'radial-gradient(circle, rgba(255,190,150,1) 0%, rgba(194,59,34,0.85) 45%, rgba(194,59,34,0) 72%)',
              boxShadow: f.yang ? '0 0 26px rgba(214,236,255,0.95)' : '0 0 26px rgba(216,84,58,0.95)',
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
              animation: `relicFlow ${RELIC_FLOW_MS}ms cubic-bezier(0.35,0,0.2,1) forwards`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* ---------- 弃牌残影：半透明停留片刻，表示对手也看得到（留牌心理战） ---------- */}
      {relicGhosts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: 118,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            pointerEvents: 'none',
            zIndex: 93,
          }}
        >
          {relicGhosts.map((g) => (
            <div
              key={g.id}
              style={{
                padding: '3px 7px',
                borderRadius: 5,
                fontSize: 9.5,
                opacity: 0.55,
                background: 'rgba(30,22,14,0.85)',
                border: `1px solid ${g.yang ? 'rgba(159,196,221,0.85)' : 'rgba(216,84,58,0.85)'}`,
                color: g.yang ? 'var(--color-tianqing)' : 'var(--color-liuguang-yin)',
                whiteSpace: 'nowrap',
              }}
            >
              弃 {g.name}
            </div>
          ))}
        </div>
      )}

      {/*
        「大量归墟」演出：一次化去多张时绽放金色水墨莲花。
        放在 BattleScreen 而不是归墟面板里 —— 归墟一结束面板就卸载，
        若把演出挂在面板上会被硬生生切断。
      */}
      {lotus && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 92,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <svg
            width={330}
            height={330}
            viewBox="0 0 200 200"
            style={{ animation: 'relicLotus 1500ms cubic-bezier(0.2,0.7,0.3,1) forwards' }}
          >
            <g transform="translate(100,100)">
              {/* 八瓣莲花：粗黑描边 + 金色平涂，符合全项目粗线条国潮画风 */}
              {Array.from({ length: 8 }).map((_, i) => (
                <ellipse
                  key={i}
                  cx="0"
                  cy="-46"
                  rx="17"
                  ry="46"
                  transform={`rotate(${i * 45})`}
                  fill="var(--color-miaojin)"
                  fillOpacity="0.16"
                  stroke="var(--color-miaojin)"
                  strokeWidth="3.5"
                />
              ))}
              {Array.from({ length: 8 }).map((_, i) => (
                <ellipse
                  key={`in-${i}`}
                  cx="0"
                  cy="-27"
                  rx="10"
                  ry="27"
                  transform={`rotate(${i * 45 + 22.5})`}
                  fill="var(--color-minghuang)"
                  fillOpacity="0.22"
                  stroke="var(--color-miaojin-light)"
                  strokeWidth="3"
                />
              ))}
              <circle
                r="16"
                fill="var(--color-minghuang)"
                fillOpacity="0.55"
                stroke="var(--color-miaojin-light)"
                strokeWidth="3.5"
              />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}

/* ============================== 子组件 ============================== */

/**
 * 敌人信息板：名字 / 血条 / 数值 三行定高。
 *
 * 统一规格（此前中间有盾条、两边是纯血条，高度与字号都不一致）：
 * - 名字行 16 / 血条 96×10 / 数值行 14，盾与状态都挤进数值行
 * - 半透明暗色底 + 金边，解决立绘复杂导致文字辨识度低的问题
 */
function EnemyInfoPanel({ enemy, dead }: { enemy: BattleState['enemies'][number]; dead: boolean }) {
  /** 与玩家血条同一套规则：有盾则压缩血条，右侧接一段松花绿护盾条 */
  const eShield = Math.max(0, enemy.shield ?? 0);
  const eDenom = enemy.maxHp + eShield;
  const eHpPct = eDenom > 0 ? (enemy.hp / eDenom) * 100 : 0;
  const eShPct = eDenom > 0 ? (eShield / eDenom) * 100 : 0;

  return (
    <div
      style={{
        width: '100%',
        height: INFO_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 5px',
        borderRadius: 7,
        background: 'linear-gradient(180deg, rgba(34,25,15,0.78), rgba(24,17,10,0.86))',
        border: '1px solid rgba(212,168,67,0.5)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        opacity: dead ? 0.4 : 1,
      }}
    >
      <div style={{ height: 16, display: 'flex', alignItems: 'center', gap: 3, maxWidth: '100%' }}>
        <span
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 11,
            color: 'var(--color-mibai)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {enemy.name}
        </span>
        {enemy.isBoss && (
          <span
            style={{
              fontSize: 8,
              background: 'var(--color-miaojin)',
              color: 'var(--color-card-title)',
              padding: '0 3px',
              borderRadius: 2,
              fontWeight: 700,
            }}
          >
            首领
          </span>
        )}
      </div>

      <Tip
        text={`敌方气血 ${enemy.hp}/${enemy.maxHp}${
          eShield > 0 ? `\n护盾 ${eShield} 点（优先被扣，条上绿色一段）` : ''
        }\n归零即被击败。`}
        placement="top"
      >
        <div
          style={{
            width: 96,
            height: 10,
            background: 'rgba(0,0,0,0.45)',
            borderRadius: 5,
            border: '1px solid rgba(212,168,67,0.8)',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              width: `${eHpPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--color-enemy-hp-light), var(--color-enemy-hp))',
              transition: 'width 260ms',
              boxShadow: '0 0 6px rgba(217,74,61,0.8)',
            }}
          />
          {eShield > 0 && (
            <div
              style={{
                width: `${eShPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-shield), var(--color-shield-light))',
                borderLeft: '1.5px solid rgba(255,246,220,0.95)',
                transition: 'width 260ms',
                boxShadow: '0 0 6px rgba(123,182,97,0.9)',
              }}
            />
          )}
        </div>
      </Tip>

      <div
        style={{
          height: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          fontSize: 9.5,
          color: 'var(--color-mibai-dim)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        <span>
          {enemy.hp}/{enemy.maxHp}
        </span>
        {enemy.shield > 0 && (
          <Tip text={`护盾 ${enemy.shield} 点\n优先于气血被扣减。`} placement="top">
            <span style={{ color: 'var(--color-songhua)', fontWeight: 700 }}>盾{enemy.shield}</span>
          </Tip>
        )}
        <span style={{ display: 'flex', gap: 2 }}>
          {enemy.statuses.map((s, i) => (
            <Tip key={i} text={t(STATUS_TIP_KEY[s.id])} placement="top">
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <StatusGlyph id={s.id} size={11} />
                <span style={{ fontSize: 9 }}>{s.stacks > 1 ? s.stacks : ''}</span>
              </span>
            </Tip>
          ))}
        </span>
      </div>
    </div>
  );
}

/** 阴阳资源：大号数字 + 分段条 + 发光，与血条在视觉上区分开 */
function QiResource({
  label,
  value,
  cap,
  color,
  tip,
}: {
  label: string;
  value: number;
  cap: number;
  color: string;
  tip: string;
}) {
  return (
    <Tip text={tip} placement="top" style={{ flex: 1, display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, color, fontFamily: 'var(--font-brush)', fontWeight: 700 }}>{label}</span>
        <span
          style={{
            fontSize: 15,
            lineHeight: 1,
            color: 'var(--color-card-title)',
            fontFamily: 'var(--font-brush)',
            fontVariantNumeric: 'tabular-nums',
            textShadow: `0 0 6px ${color}`,
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-card-text-sub)' }}>/{cap}</span>
        <div style={{ display: 'flex', gap: 1.5, flex: 1, minWidth: 0 }}>
          {Array.from({ length: Math.min(cap, 14) }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 2,
                height: 9,
                borderRadius: 1.5,
                background: i < value ? color : 'rgba(120,100,70,0.22)',
                boxShadow: i < value ? `0 0 5px ${color}` : 'none',
                transition: 'background 160ms',
              }}
            />
          ))}
        </div>
      </div>
    </Tip>
  );
}

/** 敌方招式卡：把「意图」做成一张可读的牌 */
function IntentCard({
  label,
  grade,
  active,
  willAttack,
  note,
  shi,
  shiCap,
}: {
  label: string;
  grade: string;
  active: boolean;
  willAttack: boolean;
  note?: string;
  shi: number;
  shiCap: number;
}) {
  const gradeColor: Record<string, string> = {
    base: 'var(--color-card-text-sub)',
    art: 'var(--color-wx-shui)',
    dire: 'var(--color-hupo)',
    kill: 'var(--color-zhuhong)',
  };
  const gradeName: Record<string, string> = { base: '常', art: '技', dire: '凶', kill: '杀' };
  const gradeTip: Record<string, string> = {
    base: '常 · 基础招式',
    art: '技 · 精妙招式',
    dire: '凶 · 凶险招式',
    kill: '杀 · 杀招，伤害极高',
  };
  const accent = gradeColor[grade] ?? gradeColor['base']!;

  return (
    <Tip
      text={`敌方招式「${label}」\n${gradeTip[grade] ?? grade}\n${note ? note + '\n' : ''}势 ${shi}/${shiCap}：不足则本回合只能回气蓄势`}
      placement="top"
    >
      <div
        style={{
          width: '100%',
          height: INTENT_H - 8,
          padding: '2px 5px',
          borderRadius: 5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 1,
          background:
            willAttack && active
              ? 'linear-gradient(180deg, rgba(255,236,220,0.99), rgba(240,200,180,0.97))'
              : 'linear-gradient(180deg, rgba(251,247,236,0.97), rgba(236,217,171,0.94))',
          border: `1.5px solid ${willAttack && active ? 'var(--color-zhuhong)' : 'var(--color-miaojin)'}`,
          boxShadow: willAttack && active ? '0 0 12px rgba(194,59,34,0.7)' : '0 2px 6px rgba(0,0,0,0.35)',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <span
            style={{
              fontSize: 8,
              width: 13,
              height: 13,
              lineHeight: '13px',
              borderRadius: 2,
              background: accent,
              color: 'var(--color-xuanzhi-warm)',
              fontWeight: 700,
              flex: '0 0 auto',
            }}
          >
            {gradeName[grade] ?? '常'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-brush)',
              fontSize: 11,
              color: willAttack && active ? 'var(--color-card-title)' : 'var(--color-card-text)',
              fontWeight: willAttack && active ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        </div>
        {/* 势：出招资源 */}
        <div style={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          {Array.from({ length: shiCap }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 5,
                height: 3,
                borderRadius: 1,
                background: i < shi ? 'var(--color-hupo)' : 'rgba(120,100,70,0.28)',
              }}
            />
          ))}
        </div>
      </div>
    </Tip>
  );
}

/**
 * 卡面底图映射：按「类型 / 五行」分型。
 *
 * 素材缺失时**不会白屏也不会报错** —— 这几张图只是叠加在 CSS 渐变底之上的一层
 * 半透明图案，浏览器加载失败就自动只剩渐变底，游戏照常可玩。
 * 生成提示词见 `public/art/卡面与界面提示词.md`。
 */
const CARD_FACE: Record<string, string> = {
  ultimate: 'card_奥义.png',
  physical: 'card_物理.png',
  support: 'card_功能.png',
  'spell-jin': 'card_术法_金.png',
  'spell-mu': 'card_术法_木.png',
  'spell-shui': 'card_术法_水.png',
  'spell-huo': 'card_术法_火.png',
  'spell-tu': 'card_术法_土.png',
};

/** 取一张卡的卡面分型 key（奥义优先于原类型，五行使术法再细分） */
function faceKeyOf(card: Card): string {
  if (card.isUltimate) return 'ultimate';
  if (card.kind === 'spell' && card.wuxing) return `spell-${card.wuxing}`;
  return card.kind;
}

/**
 * 游戏卡牌 · v3
 *
 * 描边语义（用户约定）：
 * - 金色 = 可融合（未选中任何牌时，标出「有同系伙伴」的牌）
 * - 红色 = 可组合（已选中某张牌后，标出能与它合体的牌）
 * - 金色加粗 + 外发光环 = 本张已被选中；未参与组合的牌降透明
 */
function GameCard({
  card,
  cost,
  playable,
  selected,
  fusible,
  partner,
  dimmed,
}: {
  card: Card;
  cost: { yang: number; yin: number };
  playable: boolean;
  selected: boolean;
  fusible: boolean;
  partner: boolean;
  dimmed: boolean;
}) {
  const wx = card.wuxing;
  const accent = wx ? WX_STROKE[wx] : card.kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';

  const borderColor = selected
    ? 'var(--color-miaojin)'
    : partner
      ? 'var(--color-zhuhong)'
      : card.isUltimate
        ? 'var(--color-miaojin-deep)'
        : accent;
  const borderWidth = selected || partner ? 3 : card.isUltimate ? 2.5 : 1.5;

  /**
   * 外发光环：**只**给「已选中 / 可合体目标」两种状态。
   *
   * 【曾经的 Bug】静止态也把「手上有可融合对象」的牌统统镀上金环 —— 实测一副手牌里有
   * 3 张同系牌，于是一屏出现三道金框，而金框又同时是「选中」的颜色，
   * 玩家根本分不清哪张是选中的 →「高亮包边不明显」。
   * 现在三种状态的视觉语言彻底分开：
   *   静止可合体 = 左边缘一条金条（收拢时恰好可见）
   *   已选中     = 金色粗环 + 上浮放大
   *   可合体目标 = 朱红脉动环 + 轻微上浮
   */
  const glow = selected
    ? '0 0 0 3px rgba(255,229,150,0.95), 0 0 34px rgba(212,168,67,1), 0 12px 26px rgba(40,26,12,0.55)'
    : partner
      ? '0 0 0 2.5px rgba(255,168,140,0.9), 0 0 26px rgba(194,59,34,0.95), 0 8px 16px rgba(40,26,12,0.5)'
      : '0 3px 8px rgba(40,26,12,0.4), inset 0 1px 0 rgba(255,255,255,0.8)';

  /**
   * 牌面底：物理=竹简暖黄；功能=玉青；术法=宣纸；奥义=描金烫底。
   * 全部走 token，不在本文件留下 hex 字面量。
   */
  const faceBase = card.isUltimate
    ? 'linear-gradient(158deg, var(--color-xuanzhi-warm) 0%, var(--color-miaojin-light) 58%, var(--color-miaojin) 100%)'
    : card.kind === 'physical'
      ? 'linear-gradient(158deg, var(--color-xuanzhi-warm) 0%, var(--color-zhujian) 100%)'
      : card.kind === 'support'
        ? 'linear-gradient(158deg, var(--color-yushi) 0%, var(--color-yushi-deep) 100%)'
        : 'linear-gradient(158deg, var(--color-xuanzhi) 0%, var(--color-zhujian-deep) 100%)';

  /** 分型卡面图（可缺省）：缺图时这一层不渲染，只剩上面的渐变底 */
  const faceImg = CARD_FACE[faceKeyOf(card)];

  // 【S1 归一】卡牌类别名 / 五行中文名真源 = i18n（原 KIND_LABEL / WX_CN 两份本地副本已删）
  const kindTip = `「${card.name}」\n${t(KIND_KEY[card.kind])}${wx ? `·${t(WUXING_KEY[wx])}` : ''}${card.hits > 1 ? ` · ${card.hits} 段` : ''}${card.aoe ? ' · 群体' : ''}\n${card.desc}`;

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 8,
        border: `${borderWidth}px solid ${borderColor}`,
        background: faceBase,
        boxShadow: glow,
        // 可合体目标：脉动，与「选中」的静态金环区分开
        animation: partner ? 'fuseRingPulse 1.35s ease-in-out infinite' : undefined,
        transition: 'box-shadow 150ms, border-color 150ms, opacity 150ms',
        opacity: dimmed ? 0.45 : playable ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 5px 4px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/*
        静止态「有可合体对象」的指示：只在**左边缘**描一条金条。
        手牌收拢时每张牌恰好只露出左侧一条边，金条正好露在外面 —— 既不跟
        「选中的金环」抢语义，也不会像以前那样一屏四五道金框。
      */}
      {fusible && !selected && !partner && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3.5,
            zIndex: 4,
            background: 'linear-gradient(180deg, rgba(255,229,150,0.98), rgba(212,168,67,0.95))',
            boxShadow: '0 0 7px rgba(212,168,67,0.9)',
          }}
        />
      )}

      {/*
        分型卡面图（物理 / 五行术法 / 功能 / 奥义 各一张，见 public/art/卡面与界面提示词.md）。
        做成「叠在渐变底上的一层半透明图案」而不是直接当 background，
        这样素材没生成时只是少一层花纹，文字对比度和可玩性都不受影响。
      */}
      {faceImg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${BASE}art/${faceImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: card.isUltimate ? 0.6 : 0.42,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 五行/类型中央大图标（半透明水印） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.2,
        }}
      >
        {wx ? <WuXingGlyph wuxing={wx} size={62} opacity={1} /> : <KindGlyph kind={card.kind} />}
      </div>

      {/* 顶部：标题 */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'flex-start', gap: 3 }}>
        <Tip text={kindTip} placement="top" style={{ flex: 1, display: 'block' }}>
          <span
            style={{
              fontFamily: 'var(--font-brush)',
              fontSize: 13,
              color: 'var(--color-card-title)',
              lineHeight: 1.1,
              fontWeight: 700,
              display: 'block',
            }}
          >
            {card.name}
          </span>
        </Tip>
        {wx && (
          <Tip text={WUXING_TIP[wx] ?? wx} placement="top">
            <WuXingSeal wuxing={wx} size={15} />
          </Tip>
        )}
      </div>

      {/* 类型标签 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          fontSize: 9,
          color: 'var(--color-card-text-sub)',
        }}
      >
        {wx ? `${t(KIND_KEY[card.kind])}·${t(WUXING_KEY[wx])}` : t(KIND_KEY[card.kind])}
        {card.hits > 1 ? ` ×${card.hits}段` : ''}
        {card.aoe ? ' ·群' : ''}
      </div>

      {/* 效果描述：加大字重与对比度（此前偏小偏灰） */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: 10,
          lineHeight: 1.3,
          color: 'var(--color-ink-soft)',
          fontWeight: 700,
          marginTop: 2,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.desc}
      </div>

      {/* 左上：炁消耗 */}
      <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 2, zIndex: 3 }}>
        {cost.yang > 0 && (
          <Tip text={`阳炁消耗 ${cost.yang} 点\n攻击与调息可获得阳炁。`} placement="top">
            <QiPip type="yang" n={cost.yang} />
          </Tip>
        )}
        {cost.yin > 0 && (
          <Tip text={`阴炁消耗 ${cost.yin} 点\n术法主耗阴炁，受击亦可积累。`} placement="top">
            <QiPip type="yin" n={cost.yin} />
          </Tip>
        )}
      </div>

      {/*
        融合提示角标：只保留「可合体」（选中之后才有意义）。
        静止态的「可融合」角标已删除 —— 它钉在右下角，而手牌收拢时右下角被
        右边那张牌整个盖住，等于看不见；现在改用左边缘金条表达同一件事。
      */}
      {partner && (
        <div
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            fontSize: 8,
            padding: '0 3px',
            borderRadius: 2,
            zIndex: 4,
            fontWeight: 700,
            background: 'var(--color-zhuhong)',
            color: 'var(--color-xuanzhi-warm)',
          }}
        >
          可合体
        </div>
      )}

      {card.isUltimate && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            fontSize: 8,
            background: 'var(--color-minghuang)',
            color: 'var(--color-card-title)',
            padding: '0 3px',
            borderRadius: 2,
            zIndex: 3,
            fontWeight: 700,
          }}
        >
          奥义
        </div>
      )}
    </div>
  );
}

/** 炁消耗圆点：阳=琥珀、阴=石青 */
function QiPip({ type, n }: { type: 'yang' | 'yin'; n: number }) {
  const color = type === 'yang' ? 'var(--color-hupo)' : 'var(--color-shishui)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: color,
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-card-text)' }}>{n}</span>
    </span>
  );
}

/** 物理/功能牌的中央图形（无五行时） */
function KindGlyph({ kind }: { kind: string }) {
  const color = kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';
  return (
    <svg viewBox="0 0 100 100" width={62} height={62} style={{ opacity: 0.9 }}>
      {kind === 'physical' ? (
        <g fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 78 L70 30" />
          <path d="M62 22 L78 38 L70 46 L54 30 Z" fill={color} opacity="0.55" />
          <path d="M18 82 L30 70" strokeWidth="6" />
        </g>
      ) : (
        <g fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round">
          <circle cx="50" cy="50" r="24" />
          <path d="M50 26 V74 M26 50 H74" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}
