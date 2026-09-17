/**
 * 游戏卡牌（T06 · 拆分④）。
 *
 * 【来源】自 `BattleScreen.tsx` 的本地 `GameCard` 组件**逐字搬迁**（含仅被它使用的
 * `QiPip` / `KindGlyph`）。描边语义 / 外发光环 / 分型卡面底 / 中央大图标 / 角标
 * 的位置、字号、颜色、动画全部保留。
 *
 * 【T03 牌面重排】按设计 §四「牌面布局规格」重排：
 *   ① 最上方居中 = 类型（只写类型名，**不带「·五行」**）→ ② 卡名居中 →
 *   ③ 右上 15×15 五行印（`WuXingSeal` 基底 + `ArtLayer` 叠 `WUXING_SEAL`）→
 *   ④ 左上竖排费用 badge（阳上阴下，可承载任意值）→ ⑤ 中央留白（水印 opacity 0.10）→
 *   ⑥ 描述贴底 clamp3（`marginTop:auto` 撑开留白，不溢出卡外）。
 *   删除原底部「类型·五行」冗余标签行；奥义角标移到左上；可合体角标的 `fuseRingPulse`
 *   动画去掉改静态。`CARD_H` / `CARD_W` 不动（保 `handLayout.ts` 魔法数字）。
 *   原 `QiPip`（逐 pip 圆点）改为 `QiBadge`（竖排 badge），原因见其函数注释。
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
 *
 * 【R3 卡面框】分型卡面由「整幅 `cover`」改为**九宫格框**（`SLICE.cardFace`）：
 * 只画四边回纹 + 描金边，内芯透明 → 类型 / 卡名 / 描述落在 `faceBase` 的干净宣纸面上。
 * `CARD_H` / `CARD_W` 与四角绝对定位角标一律不动。
 */
import type { Card } from '../../game/types';
import { KIND_KEY, t, WUXING_KEY } from '../../i18n';
import { WuXingGlyph, WuXingSeal, WX_STROKE } from '../svg/Glyphs';
import { Tip, WUXING_TIP } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { CARD_FACE, faceKeyOf, SLICE, WUXING_SEAL } from './artAssets';
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
}

/**
 * 游戏卡牌 · v3
 *
 * 描边语义（用户约定）：
 * - 金色 = 可融合（未选中任何牌时，标出「有同系伙伴」的牌）
 * - 红色 = 可组合（已选中某张牌后，标出能与它合体的牌）
 * - 金色加粗 + 外发光环 = 本张已被选中
 *
 * 【T06】不再有「非参与组合 -> 降透明」：点第二张只是改选，降透明会误导玩家以为点不动。
 */
