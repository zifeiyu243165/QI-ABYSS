/**
 * 游戏卡牌（T06 · 拆分④）。
 *
 * 【来源】自 `BattleScreen.tsx` 的本地 `GameCard` 组件**逐字搬迁**（含仅被它使用的
 * `QiPip` / `KindGlyph`）。描边语义 / 外发光环 / 分型卡面底 / 中央大图标 / 角标
 * 的位置、字号、颜色、动画全部保留。
 *
 * 【接入素材】
 * - `ui_五行印_*`（BG 15×15）：**叠在左上角 `WuXingSeal` 汉字印之上**（设计 U5：素材设计意图
 *   是「绝不要写汉字」，正常加载时盖住汉字即为预期）。中央大图标 `WuXingGlyph size={62}`
 *   **保持不变** —— 那是卡面主视觉，本轮素材未覆盖（见设计 §3.2 接入对照表）。
 *
 * 【降级铁律】`WuXingSeal`（SVG 汉字印）**必须留在 DOM 作基底**；素材层是它的兄弟节点、`zIndex`
 * 更高。素材缺失 / 404 时渲染为空 -> 汉字印原样可见。**不得**「素材存在才渲染 SVG」。
 * `card.kind` 无五行（如通用牌）时仍走 `KindGlyph`，不接素材。
 *
 * 【与设计偏差（以代码实际为准）】原 `CARD_FACE` / `faceKeyOf` 已在 T02 迁入 `artAssets.ts`，
 * 本组件改为具名 import（删除本地副本），避免同一映射表出现两份。
 */
import type { Card } from '../../game/types';
import { KIND_KEY, t, WUXING_KEY } from '../../i18n';
import { WuXingGlyph, WuXingSeal, WX_STROKE } from '../svg/Glyphs';
import { Tip, WUXING_TIP } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { artUrl, CARD_FACE, faceKeyOf, WUXING_SEAL } from './artAssets';
import { CARD_H, CARD_W } from './constants';

interface GameCardProps {
  /** 卡牌数据 */
  card: Card;
  /** 本张的炁消耗（由编排层用 `cardCost` 计算） */
  cost: { yang: number; yin: number };
  /** 当前是否可打出 */
  playable: boolean;
  /** 是否被选中 */
  selected: boolean;
  /** 静止态：手牌里有能跟它合体的牌（左边缘金条） */
  fusible: boolean;
  /** 是否是可组合目标 */
  partner: boolean;
  /** 展开态下未参与组合 -> 降透明 */
  dimmed: boolean;
}

/**
 * 游戏卡牌 · v3
 *
 * 描边语义（用户约定）：
 * - 金色 = 可融合（未选中任何牌时，标出「有同系伙伴」的牌）
 * - 红色 = 可组合（已选中某张牌后，标出能与它合体的牌）
 * - 金色加粗 + 外发光环 = 本张已被选中；未参与组合的牌降透明
 */
