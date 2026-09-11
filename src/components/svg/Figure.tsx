/**
 * 角色 / 心猿立绘
 * 优先使用 AI 生成图（public/art/），加载失败时回退到程序化 SVG。
 */

import { useState } from 'react';

const BASE = import.meta.env.BASE_URL;

const CHAR_IMG: Record<string, string> = {
  luqingya: `${BASE}art/char_陆青崖.png`,
  sujiangxue: `${BASE}art/char_苏绛雪.png`,
  xiewujiu: `${BASE}art/char_谢无咎.png`,
};

const ENEMY_IMG: Record<string, string> = {
  jiaozao: `${BASE}art/enemy_焦躁鬼.png`,
  jiaban: `${BASE}art/enemy_加班怨灵.png`,
  tanchen: `${BASE}art/enemy_贪嗔蠹.png`,
  jinwu: `${BASE}art/enemy_金吾卫.png`,
  chunlei: `${BASE}art/enemy_春雷兽.png`,
  bingyan: `${BASE}art/enemy_冰魇.png`,
};

interface CharacterFigureProps {
  /** 缺省时跳过 AI 图，直接走 SVG 兜底 */
  characterId?: string;
  robe: string;
  trim: string;
  hair: string;
  weapon?: 'blade' | 'artifact' | 'none';
  /** 立绘高度（px）。AI 立绘按此高度等比缩放并底部对齐 */
  size?: number;
  flipped?: boolean;
  /** 覆盖 AI 立绘的投影，用于嵌入小面板时去掉阴影 */
  flat?: boolean;
}

export function CharacterFigure({
  characterId,
  robe,
  trim,
  hair,
  weapon = 'blade',
  size = 150,
  flipped = false,
  flat = false,
}: CharacterFigureProps) {
  const [failed, setFailed] = useState(false);
  const src = characterId ? CHAR_IMG[characterId] : undefined;

  if (src && !failed) {
    // 透明抠图立绘：以 size 为高度，宽度自适应，底部对齐
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        style={{
          height: size,
          width: 'auto',
          maxWidth: 'none',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          transform: flipped ? 'scaleX(-1)' : undefined,
          // 多层柔和投影：贴地阴影 + 轮廓分离，避免硬边
          filter: flat
            ? undefined
            : 'drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 10px 24px rgba(0,0,0,0.45))',
          userSelect: 'none',
          flex: '0 0 auto',
        }}
      />
    );
  }
  return (
    <SvgCharacter robe={robe} trim={trim} hair={hair} weapon={weapon} size={size} flipped={flipped} />
  );
}

interface EnemyFigureProps {
  /** 缺省时跳过 AI 图，直接走 SVG 兜底 */
  enemyId?: string;
  shape: string;
  wuxing?: string;
  size?: number;
  dim?: boolean;
  /** 前摇蓄力脉动 */
  charging?: boolean;
}

export function EnemyFigure({ enemyId, shape, wuxing, size = 130, dim = false, charging = false }: EnemyFigureProps) {
  const [failed, setFailed] = useState(false);
  const src = enemyId ? ENEMY_IMG[enemyId] : undefined;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        className={charging ? 'enemy-charging' : undefined}
        style={{
          width: 'auto',
          height: size * 1.35,
          maxWidth: 'none',
          objectFit: 'contain',
          opacity: dim ? 0.22 : 1,
          filter: dim
            ? 'grayscale(1)'
            : 'drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 10px 22px rgba(0,0,0,0.45))',
          transition: 'opacity 300ms',
          userSelect: 'none',
        }}
      />
    );
  }
  return <SvgEnemy shape={shape} wuxing={wuxing} size={size} dim={dim} />;
}

/* ============================== SVG 兜底 ============================== */

const WX_FILL: Record<string, string> = {
  jin: 'var(--color-wx-jin)',
  mu: 'var(--color-wx-mu)',
  shui: 'var(--color-wx-shui)',
  huo: 'var(--color-wx-huo)',
  tu: 'var(--color-wx-tu)',
};

