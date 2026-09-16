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
import { LUNAR_MONTH_MAP, SOLAR_TERM_MAP } from '../game/data/world';
import { PARRY_TELEGRAPH_MS, PARRY_TOTAL_MS } from '../game/constants';
import { KIND_KEY, t, WUXING_KEY } from '../i18n';
import { WuXingGlyph, WuXingSeal, WX_STROKE } from './svg/Glyphs';
import { JadeButton } from './ui/Primitives';
import { Tip, WUXING_TIP } from './ui/Tip';
import { RelicPhase } from './RelicPhase';
import type { DiscardFlow } from './RelicPhase';
import { playSfx } from '../game/audio';
import type { FxHandle } from './fx/Effects';
import {
  BASE,
  CARD_H,
  CARD_W,
  FOLD_STEP,
  MOVE_SLOP_PX,
  QI_BAR_TARGET,
  RELEASE_BACK_PX,
  RELIC_FLOW_MS,
  SELECT_LIFT_PX,
} from './battle/constants';
import { TopBar } from './battle/TopBar';
import { EnemyZone } from './battle/EnemyZone';
import { StanceBar } from './battle/StanceBar';
import { PlayerPanel } from './battle/PlayerPanel';

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

      {/* ============ 天时条（T03 · battle/TopBar） ============ */}
      <TopBar
        month={month}
        term={term}
        monthId={state.lunarMonthId}
        termId={state.solarTermId}
        turn={state.turn}
        onExit={onExit}
      />

      {/* ============ 敌方区（T05 · battle/EnemyZone） ============ */}
      <EnemyZone
        state={state}
        targetId={targetId}
        intentOf={intentOf}
        onSelectTarget={setSelectedTarget}
        shake={shake}
      />

      {/* ============ 架势条（T03 · battle/StanceBar） ============ */}
      <StanceBar
        stance={state.stance}
        stanceSwitched={state.stanceSwitched}
        pending={pendingStance}
        onSelect={setPendingStance}
        onConfirm={() => {
          if (!pendingStance) return;
          dispatch({ type: 'SWITCH_STANCE', stance: pendingStance });
          setPendingStance(null);
        }}
      />

      {/* ============ 我方面板（T04 · battle/PlayerPanel） ============ */}
      <PlayerPanel state={state} char={char} />

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
