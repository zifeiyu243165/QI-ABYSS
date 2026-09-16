/**
 * 汉唐明媚 · UI 基础组件
 *
 * 统一承载：
 * - 描金面板（替代扁平深色框，走「金丝楠/玉石/描金屏风」质感）
 * - 玉牌按钮（朱红底 + 金边，替代蓝色网页按钮）
 * - 炁条 / 血条（粗壮 + 流光）
 *
 * 设计哲学 §2.2：颜色只从 CSS 变量取；禁止纯黑背景；禁止荧光色。
 */

import type React from 'react';
import { ArtLayer } from '../battle/ArtLayer';
import { nineSlice, SLICE } from '../battle/artAssets';

/* ============================== 描金面板 ============================== */

export function GoldPanel({
  children,
  style,
  tone = 'paper',
  glow = false,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** paper = 宣纸金边（主面板）；jade = 玉牌；wood = 金丝楠 */
  tone?: 'paper' | 'jade' | 'wood';
  glow?: boolean;
}) {
  const bg =
    tone === 'paper'
      ? 'linear-gradient(160deg, rgba(251,247,236,0.97), rgba(247,242,228,0.93))'
      : tone === 'jade'
        ? 'linear-gradient(160deg, rgba(228,239,232,0.96), rgba(188,214,200,0.9))'
        : 'linear-gradient(160deg, rgba(138,90,52,0.95), rgba(110,68,36,0.92))';

  const border = tone === 'wood' ? 'rgba(236,203,122,0.8)' : 'var(--color-miaojin)';
  const textColor = tone === 'wood' ? 'var(--color-xuanzhi)' : 'var(--color-card-text)';

  return (
    <div
      style={{
        position: 'relative',
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 8,
        color: textColor,
        boxShadow: glow
          ? '0 0 18px rgba(212,168,67,0.45), 0 4px 12px rgba(120,90,40,0.28), inset 0 1px 0 rgba(255,246,220,0.75)'
          : '0 3px 10px rgba(120,90,40,0.2), inset 0 1px 0 rgba(255,246,220,0.7)',
        ...style,
      }}
    >
      {/* 四角描金回纹 */}
      <CornerMarks color={border} />
      {children}
    </div>
  );
}

function CornerMarks({ color }: { color: string }) {
  const corner: React.CSSProperties = {
    position: 'absolute',
    width: 9,
    height: 9,
    borderColor: color,
    borderStyle: 'solid',
    pointerEvents: 'none',
  };
  return (
    <>
      <span style={{ ...corner, top: 3, left: 3, borderWidth: '1.5px 0 0 1.5px' }} />
      <span style={{ ...corner, top: 3, right: 3, borderWidth: '1.5px 1.5px 0 0' }} />
      <span style={{ ...corner, bottom: 3, left: 3, borderWidth: '0 0 1.5px 1.5px' }} />
      <span style={{ ...corner, bottom: 3, right: 3, borderWidth: '0 1.5px 1.5px 0' }} />
    </>
  );
}

/* ============================== 玉牌按钮 ============================== */

/** 按钮描边宽（px）—— 素材叠加层要按同一宽度外扩，才能盖住整条边框盒 */
const JADE_BORDER_W = 1.5;

