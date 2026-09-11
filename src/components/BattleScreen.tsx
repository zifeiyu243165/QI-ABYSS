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

  /* ---------- 出牌 ---------- */
  const handleCardTap = useCallback(
    (card: Card) => {
      if (selectedCards.includes(card.id)) {
        setSelectedCards((s) => s.filter((x) => x !== card.id));
        return;
      }
      if (selectedCards.length === 1) {
        const a = state.hand.find((c) => c.id === selectedCards[0]);
        if (a && canFuse(a, card)) {
          dispatch({ type: 'FUSE', cardAId: a.id, cardBId: card.id, targetId: targetId ?? undefined });
          setSelectedCards([]);
          return;
        }
      }
      if (canPlayCard(state, card) || !card.mul) {
        setSelectedCards([card.id]);
      }
    },
    [selectedCards, state, dispatch, targetId],
  );

  const playSelected = useCallback(() => {
    const id = selectedCards[0];
    if (!id) return;
    dispatch({ type: 'PLAY_CARD', cardId: id, targetId: targetId ?? undefined });
    setSelectedCards([]);
  }, [selectedCards, dispatch, targetId]);

  const fuseHint = useMemo(() => {
    if (selectedCards.length !== 1) return null;
    const a = state.hand.find((c) => c.id === selectedCards[0]);
    if (!a) return null;
    return state.hand.find((b) => b.id !== a.id && canFuse(a, b)) ?? null;
  }, [selectedCards, state.hand]);

  /* ---------- 派生 ---------- */
  const isTelegraph = state.phase === 'enemyTelegraph';
  const combo = findCombo(state.equipment[0], state.equipment[1]) ?? findCombo(state.equipment[1], state.equipment[0]);
  const bladeCount = state.equipment.filter((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade').length;

  /** 引擎在 enemyAct 用 (turn-1) 取意图，UI 展示必须与之一致 */
  const intentOf = (intents: { type: string; label: string }[], turn: number) =>
    intents[(turn - 1) % intents.length];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 青绿山水背景：提高亮度，去掉枯山水的压抑感 */}
      <div
        className="cloud-drift"
        style={{
          position: 'absolute',
          inset: '-4%',
          backgroundImage: `url(${BASE}art/bg_主界面.png), url(${BASE}art/bg_战场.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.72,
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
        <span style={{ color: 'var(--color-miaojin-light)', fontFamily: 'var(--font-brush)' }}>
          {month?.label ?? state.lunarMonthId}
        </span>
        <span style={{ color: 'rgba(251,247,236,0.45)' }}>│</span>
        <span style={{ color: 'var(--color-xuanzhi-warm)', fontFamily: 'var(--font-brush)' }}>
          炁候·{term?.name ?? state.solarTermId}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'var(--color-xuanzhi-warm)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          第 {state.turn} 回合
        </span>
        {onExit && (
          <button onClick={onExit} style={{ color: 'rgba(251,247,236,0.75)', fontSize: 11 }}>
            撤退
          </button>
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
                )}
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-card-text)', fontFamily: 'var(--font-brush)' }}>
                {e.name}
                {e.isBoss && <span style={{ color: 'var(--color-zhuhong)' }}> ·首领</span>}
                {e.chargeStacks > 0 && (
                  <span style={{ color: 'var(--color-zhuhong)', fontWeight: 700 }}> 蓄势×{e.chargeStacks}</span>
                )}
              </div>

              {/* 敌方血条：亮红 + 金边 */}
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
              <div style={{ fontSize: 10, color: 'var(--color-card-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                {e.hp}/{e.maxHp}
                {e.shield > 0 && <span style={{ color: 'var(--color-songhua)', fontWeight: 700 }}> ·盾{e.shield}</span>}
              </div>

              {/* 状态：太极/火焰/冰裂纹样，替代方块图标 */}
              {e.statuses.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {e.statuses.map((s, i) => (
                    <span
                      key={i}
                      title={`${STATUS_CN[s.id] ?? s.id}${s.stacks > 1 ? ` ×${s.stacks}` : ''}`}
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
                      {s.stacks > 1 ? s.stacks : ''}
                    </span>
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
            <button
              key={s.id}
              disabled={disabled}
              onClick={() => dispatch({ type: 'SWITCH_STANCE', stance: s.id as StanceId })}
              style={{
                flex: 1,
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
            <span style={{ fontFamily: 'var(--font-brush)', color: 'var(--color-card-title)', fontSize: 13 }}>
              {char?.name}
            </span>
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
            {char?.shishen.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  borderRadius: 2,
                  background: 'rgba(11,46,89,0.82)',
                  color: 'var(--color-yuebai)',
                }}
              >
                {SHI_SHEN_MAP[s]?.name ?? s}
              </span>
            ))}
          </div>

          <FlowBar
            label="气血"
            value={state.player.hp}
            cap={state.player.maxHp}
            color="linear-gradient(90deg, var(--color-hp-grad-a), var(--color-hp-grad-b))"
            height={13}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <FlowBar label="阳" value={state.yang} cap={state.yangCap} color="var(--color-hupo)" height={11} segments />
            <FlowBar label="阴" value={state.yin} cap={state.yinCap} color="var(--color-shishui)" height={11} segments />
          </div>
        </div>

        <div style={{ width: 64, textAlign: 'center', fontSize: 10, flex: '0 0 auto' }}>
          {state.stance === 'tixiu' && (
            <div>
              <div style={{ color: 'var(--color-hupo)', fontSize: 17, fontFamily: 'var(--font-brush)' }}>
                {state.shi}
              </div>
              <div style={{ color: 'var(--color-card-text-sub)' }}>势／{SHI_CAP}</div>
            </div>
          )}
          {state.stance === 'sanxiu' && (
            <div>
              <div style={{ color: 'var(--color-zhuhong)', fontSize: 17, fontFamily: 'var(--font-brush)' }}>
                {Math.abs(state.yang - state.yin)}
              </div>
              <div style={{ color: 'var(--color-card-text-sub)' }}>阴阳差</div>
            </div>
          )}
          {state.stance === 'faxiu' && (
            <div>
              <div style={{ color: 'var(--color-wx-shui)', fontSize: 14, fontFamily: 'var(--font-brush)' }}>
                {state.lastSpellWuxing ? '相生' : '起手'}
              </div>
              <div style={{ color: 'var(--color-card-text-sub)' }}>五行</div>
            </div>
          )}
          {bladeCount >= 2 && (
            <div style={{ color: 'var(--color-card-title)', fontSize: 9, marginTop: 3 }}>
              纯阳 {state.wushengStacks}/{WUSHENG_KAITIAN_STACKS}
            </div>
          )}
          {combo && bladeCount === 1 && (
            <div style={{ color: 'var(--color-hupo)', fontSize: 9, marginTop: 3 }}>{combo.skillName}</div>
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
          zIndex: 10,
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
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none',
              }}
            >
              {state.hand.map((c, i) => {
                const cost = cardCost(state, c);
                const playable = canPlayCard(state, c);
                const sel = selectedCards.includes(c.id);
                const first = state.hand.find((x) => x.id === selectedCards[0]);
                const canFuseWith = selectedCards.length === 1 && !sel && first !== undefined && canFuse(first, c);
                const n = state.hand.length;
                // 重叠：牌多时只露出左侧边缘
                const overlap = n <= 4 ? 6 : n <= 6 ? 26 : 40;
                const mid = (n - 1) / 2;
                const rot = (i - mid) * (n > 5 ? 2 : 3);
                const lift = Math.abs(i - mid) * (n > 5 ? 1.5 : 3);
                return (
                  <div
                    key={c.id}
                    style={{
                      flex: '0 0 auto',
                      marginLeft: i === 0 ? 0 : -overlap,
                      transform: `rotate(${rot}deg) translateY(${lift}px)`,
                      zIndex: sel ? 100 : i,
                      position: 'relative',
                    }}
                  >
                    <GameCard
                      card={c}
                      cost={cost}
                      playable={playable}
                      selected={sel}
                      fuseable={canFuseWith}
                      onClick={() => handleCardTap(c)}
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
                gap: 8,
                alignItems: 'center',
              }}
            >
              <JadeButton
                onClick={playSelected}
                disabled={selectedCards.length !== 1}
                variant="primary"
                style={{ flex: 1 }}
              >
                出　牌
              </JadeButton>
              <JadeButton
                onClick={() => {
                  if (!fuseHint) return;
                  const a = selectedCards[0];
                  if (!a) return;
                  dispatch({ type: 'FUSE', cardAId: a, cardBId: fuseHint.id, targetId: targetId ?? undefined });
                  setSelectedCards([]);
                }}
                disabled={!fuseHint}
                variant="gold"
                style={{ flex: 1 }}
              >
                合并奥义 ×1.5
              </JadeButton>
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
          <JadeButton
            onClick={() => dispatch({ type: 'REGULATE', from: state.yang >= state.yin ? 'yang' : 'yin' })}
            disabled={state.regulated || isTelegraph}
            variant="ghost"
            size="sm"
            style={{ flex: 1 }}
          >
            ☯ 阴阳逆转{state.regulated ? '（已用）' : ''}
          </JadeButton>
          <JadeButton
            onClick={() => dispatch({ type: 'END_TURN' })}
            disabled={isTelegraph}
            variant="primary"
            size="sm"
            style={{ flex: 1 }}
          >
            结 束 回 合
          </JadeButton>
        </div>

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
  const accent = gradeColor[grade] ?? gradeColor['base']!;

  return (
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
 */
function GameCard({
  card,
  cost,
  playable,
  selected,
  fuseable,
  onClick,
}: {
  card: Card;
  cost: { yang: number; yin: number };
  playable: boolean;
  selected: boolean;
  fuseable: boolean;
  onClick: () => void;
}) {
  const wx = card.wuxing;
  const accent = wx ? WX_STROKE[wx] : card.kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';

  // 牌面底：物理=竹简暖黄偏朱；术法=宣纸偏五行色；功能=玉青
  const faceBase =
    card.kind === 'physical'
      ? 'linear-gradient(158deg, #fdf6e6 0%, #f2dfae 100%)'
      : card.kind === 'support'
        ? 'linear-gradient(158deg, #f4faf5 0%, #dceee0 100%)'
        : 'linear-gradient(158deg, #fdf8ec 0%, #ecdfc4 100%)';

  return (
    <div
      className={selected ? 'card-pop' : undefined}
      onClick={onClick}
      style={{
        width: 78,
        height: 112,
        borderRadius: 8,
        border: `2px solid ${selected ? 'var(--color-miaojin)' : fuseable ? 'var(--color-songhua)' : accent}`,
        background: faceBase,
        boxShadow: selected
          ? '0 0 18px rgba(212,168,67,0.85), 0 6px 16px rgba(90,60,30,0.4)'
          : fuseable
            ? '0 0 12px rgba(123,182,97,0.7), 0 3px 8px rgba(90,60,30,0.3)'
            : '0 3px 8px rgba(90,60,30,0.32), inset 0 1px 0 rgba(255,255,255,0.8)',
        transform: selected ? undefined : 'translateY(0)',
        transition: 'box-shadow 140ms',
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
        <span
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 13,
            color: 'var(--color-card-title)',
            lineHeight: 1.1,
            fontWeight: 700,
            flex: 1,
          }}
        >
          {card.name}
        </span>
        {/* 五行小印 */}
        {wx && <WuXingSeal wuxing={wx} size={15} />}
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
        {wx ? `${KIND_LABEL[card.kind]}·${wx === 'jin' ? '金' : wx === 'mu' ? '木' : wx === 'shui' ? '水' : wx === 'huo' ? '火' : '土'}` : KIND_LABEL[card.kind]}
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
        {cost.yang > 0 && <QiPip type="yang" n={cost.yang} />}
        {cost.yin > 0 && <QiPip type="yin" n={cost.yin} />}
      </div>

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
