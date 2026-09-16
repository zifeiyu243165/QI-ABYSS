/**
 * 【本文件是全项目「除 src/i18n/** 外」唯一含中文字面量的新文件】
 * 这里的中文是**素材文件名（数据）**，不是界面文案 —— 与 src/game/audio.ts 同构，
 * 已在 scripts/架构守卫.mjs 的 CJK_PENDING 登记白名单。
 * ⚠ 本文件不得新增任何「玩家可见的中文文案」（那必须走 t()）。
 *
 * 【T02 只建立、不引用】本文件的导出暂无人使用，以保证 battle/ 基建落地时界面像素级零变化；
 * T03–T08 各分区组件再按设计 §三 的对照表逐个接入。
 */
import type { CSSProperties } from 'react';
import type { Card, StatusId, WuXing } from '../../game/types';
import { BASE } from './constants';

/** 拼接素材 URL：`<BASE>art/<fileName>`。全项目**唯一**允许拼素材路径的地方。 */
export function artUrl(fileName: string): string {
  return `${BASE}art/${fileName}`;
}

/** 界面零件素材名表（`public/art/` 下的 `ui_*.png`，见设计 §三 接入对照表） */
export const UI = {
  topBar: 'ui_天时条.png',
  turnPlaque: 'ui_回合计数牌.png',
  enemyPlatform: 'ui_敌方底台.png',
  intentCardBg: 'ui_意图卡底.png',
  hpFrame: 'ui_血条_框.png',
  hpFill: 'ui_血条_红.png',
  shieldFill: 'ui_血条_绿.png',
  shiFill: 'ui_势条_填充.png',
  shiTicks: 'ui_势条_格.png',
  flawMark: 'ui_破绽标记.png',
  statusAtlas: 'ui_状态图标.png',
  stanceBase: 'ui_架势条_底.png',
  stanceGlow: 'ui_架势条_亮.png',
  playerPanel: 'ui_我方面板.png',
  qiYang: 'ui_炁槽_阳.png',
  qiYin: 'ui_炁槽_阴.png',
  btnPrimary: 'ui_玉按钮_主.png',
  btnGold: 'ui_玉按钮_金.png',
  btnGhost: 'ui_玉按钮_灰.png',
  logFrame: 'ui_战报框.png',
  parryGold: 'ui_弹反区_金.png',
  parryRed: 'ui_弹反区_红.png',
  dmgBackdrop: 'ui_伤害飘字底.png',
  emptySlot: 'ui_空手牌槽.png',
} as const;

/**
 * 背景素材名（`bg_*.png`）。
 *
 * 【为何进本文件】T07/T08 之前，战斗屏的背景名是写死在 `BattleScreen.tsx` 里的模板字符串
 * （`` `url(${BASE}art/bg_战场.png)` ``）—— 那是「素材文件名越界」（§八 明令素材路径只能经
 * 本文件的 `artUrl()`/`UI.*` 拼装）。本次拆分顺手把它收归本表，使 `BattleScreen` 不再出现裸素材名。
 */
export const BG = {
  battlefield: 'bg_战场.png',
} as const;

/** 五行印素材名（替换 `svg/Glyphs.tsx` 的 `WuXingSeal` 汉字色块，见设计 U5） */
export const WUXING_SEAL: Record<WuXing, string> = {
  jin: 'ui_五行印_金.png',
  mu: 'ui_五行印_木.png',
  shui: 'ui_五行印_水.png',
  huo: 'ui_五行印_火.png',
  tu: 'ui_五行印_土.png',
};

/** 卡面分型映射（自 BattleScreen.tsx:1827-1843 搬运，行为不变） */
export const CARD_FACE: Record<string, string> = {
  ultimate: 'card_奥义.png',
  physical: 'card_物理.png',
  support: 'card_功能.png',
  'spell-jin': 'card_术法_金.png',
  'spell-mu': 'card_术法_木.png',
  'spell-shui': 'card_术法_水.png',
  'spell-huo': 'card_术法_火.png',
  'spell-tu': 'card_术法_土.png',
};

