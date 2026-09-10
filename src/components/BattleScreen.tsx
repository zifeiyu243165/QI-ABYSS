/**
 * 战斗界面
 * 竖屏 390×844 分区：天时条 40 / 敌方区 250 / 架势条 40 / 我方面板 96 / 手牌区 236 / 操作栏 182
 * 弹反判定：视觉由 CSS 动画驱动（避免逐帧 setState 卡顿），点击时用时间戳直接计算。
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
import type { FxHandle } from './fx/Effects';

const BASE = import.meta.env.BASE_URL;

const STATUS_LABEL: Record<string, string> = {
  burn: '灼烧',
  frost: '霜寒',
  freeze: '冻结',
  weak: '虚弱',
  armorBreak: '破甲',
  paralyze: '麻痹',
  silence: '沉默',
  flaw: '破绽',
};

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

  /* ---------- 敌方前摇：CSS 动画驱动，不逐帧 setState ---------- */
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
      {/* 水墨战场背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${BASE}art/bg_battle.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.42,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* 玩家受击红闪 */}
      {hurt > 0 && <div key={hurt} className="hurt-flash" style={{ position: 'absolute', inset: 0, zIndex: 65 }} />}
      {hitstop > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 70,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at 50% 45%, rgba(245,197,24,0.18), transparent 64%)',
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
          background: 'linear-gradient(180deg, rgba(26,31,43,0.92), rgba(26,31,43,0.55))',
          borderBottom: '1px solid rgba(232,228,216,0.14)',
          fontSize: 11,
          zIndex: 20,
        }}
      >
        <span style={{ color: 'var(--color-minghuang)', fontFamily: 'var(--font-brush)' }}>
          {month?.label ?? state.lunarMonthId}
        </span>
        <span style={{ color: 'rgba(232,228,216,0.5)' }}>|</span>
        <span style={{ color: 'var(--color-gaosu)', fontFamily: 'var(--font-brush)' }}>
          炁候·{term?.name ?? state.solarTermId}
        </span>
        <span style={{ marginLeft: 'auto', color: 'rgba(232,228,216,0.7)' }}>第 {state.turn} 回合</span>
        {onExit && (
          <button onClick={onExit} style={{ color: 'rgba(232,228,216,0.6)', fontSize: 11 }}>
            撤退
          </button>
        )}
      </div>

      {/* ============ 敌方区 ============ */}
      <div
        key={`enemy-${shake}`}
        className={shake > 0 && state.pendingNumbers.some((n) => n.targetId !== 'player') ? 'shake' : undefined}
        style={{
          height: 250,
          flex: '0 0 250px',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 12,
          paddingBottom: 8,
          zIndex: 10,
        }}
      >
        {state.enemies.map((e) => {
          const dead = e.hp <= 0;
          const hasFlaw = e.statuses.some((s) => s.id === 'flaw');
          const isTarget = e.id === targetId && !dead;
          const intent = intentOf(e.intents, state.turn);
          const willAttack = isTelegraph && (intent?.type === 'attack' || intent?.type === 'aoe');
          return (
            <div
              key={e.id}
              onClick={() => !dead && setSelectedTarget(e.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                opacity: dead ? 0.22 : 1,
                filter: dead ? 'grayscale(1)' : undefined,
                transition: 'opacity 300ms',
              }}
            >
              {/* 意图 */}
              {!dead && isTelegraph && intent && (
                <div
                  style={{
                    fontSize: 11,
                    color: willAttack ? 'var(--color-zhuhong)' : 'rgba(232,228,216,0.7)',
                    fontFamily: 'var(--font-brush)',
                    background: 'rgba(26,31,43,0.85)',
                    padding: '1px 7px',
                    borderRadius: 3,
                    border: `1px solid ${willAttack ? 'rgba(194,59,34,0.75)' : 'rgba(232,228,216,0.25)'}`,
                    fontWeight: willAttack ? 700 : 400,
                  }}
                >
                  {intent.label}
                </div>
              )}

              <div
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  padding: 2,
                  animation: hasFlaw ? 'flawPulse 1.4s ease-in-out infinite' : undefined,
                  outline: isTarget ? '1px dashed rgba(245,197,24,0.5)' : 'none',
                }}
              >
                <EnemyFigure
                  enemyId={e.id.replace('enemy_', '')}
                  shape={e.shape}
                  wuxing={e.wuxing}
                  size={e.isBoss ? 158 : 116}
                  dim={dead}
                  charging={willAttack}
                />
                {hasFlaw && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      fontSize: 10,
                      background: 'var(--color-minghuang)',
                      color: 'var(--color-yaqing)',
                      padding: '1px 4px',
                      borderRadius: 2,
                      fontWeight: 700,
                    }}
                  >
                    破绽
                  </div>
                )}
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-gaosu)' }}>
                {e.name}
                {e.isBoss && <span style={{ color: 'var(--color-zhuhong)' }}> ·首领</span>}
                {e.chargeStacks > 0 && (
                  <span style={{ color: 'var(--color-zhuhong)', fontWeight: 700 }}> 蓄势×{e.chargeStacks}</span>
                )}
              </div>
              <div style={{ width: 84, height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3 }}>
                <div
                  style={{
                    width: `${(e.hp / e.maxHp) * 100}%`,
                    height: '100%',
                    background: 'var(--color-hp)',
                    borderRadius: 3,
                    transition: 'width 260ms',
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: 'rgba(232,228,216,0.6)' }}>
                {e.hp}/{e.maxHp}
                {e.shield > 0 && <span style={{ color: 'var(--color-songhua)' }}> ·盾{e.shield}</span>}
              </div>

              {e.statuses.length > 0 && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {e.statuses.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 9,
                        padding: '0 3px',
                        borderRadius: 2,
                        background: s.id === 'flaw' ? 'var(--color-minghuang)' : 'rgba(11,46,89,0.85)',
                        color: s.id === 'flaw' ? 'var(--color-yaqing)' : 'var(--color-yuebai)',
                      }}
                    >
                      {STATUS_LABEL[s.id] ?? s.id}
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
          return (
            <button
              key={s.id}
              disabled={state.stanceSwitched && !active}
              onClick={() => dispatch({ type: 'SWITCH_STANCE', stance: s.id as StanceId })}
              style={{
                flex: 1,
                padding: '5px 2px',
                borderRadius: 4,
                fontSize: 10.5,
                border: `1px solid ${active ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.2)'}`,
                background: active ? 'rgba(245,197,24,0.16)' : 'rgba(26,31,43,0.6)',
                color: active ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.6)',
                opacity: state.stanceSwitched && !active ? 0.35 : 1,
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
          height: 96,
          flex: '0 0 96px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          borderTop: '1px solid rgba(232,228,216,0.1)',
          borderBottom: '1px solid rgba(232,228,216,0.1)',
          zIndex: 10,
        }}
      >
        <CharacterFigure
          characterId={state.characterId}
          robe={char?.palette.robe ?? '#0b2e59'}
          trim={char?.palette.trim ?? '#ca6924'}
          hair={char?.palette.hair ?? '#1a1f2b'}
          weapon={state.equipment.some((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade') ? 'blade' : 'artifact'}
          size={88}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ fontFamily: 'var(--font-brush)', color: 'var(--color-gaosu)' }}>{char?.name}</span>
            <span style={{ fontSize: 9, color: 'var(--color-minghuang)' }}>{char?.rizhu}</span>
            {char?.shishen.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 9,
                  padding: '0 3px',
                  borderRadius: 2,
                  background: 'rgba(194,59,34,0.28)',
                  color: 'var(--color-gaosu)',
                }}
              >
                {SHI_SHEN_MAP[s]?.name ?? s}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, width: 22, color: 'rgba(232,228,216,0.6)' }}>气血</span>
            <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 4 }}>
              <div
                style={{
                  width: `${(state.player.hp / state.player.maxHp) * 100}%`,
                  height: '100%',
                  background: 'var(--color-hp)',
                  borderRadius: 4,
                  transition: 'width 260ms',
                }}
              />
            </div>
            <span style={{ fontSize: 10, width: 52, textAlign: 'right' }}>
              {state.player.hp}/{state.player.maxHp}
              {state.player.shield > 0 && (
                <span style={{ color: 'var(--color-songhua)' }}> +{state.player.shield}</span>
              )}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <QiBar label="阳" value={state.yang} cap={state.yangCap} color="var(--color-hupo)" />
            <QiBar label="阴" value={state.yin} cap={state.yinCap} color="var(--color-yuebai)" />
          </div>
        </div>

        <div style={{ width: 62, textAlign: 'center', fontSize: 10 }}>
          {state.stance === 'tixiu' && (
            <div>
              <div style={{ color: 'var(--color-minghuang)', fontSize: 15, fontFamily: 'var(--font-brush)' }}>
                {state.shi}
              </div>
              <div style={{ color: 'rgba(232,228,216,0.55)' }}>势/{SHI_CAP}</div>
            </div>
          )}
          {state.stance === 'sanxiu' && (
            <div>
              <div style={{ color: 'var(--color-zhuhong)', fontSize: 15, fontFamily: 'var(--font-brush)' }}>
                {Math.abs(state.yang - state.yin)}
              </div>
              <div style={{ color: 'rgba(232,228,216,0.55)' }}>阴阳差</div>
            </div>
          )}
          {state.stance === 'faxiu' && (
            <div>
              <div style={{ color: 'var(--color-wx-shui)', fontSize: 13, fontFamily: 'var(--font-brush)' }}>
                {state.lastSpellWuxing ? '相生' : '起手'}
              </div>
              <div style={{ color: 'rgba(232,228,216,0.55)' }}>五行</div>
            </div>
          )}
          {bladeCount >= 2 && (
            <div style={{ color: 'var(--color-gaosu)', fontSize: 9, marginTop: 2 }}>
              纯阳 {state.wushengStacks}/{WUSHENG_KAITIAN_STACKS}
            </div>
          )}
          {combo && bladeCount === 1 && (
            <div style={{ color: 'var(--color-minghuang)', fontSize: 9, marginTop: 2 }}>{combo.skillName}</div>
          )}
        </div>
      </div>

      {/* ============ 手牌区 / 弹反区 ============ */}
      <div
        style={{
          height: 236,
          flex: '0 0 236px',
          position: 'relative',
          padding: '6px 8px',
          zIndex: 10,
        }}
      >
        {!isTelegraph ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 5,
                flexWrap: 'wrap',
                alignContent: 'flex-start',
              }}
            >
              {state.hand.map((c) => {
                const cost = cardCost(state, c);
                const playable = canPlayCard(state, c);
                const sel = selectedCards.includes(c.id);
                const first = state.hand.find((x) => x.id === selectedCards[0]);
                const canFuseWith = selectedCards.length === 1 && !sel && first !== undefined && canFuse(first, c);
                return (
                  <CardView
                    key={c.id}
                    card={c}
                    cost={cost}
                    playable={playable}
                    selected={sel}
                    fuseable={canFuseWith}
                    onClick={() => handleCardTap(c)}
                  />
                );
              })}
              {state.hand.length === 0 && (
                <div style={{ color: 'rgba(232,228,216,0.4)', fontSize: 12, padding: 12 }}>手牌已空</div>
              )}
            </div>

            <div
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: 6,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <button
                disabled={selectedCards.length !== 1}
                onClick={playSelected}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 5,
                  fontSize: 13,
                  fontFamily: 'var(--font-brush)',
                  background: selectedCards.length === 1 ? 'var(--color-zhuhong)' : 'rgba(232,228,216,0.12)',
                  color: selectedCards.length === 1 ? 'var(--color-gaosu)' : 'rgba(232,228,216,0.4)',
                  border: '1px solid rgba(232,228,216,0.2)',
                }}
              >
                出牌
              </button>
              <button
                disabled={!fuseHint}
                onClick={() => {
                  if (!fuseHint) return;
                  const a = selectedCards[0];
                  if (!a) return;
                  dispatch({ type: 'FUSE', cardAId: a, cardBId: fuseHint.id, targetId: targetId ?? undefined });
                  setSelectedCards([]);
                }}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 5,
                  fontSize: 13,
                  fontFamily: 'var(--font-brush)',
                  background: fuseHint ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.12)',
                  color: fuseHint ? 'var(--color-yaqing)' : 'rgba(232,228,216,0.4)',
                  border: '1px solid rgba(232,228,216,0.2)',
                }}
              >
                合并奥义 ×1.5
              </button>
            </div>
          </>
        ) : (
          /* ---- 弹反面板：判定条由 CSS 动画驱动 ---- */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              paddingTop: 8,
            }}
          >
            <div
              style={{
                width: 330,
                height: 24,
                borderRadius: 12,
                background: 'rgba(0,0,0,0.6)',
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid rgba(232,228,216,0.2)',
              }}
            >
              {/* 前摇区（红） */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  width: `${(PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100}%`,
                  top: 0,
                  bottom: 0,
                  background: 'rgba(194,59,34,0.4)',
                }}
              />
              {/* 命中窗（金） */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100}%`,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  background: inWindow
                    ? 'linear-gradient(90deg, rgba(245,197,24,0.75), rgba(245,197,24,0.4))'
                    : 'rgba(245,197,24,0.22)',
                  transition: 'background 120ms',
                }}
              />
              {/* 游标：CSS 动画从左到右 */}
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
                  color: inWindow ? 'var(--color-minghuang)' : 'var(--color-gaosu)',
                  textShadow: '0 1px 3px #000',
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
                width: 340,
                height: 128,
                borderRadius: 10,
                fontFamily: 'var(--font-brush)',
                fontSize: 34,
                letterSpacing: 10,
                border: `2px solid ${inWindow && !state.parried ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.3)'}`,
                background:
                  inWindow && !state.parried
                    ? 'radial-gradient(circle at 50% 50%, rgba(245,197,24,0.4), rgba(194,59,34,0.26))'
                    : 'rgba(26,31,43,0.78)',
                color: inWindow && !state.parried ? 'var(--color-minghuang)' : 'var(--color-gaosu)',
                boxShadow: inWindow && !state.parried ? '0 0 30px rgba(245,197,24,0.55)' : 'none',
                transform: inWindow && !state.parried ? 'scale(1.03)' : 'scale(1)',
                transition: 'all 100ms',
              }}
            >
              格挡
            </button>
            <div style={{ fontSize: 11, color: 'rgba(232,228,216,0.55)' }}>
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
          padding: '6px 10px',
          gap: 6,
          minHeight: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            disabled={state.regulated || isTelegraph}
            onClick={() => dispatch({ type: 'REGULATE', from: state.yang >= state.yin ? 'yang' : 'yin' })}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 5,
              fontSize: 12,
              border: '1px solid rgba(232,228,216,0.22)',
              background: state.regulated ? 'rgba(232,228,216,0.06)' : 'rgba(11,46,89,0.6)',
              color: state.regulated ? 'rgba(232,228,216,0.35)' : 'var(--color-yuebai)',
            }}
          >
            调息 {state.regulated ? '（已用）' : '2:1'}
          </button>
          <button
            disabled={isTelegraph}
            onClick={() => dispatch({ type: 'END_TURN' })}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 5,
              fontSize: 12,
              border: '1px solid rgba(232,228,216,0.22)',
              background: 'rgba(194,59,34,0.55)',
              color: 'var(--color-gaosu)',
            }}
          >
            结束回合
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            fontSize: 10.5,
            lineHeight: 1.65,
            color: 'rgba(232,228,216,0.62)',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            padding: '4px 7px',
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

