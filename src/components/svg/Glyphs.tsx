/**
 * 五行纹样（SVG 程序化）
 *
 * 设计哲学 §2.2 / §5.3：
 * - 每种五行必须有**独立颜色 + 独立纹理**，支持色盲玩家辨别
 * - 纹样取自真实道家文化元素，不用「龙凤/仙鹤/祥云」泛化装饰
 *   火 = 火焰纹　水 = 波浪纹　木 = 藤蔓纹　金 = 回纹（云雷）　土 = 龟裂纹
 */

import { t, WUXING_KEY } from '../../i18n';
import type { WuXing } from '../../game/types';

export const WX_STROKE: Record<WuXing, string> = {
  jin: 'var(--color-wx-jin)',
  mu: 'var(--color-wx-mu)',
  shui: 'var(--color-wx-shui)',
  huo: 'var(--color-wx-huo)',
  tu: 'var(--color-wx-tu)',
};

/**
 * 五行大图标：卡牌正中央的巨大半透明纹样。
 * 玩家扫一眼就能认出属性，不用读字。
 */
export function WuXingGlyph({
  wuxing,
  size = 56,
  opacity = 0.9,
  color,
}: {
  wuxing: WuXing;
  size?: number;
  opacity?: number;
  color?: string;
}) {
  const stroke = color ?? WX_STROKE[wuxing];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ opacity, pointerEvents: 'none', display: 'block' }}
    >
      {/* ---- 金 · 回纹（云雷纹方环） ---- */}
      {wuxing === 'jin' && (
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="square">
          <rect x="14" y="14" width="72" height="72" rx="4" />
          <rect x="26" y="26" width="48" height="48" rx="3" />
          <path d="M38 38 H62 V62 H46 V50 H54" />
          <path d="M14 26 H26 M14 38 H26 M74 26 H86 M74 38 H86" strokeWidth="3" />
          <path d="M14 74 H26 M14 62 H26 M74 74 H86 M74 62 H86" strokeWidth="3" />
        </g>
      )}

      {/* ---- 木 · 藤蔓纹 ---- */}
      {wuxing === 'mu' && (
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round">
          <path d="M50 90 C50 66 30 62 30 44 C30 30 40 24 50 24 C62 24 70 32 70 44 C70 58 58 62 50 74" />
          <path d="M30 52 C22 50 18 42 22 36" />
          <path d="M70 40 C78 38 82 30 78 24" />
          <ellipse cx="30" cy="34" rx="7" ry="4" fill={stroke} stroke="none" transform="rotate(-32 30 34)" />
          <ellipse cx="70" cy="30" rx="7" ry="4" fill={stroke} stroke="none" transform="rotate(30 70 30)" />
          <ellipse cx="50" cy="16" rx="6" ry="3.5" fill={stroke} stroke="none" />
        </g>
      )}

      {/* ---- 水 · 波浪纹 ---- */}
      {wuxing === 'shui' && (
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round">
          <path d="M12 38 C24 22 36 22 50 38 C64 54 76 54 88 38" />
          <path d="M12 56 C24 40 36 40 50 56 C64 72 76 72 88 56" />
          <path d="M12 74 C24 58 36 58 50 74 C64 90 76 90 88 74" opacity="0.55" />
        </g>
      )}

      {/* ---- 火 · 火焰纹 ---- */}
      {wuxing === 'huo' && (
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M50 88 C34 88 24 76 24 62 C24 48 34 42 38 30 C40 42 46 46 50 40 C52 28 48 20 56 12 C60 24 74 34 76 52 C78 72 66 88 50 88 Z" />
          <path d="M50 76 C44 76 40 70 40 64 C40 58 46 54 50 48 C54 56 60 58 60 66 C60 72 56 76 50 76 Z" opacity="0.6" />
        </g>
      )}

      {/* ---- 土 · 龟裂纹 ---- */}
      {wuxing === 'tu' && (
        <g fill="none" stroke={stroke} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="16" y="16" width="68" height="68" rx="6" />
          <path d="M50 16 V50 M50 50 H16 M50 50 L78 84" />
          <path d="M30 30 L44 42 M70 30 L58 40 M34 72 L44 62 M68 68 L58 60" opacity="0.7" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

/** 五行单字印章（小尺寸用，如卡牌角标） */
export function WuXingSeal({ wuxing, size = 18 }: { wuxing: WuXing; size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 3,
        background: WX_STROKE[wuxing],
        color: 'var(--color-xuanzhi)',
        fontFamily: 'var(--font-seal)',
        fontSize: size * 0.68,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {t(WUXING_KEY[wuxing])}
    </span>
  );
}

/**
 * 八卦底盘：敌人脚下的发光阵图。
 * 解决「敌人与背景融为一体、敌我不分」的问题。
 */
export function BaguaPlatform({
  size = 130,
  color = 'var(--color-miaojin)',
  glow = true,
  wuxing,
}: {
  size?: number;
  color?: string;
  glow?: boolean;
  wuxing?: WuXing;
}) {
  const accent = wuxing ? WX_STROKE[wuxing] : color;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{
        position: 'absolute',
        left: '50%',
        top: '58%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        filter: glow ? `drop-shadow(0 0 10px ${accent}) drop-shadow(0 0 22px rgba(212,168,67,0.35))` : undefined,
      }}
    >
      <defs>
        <radialGradient id="baguaGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
          <stop offset="62%" stopColor={accent} stopOpacity="0.12" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="url(#baguaGrad)" />
      <circle cx="60" cy="60" r="46" fill="none" stroke={color} strokeWidth="1.6" opacity="0.75" />
      <circle cx="60" cy="60" r="40" fill="none" stroke={color} strokeWidth="1" opacity="0.5" strokeDasharray="3 5" />
      <circle cx="60" cy="60" r="24" fill="none" stroke={color} strokeWidth="1" opacity="0.42" />
      {/* 八方卦爻 */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x1 = 60 + Math.cos(a) * 46;
        const y1 = 60 + Math.sin(a) * 46;
        const x2 = 60 + Math.cos(a) * 56;
        const y2 = 60 + Math.sin(a) * 56;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2.4" opacity="0.7" />;
      })}
      {/* 中央太极 */}
      <g opacity="0.85">
        <circle cx="60" cy="60" r="13" fill="none" stroke={accent} strokeWidth="1.8" />
        <path
          d="M60 47 A6.5 6.5 0 0 1 60 60 A6.5 6.5 0 0 0 60 73 A13 13 0 0 1 60 47 Z"
          fill={accent}
          opacity="0.75"
        />
        <circle cx="60" cy="53.5" r="2.1" fill={accent} />
        <circle cx="60" cy="66.5" r="2.1" fill="none" stroke={accent} strokeWidth="1.2" />
      </g>
    </svg>
  );
}