export function JadeButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  style,
  size = 'md',
  skin,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** primary = 朱红描金；ghost = 玉牌描金；gold = 明黄描金 */
  variant?: 'primary' | 'ghost' | 'gold';
  disabled?: boolean;
  style?: React.CSSProperties;
  size?: 'sm' | 'md' | 'lg';
  /**
   * 可选：素材文件名（9S 九宫格，取 `SLICE.jadeButton`）。
   *
   * 【向后兼容铁律】**缺省 `undefined` → 行为与外观与既有完全一致**：DOM 仍是纯文字子节点、
   * 不注入任何叠加层、不追加 `position`。`Screens.tsx`（主界面/编队/结算）复用本组件但**不传** `skin`，
   * 因此外观零变化 —— 战斗美术绝不允许污染外围界面。
   *
   * 传入时按「基底 CSS 层 + 透明叠加层」兄弟结构叠加：基底 = 本按钮自身的渐变 + 描金边 + 圆角
   * （素材 404 / 未生成时唯一可见者），叠加层 `background-color: transparent`，内容包一层
   * `position:relative` 的 span 压在图之上。
   *
   * 【禁用可辨性】灰玉（`ui_玉按钮_灰`）本身是浅色玉牌，单靠 `opacity: 0.7` 会显得「只是淡了」。
   * 故传入 `skin` 且 `disabled` 时，再叠一层 `rgba(30,24,16,0.35)` 遮罩（压在素材之上、文字之下），
   * 把灰玉压成中灰死色，同时保留既有那行浅灰标签的可读性 —— 这是本组件对「不可用」的唯一增量表达。
   */
  skin?: string;
}) {
  const pad = size === 'lg' ? '14px 0' : size === 'sm' ? '6px 10px' : '10px 0';
  const fs = size === 'lg' ? 17 : size === 'sm' ? 11 : 13;

  const bg = disabled
    ? 'rgba(180,170,150,0.3)'
    : variant === 'primary'
      ? 'linear-gradient(180deg, var(--color-zhuhong-light), var(--color-zhuhong))'
      : variant === 'gold'
        ? 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))'
        : 'linear-gradient(180deg, rgba(251,247,236,0.98), rgba(236,217,171,0.95))';

  const fg = disabled
    ? 'rgba(120,110,95,0.6)'
    : variant === 'ghost'
      ? 'var(--color-card-title)'
      : 'var(--color-xuanzhi-warm)';

  const border = variant === 'ghost' ? 'var(--color-miaojin)' : 'var(--color-miaojin-light)';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: pad,
        borderRadius: 6,
        fontFamily: 'var(--font-brush)',
        fontSize: fs,
        letterSpacing: 3,
        background: bg,
        color: fg,
        border: `${JADE_BORDER_W}px solid ${border}`,
        boxShadow: disabled
          ? 'none'
          : '0 2px 6px rgba(120,90,40,0.26), inset 0 1px 0 rgba(255,246,220,0.6)',
        opacity: disabled ? 0.7 : 1,
        textShadow: disabled || variant === 'ghost' ? 'none' : '0 1px 2px rgba(80,20,10,0.5)',
        transition: 'transform 120ms, box-shadow 120ms',
        // 有 skin 才需要定位上下文；缺省时不追加任何属性，保证既有调用方渲染完全一致
        ...(skin ? { position: 'relative' as const } : {}),
        ...style,
      }}
    >
      {skin ? (
        <>
          {/* ① 叠加层：玉牌素材（9S）—— 外扩一个描边宽，使其边框盒与按钮边框盒重合 */}
          <ArtLayer
            fileName={skin}
            mode="slice"
            slice={SLICE.jadeButton}
            zIndex={0}
            style={{ inset: -JADE_BORDER_W }}
          />
          {/* ② 禁用遮罩：仅「有素材且禁用」时出现，把浅色灰玉压成明确的死色 */}
          {disabled && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: -JADE_BORDER_W,
                zIndex: 1,
                pointerEvents: 'none',
                borderRadius: 6,
                background: 'rgba(30,24,16,0.35)',
              }}
            />
          )}
          {/* ③ 内容层：压在图与遮罩之上 */}
          <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/* ============================== 炁条 / 血条 ============================== */

/**
 * 粗壮 + 带流光的计量条。
 * 设计哲学 §2.3：炁量变化要有「气在流转」的呼吸感。
 *
 * 【护盾】传入 `shield > 0` 时，条形改为「双段」：
 * 横向刻度把血条**压缩**，右侧紧接一段松花绿的护盾条。
 * 刻度基准取 `cap + shield`，所以拿到护盾的瞬间血条会肉眼可见地变短一截 ——
 * 这正是「护盾顶在前面」的直观表达，而不是在血条上盖一层色。
 */
