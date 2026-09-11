/**
 * 外围界面：主界面 / 编队 / 结算复盘 / 开场仪式
 *
 * v2 · 汉唐明媚：
 * 全部面板改用「宣纸暖白 + 描金边 + 玉牌按钮」，
 * 取代 v1 的深蓝底 + 灰白字（那种配色被用户形容为「阴曹地府 / 满清阴森」）。
 *
 * 设计哲学 §2.2：颜色只从 CSS 变量取；禁止纯黑背景；禁止荧光色。
 */

import { useEffect, useMemo, useState } from 'react';
import type { BattleState, SaveData } from '../game/types';
import { CHARACTERS, CHARACTER_MAP } from '../game/data/actors';
import { EQUIPMENT, findCombo } from '../game/data/cards';
import {
  IMPLEMENTED_TERMS,
  LUNAR_MONTH_MAP,
  LUNAR_MONTHS,
  SHI_SHEN_MAP,
  SOLAR_TERM_MAP,
  STANCES,
} from '../game/data/world';
import { CharacterFigure } from './svg/Figure';
import { GoldPanel, JadeButton } from './ui/Primitives';

const BASE = import.meta.env.BASE_URL;

/* ============================== 背景层 ============================== */

/**
 * 宣纸 / 青绿山水背景。
 * 从 v1 的 `opacity 0.32 深色水墨`（闷、灰、阴）改为明亮的青绿山水 + 霞光，
 * 使「外围界面」与「战斗界面」色温一致。
 */