function SvgCharacter({
  robe,
  trim,
  hair,
  weapon = 'blade',
  size = 150,
  flipped = false,
}: CharacterFigureProps) {
  return (
    <svg
      viewBox="0 0 120 180"
      width={size}
      height={(size * 180) / 120}
      style={{ transform: flipped ? 'scaleX(-1)' : undefined, overflow: 'visible' }}
    >
      <ellipse cx="60" cy="150" rx="46" ry="10" fill={trim} opacity="0.18" />
      <path d="M60 44 L32 74 L20 164 L100 164 L88 74 Z" fill={robe} />
      <path d="M60 44 L32 74 L20 164 L48 164 L52 80 Z" fill="#000" opacity="0.16" />
      <path d="M60 44 L46 76 L60 164 L74 76 Z" fill={trim} opacity="0.85" />
      <path d="M46 76 L38 150" stroke={trim} strokeWidth="3" fill="none" opacity="0.9" />
      <path d="M74 76 L82 150" stroke={trim} strokeWidth="3" fill="none" opacity="0.9" />
      <rect x="40" y="96" width="40" height="9" rx="2" fill={trim} opacity="0.95" />
      <rect x="54" y="36" width="12" height="12" fill="#e8c9a8" />
      <ellipse cx="60" cy="26" rx="15" ry="17" fill="#f2d8bb" />
      <path d="M43 26 Q44 6 60 6 Q76 6 77 26 Q74 16 60 16 Q46 16 43 26 Z" fill={hair} />
      <path d="M43 24 Q38 34 40 46 Q44 36 46 26 Z" fill={hair} />
      <path d="M77 24 Q82 34 80 46 Q76 36 74 26 Z" fill={hair} />
      <path d="M52 27 Q55 24 58 27" stroke={hair} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M62 27 Q65 24 68 27" stroke={hair} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {weapon === 'blade' && (
        <g>
          <rect x="92" y="42" width="4" height="96" rx="2" fill="var(--color-yaqing)" />
          <path d="M94 42 L99 30 L94 20 L89 30 Z" fill="var(--color-yuebai)" />
          <rect x="86" y="132" width="16" height="5" rx="2" fill="var(--color-hupo)" />
        </g>
      )}
      {weapon === 'artifact' && (
        <g>
          <circle cx="94" cy="66" r="13" fill="none" stroke="var(--color-minghuang)" strokeWidth="3" />
          <circle cx="94" cy="66" r="5" fill="var(--color-minghuang)" opacity="0.6" />
          <path d="M94 79 L94 130" stroke="var(--color-yaqing)" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
}

function SvgEnemy({ shape, wuxing, size = 130, dim = false }: EnemyFigureProps) {
  const accent = WX_FILL[wuxing ?? ''] ?? 'var(--color-zhuhong)';
  const body = 'var(--color-yaqing)';
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} style={{ opacity: dim ? 0.4 : 1, overflow: 'visible' }}>
      {shape === 'wraith' && (
        <g>
          <path
            d="M70 22 Q34 40 30 80 Q28 112 48 128 Q70 118 70 100 Q70 118 92 128 Q112 112 110 80 Q106 40 70 22 Z"
            fill={body}
          />
          <path d="M70 22 Q52 44 50 84 Q50 108 62 122 Q70 112 70 96 Z" fill={accent} opacity="0.35" />
          <ellipse cx="58" cy="62" rx="7" ry="9" fill={accent} />
          <ellipse cx="84" cy="62" rx="7" ry="9" fill={accent} />
        </g>
      )}
      {shape === 'beast' && (
        <g>
          <path d="M26 104 Q30 74 56 66 Q84 58 108 72 Q126 82 124 104 Q120 116 104 114 Q96 112 94 104 L70 104 L66 118 Q64 126 54 124 Q46 122 46 112 Z" fill={body} />
          <path d="M100 60 Q124 52 128 70 Q130 86 112 88 Q100 88 98 76 Z" fill={body} />
          <path d="M112 56 Q118 32 106 26 Q110 40 104 52 Z" fill={accent} />
          <ellipse cx="114" cy="70" rx="4" ry="5" fill={accent} />
        </g>
      )}
      {shape === 'insect' && (
        <g>
          <ellipse cx="70" cy="84" rx="26" ry="34" fill={body} />
          <circle cx="70" cy="40" r="16" fill={body} />
          <ellipse cx="62" cy="38" rx="6" ry="8" fill={accent} />
          <ellipse cx="78" cy="38" rx="6" ry="8" fill={accent} />
        </g>
      )}
      {shape === 'dragon' && (
        <g>
          <path
            d="M12 116 Q26 92 46 96 Q60 100 62 84 Q64 66 84 62 Q106 58 112 40 Q116 26 106 20 Q118 30 118 48 Q114 72 92 78 Q74 82 74 96 Q74 112 58 112 Q40 112 30 126"
            stroke={body}
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M100 14 Q124 8 128 26 Q130 42 110 44 Q96 44 94 30 Z" fill={body} />
          <ellipse cx="114" cy="26" rx="4" ry="5" fill={accent} />
        </g>
      )}
      {shape === 'moth' && (
        <g>
          <path d="M70 70 Q24 40 20 76 Q18 108 66 96 Z" fill={body} opacity="0.9" />
          <path d="M70 70 Q116 40 120 76 Q122 108 74 96 Z" fill={body} opacity="0.9" />
          <ellipse cx="70" cy="82" rx="8" ry="30" fill={body} />
        </g>
      )}
    </svg>
  );
}
