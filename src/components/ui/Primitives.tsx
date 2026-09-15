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

export function JadeButton({
  children,
  onClick,
  variant = 'primary',
  disabled,
  style,
  size = 'md',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** primary = 朱红描金；ghost = 玉牌描金；gold = 明黄描金 */
  variant?: 'primary' | 'ghost' | 'gold';
  disabled?: boolean;
  style?: React.CSSProperties;
  size?: 'sm' | 'md' | 'lg';
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
        border: `1.5px solid ${border}`,
        boxShadow: disabled
          ? 'none'
          : '0 2px 6px rgba(120,90,40,0.26), inset 0 1px 0 rgba(255,246,220,0.6)',
        opacity: disabled ? 0.7 : 1,
        textShadow: disabled || variant === 'ghost' ? 'none' : '0 1px 2px rgba(80,20,10,0.5)',
        transition: 'transform 120ms, box-shadow 120ms',
        ...style,
      }}
    >
      {children}
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
      <div
        style={{
          flex: 1,
          height,
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