export function FlowBar({
  value,
  cap,
  color,
  height = 12,
  label,
  showText = true,
  segments,
  shield = 0,
  fill,
  shieldFill,
  frame,
}: {
  value: number;
  cap: number;
  color: string;
  height?: number;
  label?: string;
  showText?: boolean;
  /** 是否用分段小格（炁）而非连续条（血） */
  segments?: boolean;
  /** 护盾值；> 0 时压缩血条并在右侧额外绘制护盾条 */
  shield?: number;
  /**
   * 可选：气血填充素材文件名（9S）。**缺省 undefined → 行为与既有完全一致**（仅走 CSS 渐变）。
   * 传入时在渐变填充之上叠一层 `border-image` 九宫格，降级由「基底渐变始终在 DOM」保证。
   */
  fill?: string;
  /** 可选：护盾填充素材文件名（9S）。缺省 → 护盾段仅走 CSS 渐变。 */
  shieldFill?: string;
  /** 可选：外框素材文件名（9S 中空框，叠最上）。缺省 → 不叠外框。 */
  frame?: string;
}) {
  const pct = cap > 0 ? Math.max(0, Math.min(1, value / cap)) : 0;
  const shieldVal = Math.max(0, Math.floor(shield ?? 0));
  /** 有盾时改用动态刻度：血 + 盾正好铺满 */
  const denom = cap + shieldVal;
  const hpPct = denom > 0 ? Math.max(0, Math.min(1, value / denom)) : 0;
  const shPct = denom > 0 ? shieldVal / denom : 0;

  if (segments) {
    const n = Math.min(cap, 14);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        {label && (
          <span style={{ fontSize: 10, color, fontFamily: 'var(--font-brush)', width: 12 }}>{label}</span>
        )}
        <div style={{ display: 'flex', gap: 1.5, flex: 1 }}>
          {Array.from({ length: n }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height,
                borderRadius: 1.5,
                background: i < value ? color : 'rgba(120,100,70,0.18)',
                boxShadow: i < value ? `0 0 5px ${color}` : 'none',
                transition: 'background 160ms',
              }}
            />
          ))}
        </div>
        {showText && (
          <span
            style={{
              fontSize: 10,
              width: 26,
              textAlign: 'right',
              color: 'var(--color-card-text-sub)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}/{cap}
          </span>
        )}
      </div>
    );
  }

  const hasShield = shieldVal > 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
      {label && (
        <span style={{ fontSize: 10, color: 'var(--color-card-text-sub)', width: 24 }}>{label}</span>
      )}
      <div style={{ position: 'relative', flex: 1, height }}>
        {/* ③ 基底 CSS 层：暗底轨道 + 金边 + 圆角 + 溢出裁剪，内含 CSS 双段渐变填充 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(120,100,70,0.2)',
            borderRadius: height / 2,
            overflow: 'hidden',
            border: '1px solid rgba(212,168,67,0.5)',
            display: 'flex',
          }}
        >
          <div
            style={{
              width: `${(hasShield ? hpPct : pct) * 100}%`,
              height: '100%',
              background: color,
              borderRadius: hasShield ? 0 : height / 2,
              transition: 'width 280ms cubic-bezier(0.2,0.9,0.3,1)',
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          {hasShield && (
            <div
              style={{
                width: `${shPct * 100}%`,
                height: '100%',
                // 松花绿护盾段，左侧一道亮边与血条切开
                background: 'linear-gradient(90deg, var(--color-shield), var(--color-shield-light))',
                borderLeft: '1.5px solid rgba(255,246,220,0.95)',
                transition: 'width 280ms cubic-bezier(0.2,0.9,0.3,1)',
                boxShadow: '0 0 8px rgba(123,182,97,0.9)',
              }}
            />
          )}
        </div>

        {/* ① 叠加层：气血填充素材（9S）—— 叠在渐变之上，transparent 底不盖死基底 */}
        {fill && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${(hasShield ? hpPct : pct) * 100}%`,
              backgroundColor: 'transparent',
              transition: 'width 280ms cubic-bezier(0.2,0.9,0.3,1)',
              ...nineSlice(fill, SLICE.stripCaps),
            }}
          />
        )}
        {/* ① 叠加层：护盾填充素材（9S）—— 起于血条右端 */}
        {hasShield && shieldFill && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: `${(hasShield ? hpPct : pct) * 100}%`,
              top: 0,
              height: '100%',
              width: `${shPct * 100}%`,
              backgroundColor: 'transparent',
              transition: 'width 280ms cubic-bezier(0.2,0.9,0.3,1)',
              ...nineSlice(shieldFill, SLICE.stripCaps),
            }}
          />
        )}
        {/* ① 叠加层：外框素材（9S 中空框，叠最上） */}
        {frame && <ArtLayer fileName={frame} mode="slice" slice={SLICE.stripCaps} zIndex={3} />}
      </div>
      {showText && (
        <span
          style={{
            fontSize: 10,
            width: hasShield ? 72 : 44,
            textAlign: 'right',
            color: 'var(--color-card-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}/{cap}
          {hasShield && (
            <span style={{ color: 'var(--color-shilv)', fontWeight: 700, marginLeft: 3 }}>盾{shieldVal}</span>
          )}
        </span>
      )}
    </div>
  );
}
