/**
 * 「大量归墟」金色水墨莲花演出层（T09 · 自 `BattleScreen.tsx` **逐字下沉**）。
 *
 * 【来源】「一次化去多张时绽放金色水墨莲花」的 SVG 演出，`viewBox` / 八瓣外圈 + 八瓣内圈 +
 * 花心圆、旋转角、`relicLotus` 动画、层级 `zIndex:92` **逐字保留**。
 *
 * 【为何放在战斗屏而不是归墟面板里】归墟一结束面板就卸载，若把演出挂在面板上会被硬生生切断；
 * 本组件由战斗屏在 `lotus !== null` 时渲染，生命周期与演出时长一致。
 *
 * 【入参类型】复用 `useBattleFx` 导出的 `LotusBurst`（单一真源）；组件名用 `RelicLotus`
 * 以避免与接口 `LotusBurst` 重名。
 */
import type { LotusBurst } from './useBattleFx';

interface RelicLotusProps {
  /** 当前莲花演出场次（null = 未播放） */
  lotus: LotusBurst | null;
}

export function RelicLotus({ lotus }: RelicLotusProps) {
  if (!lotus) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 92,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <svg
        width={330}
        height={330}
        viewBox="0 0 200 200"
        style={{ animation: 'relicLotus 1500ms cubic-bezier(0.2,0.7,0.3,1) forwards' }}
      >
        <g transform="translate(100,100)">
          {/* 八瓣莲花：粗黑描边 + 金色平涂，符合全项目粗线条国潮画风 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <ellipse
              key={i}
              cx="0"
              cy="-46"
              rx="17"
              ry="46"
              transform={`rotate(${i * 45})`}
              fill="var(--color-miaojin)"
              fillOpacity="0.16"
              stroke="var(--color-miaojin)"
              strokeWidth="3.5"
            />
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <ellipse
              key={`in-${i}`}
              cx="0"
              cy="-27"
              rx="10"
              ry="27"
              transform={`rotate(${i * 45 + 22.5})`}
              fill="var(--color-minghuang)"
              fillOpacity="0.22"
              stroke="var(--color-miaojin-light)"
              strokeWidth="3"
            />
          ))}
          <circle r="16" fill="var(--color-minghuang)" fillOpacity="0.55" stroke="var(--color-miaojin-light)" strokeWidth="3.5" />
        </g>
      </svg>
    </div>
  );
}
