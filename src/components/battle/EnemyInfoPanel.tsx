/**
 * 敌人信息板（T05 · 拆分③）。
 *
 * 【来源】自 `BattleScreen.tsx` 的本地 `EnemyInfoPanel` 组件**搬迁 + 接入素材**。
 * 统一规格逐字保留：宽度 100% / 高 `INFO_H`(=66) / 圆角 7 / padding `4px 5px` / 行高
 * 名 16 / 血条 96×10 / 值行 14 / 半透明暗底 + 金边。
 *
 * 【接入素材】
 * - `ui_血条_框`（9S 中空框，叠最上）/ `ui_血条_红` / `ui_血条_绿`（9S 双段填充）。
 * - `ui_状态图标`（图集精灵）：`statusAtlasStyle()` 有对应格则用精灵，无（`paralyze` /
 *   `silence` / `flaw`）**逐状态回落 SVG `StatusGlyph`**（设计 D9 / U4）。
 *
 * 【降级铁律】**兄弟三层**：基底轨道（暗色底 + 金边 + 圆角 + CSS 双段渐变）始终在 DOM 里，
 * 9S 填充与 9S 外框是叠在其上的**独立兄弟节点**（`background-color:transparent`）。
 * 图缺失 → 只剩 CSS 渐变与金边，血条语义（含护盾压缩刻度 `denom = maxHp + shield`）不变。
 */
import type { BattleState } from '../../game/types';
import { t, STATUS_TIP_KEY } from '../../i18n';
import { StatusGlyph } from '../svg/Glyphs';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { nineSlice, SLICE, statusAtlasStyle, UI } from './artAssets';
import { INFO_H } from './constants';

interface EnemyInfoPanelProps {
  enemy: BattleState['enemies'][number];
  /** 已阵亡（整板降透明度 0.4） */
  dead: boolean;
}

export function EnemyInfoPanel({ enemy, dead }: EnemyInfoPanelProps) {
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
              // 【T04 对比度】首领角标 8px → 8.5px（见设计 §六 EnemyInfoPanel.tsx:72）
              fontSize: 8.5,
              background: 'var(--color-miaojin)',
              color: 'var(--color-card-title)',
              padding: '0 3px',
              borderRadius: 2,
              fontWeight: 700,
            }}
          >
            {t('ui.battle.boss')}
          </span>
        )}
      </div>

      <Tip
        text={t('tip.battle.enemy-hp', {
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          shield: eShield > 0 ? t('tip.battle.shield-impact', { value: eShield }) : '',
        })}
        placement="top"
      >
        <div style={{ position: 'relative', width: 96, height: 10 }}>
          {/* ③ 基底 CSS 层：暗色轨道 + 金边 + 圆角，内含 CSS 双段渐变（无素材时唯一可见者） */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
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

          {/* ① 叠加层 · 血量填充（9S）—— 叠在 CSS 渐变之上，transparent 底不盖死基底 */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${eHpPct}%`,
              backgroundColor: 'transparent',
              transition: 'width 260ms',
              ...nineSlice(UI.hpFill, SLICE.stripCaps),
            }}
          />
          {eShield > 0 && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: `${eHpPct}%`,
                top: 0,
                height: '100%',
                width: `${eShPct}%`,
                backgroundColor: 'transparent',
                transition: 'width 260ms',
                ...nineSlice(UI.shieldFill, SLICE.stripCaps),
              }}
            />
          )}

          {/* ① 叠加层 · 中空外框（9S）—— 叠最上 */}
          <ArtLayer fileName={UI.hpFrame} mode="slice" slice={SLICE.stripCaps} zIndex={2} />
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
          <Tip text={t('tip.battle.enemy-shield', { value: enemy.shield })} placement="top">
            <span style={{ color: 'var(--color-songhua)', fontWeight: 700 }}>
              {t('ui.battle.shield-tag', { value: enemy.shield })}
            </span>
          </Tip>
        )}
        <span style={{ display: 'flex', gap: 2 }}>
          {enemy.statuses.map((s, i) => {
            const atlas = statusAtlasStyle(s.id, 11);
            return (
              <Tip key={i} text={t(STATUS_TIP_KEY[s.id])} placement="top">
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {atlas ? <span aria-hidden style={atlas} /> : <StatusGlyph id={s.id} size={11} />}
                  <span style={{ fontSize: 9 }}>{s.stacks > 1 ? s.stacks : ''}</span>
                </span>
              </Tip>
            );
          })}
        </span>
      </div>
    </div>
  );
}