function AmbientBackground({ opacity = 0.34, position = 'center' }: { opacity?: number; position?: string }) {
  return (
    <>
      <div
        className="cloud-drift"
        style={{
          position: 'absolute',
          inset: '-4%',
          backgroundImage: `url(${BASE}art/bg_主界面.png), url(${BASE}art/bg_战场.png)`,
          backgroundSize: 'cover',
          backgroundPosition: position,
          opacity,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* 霞光罩层：把色温拉暖，避免「灰绿枯山水」的压抑 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(243,217,164,0.3) 0%, rgba(223,234,242,0.1) 44%, rgba(251,247,236,0.56) 100%)',
        }}
      />
    </>
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
      <AmbientBackground opacity={0.42} />

      {/* 主角立绘 */}
      <div style={{ animation: 'fadeUp 900ms ease-out', position: 'relative', zIndex: 1 }}>
        <CharacterFigure
          characterId={char.id}
          robe={char.palette.robe}
          trim={char.palette.trim}
          hair={char.palette.hair}
          size={168}
        />
      </div>

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 62,
            letterSpacing: 12,
            color: 'var(--color-card-title)',
            // 描金外发光 + 朱红投影，做成「匾额」而非「霓虹招牌」
            textShadow:
              '0 1px 0 rgba(255,246,220,0.9), 0 3px 10px rgba(212,168,67,0.6), 0 6px 20px rgba(194,59,34,0.3)',
            animation: 'fadeUp 700ms ease-out',
          }}
        >
          炁渊
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 6,
            color: 'var(--color-miaojin-deep)',
            marginTop: 4,
            fontWeight: 600,
          }}
        >
          Q I &nbsp; A B Y S S
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-card-text-sub)',
            marginTop: 14,
            fontFamily: 'var(--font-brush)',
          }}
        >
          回合制里的动作游戏
        </div>
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 22,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <JadeButton onClick={onStart} variant="primary" size="lg">
          入 局
        </JadeButton>
        <JadeButton onClick={onLoadout} variant="ghost" size="lg">
          编 队 · 命 盘
        </JadeButton>
      </div>

      <div
        style={{
          fontSize: 10,
          color: 'var(--color-card-text-sub)',
          textAlign: 'center',
          marginTop: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
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

  /* 环境：展示本轮月令 + 已实现节气，让「五层变量」在编队阶段可见 */
  const [monthId, setMonthId] = useState(LUNAR_MONTHS[6]!.id);
  const [termId, setTermId] = useState(IMPLEMENTED_TERMS[0]!.id);
  const month = LUNAR_MONTH_MAP[monthId];
  const term = SOLAR_TERM_MAP[termId];

  const deling = char && month && char.wuxing === month.wuxing;
  const shiling =
    char && month && { mu: 'tu', tu: 'shui', shui: 'huo', huo: 'jin', jin: 'mu' }[month.wuxing] === char.wuxing;

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
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AmbientBackground opacity={0.3} position="center 30%" />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflowY: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* 头部 */}
        <div
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'linear-gradient(180deg, rgba(212,168,67,0.22), transparent)',
          }}
        >
          <button
            onClick={onBack}
            style={{
              color: 'var(--color-card-title)',
              fontSize: 13,
              fontFamily: 'var(--font-brush)',
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid var(--color-miaojin)',
              background: 'rgba(251,247,236,0.8)',
            }}
          >
            ← 返回
          </button>
          <span
            style={{
              fontFamily: 'var(--font-brush)',
              fontSize: 17,
              color: 'var(--color-card-title)',
              letterSpacing: 2,
            }}
          >
            编队 · 命盘
          </span>
        </div>

        {/* 角色卡 */}
        <div style={{ padding: '0 14px 10px' }}>
          <GoldPanel style={{ padding: '10px 12px' }} glow>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <CharacterFigure
                characterId={char.id}
                robe={char.palette.robe}
                trim={char.palette.trim}
                hair={char.palette.hair}
                size={128}
                flat
              />
              <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.8, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-brush)',
                      fontSize: 20,
                      color: 'var(--color-card-title)',
                    }}
                  >
                    {char.name}
                  </span>
                  {/* 日主印章 */}
                  <span
                    style={{
                      fontFamily: 'var(--font-seal)',
                      fontSize: 10,
                      background: 'var(--color-zhuhong)',
                      color: 'var(--color-xuanzhi-warm)',
                      padding: '2px 5px',
                      borderRadius: 2,
                      transform: 'rotate(-4deg)',
                      animation: 'sealDrop 500ms ease-out',
                      fontWeight: 700,
                    }}
                  >
                    {char.rizhu}
                  </span>
                </div>
                <div style={{ color: 'var(--color-card-text-sub)' }}>
                  {char.faction} · {STANCES.find((s) => s.id === char.stance)?.name.split('·')[0]}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                  {char.shishen.map((s) => (
                    <span
                      key={s}
                      style={{
                        fontSize: 10,
                        background: 'linear-gradient(180deg, rgba(11,46,89,0.9), rgba(11,46,89,0.75))',
                        color: 'var(--color-yuebai)',
                        padding: '1px 6px',
                        borderRadius: 2,
                        border: '1px solid rgba(212,168,67,0.55)',
                      }}
                    >
                      {SHI_SHEN_MAP[s]?.name}
                    </span>
                  ))}
                </div>
                <div style={{ color: 'var(--color-card-text-sub)', fontSize: 10.5, marginTop: 4 }}>
                  {char.lore}
                </div>
                <div style={{ color: 'var(--color-card-text)', fontSize: 10.5, marginTop: 3, fontWeight: 600 }}>
                  气血 {char.hp} · 攻击 {char.atk} · 防御 {char.def}
                </div>
              </div>
            </div>
          </GoldPanel>
        </div>

        {/* 角色选择 */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px' }}>
          {CHARACTERS.map((c) => {
            const active = c.id === char.id;
            return (
              <button
                key={c.id}
                onClick={() => onChange({ selectedCharacterId: c.id })}
                style={{
                  flex: 1,
                  padding: '7px 2px',
                  fontSize: 11,
                  borderRadius: 5,
                  fontFamily: 'var(--font-brush)',
                  border: `1.5px solid ${active ? 'var(--color-miaojin)' : 'rgba(138,90,52,0.3)'}`,
                  background: active
                    ? 'linear-gradient(180deg, rgba(212,168,67,0.36), rgba(236,203,122,0.24))'
                    : 'linear-gradient(180deg, rgba(251,247,236,0.86), rgba(236,217,171,0.7))',
                  color: active ? 'var(--color-card-title)' : 'var(--color-card-text-sub)',
                  fontWeight: active ? 700 : 400,
                  boxShadow: active ? '0 0 10px rgba(212,168,67,0.45)' : 'none',
                }}
              >
                {c.name}
                <div style={{ fontSize: 9, opacity: 0.75 }}>{c.rizhu}</div>
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px' }}>
          {(['角色', '装备'] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '5px 16px',
                  fontSize: 12,
                  borderRadius: 4,
                  fontFamily: 'var(--font-brush)',
                  border: `1.5px solid ${active ? 'var(--color-zhuhong)' : 'rgba(138,90,52,0.3)'}`,
                  background: active
                    ? 'linear-gradient(180deg, #d8543a, var(--color-zhuhong))'
                    : 'rgba(251,247,236,0.7)',
                  color: active ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-text-sub)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* 内容 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', minHeight: 0 }}>
          {tab === '角色' && (
            <div>
              {/* 天时：月令 × 节气 × 得令/失令 */}
              <GoldPanel tone="jade" style={{ padding: '9px 11px', marginBottom: 10 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-brush)',
                    fontSize: 14,
                    color: 'var(--color-card-title)',
                    marginBottom: 5,
                  }}
                >
                  天时 · 得令推演
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 10.5, color: 'var(--color-card-text-sub)' }}>
                    月令
                    <select
                      value={monthId}
                      onChange={(e) => setMonthId(e.target.value)}
                      style={{
                        marginLeft: 4,
                        fontSize: 10.5,
                        borderRadius: 3,
                        border: '1px solid var(--color-miaojin)',
                        background: 'rgba(251,247,236,0.95)',
                        color: 'var(--color-card-text)',
                        padding: '1px 3px',
                      }}
                    >
                      {LUNAR_MONTHS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 10.5, color: 'var(--color-card-text-sub)' }}>
                    炁候
                    <select
                      value={termId}
                      onChange={(e) => setTermId(e.target.value)}
                      style={{
                        marginLeft: 4,
                        fontSize: 10.5,
                        borderRadius: 3,
                        border: '1px solid var(--color-miaojin)',
                        background: 'rgba(251,247,236,0.95)',
                        color: 'var(--color-card-text)',
                        padding: '1px 3px',
                      }}
                    >
                      {IMPLEMENTED_TERMS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: deling ? 'var(--color-zhuhong)' : shiling ? 'var(--color-miaojin-deep)' : 'var(--color-card-text-sub)',
                  }}
                >
                  {deling
                    ? '得令：全技能 +10%，每回合 +1 阳 +1 阴'
                    : shiling
                      ? '失令：首牌 +1 消耗，暴击 -10%'
                      : '平令：无额外增益，也无惩罚'}
                </div>
                {term?.desc && (
                  <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--color-card-text-sub)', lineHeight: 1.7 }}>
                    {term.name}：{term.desc}
                  </div>
                )}
              </GoldPanel>

              {char.shishen.map((s) => {
                const ss = SHI_SHEN_MAP[s];
                return (
                  <GoldPanel key={s} style={{ padding: '8px 11px', marginBottom: 8 }}>
                    <div
                      style={{
                        color: 'var(--color-card-title)',
                        fontFamily: 'var(--font-brush)',
                        fontSize: 14,
                      }}
                    >
                      {ss?.name}
                      <span style={{ fontSize: 10, color: 'var(--color-card-text-sub)', marginLeft: 6 }}>
                        {ss?.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-card-text)', lineHeight: 1.8 }}>{ss?.desc}</div>
                  </GoldPanel>
                );
              })}

              <GoldPanel tone="jade" style={{ padding: '8px 11px' }}>
                <div
                  style={{
                    color: 'var(--color-card-title)',
                    fontFamily: 'var(--font-brush)',
                    fontSize: 14,
                  }}
                >
                  当前架势
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-card-text)', lineHeight: 1.8 }}>
                  {STANCES.find((s) => s.id === char.stance)?.desc}
                </div>
              </GoldPanel>
            </div>
          )}

          {tab === '装备' && (
            <div>
              {/* 流派提示 */}
              <GoldPanel glow style={{ padding: '9px 11px', marginBottom: 10 }}>
                <span
                  style={{
                    color: 'var(--color-card-title)',
                    fontFamily: 'var(--font-brush)',
                    fontSize: 15,
                  }}
                >
                  {flowName}
                </span>
                {combo && (
                  <span style={{ color: 'var(--color-card-text)', marginLeft: 8, fontSize: 11.5 }}>
                    · 附魔招式「{combo.skillName}」
                  </span>
                )}
                {!combo && (
                  <span style={{ color: 'var(--color-card-text-sub)', marginLeft: 8, fontSize: 11 }}>
                    · 未触发附魔
                  </span>
                )}
              </GoldPanel>

              {(['blade', 'artifact'] as const).map((kind) => (
                <div key={kind} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-card-title)',
                      marginBottom: 6,
                      fontFamily: 'var(--font-brush)',
                      letterSpacing: 1,
                    }}
                  >
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
                          borderRadius: 6,
                          marginBottom: 6,
                          cursor: 'pointer',
                          border: `1.5px solid ${active ? 'var(--color-miaojin)' : 'rgba(138,90,52,0.28)'}`,
                          background: active
                            ? 'linear-gradient(158deg, rgba(253,246,230,0.98), rgba(236,203,122,0.9))'
                            : 'linear-gradient(158deg, rgba(251,247,236,0.9), rgba(236,217,171,0.76))',
                          boxShadow: active ? '0 0 12px rgba(212,168,67,0.5)' : '0 2px 5px rgba(120,90,40,0.14)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--color-card-title)',
                            fontFamily: 'var(--font-brush)',
                            fontWeight: 700,
                          }}
                        >
                          {e.name}
                          {active && (
                            <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--color-zhuhong)' }}>
                              已装备
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--color-card-text)', marginTop: 2 }}>{e.desc}</div>
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
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 18px',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <AmbientBackground opacity={won ? 0.4 : 0.22} />

      <div style={{ textAlign: 'center', marginBottom: 12, position: 'relative', zIndex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 46,
            letterSpacing: 8,
            color: won ? 'var(--color-miaojin-deep)' : 'var(--color-zhuhong)',
            textShadow: won
              ? '0 1px 0 rgba(255,246,220,0.9), 0 0 26px rgba(212,168,67,0.7)'
              : '0 2px 10px rgba(194,59,34,0.35)',
          }}
        >
          {won ? '心猿已除' : '道消'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-card-text-sub)', marginTop: 4, fontWeight: 600 }}>
          命理复盘 · {month?.label} · 炁候 {term?.name}
        </div>
      </div>

      <GoldPanel
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          fontSize: 11.5,
          lineHeight: 2,
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Row
          k="得令 / 失令"
          v={deling ? '得令（全技能 +10%，每回合 +1 阳 +1 阴）' : shiling ? '失令（首牌 +1 消耗，暴击 -10%）' : '平'}
        />
        <Row k="回合数" v={`${state.stats.turnCount}`} />
        <Row k="出牌数" v={`${state.stats.cardsPlayed}`} />
        <Row k="最高连击" v={`${state.stats.maxCombo} 段`} />
        <Row k="相克命中" v={`${state.stats.maxCounterHits} 次`} />
        <Row k="最高单次伤害" v={`${state.stats.maxSingleDamage}`} />
        <div style={{ color: 'var(--color-card-text-sub)', fontSize: 10.5, marginBottom: 2 }}>
          └ {state.stats.maxSingleDamageLabel || '—'}
        </div>
        <Row k="弹反 / 完美弹反" v={`${state.stats.parryCount} / ${state.stats.perfectParryCount}`} />

        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(212,168,67,0.45)' }}>
          <div
            style={{
              color: 'var(--color-card-title)',
              fontFamily: 'var(--font-brush)',
              fontSize: 14,
              marginBottom: 4,
            }}
          >
            十神触发
          </div>
          {Object.entries(state.stats.shishenTriggers)
            .filter(([k]) => k !== 'piancai_thisTurn')
            .map(([k, v]) => (
              <div key={k} style={{ color: 'var(--color-card-text)' }}>
                {SHI_SHEN_MAP[k]?.name ?? k} · {v} 次
              </div>
            ))}
          {Object.keys(state.stats.shishenTriggers).filter((k) => k !== 'piancai_thisTurn').length === 0 && (
            <div style={{ color: 'var(--color-card-text-sub)' }}>本局未触发十神特效</div>
          )}
        </div>
      </GoldPanel>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 12,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {won && onNext && (
          <JadeButton onClick={onNext} variant="primary" size="lg">
            下 一 战
          </JadeButton>
        )}
        {!won && (
          <JadeButton onClick={onRetry} variant="primary" size="lg">
            再 来 一 次
          </JadeButton>
        )}
        <JadeButton onClick={onHome} variant="ghost" size="lg">
          回 主 界 面
        </JadeButton>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--color-card-text-sub)' }}>{k}</span>
      <span style={{ color: 'var(--color-card-text)', textAlign: 'right', fontWeight: 600 }}>{v}</span>
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
        // 从 v1 的纯鸦青黑（阴间感）改为霞光金 → 宣纸的明亮渐变
        background:
          'radial-gradient(70% 50% at 50% 42%, rgba(243,217,164,0.55), transparent 72%), linear-gradient(180deg, #2d2418 0%, #6b4a24 44%, #a67c2e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        animation: 'fadeUp 420ms ease-out',
      }}
    >
      {/* 月令播报 */}
      {step >= 0 && (
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 15,
            letterSpacing: 6,
            color: 'var(--color-miaojin-light)',
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
            color: 'var(--color-xuanzhi-warm)',
            textShadow:
              '0 0 34px rgba(245,197,24,0.6), 0 2px 0 rgba(166,124,46,0.9), 0 8px 24px rgba(0,0,0,0.35)',
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
              color: 'var(--color-xuanzhi-warm)',
              padding: '5px 9px',
              borderRadius: 3,
              transform: 'rotate(-5deg)',
              animation: 'sealDrop 520ms ease-out',
              fontWeight: 700,
              border: '1px solid rgba(236,203,122,0.7)',
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
                color: 'var(--color-xuanzhi-warm)',
                padding: '5px 9px',
                borderRadius: 3,
                transform: `rotate(${-3 + i * 6}deg)`,
                animation: `sealDrop 520ms ease-out ${i * 120}ms both`,
                fontWeight: 700,
                border: '1px solid rgba(236,203,122,0.6)',
              }}
            >
              {SHI_SHEN_MAP[s]?.name ?? s}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'rgba(251,247,236,0.6)', marginTop: 26 }}>点击跳过</div>
    </div>
  );
}
