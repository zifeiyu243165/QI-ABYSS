/**
 * 天时条（T03 · 拆分①）。
 *
 * 【来源】自 `BattleScreen.tsx` 原 `{/* ============ 天时条 ============ *␉}` 区块**逐字搬迁**：
 * 高度 36 / flex `0 0 36px` / padding `0 10px` / 渐变色、`borderBottom:1.5px solid var(--color-miaojin)`、
 * `boxShadow`、字号 11、`zIndex:20` 一律保留（对照设计 §七.2 的魔法数字清单）。
 *
 * 【降级铁律】**兄弟三层**：
 *   ① 叠加层 —— `ArtLayer`（`ui_天时条` 9S / `ui_回合计数牌` BG 44×22），`background-color:transparent`；
 *   ② 内容层 —— 文字（`zIndex:1`，保证压在图之上，天时条文字仍清晰可读）；
 *   ③ 基底 CSS 层 —— 外层 div 的渐变 + borderBottom + boxShadow（图缺失时唯一可见者）。
 * 图缺失时叠加层渲染为空 → 基底原样可见，不白屏、不报错、无布局跳动。
 *
 * 【只接口、不自算】month / term 由编排壳（`BattleScreen`）派生后传入，本组件只负责呈现。
 */
import type { LunarMonth, SolarTerm } from '../../game/types';
import { t } from '../../i18n';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { SLICE, UI } from './artAssets';

interface TopBarProps {
  /** 月令（可能查不到 → 回退 id） */
  month: LunarMonth | undefined;
  /** 节气（可能查不到 → 回退 id） */
  term: SolarTerm | undefined;
  /** 月令 id（月令数据查不到时的兜底显示） */
  monthId: string;
  /** 节气 id（同上） */
  termId: string;
  /** 当前回合数 */
  turn: number;
  /** 撤退回调（缺省则不渲染撤退按钮） */
  onExit?: () => void;
}

/** 天时条内两枚月令/炁候标签共用的文字样式（逐字搬运） */
const clampStyle = {
  color: 'var(--color-miaojin-light)',
  fontFamily: 'var(--font-brush)',
  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
} as const;

export function TopBar({ month, term, monthId, termId, turn, onExit }: TopBarProps) {
  /** 月令 Tip 末行：有防御倍率则列出倍率，否则说明无加成（原三目逻辑逐字保留） */
  const monthDefense =
    (month?.defMul ?? 1) > 1
      ? t('tip.battle.month-defense-mul', { mul: month?.defMul ?? 1 })
      : t('tip.battle.month-defense-none');

  return (
    <div
      style={{
        height: 36,
        flex: '0 0 36px',
        position: 'relative',
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
      {/* ① 叠加层：天时条素材（9S）—— 盖在渐变之上、文字之下 */}
      <ArtLayer fileName={UI.topBar} mode="slice" slice={SLICE.topBar} zIndex={0} />

      {/* ② 内容层：整条内容包一层相对容器，zIndex 高于图，保证文字清晰可读 */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Tip
          text={t('tip.battle.month', {
            label: month?.label ?? monthId,
            desc: month?.desc ?? '',
            defense: monthDefense,
          })}
          placement="bottom"
        >
          <span style={clampStyle}>{month?.label ?? monthId}</span>
        </Tip>
        <span style={{ color: 'rgba(236,203,122,0.5)' }}>│</span>
        <Tip
          text={t('tip.battle.term', {
            name: term?.name ?? termId,
            season: term?.season ?? '',
            desc: term?.desc ?? '',
            status: term?.implemented ? t('tip.battle.term-implemented') : t('tip.battle.term-pending'),
          })}
          placement="bottom"
        >
          <span style={clampStyle}>{t('ui.battle.term', { name: term?.name ?? termId })}</span>
        </Tip>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tip text={t('tip.battle.turn', { turn })} placement="bottom">
            {/* 回合计数牌：素材作文字底板，z 低于文字 */}
            <span
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 22,
              }}
            >
              <ArtLayer fileName={UI.turnPlaque} mode="fit" fit={{ w: 44, h: 22 }} zIndex={0} />
              <span
                style={{
                  position: 'relative',
                  zIndex: 1,
                  color: 'var(--color-miaojin-light)',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                }}
              >
                {t('ui.battle.turn', { turn })}
              </span>
            </span>
          </Tip>
          {onExit && (
            <Tip text={t('tip.battle.retreat')} placement="bottom">
              <button
                onClick={onExit}
                aria-label={t('ui.battle.retreat')}
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
                {t('ui.battle.retreat-action')}
              </button>
            </Tip>
          )}
        </div>
      </div>
    </div>
  );
}
