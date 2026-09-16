/**
 * 归墟弃牌残影层（T09 · 自 `BattleScreen.tsx` **逐字下沉**）。
 *
 * 【来源】「弃牌残影：半透明停留片刻，表示对手也看得到（留牌心理战）」的 `relicGhosts.map(...)`，
 * 定位（`right:8 / top:118`）、列向排布、`gap:5`、`opacity:0.55`、描边色（阳=天青 / 阴=流光暖桃）、
 * `zIndex:93` 与 `t('ui.battle.relic-ghost', { name })` 文案**逐字保留**。
 *
 * 【入参类型】复用 `useBattleFx` 导出的 `RelicGhost`（单一真源）。
 */
import { t } from '../../i18n';
import type { RelicGhost } from './useBattleFx';

interface RelicGhostsProps {
  /** 停留中的残影列表（由 `useBattleFx` 持有） */
  ghosts: RelicGhost[];
}

export function RelicGhosts({ ghosts }: RelicGhostsProps) {
  if (ghosts.length === 0) return null;
  return (
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
      {ghosts.map((g) => (
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
          {t('ui.battle.relic-ghost', { name: g.name })}
        </div>
      ))}
    </div>
  );
}
