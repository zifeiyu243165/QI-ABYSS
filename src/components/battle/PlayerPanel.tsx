/**
 * 我方面板（T04 · 拆分②）。
 *
 * 【来源】自 `BattleScreen.tsx` 我方面板区块**逐字搬迁**：高度 104 / flex `0 0 104px` /
 * gap 8 / `margin:0 8px` / `borderRadius:8` / 渐变底 / `border:1.5px solid
 * var(--color-miaojin)` / `boxShadow` / `zIndex:10` 一律保留。
 * 【R2 修复】唯一改动：外层 `padding` 由 `'0 10px'` 改为 `'0 22px 0 10px'`，让内容避让右描金框饰。
 *
 * 【接入素材】
 * - `ui_我方面板`（9S）：左上头像凹槽需与 `<CharacterFigure size={84}>` 对齐。
 *   `SLICE.playerPanel` 的左切片 = 26%（≈96px）且左侧边框宽 96px → 先把凹槽区**1:1** 落到
 *   面板左端（与 padding-left 10 处的角色立绘对齐），中段再横向拉伸，避免 9S 把凹槽压扁错位。
 * - `ui_炁槽_阳` / `ui_炁槽_阴`（CLIP）：见 `QiResource.tsx`。
 * - 气血条经 `FlowBar` 接 `ui_血条_框`（9S 外框）+ `ui_血条_红` / `ui_血条_绿`（双段填充 9S）。
 *
 * 【降级铁律】叠加层（ArtLayer）`background-color:transparent`；内容层 `zIndex:1`；
 * 基底 = 外层 div 的渐变 + 描金边 + 圆角 + shadow。图缺失 → 基底原样可见。
 *
 * 【铁律】气血条的护盾压缩刻度（`denom = cap + shield`）在 `FlowBar` 内部，本组件不触碰。
 *
 * 【与设计偏差（以代码实际为准）】`combo` / `bladeCount` 仅本面板使用，故一并下沉到本组件，
 * 不再由编排壳派生转发（壳更薄）。
 */
import { EQUIPMENT_MAP, findCombo } from '../../game/data/cards';
import { SHI_SHEN_MAP } from '../../game/data/world';
import { WUSHENG_KAITIAN_STACKS, SHI_CAP } from '../../game/constants';
import type { BattleState, Character } from '../../game/types';
import { t } from '../../i18n';
import { CharacterFigure } from '../svg/Figure';
import { FlowBar } from '../ui/Primitives';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { SLICE, UI } from './artAssets';
import { QiResource } from './QiResource';

interface PlayerPanelProps {
  /** 战斗状态（面板读取角色资源、架势、装备等） */
  state: BattleState;
  /** 角色静态数据（可能查不到 → 各字段走兜底） */
  char: Character | undefined;
}

