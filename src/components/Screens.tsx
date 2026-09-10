/**
 * 外围界面：主界面 / 编队 / 结算复盘 / 开场仪式
 */

import { useEffect, useMemo, useState } from 'react';
import type { BattleState, SaveData } from '../game/types';
import { CHARACTERS, CHARACTER_MAP } from '../game/data/actors';
import { EQUIPMENT, findCombo } from '../game/data/cards';
import { LUNAR_MONTH_MAP, SHI_SHEN_MAP, SOLAR_TERM_MAP, STANCES } from '../game/data/world';
import { CharacterFigure } from './svg/Figure';

/* ============================== 通用按钮 ============================== */

function BigButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? 'var(--color-zhuhong)' : 'rgba(232,228,216,0.1)';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '13px 0',
        borderRadius: 6,
        fontFamily: 'var(--font-brush)',
        fontSize: 17,
        letterSpacing: 3,
        background: disabled ? 'rgba(232,228,216,0.06)' : bg,
        color: disabled ? 'rgba(232,228,216,0.3)' : 'var(--color-gaosu)',
        border: `1px solid ${variant === 'primary' ? 'rgba(245,197,24,0.45)' : 'rgba(232,228,216,0.2)'}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ============================== 主界面 ============================== */

export function MainScreen({
  save,
  onStart,
  onLoadout,
}: {
  save: SaveData;
  onStart: () => void;
  onLoadout: () => void;
}) {
  const char = CHARACTER_MAP[save.selectedCharacterId] ?? CHARACTERS[0]!;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '0 28px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 水墨背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${import.meta.env.BASE_URL}art/bg_battle.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.5,
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />

      {/* 主角立绘 */}
      <div style={{ animation: 'fadeUp 900ms ease-out' }}>
        <CharacterFigure
          characterId={char.id}
          robe={char.palette.robe}
          trim={char.palette.trim}
          hair={char.palette.hair}
          size={168}
        />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 62,
            letterSpacing: 12,
            color: 'var(--color-gaosu)',
            textShadow: '0 4px 18px rgba(194,59,34,0.55)',
            animation: 'fadeUp 700ms ease-out',
          }}
        >
          炁渊
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 6,
            color: 'var(--color-hupo)',
            marginTop: 2,
          }}
        >
          Q I &nbsp; A B Y S S
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(232,228,216,0.5)',
            marginTop: 14,
            fontFamily: 'var(--font-brush)',
          }}
        >
          回合制里的动作游戏
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
        <BigButton onClick={onStart}>入 局</BigButton>
        <BigButton onClick={onLoadout} variant="ghost">
          编 队 · 命 盘
        </BigButton>
      </div>

      <div style={{ fontSize: 10, color: 'rgba(232,228,216,0.35)', textAlign: 'center', marginTop: 10 }}>
        已通关 {save.clearedCampaigns.length} / 4 场
        <br />
        心猿潜伏在都市的霓虹阴影里
      </div>
    </div>
  );
}

/* ============================== 编队界面 ============================== */

export function LoadoutScreen({
  save,
  onBack,
  onChange,
}: {
  save: SaveData;
  onBack: () => void;
  onChange: (patch: Partial<SaveData>) => void;
}) {
  const [tab, setTab] = useState<'角色' | '装备'>('角色');
  const char = CHARACTER_MAP[save.selectedCharacterId] ?? CHARACTERS[0]!;
  const equip = save.equipment[char.id] ?? [null, null];
  const [slotA, slotB] = equip;
  const combo = findCombo(slotA, slotB) ?? findCombo(slotB, slotA);

  const flowName = useMemo(() => {
    const kinds = [slotA, slotB].map((id) => EQUIPMENT.find((e) => e.id === id)?.kind);
    const blade = kinds.filter((k) => k === 'blade').length;
    if (blade === 2) return '纯阳武圣';
    if (blade === 0 && kinds.filter(Boolean).length === 2) return '五运阴阳';
    if (blade === 1 && kinds.filter(Boolean).length === 2) return '阴阳合契';
    return '未成流派';
  }, [slotA, slotB]);

  const setSlot = (idx: 0 | 1, id: string | null) => {
    const next: [string | null, string | null] = [equip[0], equip[1]];
    next[idx] = id;
    onChange({ equipment: { ...save.equipment, [char.id]: next } });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      {/* 水墨背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${import.meta.env.BASE_URL}art/bg_battle.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          opacity: 0.32,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
      {/* 头部 */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} style={{ color: 'var(--color-gaosu)', fontSize: 13 }}>
          ← 返回
        </button>
        <span style={{ fontFamily: 'var(--font-brush)', fontSize: 16 }}>编队 · 命盘</span>
      </div>

      {/* 角色卡 */}
      <div style={{ display: 'flex', gap: 12, padding: '0 14px 10px', alignItems: 'center' }}>
        <CharacterFigure
          characterId={char.id}
          robe={char.palette.robe}
          trim={char.palette.trim}
          hair={char.palette.hair}
          size={132}
        />
        <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-brush)', fontSize: 19, color: 'var(--color-gaosu)' }}>
              {char.name}
            </span>
            {/* 日主印章 */}
            <span
              style={{
                fontFamily: 'var(--font-seal)',
                fontSize: 10,
                background: 'var(--color-zhuhong)',
                color: 'var(--color-gaosu)',
                padding: '2px 5px',
                borderRadius: 2,
                transform: 'rotate(-4deg)',
                animation: 'sealDrop 500ms ease-out',
              }}
            >
              {char.rizhu}
            </span>
          </div>
          <div style={{ color: 'rgba(232,228,216,0.62)' }}>
            {char.faction} · {STANCES.find((s) => s.id === char.stance)?.name.split('·')[0]}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {char.shishen.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 10,
                  background: 'rgba(11,46,89,0.8)',
                  color: 'var(--color-yuebai)',
                  padding: '1px 6px',
                  borderRadius: 2,
                  border: '1px solid rgba(214,236,255,0.3)',
                }}
              >
                {SHI_SHEN_MAP[s]?.name}
              </span>
            ))}
          </div>
          <div style={{ color: 'rgba(232,228,216,0.45)', fontSize: 10.5, marginTop: 4 }}>{char.lore}</div>
          <div style={{ color: 'rgba(232,228,216,0.7)', fontSize: 10.5, marginTop: 3 }}>
            气血 {char.hp} · 攻击 {char.atk} · 防御 {char.def}
          </div>
        </div>
      </div>

      {/* 角色选择 */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px' }}>
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange({ selectedCharacterId: c.id })}
            style={{
              flex: 1,
              padding: '7px 2px',
              fontSize: 11,
              borderRadius: 4,
              border: `1px solid ${c.id === char.id ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.18)'}`,
              background: c.id === char.id ? 'rgba(245,197,24,0.14)' : 'rgba(26,31,43,0.6)',
              color: c.id === char.id ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.62)',
            }}
          >
            {c.name}
            <div style={{ fontSize: 9, opacity: 0.7 }}>{c.rizhu}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px' }}>
        {(['角色', '装备'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${tab === t ? 'var(--color-hupo)' : 'rgba(232,228,216,0.16)'}`,
              background: tab === t ? 'rgba(202,105,36,0.2)' : 'transparent',
              color: tab === t ? 'var(--color-hupo)' : 'rgba(232,228,216,0.5)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', minHeight: 0 }}>
        {tab === '角色' && (
          <div style={{ fontSize: 11, lineHeight: 1.9, color: 'rgba(232,228,216,0.72)' }}>
            {char.shishen.map((s) => {
              const ss = SHI_SHEN_MAP[s];
              return (
                <div key={s} style={{ marginBottom: 10 }}>
                  <div style={{ color: 'var(--color-minghuang)', fontFamily: 'var(--font-brush)', fontSize: 14 }}>
                    {ss?.name}
                    <span style={{ fontSize: 10, color: 'rgba(232,228,216,0.45)', marginLeft: 6 }}>
                      {ss?.category}
                    </span>
                  </div>
                  <div>{ss?.desc}</div>
                </div>
              );
            })}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(232,228,216,0.12)' }}>
              <div style={{ color: 'var(--color-hupo)', fontFamily: 'var(--font-brush)', fontSize: 14 }}>
                当前架势
              </div>
              <div>{STANCES.find((s) => s.id === char.stance)?.desc}</div>
            </div>
          </div>
        )}

        {tab === '装备' && (
          <div>
            {/* 流派提示 */}
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 5,
                background: 'rgba(245,197,24,0.12)',
                border: '1px solid rgba(245,197,24,0.35)',
                marginBottom: 10,
                fontSize: 11.5,
              }}
            >
              <span style={{ color: 'var(--color-minghuang)', fontFamily: 'var(--font-brush)', fontSize: 14 }}>
                {flowName}
              </span>
              {combo && (
                <span style={{ color: 'var(--color-gaosu)', marginLeft: 8 }}>
                  · 附魔招式「{combo.skillName}」
                </span>
              )}
            </div>

            {(['blade', 'artifact'] as const).map((kind) => (
              <div key={kind} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-hupo)', marginBottom: 6 }}>
                  {kind === 'blade' ? '兵刃' : '法器'}
                </div>
                {EQUIPMENT.filter((e) => e.kind === kind).map((e) => {
                  const slotIdx = kind === 'blade' ? 0 : 1;
                  const active = equip[slotIdx] === e.id;
                  return (
                    <div
                      key={e.id}
                      onClick={() => setSlot(slotIdx as 0 | 1, active ? null : e.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 5,
                        marginBottom: 6,
                        cursor: 'pointer',
                        border: `1px solid ${active ? 'var(--color-minghuang)' : 'rgba(232,228,216,0.14)'}`,
                        background: active ? 'rgba(245,197,24,0.12)' : 'rgba(26,31,43,0.55)',
                      }}
                    >
                      <div style={{ fontSize: 12.5, color: 'var(--color-gaosu)', fontFamily: 'var(--font-brush)' }}>
                        {e.name}
                        {active && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--color-minghuang)' }}>已装备</span>}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'rgba(232,228,216,0.6)', marginTop: 2 }}>{e.desc}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/* ============================== 结算复盘 ============================== */

export function ResultScreen({
  state,
  onNext,
  onRetry,
  onHome,
}: {
  state: BattleState;
  onNext?: () => void;
  onRetry: () => void;
  onHome: () => void;
}) {
  const won = state.phase === 'won';
  const char = CHARACTER_MAP[state.characterId];
  const month = LUNAR_MONTH_MAP[state.lunarMonthId];
  const term = SOLAR_TERM_MAP[state.solarTermId];

  const deling = char && month && char.wuxing === month.wuxing;
  const shiling =
    char && month && { mu: 'tu', tu: 'shui', shui: 'huo', huo: 'jin', jin: 'mu' }[month.wuxing] === char.wuxing;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 18px', minHeight: 0 }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 44,
            letterSpacing: 8,
            color: won ? 'var(--color-minghuang)' : 'var(--color-zhuhong)',
            textShadow: won ? '0 0 22px rgba(245,197,24,0.5)' : 'none',
          }}
        >
          {won ? '心猿已除' : '道消'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(232,228,216,0.55)', marginTop: 4 }}>
          命理复盘 · {month?.label} · 炁候 {term?.name}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.26)',
          borderRadius: 6,
          padding: 12,
          fontSize: 11.5,
          lineHeight: 2,
          minHeight: 0,
        }}
      >
        <Row k="得令 / 失令" v={deling ? '得令（全技能 +10%，每回合 +1 阳 +1 阴）' : shiling ? '失令（首牌 +1 消耗，暴击 -10%）' : '平'} />
        <Row k="回合数" v={`${state.stats.turnCount}`} />
        <Row k="出牌数" v={`${state.stats.cardsPlayed}`} />
        <Row k="最高连击" v={`${state.stats.maxCombo} 段`} />
        <Row k="相克命中" v={`${state.stats.maxCounterHits} 次`} />
        <Row k="最高单次伤害" v={`${state.stats.maxSingleDamage}`} />
        <div style={{ color: 'rgba(232,228,216,0.45)', fontSize: 10.5, marginBottom: 2 }}>
          └ {state.stats.maxSingleDamageLabel || '—'}
        </div>
        <Row k="弹反 / 完美弹反" v={`${state.stats.parryCount} / ${state.stats.perfectParryCount}`} />

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(232,228,216,0.14)' }}>
          <div style={{ color: 'var(--color-minghuang)', fontFamily: 'var(--font-brush)', fontSize: 14, marginBottom: 4 }}>
            十神触发
          </div>
          {Object.entries(state.stats.shishenTriggers)
            .filter(([k]) => k !== 'piancai_thisTurn')
            .map(([k, v]) => (
              <div key={k} style={{ color: 'rgba(232,228,216,0.72)' }}>
                {SHI_SHEN_MAP[k]?.name ?? k} · {v} 次
              </div>
            ))}
          {Object.keys(state.stats.shishenTriggers).filter((k) => k !== 'piancai_thisTurn').length === 0 && (
            <div style={{ color: 'rgba(232,228,216,0.4)' }}>本局未触发十神特效</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {won && onNext && <BigButton onClick={onNext}>下 一 战</BigButton>}
        {!won && <BigButton onClick={onRetry}>再 来 一 次</BigButton>}
        <BigButton onClick={onHome} variant="ghost">
          回 主 界 面
        </BigButton>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'rgba(232,228,216,0.5)' }}>{k}</span>
      <span style={{ color: 'var(--color-gaosu)', textAlign: 'right' }}>{v}</span>
    </div>
  );
}

/* ============================== 开场仪式 ============================== */

export function IntroSequence({
  lunarMonthId,
  solarTermId,
  characterId,
  onDone,
}: {
  lunarMonthId: string;
  solarTermId: string;
  characterId: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const month = LUNAR_MONTH_MAP[lunarMonthId];
  const term = SOLAR_TERM_MAP[solarTermId];
  const char = CHARACTER_MAP[characterId];

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 900),
      window.setTimeout(() => setStep(2), 2100),
      window.setTimeout(() => onDone(), 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: 'var(--color-yaqing)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      {/* 月令播报 */}
      {step >= 0 && (
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 15,
            letterSpacing: 6,
            color: 'var(--color-hupo)',
            opacity: step >= 0 ? 1 : 0,
            animation: 'fadeUp 600ms ease-out',
          }}
        >
          {month?.label ?? lunarMonthId}
        </div>
      )}

      {/* 节气毛笔字 */}
      {step >= 1 && (
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 78,
            letterSpacing: 10,
            color: 'var(--color-gaosu)',
            textShadow: '0 0 34px rgba(245,197,24,0.42), 0 6px 0 rgba(0,0,0,0.4)',
            animation: 'brushReveal 900ms ease-out',
          }}
        >
          {term?.name ?? solarTermId}
        </div>
      )}

      {/* 十神印章 */}
      {step >= 2 && char && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-seal)',
              fontSize: 13,
              background: 'var(--color-zhuhong)',
              color: 'var(--color-gaosu)',
              padding: '5px 9px',
              borderRadius: 3,
              transform: 'rotate(-5deg)',
              animation: 'sealDrop 520ms ease-out',
            }}
          >
            {char.rizhu}
          </span>
          {char.shishen.map((s, i) => (
            <span
              key={s}
              style={{
                fontFamily: 'var(--font-seal)',
                fontSize: 13,
                background: i === 0 ? 'var(--color-shiqing)' : 'var(--color-songhua)',
                color: 'var(--color-gaosu)',
                padding: '5px 9px',
                borderRadius: 3,
                transform: `rotate(${-3 + i * 6}deg)`,
                animation: `sealDrop 520ms ease-out ${i * 120}ms both`,
              }}
            >
              {SHI_SHEN_MAP[s]?.name ?? s}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'rgba(232,228,216,0.35)', marginTop: 26 }}>点击跳过</div>
    </div>
  );
}
