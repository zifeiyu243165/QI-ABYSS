/**
 * 战斗界面 · v2 汉唐明媚
 *
 * 分区（390×844）：
 *   天时条 40 / 敌方区 260 / 架势条 40 / 我方面板 108 / 手牌区 216 / 操作栏 剩余
 *
 * v2 重构要点（对齐用户方案）：
 * - 手牌：宣纸米白底 + 中央五行大图标 + 横向重叠扇形，缩小高度，点击弹出放大
 * - 敌方：脚下八卦发光底盘，敌我分明；意图以「招式卡」呈现
 * - 血条/炁条：粗壮 + 流光；主角血条朱红渐变
 * - 按钮：朱红底金边；「阴阳逆转（调息）」替代「调息 2:1」
 * - 弹反判定：游标 CSS 动画驱动，点击用 performance.now() 计时
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleAction } from '../game/engine/battle';
import { canFuse, canPlayCard, cardCost } from '../game/engine/battle';
import type { BattleState, Card, StanceId } from '../game/types';
import { CHARACTER_MAP } from '../game/data/actors';
import { LUNAR_MONTH_MAP, SOLAR_TERM_MAP, STANCES } from '../game/data/world';
import { SHI_SHEN_MAP } from '../game/data/world';
import { EQUIPMENT_MAP, findCombo } from '../game/data/cards';
import { PARRY_TELEGRAPH_MS, PARRY_TOTAL_MS, SHI_CAP, WUSHENG_KAITIAN_STACKS } from '../game/constants';
import { CharacterFigure, EnemyFigure } from './svg/Figure';
import { BaguaPlatform, StatusGlyph, WuXingGlyph, WuXingSeal, STATUS_CN, WX_STROKE } from './svg/Glyphs';
import { JadeButton, FlowBar } from './ui/Primitives';
import { Tip, STATUS_TIP, WUXING_TIP } from './ui/Tip';
import type { FxHandle } from './fx/Effects';

const BASE = import.meta.env.BASE_URL;

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
  const fxConsumed = useRef<string>('');

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

  /* ---------- 手牌：斗地主式扇形 + 拖拽选中 ---------- */
  /** 上拖超过此距离 → 进入选中态 */
  const SELECT_LIFT_PX = 56;
  /** 回落在此范围内 → 退出选中态 */
  const RELEASE_BACK_PX = 24;

  const dragRef = useRef<{ uid: string; startY: number; startX: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ uid: string; dy: number; mode: 'press' | 'select' } | null>(null);

  /** 可融合的牌（未选中任何牌时用金色外框标出） */
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

  /** 选中一张牌后，能与它组合的牌（用红色外框标出） */
  const partnerUids = useMemo(() => {
    if (selectedCards.length !== 1) return new Set<string>();
    const a = state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
    if (!a) return new Set<string>();
    return new Set(
      state.hand.filter((c) => (c.uid ?? c.id) !== (a.uid ?? a.id) && canFuse(a, c)).map((c) => c.uid ?? c.id),
    );
  }, [selectedCards, state.hand]);

  const handleCardPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, card: Card) => {
    const uid = card.uid ?? card.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { uid, startY: e.clientY, startX: e.clientX, moved: false };
    setDrag({ uid, dy: 0, mode: 'press' });
  }, []);

  const handleCardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      if (Math.abs(dy) > 4 || Math.abs(e.clientX - d.startX) > 4) d.moved = true;
      const held = selectedCards.includes(d.uid);
      const mode: 'press' | 'select' =
        dy < -SELECT_LIFT_PX ? 'select' : held && dy < -RELEASE_BACK_PX ? 'select' : 'press';
      setDrag({ uid: d.uid, dy, mode });
    },
    [selectedCards],
  );

  const handleCardPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;

      const dy = e.clientY - d.startY;
      const held = selectedCards.includes(d.uid);
      const card = state.hand.find((c) => (c.uid ?? c.id) === d.uid);
      const fuseWith = (target: Card) => {
        const a = state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
        if (!a) return false;
        dispatch({
          type: 'FUSE',
          cardAId: a.uid ?? a.id,
          cardBId: target.uid ?? target.id,
          targetId: targetId ?? undefined,
        });
        setSelectedCards([]);
        return true;
      };

      // 轻点（未拖动）：已有选中牌且本张可与之组合 → 直接合体；否则仅作「抽出预览」，回位不选中
      if (!d.moved) {
        if (selectedCards.length === 1 && card) fuseWith(card);
        return;
      }

      // 上拖 → 进入选中（若能组合则直接合体）
      if (dy < -SELECT_LIFT_PX) {
        if (held) return;
        if (selectedCards.length === 1 && card && fuseWith(card)) return;
        setSelectedCards([d.uid]);
        return;
      }

      // 下拖 → 退出选中，回归手牌
      if (held && dy > -RELEASE_BACK_PX) {
        setSelectedCards((prev) => prev.filter((x) => x !== d.uid));
      }
    },
    [selectedCards, state.hand, dispatch, targetId],
  );

  const playSelected = useCallback(() => {
    const uid = selectedCards[0];
    if (!uid) return;
    dispatch({ type: 'PLAY_CARD', cardId: uid, targetId: targetId ?? undefined });
    setSelectedCards([]);
  }, [selectedCards, dispatch, targetId]);

  /** 兜底按钮：选中一张后，若有可组合的牌则合并 */
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
  /** 当前架势的「阴阳逆转」兑换比（体修/法修为 2:1，散修为 1:1） */
  const regRatio = STANCES.find((s) => s.id === state.stance)?.substituteRatio ?? 2;

  /** 引擎在 enemyAct 用 (turn-1) 取意图，UI 展示必须与之一致 */
  const intentOf = (intents: { type: string; label: string }[], turn: number) =>
    intents[(turn - 1) % intents.length];

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
          filter: 'saturate(0.94) brightness(1.02)',
          opacity: 0.96,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* 霞光罩层：让整体色温偏暖 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(243,217,164,0.28) 0%, rgba(223,234,242,0.14) 42%, rgba(251,247,236,0.5) 100%)',
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
          height: 40,
          flex: '0 0 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          background: 'linear-gradient(180deg, rgba(138,90,52,0.92), rgba(138,90,52,0.72))',
          borderBottom: '1.5px solid var(--color-miaojin)',
          fontSize: 11,
          zIndex: 20,
        }}
      >
        <Tip
          text={`月令·${month?.label ?? state.lunarMonthId}\n${month?.desc ?? ''}\n${(month?.defMul ?? 1) > 1 ? '本月防御倍率 ×' + month?.defMul : '本月防御无额外加成'}`}
          placement="bottom"
        >
          <span style={{ color: 'var(--color-miaojin-light)', fontFamily: 'var(--font-brush)' }}>
            {month?.label ?? state.lunarMonthId}
          </span>
        </Tip>
        <span style={{ color: 'rgba(251,247,236,0.45)' }}>│</span>
        <Tip
          text={`节气·${term?.name ?? state.solarTermId}（${term?.season ?? ''}）\n${term?.desc ?? ''}\n${term?.implemented ? '本节气效果已实装，会在符合条件时自动触发。' : '本节气为留位数据，尚未实装效果。'}`}
          placement="bottom"
        >
          <span style={{ color: 'var(--color-xuanzhi-warm)', fontFamily: 'var(--font-brush)' }}>
            炁候·{term?.name ?? state.solarTermId}
          </span>
        </Tip>
        <Tip
          text={`第 ${state.turn} 回合\n你出牌或结束回合 → 敌方行动 → 进入下一回合。\n每回合抽牌并回炁。`}
          placement="bottom"
          style={{ marginLeft: 'auto' }}
        >
          <span
            style={{
              color: 'var(--color-xuanzhi-warm)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            第 {state.turn} 回合
          </span>
        </Tip>
        {onExit && (
          <Tip text="撤退\n退出当前战斗，返回主界面（本局进度不保留）。" placement="bottom">
            <button onClick={onExit} style={{ color: 'rgba(251,247,236,0.75)', fontSize: 11 }}>
              撤退
            </button>
          </Tip>
        )}
      </div>

      {/* ============ 敌方区 ============ */}
      <div
        key={`enemy-${shake}`}
        className={shake > 0 && state.pendingNumbers.some((n) => n.targetId !== 'player') ? 'shake' : undefined}
        style={{
          height: 260,
          flex: '0 0 260px',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 10,
          paddingBottom: 10,
          zIndex: 10,
        }}
      >
        {state.enemies.map((e) => {
          const dead = e.hp <= 0;
          const hasFlaw = e.statuses.some((s) => s.id === 'flaw');
          const isTarget = e.id === targetId && !dead;
          const intent = intentOf(e.intents, state.turn);
          const willAttack = isTelegraph && (intent?.type === 'attack' || intent?.type === 'aoe');
          const grade = (intent as { grade?: string })?.grade ?? 'base';

          return (
            <div
              key={e.id}
              onClick={() => !dead && setSelectedTarget(e.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                opacity: dead ? 0.24 : 1,
                filter: dead ? 'grayscale(1)' : undefined,
                transition: 'opacity 300ms',
                position: 'relative',
              }}
            >
              {/* ---- 招式卡：敌方意图以卡牌形式公示 ---- */}
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

              <div
                style={{
                  position: 'relative',
                  borderRadius: 10,
                  padding: 2,
                  animation: hasFlaw ? 'flawPulse 1.4s ease-in-out infinite' : undefined,
                  outline: isTarget ? '2px solid rgba(212,168,67,0.75)' : 'none',
                  outlineOffset: 2,
                  width: e.isBoss ? 150 : 112,
                  height: e.isBoss ? 168 : 132,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                {/* 八卦发光底盘：解决敌我融于背景的问题 */}
                <BaguaPlatform size={e.isBoss ? 150 : 116} wuxing={e.wuxing} />

                <EnemyFigure
                  enemyId={e.id.replace('enemy_', '')}
                  shape={e.shape}
                  wuxing={e.wuxing}
                  size={e.isBoss ? 150 : 112}
                  dim={dead}
                  charging={willAttack}
                />

                {hasFlaw && (
                  <Tip text={STATUS_TIP['flaw'] ?? '破绽'} placement="top">
                    <div
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        fontSize: 10,
                        background: 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))',
                        color: 'var(--color-card-title)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontWeight: 700,
                        border: '1px solid var(--color-xuanzhi-warm)',
                      }}
                    >
                      破绽
                    </div>
                  </Tip>
                )}
              </div>

              <Tip
                text={`${e.name}\n五行·${e.wuxing ? (WUXING_TIP[e.wuxing]?.split('\n')[0] ?? e.wuxing) : '无属'}${e.isBoss ? '\n首领：气血更厚，且拥有杀招。' : ''}${e.chargeStacks > 0 ? `\n蓄势 ×${e.chargeStacks}：伤害随蓄势层数放大，可被相克术法打断。` : ''}\n点击立绘可切换攻击目标。`}
                placement="top"
              >
                <div style={{ fontSize: 11, color: 'var(--color-card-text)', fontFamily: 'var(--font-brush)' }}>
                  {e.name}
                  {e.isBoss && <span style={{ color: 'var(--color-zhuhong)' }}> ·首领</span>}
                  {e.chargeStacks > 0 && (
                    <span style={{ color: 'var(--color-zhuhong)', fontWeight: 700 }}> 蓄势×{e.chargeStacks}</span>
                  )}
                </div>
              </Tip>

              {/* 敌方血条：亮红 + 金边 */}
              <Tip text={`敌方气血 ${e.hp}/${e.maxHp}\n归零即被击败。${e.shield > 0 ? `\n护盾 ${e.shield} 点：优先于气血被扣减。` : ''}`} placement="top">
                <div
                  style={{
                    width: 88,
                    height: 9,
                    background: 'rgba(90,60,30,0.35)',
                    borderRadius: 5,
                    border: '1px solid var(--color-miaojin)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(e.hp / e.maxHp) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #e8604a, var(--color-enemy-hp))',
                      borderRadius: 4,
                      transition: 'width 260ms',
                      boxShadow: '0 0 6px rgba(217,74,61,0.7)',
                    }}
                  />
                </div>
              </Tip>
              <div style={{ fontSize: 10, color: 'var(--color-card-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                {e.hp}/{e.maxHp}
                {e.shield > 0 && (
                  <Tip text={`护盾 ${e.shield} 点\n优先于气血被扣减，本回合结束不会结转。`} placement="top">
                    <span style={{ color: 'var(--color-songhua)', fontWeight: 700 }}> ·盾{e.shield}</span>
                  </Tip>
                )}
              </div>

              {/* 状态：太极/火焰/冰裂纹样，替代方块图标 */}
              {e.statuses.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {e.statuses.map((s, i) => (
                    <Tip key={i} text={STATUS_TIP[s.id] ?? `${STATUS_CN[s.id] ?? s.id}`} placement="top">
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 9,
                          padding: '1px 4px 1px 2px',
                          borderRadius: 3,
                          background: 'rgba(251,247,236,0.92)',
                          border: '1px solid rgba(212,168,67,0.7)',
                          color: 'var(--color-card-text)',
                        }}
                      >
                        <StatusGlyph id={s.id} size={12} />
                        {STATUS_CN[s.id] ?? s.id}
                        {s.stacks > 1 ? `×${s.stacks}` : ''}
                      </span>
                    </Tip>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============ 架势条 ============ */}
      <div
        style={{
          height: 40,
          flex: '0 0 40px',
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
          const disabled = state.stanceSwitched && !active;
          return (
            <Tip
              key={s.id}
              text={`${s.name}\n${s.desc}${active ? '\n（当前架势）' : disabled ? '\n本回合已切换过架势，下回合才能再换。' : '\n点击切换为该架势。'}`}
              placement="top"
              style={{ flex: 1 }}
            >
              <button
                disabled={disabled}
                onClick={() => dispatch({ type: 'SWITCH_STANCE', stance: s.id as StanceId })}
                style={{
                  width: '100%',
                  padding: '5px 2px',
                  borderRadius: 5,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-brush)',
                  letterSpacing: 1,
                  border: `1.5px solid ${active ? 'var(--color-miaojin)' : 'rgba(138,90,52,0.35)'}`,
                  background: active
                    ? 'linear-gradient(180deg, #d8543a, var(--color-zhuhong))'
                    : 'linear-gradient(180deg, rgba(251,247,236,0.9), rgba(236,217,171,0.82))',
                  color: active ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-text-sub)',
                  opacity: disabled ? 0.4 : 1,
                  textShadow: active ? '0 1px 2px rgba(80,20,10,0.5)' : 'none',
                }}
              >
                {s.name.split('·')[0]}
              </button>
            </Tip>
          );
        })}
      </div>

      {/* ============ 我方面板 ============ */}
      <div
        style={{
          height: 108,
          flex: '0 0 108px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          margin: '0 8px',
          borderRadius: 8,
          background: 'linear-gradient(160deg, rgba(251,247,236,0.94), rgba(236,217,171,0.86))',
          border: '1.5px solid var(--color-miaojin)',
          boxShadow: '0 3px 12px rgba(120,90,40,0.25), inset 0 1px 0 rgba(255,246,220,0.8)',
          zIndex: 10,
        }}
      >
        <CharacterFigure
          characterId={state.characterId}
          robe={char?.palette.robe ?? '#0b2e59'}
          trim={char?.palette.trim ?? '#ca6924'}
          hair={char?.palette.hair ?? '#1a1f2b'}
          weapon={state.equipment.some((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade') ? 'blade' : 'artifact'}
          size={96}
          flat
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <Tip text={`角色：${char?.name}\n${char?.rizhu ?? ''}日主，五行属${WUXING_TIP[char?.wuxing ?? '']?.split(' ')[0] ?? char?.wuxing ?? ''}。`} placement="top">
              <span style={{ fontFamily: 'var(--font-brush)', color: 'var(--color-card-title)', fontSize: 13 }}>
                {char?.name}
              </span>
            </Tip>
            <Tip text={`日主·${char?.rizhu}\n该角色的本命五行，决定其感受节气与月令加成的方式。`} placement="top">
              <span
                style={{
                  fontSize: 9,
                  background: 'var(--color-zhuhong)',
                  color: 'var(--color-xuanzhi-warm)',
                  padding: '1px 4px',
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
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 2,
                      background: 'rgba(11,46,89,0.82)',
                      color: 'var(--color-yuebai)',
                      opacity: info && !info.implemented ? 0.6 : 1,
                    }}
                  >
                    {info?.name ?? s}
                  </span>
                </Tip>
              );
            })}
          </div>

          <Tip
            text={`气血 ${state.player.hp}/${state.player.maxHp}\n归零即战败。受击先扣护盾，再扣气血。`}
            placement="top"
            style={{ display: 'block' }}
          >
            <FlowBar
              label="气血"
              value={state.player.hp}
              cap={state.player.maxHp}
              color="linear-gradient(90deg, var(--color-hp-grad-a), var(--color-hp-grad-b))"
              height={13}
            />
          </Tip>

          <div style={{ display: 'flex', gap: 8 }}>
            <Tip
              text={`阳炁 ${state.yang}/${state.yangCap}\n出物理牌消耗。攻击命中、调息可积累，是「性命双修」中炼「命」的一面。`}
              placement="top"
              style={{ flex: 1, display: 'block' }}
            >
              <FlowBar label="阳" value={state.yang} cap={state.yangCap} color="var(--color-hupo)" height={11} segments />
            </Tip>
            <Tip
              text={`阴炁 ${state.yin}/${state.yinCap}\n出术法牌消耗。受击与术法相生可积累，是炼「性」的一面。`}
              placement="top"
              style={{ flex: 1, display: 'block' }}
            >
              <FlowBar label="阴" value={state.yin} cap={state.yinCap} color="var(--color-shishui)" height={11} segments />
            </Tip>
          </div>
        </div>

        <div style={{ width: 64, textAlign: 'center', fontSize: 10, flex: '0 0 auto' }}>
          {state.stance === 'tixiu' && (
            <Tip
              text={`势 ${state.shi}／${SHI_CAP}\n体修专属资源：每打出一张物理牌积攒 1 层。\n满 ${SHI_CAP} 层解锁「破军」，下张物理牌造成 攻击×层数 的真实伤害。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-hupo)', fontSize: 17, fontFamily: 'var(--font-brush)' }}>
                  {state.shi}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)' }}>势／{SHI_CAP}</div>
              </div>
            </Tip>
          )}
          {state.stance === 'sanxiu' && (
            <Tip
              text={`阴阳差 ${Math.abs(state.yang - state.yin)}\n散修核心：阴阳炁差值越大，暴击率与暴击伤害越高。\n差值达上限触发「剑走偏锋」：本回合伤害 +100%，回合结束自损 30% 当前气血。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-zhuhong)', fontSize: 17, fontFamily: 'var(--font-brush)' }}>
                  {Math.abs(state.yang - state.yin)}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)' }}>阴阳差</div>
              </div>
            </Tip>
          )}
          {state.stance === 'faxiu' && (
            <Tip
              text={`五行轮转：${state.lastSpellWuxing ? '相生（已进入轮转）' : '起手（本回合尚未出术法）'}\n法修按五行相生顺序（木→火→土→金→水）连续出术法牌，每张费用减半且伤害递增 10%。\n相克可打断敌方蓄力并附加虚弱。`}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-wx-shui)', fontSize: 14, fontFamily: 'var(--font-brush)' }}>
                  {state.lastSpellWuxing ? '相生' : '起手'}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)' }}>五行</div>
              </div>
            </Tip>
          )}
          {bladeCount >= 2 && (
            <Tip text={`纯阳开天 ${state.wushengStacks}/${WUSHENG_KAITIAN_STACKS}\n双持兵刃时积累的叠层，满层释放「纯阳开天」奥义。`} placement="top">
              <div style={{ color: 'var(--color-card-title)', fontSize: 9, marginTop: 3 }}>
                纯阳 {state.wushengStacks}/{WUSHENG_KAITIAN_STACKS}
              </div>
            </Tip>
          )}
          {combo && bladeCount === 1 && (
            <Tip text={`连携技「${combo.skillName}」\n装备组合触发的被动：同时佩戴对应兵刃与法器时生效。`} placement="top">
              <div style={{ color: 'var(--color-hupo)', fontSize: 9, marginTop: 3 }}>{combo.skillName}</div>
            </Tip>
          )}
        </div>
      </div>

      {/* ============ 手牌区 / 弹反区 ============ */}
      <div
        style={{
          height: 216,
          flex: '0 0 216px',
          position: 'relative',
          padding: '10px 0 4px',
          // 高于操作栏：卡片「抽出预览」上浮后会盖在按钮之上
          zIndex: 40,
        }}
      >
        {!isTelegraph ? (
          <>
            {/* 横向重叠扇形手牌 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                height: 130,
                paddingTop: 14,
                // 必须 visible：卡片「抽出预览」会上浮 176px，被裁剪就看不见了。
                // 手牌上限 8 张时扇形总宽 344px < 390，无需横向滚动。
                overflow: 'visible',
              }}
            >
              {state.hand.map((c, i) => {
                const cost = cardCost(state, c);
                const playable = canPlayCard(state, c);
                const uid = c.uid ?? c.id;
                const sel = selectedCards.includes(uid);
                const dragging = drag?.uid === uid;
                const pressPreview = dragging && drag?.mode === 'press';
                const selectPreview = dragging && drag?.mode === 'select';
                const fusible = selectedCards.length === 0 && fusibleUids.has(uid);
                const partner = partnerUids.has(uid);

                const n = state.hand.length;
                // 重叠：牌多时只露出左侧边缘（斗地主式扇形）
                const overlap = n <= 4 ? 6 : n <= 6 ? 26 : 40;
                const mid = (n - 1) / 2;
                const rot = (i - mid) * (n > 5 ? 2 : 3);
                const lift = Math.abs(i - mid) * (n > 5 ? 1.5 : 3);

                // 三种姿态：待机（扇形）/ 选中（上浮定住）/ 抽出预览（浮到屏幕中间放大）
                let transform = `rotate(${rot}deg) translateY(${lift}px)`;
                let z = i;
                if (sel || selectPreview) {
                  transform = 'rotate(0deg) translateY(-92px) scale(1.08)';
                  z = 120;
                }
                if (pressPreview) {
                  transform = 'rotate(0deg) translateY(-176px) scale(1.36)';
                  z = 200;
                }

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
                      transition: dragging ? 'none' : 'transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1.1)',
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
                      selected={sel || selectPreview}
                      fusible={fusible}
                      partner={partner}
                    />
                  </div>
                );
              })}
              {state.hand.length === 0 && (
                <div style={{ color: 'var(--color-card-text-sub)', fontSize: 12, padding: 12 }}>手牌已空</div>
              )}
            </div>

            <div
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <div style={{ textAlign: 'center', fontSize: 9.5, color: 'var(--color-card-text-sub)' }}>
                按住看牌 · 上拖选中 · 下拖归位 · 点红框牌合体
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Tip
                  text={'出牌\n选中一张（向上拖）后点此打出。\n物理牌耗阳炁，术法牌耗阴炁。'}
                  placement="top"
                  style={{ flex: 1 }}
                >
                  <JadeButton
                    onClick={playSelected}
                    disabled={selectedCards.length !== 1}
                    variant="primary"
                    style={{ width: '100%' }}
                  >
                    出　牌
                  </JadeButton>
                </Tip>
                <Tip
                  text={'合并奥义\n两张同系牌（双物理 / 同五行术法）可合体：\n伤害倍率 ×1.5，且不额外消耗回合。\n金框=可融合，红框=能与当前选中牌组合。'}
                  placement="top"
                  style={{ flex: 1 }}
                >
                  <JadeButton
                    onClick={() => {
                      if (!fuseHint) return;
                      const a = selectedCards[0];
                      if (!a) return;
                      dispatch({
                        type: 'FUSE',
                        cardAId: a,
                        cardBId: fuseHint.uid ?? fuseHint.id,
                        targetId: targetId ?? undefined,
                      });
                      setSelectedCards([]);
                    }}
                    disabled={!fuseHint}
                    variant="gold"
                    style={{ width: '100%' }}
                  >
                    合并奥义 ×1.5
                  </JadeButton>
                </Tip>
              </div>
            </div>
          </>
        ) : (
          /* ---- 弹反面板 ---- */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              paddingTop: 4,
            }}
          >
            <Tip
              text={'弹反时序\n游标自左向右划过：\n· 红色区按下 = 普通格挡（减伤 60%）\n· 金色区按下 = 完美弹反（免疫该次攻击并追击）\n· 游标走完仍未按下 = 未格挡，全额受伤'}
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
              text={'格挡\n敌方出招前的瞬间点击：\n· 游标进入金色区点击 = 完美弹反\n· 红色区点击 = 普通格挡（减伤 60%）\n只需点击，无需拖动。'}
              placement="top"
              style={{ display: 'block', width: 334 }}
            >
              <button
                disabled={state.parried}
                onClick={handleParry}
                style={{
                  width: 334,
                  height: 112,
                  borderRadius: 10,
                  fontFamily: 'var(--font-brush)',
                  fontSize: 32,
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
            <div style={{ fontSize: 11, color: 'var(--color-card-text-sub)' }}>
              游标进入金色区按下 = 完美弹反（免疫 + 追击）· 红色区按下 = 普通格挡（减伤 60%）
            </div>
          </div>
        )}
      </div>

      {/* ============ 操作栏 ============ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '4px 10px 8px',
          gap: 6,
          minHeight: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Tip
            text={`阴阳逆转\n把较多的那种炁，按 ${regRatio} : 1 的比例转换成另一种炁，用于凑齐出牌费用。\n每回合限一次；敌方前摇时不可用。`}
            placement="top"
            style={{ flex: 1 }}
          >
            <JadeButton
              onClick={() => dispatch({ type: 'REGULATE', from: state.yang >= state.yin ? 'yang' : 'yin' })}
              disabled={state.regulated || isTelegraph}
              variant="ghost"
              size="sm"
              style={{ width: '100%' }}
            >
              ☯ 阴阳逆转{state.regulated ? '（已用）' : ''}
            </JadeButton>
          </Tip>
          <Tip
            text={'结束回合\n放弃本回合剩余行动，进入敌方回合：\n敌方按其公示的招式卡行动，随后进入你的下一回合。\n腾出的时机可用于蓄炁或规避。'}
            placement="top"
            style={{ flex: 1 }}
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

        <Tip
          text={'战报\n本场战斗的逐条记录：出牌、伤害、状态变化、弹反结果都会写在这里。\n最新的在最上方。'}
          placement="top"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              fontSize: 10.5,
              lineHeight: 1.7,
              color: 'var(--color-card-text-sub)',
              background: 'rgba(251,247,236,0.72)',
              border: '1px solid rgba(212,168,67,0.5)',
              borderRadius: 5,
              padding: '5px 8px',
              minHeight: 0,
            }}
          >
            {state.log
              .slice(-14)
              .reverse()
              .map((l, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.055 }}>
                  {l}
                </div>
              ))}
          </div>
        </Tip>
      </div>
    </div>
  );
}

/* ============================== 子组件 ============================== */

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
        minWidth: 76,
        padding: '3px 6px',
        borderRadius: 5,
        background: willAttack && active
          ? 'linear-gradient(180deg, rgba(255,236,220,0.98), rgba(240,200,180,0.95))'
          : 'linear-gradient(180deg, rgba(251,247,236,0.95), rgba(236,217,171,0.9))',
        border: `1.5px solid ${willAttack && active ? 'var(--color-zhuhong)' : 'var(--color-miaojin)'}`,
        boxShadow: willAttack && active ? '0 0 10px rgba(194,59,34,0.55)' : '0 2px 5px rgba(120,90,40,0.2)',
        textAlign: 'center',
        lineHeight: 1.25,
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
      {note && (
        <div style={{ fontSize: 8, color: 'var(--color-card-text-sub)', whiteSpace: 'nowrap' }}>{note}</div>
      )}
      {/* 敌方势：出招资源 */}
      <div style={{ display: 'flex', gap: 1, justifyContent: 'center', marginTop: 2 }}>
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

const KIND_LABEL: Record<string, string> = {
  physical: '物理',
  spell: '术法',
  support: '功能',
};

/**
 * 游戏卡牌 · v2
 * 宣纸米白 / 竹简暖黄底；中央五行大图标；左上阴阳炁消耗圆点；底部高对比描述。
 *
 * 描边语义（用户约定）：
 * - 金色 = 可融合（未选中任何牌时，标出「有同系伙伴」的牌）
 * - 红色 = 可组合（已选中某张牌后，标出能与它合体的牌）
 * - 金色加粗 = 本张已被选中
 */
function GameCard({
  card,
  cost,
  playable,
  selected,
  fusible,
  partner,
}: {
  card: Card;
  cost: { yang: number; yin: number };
  playable: boolean;
  selected: boolean;
  fusible: boolean;
  partner: boolean;
}) {
  const wx = card.wuxing;
  const accent = wx ? WX_STROKE[wx] : card.kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';

  const borderColor = partner
    ? 'var(--color-zhuhong)'
    : selected || fusible
      ? 'var(--color-miaojin)'
      : accent;
  const borderWidth = partner || selected ? 2.5 : 2;
  const glow = partner
    ? '0 0 14px rgba(194,59,34,0.85), 0 4px 12px rgba(90,60,30,0.4)'
    : selected
      ? '0 0 22px rgba(212,168,67,0.95), 0 8px 20px rgba(90,60,30,0.45)'
      : fusible
        ? '0 0 12px rgba(212,168,67,0.75), 0 3px 8px rgba(90,60,30,0.32)'
        : '0 3px 8px rgba(90,60,30,0.32), inset 0 1px 0 rgba(255,255,255,0.8)';

  // 牌面底：物理=竹简暖黄偏朱；术法=宣纸偏五行色；功能=玉青
  const faceBase =
    card.kind === 'physical'
      ? 'linear-gradient(158deg, #fdf6e6 0%, #f2dfae 100%)'
      : card.kind === 'support'
        ? 'linear-gradient(158deg, #f4faf5 0%, #dceee0 100%)'
        : 'linear-gradient(158deg, #fdf8ec 0%, #ecdfc4 100%)';

  const kindTip = `「${card.name}」\n${KIND_LABEL[card.kind]}${card.hits > 1 ? ` · ${card.hits} 段` : ''}${card.aoe ? ' · 群体' : ''}\n${card.desc}`;

  return (
    <div
      style={{
        width: 78,
        height: 112,
        borderRadius: 8,
        border: `${borderWidth}px solid ${borderColor}`,
        background: faceBase,
        boxShadow: glow,
        transition: 'box-shadow 140ms, border-color 140ms',
        opacity: playable ? 1 : 0.5,
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 5px 4px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 五指中央大图标（半透明水印） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.22,
        }}
      >
        {wx ? <WuXingGlyph wuxing={wx} size={64} opacity={1} /> : <KindGlyph kind={card.kind} />}
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
        {/* 五行小印 */}
        {wx && (
          <Tip text={WUXING_TIP[wx] ?? wx} placement="top">
            <WuXingSeal wuxing={wx} size={15} />
          </Tip>
        )}
      </div>

      {/* 中央：类型标签 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          fontSize: 9,
          color: 'var(--color-card-text-sub)',
        }}
      >
        {wx
          ? `${KIND_LABEL[card.kind]}·${wx === 'jin' ? '金' : wx === 'mu' ? '木' : wx === 'shui' ? '水' : wx === 'huo' ? '火' : '土'}`
          : KIND_LABEL[card.kind]}
        {card.hits > 1 ? ` ×${card.hits}段` : ''}
        {card.aoe ? ' ·群' : ''}
      </div>

      {/* 底部：效果描述（加大加粗高对比） */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: 9.5,
          lineHeight: 1.25,
          color: 'var(--color-card-text)',
          fontWeight: 600,
          marginTop: 2,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.desc}
      </div>

      {/* 左上：炁消耗（红/蓝小圆点） */}
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

      {/* 融合提示角标 */}
      {(fusible || partner) && (
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
            background: partner ? 'var(--color-zhuhong)' : 'var(--color-miaojin)',
            color: partner ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-title)',
          }}
        >
          {partner ? '可合体' : '可融合'}
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

/** 炁消耗圆点：阳=朱红、阴=石青 */
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
