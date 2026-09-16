/**
 * 阴阳炁条（T04 · 拆分②）。
 *
 * 【来源】自 `BattleScreen.tsx` 的本地 `QiResource` 组件**搬迁 + 接入素材**：
 * 保留「标签 + 大号数字 + /上限 + 计量条」结构、字号（10 / 15 / 9）、发光
 * `textShadow: 0 0 6px ${color}`、分段 pip 的 `Math.min(cap, 14)` 段数与 9 高小格。
 *
 * 【接入方式：CLIP 裁剪揭示（设计 §四.4(b)）】
 * `ui_炁槽_阳` / `ui_炁槽_阴` 图里**烘焙了格线 + 日月标记**，按宽度缩放会把格线压扁、
 * 与「可分配炁点」对不齐 → 固定 **120×16** 原尺寸，从左侧按 `value/cap` 揭示。
 *
 * 【降级铁律】**兄弟三层**（同一相对容器内，非「同元素 background-color + background-image」）：
 *   ① 图像层 —— 空槽底（同图降透明度 0.26）+ 裁剪揭示层（`background-color:transparent`）；
 *   ②（与上并列的）内容层 —— 分段 pip，作为「无素材时的样子」；
 *   ③ 基底 —— 容器本身透明，pip 直接可见。
 * 图缺失时图像层渲染为空 → pip 原样可见，不白屏、不报错。
 *
 * 【与设计偏差（以代码实际为准）】设计 §四.4(b) 写「容器固定 120px」；但实测我方面板中列
 * 可用宽仅约 190px，两个炁槽各固定 120px 会横向溢出、撑破面板。故容器改为 `flex:1 + overflow:hidden`，
 * **内层图像仍固定 120px 不缩放**（保住烘焙格线不被压扁），靠裁剪揭示 —— 既满足「固定 120×16」，
 * 又不破坏布局。若未来面板加宽，仅需回填容器 minWidth。
 */
import { Tip } from '../ui/Tip';
import { artUrl, UI } from './artAssets';

interface QiResourceProps {
  /** 阳炁用 `ui_炁槽_阳`，阴炁用 `ui_炁槽_阴` */
  side: 'yang' | 'yin';
  /** 大字左侧的单字标签（阳 / 阴） */
  label: string;
  /** 当前值 */
  value: number;
  /** 上限 */
  cap: number;
  /** 主题色（pip / 数字发光） */
  color: string;
  /** 释义长文 */
  tip: string;
}

export function QiResource({ side, label, value, cap, color, tip }: QiResourceProps) {
  const file = side === 'yang' ? UI.qiYang : UI.qiYin;
  /** 揭示比例：夹到 0..100（cap 为 0 时不显示任何填充） */
  const pct = cap > 0 ? Math.max(0, Math.min(100, (value / cap) * 100)) : 0;
  const segments = Math.min(cap, 14);

  return (
    <Tip text={tip} placement="top" style={{ flex: 1, display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, color, fontFamily: 'var(--font-brush)', fontWeight: 700 }}>{label}</span>
        <span
          style={{
            fontSize: 15,
            lineHeight: 1,
            color: 'var(--color-card-title)',
            fontFamily: 'var(--font-brush)',
            fontVariantNumeric: 'tabular-nums',
            textShadow: `0 0 6px ${color}`,
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-card-text-sub)' }}>/{cap}</span>

        <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, height: 16, overflow: 'hidden', borderRadius: 3 }}>
          {/* ② 内容层 / 基底：分段 pip（无素材时可见） */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {Array.from({ length: segments }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: 2,
                  height: 9,
                  borderRadius: 1.5,
                  background: i < value ? color : 'rgba(120,100,70,0.22)',
                  boxShadow: i < value ? `0 0 5px ${color}` : 'none',
                  transition: 'background 160ms',
                }}
              />
            ))}
          </div>

          {/* ① 图像层 · 空槽底（同图降透明度；background-color 透明，不盖死 pip 以外的基底） */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.26,
              backgroundColor: 'transparent',
              backgroundImage: `url(${artUrl(file)})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          />
          {/* ① 图像层 · 裁剪揭示（内层图像固定 120×16，不随容器缩放） */}
          <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, overflow: 'hidden' }}>
            <div
              style={{
                width: 120,
                height: 16,
                backgroundImage: `url(${artUrl(file)})`,
                backgroundSize: '100% 100%',
                backgroundRepeat: 'no-repeat',
              }}
            />
          </div>
        </div>
      </div>
    </Tip>
  );
}