export function GameCard({ card, cost, playable, selected, fusible, partner, dimmed }: GameCardProps) {
  const wx = card.wuxing;
  const accent = wx ? WX_STROKE[wx] : card.kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';

  const borderColor = selected
    ? 'var(--color-miaojin)'
    : partner
      ? 'var(--color-zhuhong)'
      : card.isUltimate
        ? 'var(--color-miaojin-deep)'
        : accent;
  const borderWidth = selected || partner ? 3 : card.isUltimate ? 2.5 : 1.5;

  /**
   * 外发光环：**只**给「已选中 / 可合体目标」两种状态。
   *
   * 【曾经的 Bug】静止态也把「手上有可融合对象」的牌统统镀上金环 —— 实测一副手牌里有
   * 3 张同系牌，于是一屏出现三道金框，而金框又同时是「选中」的颜色，
   * 玩家根本分不清哪张是选中的 ->「高亮包边不明显」。
   * 现在三种状态的视觉语言彻底分开：
   *   静止可合体 = 左边缘一条金条（收拢时恰好可见）
   *   已选中     = 金色粗环 + 上浮放大
   *   可合体目标 = 朱红脉动环 + 轻微上浮
   */
  const glow = selected
    ? '0 0 0 3px rgba(255,229,150,0.95), 0 0 34px rgba(212,168,67,1), 0 12px 26px rgba(40,26,12,0.55)'
    : partner
      ? '0 0 0 2.5px rgba(255,168,140,0.9), 0 0 26px rgba(194,59,34,0.95), 0 8px 16px rgba(40,26,12,0.5)'
      : '0 3px 8px rgba(40,26,12,0.4), inset 0 1px 0 rgba(255,255,255,0.8)';

  /**
   * 牌面底：物理=竹简暖黄；功能=玉青；术法=宣纸；奥义=描金烫底。
   * 全部走 token，不在本文件留下 hex 字面量。
   */
  const faceBase = card.isUltimate
    ? 'linear-gradient(158deg, var(--color-xuanzhi-warm) 0%, var(--color-miaojin-light) 58%, var(--color-miaojin) 100%)'
    : card.kind === 'physical'
      ? 'linear-gradient(158deg, var(--color-xuanzhi-warm) 0%, var(--color-zhujian) 100%)'
      : card.kind === 'support'
        ? 'linear-gradient(158deg, var(--color-yushi) 0%, var(--color-yushi-deep) 100%)'
        : 'linear-gradient(158deg, var(--color-xuanzhi) 0%, var(--color-zhujian-deep) 100%)';

  /** 分型卡面图（可缺省）：缺图时这一层不渲染，只剩上面的渐变底 */
  const faceImg = CARD_FACE[faceKeyOf(card)];

  // 【S1 归一】卡牌类别名 / 五行中文名真源 = i18n（原 KIND_LABEL / WX_CN 两份本地副本已删）
  const kindSummary = `${t(KIND_KEY[card.kind])}${wx ? `·${t(WUXING_KEY[wx])}` : ''}${
    card.hits > 1 ? t('tip.battle.card-hits', { hits: card.hits }) : ''
  }${card.aoe ? t('tip.battle.card-aoe') : ''}`;
  const kindTip = t('tip.battle.card', { name: card.name, summary: kindSummary, desc: card.desc });

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 8,
        border: `${borderWidth}px solid ${borderColor}`,
        background: faceBase,
        boxShadow: glow,
        // 可合体目标：脉动，与「选中」的静态金环区分开
        animation: partner ? 'fuseRingPulse 1.35s ease-in-out infinite' : undefined,
        transition: 'box-shadow 150ms, border-color 150ms, opacity 150ms',
        opacity: dimmed ? 0.45 : playable ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        padding: '5px 5px 4px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/*
        静止态「有可合体对象」的指示：只在**左边缘**描一条金条。
        手牌收拢时每张牌恰好只露出左侧一条边，金条正好露在外面 —— 既不跟
        「选中的金环」抢语义，也不会像以前那样一屏四五道金框。
      */}
      {fusible && !selected && !partner && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3.5,
            zIndex: 4,
            background: 'linear-gradient(180deg, rgba(255,229,150,0.98), rgba(212,168,67,0.95))',
            boxShadow: '0 0 7px rgba(212,168,67,0.9)',
          }}
        />
      )}

      {/*
        分型卡面图（物理 / 五行术法 / 功能 / 奥义 各一张，见 public/art/卡面与界面提示词.md）。
        做成「叠在渐变底上的一层半透明图案」而不是直接当 background，
        这样素材没生成时只是少一层花纹，文字对比度和可玩性都不受影响。
      */}
      {faceImg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${artUrl(faceImg)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: card.isUltimate ? 0.6 : 0.42,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 五行/类型中央大图标（半透明水印）。素材未覆盖卡面主视觉，保持不变 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.2,
        }}
      >
        {wx ? <WuXingGlyph wuxing={wx} size={62} opacity={1} /> : <KindGlyph kind={card.kind} />}
      </div>

      {/* 顶部：标题 */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'flex-start', gap: 3 }}>
        <Tip text={kindTip} placement="top" style={{ flex: 1, display: 'block' }}>
          <span
            style={{
              fontFamily: 'var(--font-brush)',
              fontSize: 13,
              color: 'var(--color-card-title)',
              lineHeight: 1.1,
              fontWeight: 700,
              display: 'block',
            }}
          >
            {card.name}
          </span>
        </Tip>
        {wx && (
          <Tip text={WUXING_TIP[wx] ?? wx} placement="top">
            {/* 相对容器（15x15）：把叠加层锚到汉字印之上，外层几何与原 `WuXingSeal` 一致 */}
            <span style={{ position: 'relative', width: 15, height: 15, display: 'inline-flex' }}>
              {/* ③ 基底 CSS 层：五行单字印章（无素材时原样可见） */}
              <WuXingSeal wuxing={wx} size={15} />
              {/* ① 叠加层：ui_五行印_*（BG 15x15）—— 叠在汉字印之上，正常加载时盖住汉字 */}
              <ArtLayer fileName={WUXING_SEAL[wx]} mode="fit" fit={{ w: 15, h: 15 }} zIndex={1} style={{ left: 0, top: 0 }} />
            </span>
          </Tip>
        )}
      </div>

      {/* 类型标签 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          fontSize: 9,
          color: 'var(--color-card-text-sub)',
        }}
      >
        {wx ? `${t(KIND_KEY[card.kind])}·${t(WUXING_KEY[wx])}` : t(KIND_KEY[card.kind])}
        {card.hits > 1 ? t('ui.battle.card-hits', { hits: card.hits }) : ''}
        {card.aoe ? t('ui.battle.card-aoe') : ''}
      </div>

      {/* 效果描述：加大字重与对比度（此前偏小偏灰） */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: 10,
          lineHeight: 1.3,
          color: 'var(--color-ink-soft)',
          fontWeight: 700,
          marginTop: 2,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.desc}
      </div>

      {/* 左上：炁消耗 */}
      <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', gap: 2, zIndex: 3 }}>
        {cost.yang > 0 && (
          <Tip text={t('tip.battle.cost-yang', { value: cost.yang })} placement="top">
            <QiPip type="yang" n={cost.yang} />
          </Tip>
        )}
        {cost.yin > 0 && (
          <Tip text={t('tip.battle.cost-yin', { value: cost.yin })} placement="top">
            <QiPip type="yin" n={cost.yin} />
          </Tip>
        )}
      </div>

      {/*
        融合提示角标：只保留「可合体」（选中之后才有意义）。
        静止态的「可融合」角标已删除 —— 它钉在右下角，而手牌收拢时右下角被
        右边那张牌整个盖住，等于看不见；现在改用左边缘金条表达同一件事。
      */}
      {partner && (
        <div
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            fontSize: 8,
            padding: '0 3px',
            borderRadius: 2,
            zIndex: 4,
            fontWeight: 700,
            background: 'var(--color-zhuhong)',
            color: 'var(--color-xuanzhi-warm)',
          }}
        >
          {t('ui.battle.card-fusable')}
        </div>
      )}

      {card.isUltimate && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            fontSize: 8,
            background: 'var(--color-minghuang)',
            color: 'var(--color-card-title)',
            padding: '0 3px',
            borderRadius: 2,
            zIndex: 3,
            fontWeight: 700,
          }}
        >
          {t('ui.battle.ultimate')}
        </div>
      )}
    </div>
  );
}

/** 炁消耗圆点：阳=琥珀、阴=石青 */
function QiPip({ type, n }: { type: 'yang' | 'yin'; n: number }) {
  const color = type === 'yang' ? 'var(--color-hupo)' : 'var(--color-shishui)';
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: color,
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-card-text)' }}>{n}</span>
    </span>
  );
}

/** 物理/功能牌的中央图形（无五行时） */
function KindGlyph({ kind }: { kind: string }) {
  const color = kind === 'physical' ? 'var(--color-zhuhong)' : 'var(--color-songhua)';
  return (
    <svg viewBox="0 0 100 100" width={62} height={62} style={{ opacity: 0.9 }}>
      {kind === 'physical' ? (
        <g fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 78 L70 30" />
          <path d="M62 22 L78 38 L70 46 L54 30 Z" fill={color} opacity="0.55" />
          <path d="M18 82 L30 70" strokeWidth="6" />
        </g>
      ) : (
        <g fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round">
          <circle cx="50" cy="50" r="24" />
          <path d="M50 26 V74 M26 50 H74" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}