/**
 * 状态纹样：替代方块图标，精致且直观。
 * 灼烧=火焰纹　霜寒/冻结=冰裂纹　破绽=金环　麻痹=雷纹　虚弱=断纹　破甲=裂甲纹
 */
export function StatusGlyph({ id, size = 13 }: { id: string; size?: number }) {
  const s = (path: React.ReactNode, color: string) => (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <g fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </g>
    </svg>
  );

  switch (id) {
    case 'burn':
      return s(
        <>
          <path d="M12 21 C7 21 5 17.5 5 14.5 C5 11 8 9.5 9 6 C9.5 9 11 10 12 8.5 C12.6 5.5 11.4 3.5 14 2 C15 5.5 19 8 19 13.5 C19 17.5 17 21 12 21 Z" />
          <path d="M12 18 C10 18 9 16.5 9 15 C9 13.5 11 12.5 12 10.5 C13 12.5 15 13.5 15 15 C15 16.5 14 18 12 18 Z" opacity="0.6" />
        </>,
        'var(--color-zhuhong)',
      );
    case 'frost':
      return s(
        <>
          <path d="M12 2 V22 M3 7 L21 17 M21 7 L3 17" />
          <path d="M12 7 L9.5 4.5 M12 7 L14.5 4.5 M12 17 L9.5 19.5 M12 17 L14.5 19.5" strokeWidth="1.3" />
        </>,
        'var(--color-shishui)',
      );
    case 'freeze':
      return s(
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M12 4 V20 M4 12 H20 M7 7 L17 17 M17 7 L7 17" strokeWidth="1.2" />
        </>,
        'var(--color-shishui)',
      );
    case 'flaw':
      return s(
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.6" opacity="0.7" />
        </>,
        'var(--color-minghuang)',
      );
    case 'paralyze':
      return s(<path d="M13 2 L5 13 H11 L10 22 L19 10 H12 Z" />, 'var(--color-wx-jin)');
    case 'weak':
      return s(
        <>
          <path d="M12 3 V10" />
          <path d="M12 14 V21" opacity="0.5" />
          <path d="M7 12 H17" />
        </>,
        'var(--color-songhua)',
      );
    case 'armorBreak':
      return s(
        <>
          <path d="M12 2 L21 6 V12 C21 17 17 20 12 22 C7 20 3 17 3 12 V6 Z" />
          <path d="M12 3 L8 12 L13 12 L10 21" strokeWidth="1.5" />
        </>,
        'var(--color-hupo)',
      );
    case 'silence':
      return s(
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M6 6 L18 18" />
        </>,
        'var(--color-shiqing)',
      );
    default:
      return null;
  }
}
