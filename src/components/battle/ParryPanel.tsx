/**
 * 弹反面板（T08 · 拆分⑥）。
 *
 * 【来源】自 `BattleScreen.tsx` 的 `{/* 弹反面板 *␉}` 区块（`!isTelegraph` 的三目另一支）**逐字搬迁**：
 * 外层 `flex column / alignItems center / gap 8 / paddingTop 10`、判定条 `334×26 / borderRadius 13 /
 * rgba(90,60,30,0.55) / 1.5px miaojin 边 / overflow hidden`、中央文字的字号与配色三态、
 * 格挡按钮 `334×104 / fontSize 30 / letterSpacing 10 / borderRadius 10` 及其 in-window 发光态 ——
 * 全部原样保留（对照设计 §七.2 的魔法数字清单）。
 *
 * 【分段百分比】红区宽与金区起点一律取 `(PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100%` —— 逐字保留，
 * **不得**改成硬编码百分比或像素。
 *
 * 【接入素材】`ui_弹反区_红` / `ui_弹反区_金`（9S **横向**：上下切片 0，`SLICE.parryZone`）。
 * 切片只加在**叠加层**上：红/金两区的定位是 `left/width: 百分比`，若把 `border-image` 直接加到区内
 * 元素上，`borderWidth: 0 10px 0 10px` 会在 content-box 下把区宽撑大 20px，
 * 破坏「红金分界落在 `TELEGRAPH/TOTAL` 处」这一语义 —— 故九宫格必须走 `ArtLayer`（绝对定位、不参与布局）。
 *
 * 【降级铁律】兄弟三层：
 *   ① 叠加层 —— `ArtLayer`（`background-color: transparent`，素材缺失即渲染为空）；
 *   ② 内容层 —— 中央文字 `zIndex:1`、游标 `.parry-cursor`；
 *   ③ 基底 CSS 层 —— 判定条底 `rgba(90,60,30,0.55)` + 红区 `rgba(194,59,34,0.45)` +
 *      金区 `rgba(245,197,24,0.3)`（窗口开启时改发光渐变）。
 * 图缺失时基底原样可见：不白屏、不报错、无布局跳动。
 *
 * 【与原文的唯一差异】中央文字层补了 `zIndex:1`：叠加层取 `zIndex:0` 后，同层 `auto` 的定位元素
 * 会按文档序被 `0` 压住（CSS 层叠规则），补上显式层级后文字仍在最上，**无素材时观感与拆分前逐像素一致**。
 *
 * 【只接口、不自算】`inWindow` 由 `useParryTiming` 传入、`onParry` 由编排壳转派，本组件不持有时序状态。
 */
import type { BattleState } from '../../game/types';
import { PARRY_TELEGRAPH_MS, PARRY_TOTAL_MS } from '../../game/constants';
import { t } from '../../i18n';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { SLICE, UI } from './artAssets';

interface ParryPanelProps {
  /** 战斗状态（读取 phase / parried / parryResult） */
  state: BattleState;
  /** 游标是否已进入金色（完美弹反）窗口 —— 来自 `useParryTiming` */
  inWindow: boolean;
  /** 按下格挡按钮 */
  onParry: () => void;
}

export function ParryPanel({ state, inWindow, onParry }: ParryPanelProps) {
  /** 红区宽度 / 金区起点：分段百分比逐字保留 */
  const telegraphPct = (PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 10 }}>
      <Tip text={t('tip.battle.parry')} placement="top" style={{ display: 'block', width: 334 }}>
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
          {/* 红区（普通格挡）：基底朱红 + 素材叠加层（9S 横向） */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              width: `${telegraphPct}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(194,59,34,0.45)',
            }}
          >
            <ArtLayer fileName={UI.parryRed} mode="slice" slice={SLICE.parryZone} zIndex={0} />
          </div>
          {/* 金区（完美弹反）：基底金 → 开窗时换发光渐变；素材叠加层（9S 横向） */}
          <div
            style={{
              position: 'absolute',
              left: `${telegraphPct}%`,
              right: 0,
              top: 0,
              bottom: 0,
              background: inWindow
                ? 'linear-gradient(90deg, rgba(245,197,24,0.9), rgba(236,203,122,0.55))'
                : 'rgba(245,197,24,0.3)',
              transition: 'background 120ms',
            }}
          >
            <ArtLayer fileName={UI.parryGold} mode="slice" slice={SLICE.parryZone} zIndex={0} />
          </div>
          {state.phase === 'enemyTelegraph' && !state.parried && (
            <div className="parry-cursor" style={{ animationDuration: `${PARRY_TOTAL_MS}ms` }} />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
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
                ? t('ui.battle.parry-perfect')
                : state.parryResult === 'early'
                  ? t('ui.battle.parry-early')
                  : t('ui.battle.parry-miss')
              : inWindow
                ? t('ui.battle.parry-now')
                : t('ui.battle.parry-charging')}
          </div>
        </div>
      </Tip>

      <Tip text={t('tip.battle.block')} placement="top" style={{ display: 'block', width: 334 }}>
        <button
          disabled={state.parried}
          onClick={onParry}
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
          {t('ui.battle.parry-button')}
        </button>
      </Tip>
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--color-xuanzhi-warm)',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}
      >
        {t('ui.battle.parry-hint')}
      </div>
    </div>
  );
}