export function PlayerPanel({ state, char }: PlayerPanelProps) {
  /** 双持兵刃数：>=2 触发「纯阳开天」，===1 且配法器触发连携技 */
  const bladeCount = state.equipment.filter((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade').length;
  const combo = findCombo(state.equipment[0], state.equipment[1]) ?? findCombo(state.equipment[1], state.equipment[0]);

  /** 阴阳差（散修核心数值） */
  const yinYangDiff = Math.abs(state.yang - state.yin);

  return (
    <div
      style={{
        height: 104,
        flex: '0 0 104px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        // 【R2 修复】右侧留出描金框饰宽度 22px（= SLICE.playerPanel 右框饰宽度），
        // 让内容避让右框饰 —— 否则最右列（width:60 居中）的 combo.skillName「赤焰斩」右半会被框饰压住。
        // 降级态（素材缺失）内容左移 12px，无害。面板高 104 / margin / borderRadius / gap 等魔法数字一律不动。
        padding: '0 22px 0 10px',
        margin: '0 8px',
        borderRadius: 8,
        background: 'linear-gradient(160deg, rgba(251,247,236,0.96), rgba(236,217,171,0.9))',
        border: '1.5px solid var(--color-miaojin)',
        boxShadow: '0 3px 12px rgba(120,90,40,0.3), inset 0 1px 0 rgba(255,246,220,0.85)',
        zIndex: 10,
      }}
    >
      {/* ① 叠加层：我方面板素材（9S）—— 基底之上、内容之下 */}
      <ArtLayer fileName={UI.playerPanel} mode="slice" slice={SLICE.playerPanel} zIndex={0} />

      {/* ② 内容层：整块内容包相对容器，压在图之上 */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CharacterFigure
          characterId={state.characterId}
          robe={char?.palette.robe ?? 'var(--color-shiqing)'}
          trim={char?.palette.trim ?? 'var(--color-hupo)'}
          hair={char?.palette.hair ?? 'var(--color-yaqing)'}
          weapon={bladeCount > 0 ? 'blade' : 'artifact'}
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
            <Tip text={t('tip.battle.day-master', { rizhu: char?.rizhu ?? '' })} placement="top">
              <span
                style={{
                  fontSize: 9,
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
                  text={t('tip.battle.ten-gods', {
                    name: info?.name ?? s,
                    category: info?.category ?? '',
                    desc: info?.desc ?? '',
                    suffix: info && !info.implemented ? t('tip.battle.ten-gods-pending') : '',
                  })}
                  placement="top"
                >
                  <span
                    style={{
                      fontSize: 9,
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
            text={t('tip.battle.hp', {
              hp: state.player.hp,
              maxHp: state.player.maxHp,
              shield: state.player.shield > 0 ? t('tip.battle.shield-impact', { value: state.player.shield }) : '',
            })}
            placement="top"
            style={{ display: 'block' }}
          >
            <FlowBar
              label={t('ui.battle.hp')}
              value={state.player.hp}
              cap={state.player.maxHp}
              shield={state.player.shield}
              color="linear-gradient(90deg, var(--color-hp-grad-a), var(--color-hp-grad-b))"
              height={12}
              fill={UI.hpFill}
              shieldFill={UI.shieldFill}
              frame={UI.hpFrame}
            />
          </Tip>

          {/* 阴阳资源：大号数字 + 分段条 + 发光，与血条在视觉上区分开 */}
          <div style={{ display: 'flex', gap: 10 }}>
            <QiResource
              side="yang"
              label={t('ui.battle.yang')}
              value={state.yang}
              cap={state.yangCap}
              color="var(--color-hupo)"
              tip={t('tip.battle.yang-essence', { value: state.yang, cap: state.yangCap })}
            />
            <QiResource
              side="yin"
              label={t('ui.battle.yin')}
              value={state.yin}
              cap={state.yinCap}
              color="var(--color-shishui)"
              tip={t('tip.battle.yin-essence', { value: state.yin, cap: state.yinCap })}
            />
          </div>
        </div>

        <div style={{ width: 60, textAlign: 'center', fontSize: 10, flex: '0 0 auto' }}>
          {state.stance === 'tixiu' && (
            <Tip text={t('tip.battle.momentum', { shi: state.shi, cap: SHI_CAP })} placement="top">
              <div>
                <div style={{ color: 'var(--color-hupo)', fontSize: 18, fontFamily: 'var(--font-brush)' }}>
                  {state.shi}
                </div>
                <div style={{ color: 'var(--color-card-text)', fontSize: 9 }}>
                  {t('ui.battle.momentum', { cap: SHI_CAP })}
                </div>
              </div>
            </Tip>
          )}
          {state.stance === 'sanxiu' && (
            <Tip text={t('tip.battle.diff', { diff: yinYangDiff })} placement="top">
              <div>
                <div style={{ color: 'var(--color-zhuhong)', fontSize: 18, fontFamily: 'var(--font-brush)' }}>
                  {yinYangDiff}
                </div>
                <div style={{ color: 'var(--color-card-text)', fontSize: 9 }}>{t('ui.battle.diff')}</div>
              </div>
            </Tip>
          )}
          {state.stance === 'faxiu' && (
            <Tip
              text={t('tip.battle.spell-stance', {
                state: state.lastSpellWuxing
                  ? t('tip.battle.spell-stance-generate')
                  : t('tip.battle.spell-stance-opening'),
                chain: t('label.wuxingChain'),
              })}
              placement="top"
            >
              <div>
                <div style={{ color: 'var(--color-wx-shui)', fontSize: 14, fontFamily: 'var(--font-brush)' }}>
                  {state.lastSpellWuxing ? t('ui.battle.wuxing-generate') : t('ui.battle.wuxing-opening')}
                </div>
                <div style={{ color: 'var(--color-card-text)', fontSize: 9 }}>{t('ui.battle.wuxing')}</div>
              </div>
            </Tip>
          )}
          {bladeCount >= 2 && (
            <Tip
              text={t('tip.battle.blade-stacks', { stacks: state.wushengStacks, cap: WUSHENG_KAITIAN_STACKS })}
              placement="top"
            >
              <div style={{ color: 'var(--color-card-title)', fontSize: 9, marginTop: 2 }}>
                {t('ui.battle.blade-stacks', { stacks: state.wushengStacks, cap: WUSHENG_KAITIAN_STACKS })}
              </div>
            </Tip>
          )}
          {combo && bladeCount === 1 && (
            <Tip text={t('tip.battle.combo', { name: combo.skillName })} placement="top">
              <div style={{ color: 'var(--color-hupo)', fontSize: 10, fontWeight: 700, marginTop: 2 }}>{combo.skillName}</div>
            </Tip>
          )}
        </div>
      </div>
    </div>
  );
}