function QiBar({ label, value, cap, color }: { label: string; value: number; cap: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
      <span style={{ fontSize: 9, color }}>{label}</span>
      <div style={{ display: 'flex', gap: 1.5, flex: 1 }}>
        {Array.from({ length: Math.min(cap, 14) }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 7,
              borderRadius: 1,
              background: i < value ? color : 'rgba(232,228,216,0.14)',
              transition: 'background 160ms',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 9, width: 16, textAlign: 'right', color: 'rgba(232,228,216,0.6)' }}>{value}</span>
    </div>
  );
}

const KIND_COLOR: Record<string, string> = {
  physical: 'var(--color-zhuhong)',
  spell: 'var(--color-shiqing)',
  support: 'var(--color-songhua)',
};

const WX_COLOR: Record<string, string> = {
  jin: 'var(--color-wx-jin)',
  mu: 'var(--color-wx-mu)',
  shui: 'var(--color-wx-shui)',
  huo: 'var(--color-wx-huo)',
  tu: 'var(--color-wx-tu)',
};

function CardView({
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
  const accent = card.wuxing ? WX_COLOR[card.wuxing] : KIND_COLOR[card.kind];

  return (
    <div
      onClick={onClick}
      style={{
        width: 74,
        height: 96,
        borderRadius: 6,
        border: `1.5px solid ${selected ? 'var(--color-minghuang)' : fuseable ? 'var(--color-songhua)' : accent}`,
        background: card.isUltimate
          ? 'linear-gradient(150deg, rgba(245,197,24,0.34), rgba(26,31,43,0.94))'
          : 'linear-gradient(160deg, rgba(26,31,43,0.96), rgba(11,46,89,0.72))',
        boxShadow: selected
          ? '0 0 14px rgba(245,197,24,0.6)'
          : fuseable
            ? '0 0 10px rgba(123,182,97,0.5)'
            : '0 2px 6px rgba(0,0,0,0.45)',
        transform: selected ? 'translateY(-7px) scale(1.04)' : undefined,
        transition: 'transform 140ms, box-shadow 140ms',
        opacity: playable ? 1 : 0.45,
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 5px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
        {cost.yang > 0 && (
          <span
            style={{
              fontSize: 9,
              background: 'var(--color-hupo)',
              color: 'var(--color-yaqing)',
              borderRadius: 2,
              padding: '0 3px',
              fontWeight: 700,
            }}
          >
            阳{cost.yang}
          </span>
        )}
        {cost.yin > 0 && (
          <span
            style={{
              fontSize: 9,
              background: 'var(--color-yuebai)',
              color: 'var(--color-yaqing)',
              borderRadius: 2,
              padding: '0 3px',
              fontWeight: 700,
            }}
          >
            阴{cost.yin}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          fontFamily: 'var(--font-brush)',
          color: card.isUltimate ? 'var(--color-minghuang)' : 'var(--color-gaosu)',
          lineHeight: 1.15,
          marginBottom: 2,
        }}
      >
        {card.name}
      </div>

      <div style={{ fontSize: 9, color: 'rgba(232,228,216,0.62)', lineHeight: 1.32, flex: 1 }}>{card.desc}</div>

      {card.isUltimate && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            fontSize: 8,
            background: 'var(--color-minghuang)',
            color: 'var(--color-yaqing)',
            padding: '0 3px',
            borderRadius: 2,
          }}
        >
          奥义
        </div>
      )}
    </div>
  );
}