export function GameCard({ card, cost, playable, selected, fusible, partner }: GameCardProps) {
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
        // 【T03】可合体目标的 `fuseRingPulse` **动画已去掉，改静态**（配合 T06 的融合语义变更）。
        // 环的静态 boxShadow 仍由上方的 `glow` 三态给出，视觉上仍与「选中金环」区分。
        transition: 'box-shadow 150ms, border-color 150ms, opacity 150ms',
        opacity: playable ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        // 【R3】内容内缩 ≥ 卡面框饰宽（上 12 / 右 8 / 下 14 / 左 9，取整上浮到 9/9）。
        // 目的是让类型 / 卡名 / 描述全部落在**干净纸面**（九宫格的透明内芯）上，
        // 不再压到底部回纹装饰带。绝对定位的五行印 / 费用 / 奥义角标不受 padding 影响，
        // 仍压在框饰上（角标落在四角圆形描金记章处，是刻意的「贴边」观感）。
        padding: '12px 9px 15px 9px',
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
        分型卡面框（R3）。
        【为什么从「整幅 cover」改为九宫格】原实现把 530×742 的整张素材按 cover 铺满 78×112 的卡，
        素材底部的回纹装饰带正好落在卡的下缘 —— 描述的 2–3 行压纹样、末行还被 `overflow:hidden`
        截断。改为 `nineSlice` 后**只画四边框饰**，内芯留空（`border-image-slice` 未加 `fill`），
        于是卡中央露出下方 `faceBase` 的宣纸渐变：文字与未来插图都落在干净纸面上。
        【降级铁律】素材缺失 / 404 时 `border-image` 不绘制，`faceBase` 渐变与描边原样可见 ——
        不白屏、不报错、不塌布局。
      */}
      {faceImg && (
        <ArtLayer
          fileName={faceImg}
          mode="slice"
          slice={SLICE.cardFace}
          zIndex={0}
          style={{ opacity: card.isUltimate ? 1 : 0.92 }}
        />
      )}

      {/* 五行/类型中央大图标（半透明水印）—— 作留白纹理。
          【T03】不删：它是**零素材态唯一视觉识别**；仅把 opacity 由 0.2 降到 0.10，
          中间大片区域留给日后插图（插入图直接叠在这层水印之上即可）。 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.1,
        }}
      >
        {wx ? <WuXingGlyph wuxing={wx} size={62} opacity={1} /> : <KindGlyph kind={card.kind} />}
      </div>

      {/* ① 顶部：类型 —— 只写类型名（**不带「·五行」**，五行由右上印承载）10px / 700 / ls 1 / accent。
          【与设计偏差】设计给 `padding:'3px 20px 0'`，但本卡 content-box 仅 68px 宽（78 − 左右各 5），
          再各留 20px 后只剩 28px，题目 + 多段/群体标记会当场折行 —— 故横向 padding 收窄到 4px，
          并让多段/群体标记用更小字（8.5px）承载，保证单行不折行（视觉上仍居中，短标签观感不变）。 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          padding: '3px 4px 0',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          color: accent,
        }}
      >
        {t(KIND_KEY[card.kind])}
        {card.hits > 1 && (
          <span style={{ fontSize: 8.5, fontWeight: 700 }}>{t('ui.battle.card-hits', { hits: card.hits })}</span>
        )}
        {card.aoe && <span style={{ fontSize: 8.5, fontWeight: 700 }}>{t('ui.battle.card-aoe')}</span>}
      </div>

      {/* ② 卡名 —— 居中 12.5px / 800 / lh 1.1 / accent；
          金木两色在宣纸底对比偏弱，靠 fontWeight:800 + 白光 textShadow 提亮。
          【与设计偏差（R3 复合）】设计给 `padding:'0 18px'`；T03 因容器内边距 5px 改取 12px
          （合计卡边 17px）。R3 把容器内边距提到 9px 后，若仍取 12px 则正文仅剩 36px，
          3 字名（37.5px）当场折行 —— 故横向取 8px（合计卡边 17px，与设计意图等价），
          3 字名稳落单行，5 字名按 lh 1.1 自然折两行。 */}
      <Tip text={kindTip} placement="top" style={{ display: 'block', position: 'relative', zIndex: 2 }}>
        <span
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '0 8px',
            fontFamily: 'var(--font-brush)',
            fontSize: 12.5,
            fontWeight: 800,
            lineHeight: 1.1,
            color: accent,
            textShadow: '0 1px 1px rgba(255,255,255,0.6)',
          }}
        >
          {card.name}
        </span>
      </Tip>

      {/* ③ 描述 —— 贴底 9.5px / 700 / lh 1.25 / clamp 3；`marginTop:auto` 把中间留白推出来，绝不溢出卡外 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          marginTop: 'auto',
          fontSize: 9.5,
          lineHeight: 1.25,
          color: 'var(--color-ink-soft)',
          fontWeight: 700,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.desc}
      </div>

      {/* 右上角：五行印（absolute right:4 top:4，15×15）。
          【降级铁律】`WuXingSeal`（汉字印）常驻 DOM 作基底；素材层是它的**兄弟节点**且 zIndex 更高，缺失即回落汉字印。 */}
      {wx && (
        <Tip text={WUXING_TIP[wx] ?? wx} placement="top" style={{ position: 'absolute', right: 4, top: 4, zIndex: 3 }}>
          {/* 相对容器（15x15）：把叠加层锚到汉字印之上，外层几何与原 `WuXingSeal` 一致 */}
          <span style={{ position: 'relative', width: 15, height: 15, display: 'inline-flex' }}>
            {/* ③ 基底 CSS 层：五行单字印章（无素材时原样可见） */}
            <WuXingSeal wuxing={wx} size={15} />
            {/* ① 叠加层：ui_五行印_*（BG 15x15）—— 叠在汉字印之上，正常加载时盖住汉字 */}
            <ArtLayer fileName={WUXING_SEAL[wx]} mode="fit" fit={{ w: 15, h: 15 }} zIndex={1} style={{ left: 0, top: 0 }} />
          </span>
        </Tip>
      )}

      {/* 左上（费用）：**竖排 badge**（阳在上、阴在下）。
          【为何不用逐 pip 圆点】奥义 costYang 可达 5、costYin 达 6，逐 pip 竖排会溢出卡外，
          badge 能承载任意数值；阳 `--color-hupo` / 阴 `--color-shishui`，字 `--color-xuanzhi-warm`。 */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
          zIndex: 3,
        }}
      >
        {cost.yang > 0 && (
          <Tip text={t('tip.battle.cost-yang', { value: cost.yang })} placement="top">
            <QiBadge type="yang" n={cost.yang} />
          </Tip>
        )}
        {cost.yin > 0 && (
          <Tip text={t('tip.battle.cost-yin', { value: cost.yin })} placement="top">
            <QiBadge type="yin" n={cost.yin} />
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
            // 【T03】左上已让给费用竖排，奥义角标移到 top:3 left:3
            top: 3,
            left: 3,
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

/**
 * 炁消耗 badge（T03）：阳=琥珀、阴=石青。
 * 【为何改 badge 而非逐 pip】奥义 `costYang` 可达 5、`costYin` 达 6，逐 pip 竖排会溢出卡外；
 * badge 承载任意数值，竖排两枚（阳上阴下）即可：minW18 h14 r3、11px/700、字 `--color-xuanzhi-warm`。
 */
function QiBadge({ type, n }: { type: 'yang' | 'yin'; n: number }) {
  return (
    <span
      style={{
        minWidth: 18,
        height: 14,
        lineHeight: '14px',
        textAlign: 'center',
        borderRadius: 3,
        fontSize: 11,
        fontWeight: 700,
        background: type === 'yang' ? 'var(--color-hupo)' : 'var(--color-shishui)',
        color: 'var(--color-xuanzhi-warm)',
      }}
    >
      {n}
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