/** 取一张卡的卡面分型 key（奥义优先于原类型，五行使术法再细分） */
export function faceKeyOf(card: Card): string {
  if (card.isUltimate) return 'ultimate';
  if (card.kind === 'spell' && card.wuxing) return `spell-${card.wuxing}`;
  return card.kind;
}

/**
 * 九宫格切片表。**一律用百分比**（生成像素与文档标注不符，且抠图会改尺寸 → 百分比才与分辨率解耦）。
 * slice 顺序 = 上 右 下 左；width = 渲染端头厚度（px，可独立于 slice）。
 * 首轮取值由「按实测图目测端饰占比」得出，实现时可微调 —— **但不得改成像素数字**。
 */
export const SLICE = {
  topBar: { slice: '26% 5% 26% 5%', width: '0 10px 0 10px' },
  intentCard: { slice: '16% 10% 16% 10%', width: '6px 8px 6px 8px' },
  stripCaps: { slice: '0 8% 0 8%', width: '0 8px 0 8px' },
  shiFill: { slice: '0 10% 0 10%', width: '0 6px 0 6px' },
  /**
   * 架势轨道：横向切片由首轮目测的 5% 微调为 3%（T03 实装校准）。
   * 依据：素材上两道描金竖线把轨道三等分；在 8px 端带、三格等宽（gap 0）下，
   * 侧切片取 3% 时 1/3、2/3 处的映射与格边界误差最小（约 1.5px）。高度 38 不变。
   */
  stanceBase: { slice: '20% 3% 20% 3%', width: '0 8px 0 8px' },
  /**
   * 我方面板：**左切片放大到 26%（≈96px）且左侧边框宽同取 96px**，让左上头像凹槽区
   * 1:1 落到面板左端（与 padding-left 10 处的 `<CharacterFigure size={84}>` 对齐），
   * 中段再横向拉伸 —— 避免默认 12%/14px 把凹槽压扁错位（T04 实装校准）。
   * 上/下切片取 0：面板高 104 与素材等比例映射，纵向无端饰需分离。
   */
  playerPanel: { slice: '0 6% 0 26%', width: '0 22px 0 96px' },
  jadeButton: { slice: '24% 9% 24% 9%', width: '8px 10px 8px 10px' },
  logFrame: { slice: '14% 6% 14% 14%', width: '8px 8px 8px 14px' },
  parryZone: { slice: '0 8% 0 8%', width: '0 10px 0 10px' },
} as const;

/** 九宫格 → 内联样式（`border-image` 会忽略 `border-radius`，形状由素材提供） */
export function nineSlice(fileName: string, s: { slice: string; width: string }): CSSProperties {
  return {
    borderStyle: 'solid',
    borderWidth: s.width,
    borderColor: 'transparent',
    borderImageSource: `url(${artUrl(fileName)})`,
    borderImageSlice: s.slice,
    borderImageWidth: s.width,
    borderImageRepeat: 'stretch', // 中间段拉伸；勿用 repeat/round（描金边会重复）
  };
}

/* ---------------------------- 状态图集精灵 ---------------------------- */
/**
 * ui_状态图标.png = 横排 6 格：①灼烧 ②霜寒 ③冻结 ④破甲 ⑤虚弱 ⑥护盾
 * 【只有 5 个 StatusId 有图】paralyze / silence / flaw 无对应格 → 返回 null，
 * 调用方回落现有 SVG `StatusGlyph`。
 * 第 6 格「护盾」不是 StatusId（护盾是数值字段），本表**不登记**。
 */
const ATLAS_COLS = 6;
const ATLAS_CELL: Partial<Record<StatusId, number>> = {
  burn: 0,
  frost: 1,
  freeze: 2,
  armorBreak: 3,
  weak: 4,
};

/** 取某状态在图集里的精灵样式；无对应格时返回 `null`（调用方回落 SVG） */
export function statusAtlasStyle(id: StatusId, size: number): CSSProperties | null {
  const cell = ATLAS_CELL[id];
  if (cell === undefined) return null;
  return {
    display: 'inline-block',
    width: size,
    height: size,
    backgroundImage: `url(${artUrl(UI.statusAtlas)})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${ATLAS_COLS * 100}% 100%`,
    backgroundPositionX: `${(cell / (ATLAS_COLS - 1)) * 100}%`,
  };
}
