/**
 * 手牌布局数学（纯函数 · T02 battle/ 基建）。
 *
 * 【来源】自 `BattleScreen.tsx` 手牌扇形渲染（约 969–999 行）**逐字抽取**：
 * 数值、`Math.max` / `Math.min` 结构、条件分支顺序、`transform` 字符串全部保留
 * （对照设计 §七.2 的魔法数字清单），以便 T06 把 `HandArea` / `useHandInteraction`
 * 切到本函数后**界面像素级零变化**。
 *
 * 【本任务（T02）只建立、不接线】`BattleScreen.tsx` 仍使用其内联数学，渲染完全不变。
 */
import { CARD_W, FOLD_STEP } from './constants';

/** 单张手牌的最终布局（供内联 style 消费） */
export interface HandCardLayout {
  /** 与上一张之间的外边距（第 0 张为 0，其余为负的叠压宽度） */
  marginLeft: number;
  /** CSS transform 字符串 */
  transform: string;
  /** 叠放层级 */
  zIndex: number;
  /** 均分步进（暴露给调试 / 测试） */
  step: number;
  /** 叠压宽度（= CARD_W - step，下限 0） */
  overlap: number;
  /** 扇形角度（deg） */
  rot: number;
  /** 扇形弧高（px） */
  arc: number;
}

/** 手牌布局输入 */
export interface HandCardLayoutInput {
  /** 牌索引（0 起） */
  index: number;
  /** 手牌张数 */
  count: number;
  /** 是否展开态（有选中牌即展开） */
  expanded: boolean;
  /** 本张是否被选中 */
  selected: boolean;
  /** 本张是否是可合体目标 */
  partner: boolean;
  /** 本张是否正在被拖动 */
  dragging: boolean;
}

/**
 * 计算单张手牌的布局。结构与 `BattleScreen.tsx` 原内联版本逐字一致。
 *
 * @param input 索引 / 张数 / 展开态 / 选中态 / 可合体目标态 / 拖动态
 * @returns 消费进内联 style 的 `marginLeft` / `transform` / `zIndex`，以及中间量
 */
export function handCardLayout(input: HandCardLayoutInput): HandCardLayout {
  const { index: i, count: n, expanded: handExpanded, selected: sel, partner, dragging } = input;

  const mid = (n - 1) / 2;
  /** 均分步进：让 n 张牌正好铺满手牌区可用宽度（marginLeft 用负值抵消） */
  const even = Math.floor((344 - CARD_W) / Math.max(1, n - 1));
  /**
   * 收拢态：步进上限 FOLD_STEP(32)，重度叠压，每张只露左侧一条边。
   * 展开态：用均分步进尽量摊开。
   */
  const step = handExpanded
    ? Math.max(20, Math.min(CARD_W + 6, even))
    : Math.max(16, Math.min(FOLD_STEP, even));
  const overlap = Math.max(0, CARD_W - step);
  // 扇形弧度：展开态角度更大
  const rotMax = handExpanded ? 7 : 5;
  const rot = n <= 1 ? 0 : ((i - mid) / Math.max(1, mid)) * rotMax;
  const arc = handExpanded ? Math.abs(i - mid) * 3 : Math.abs(i - mid) * 1.2;

  let transform = `rotate(${rot}deg) translateY(${arc}px)`;
  let z = i;
  if (sel) {
    transform = 'rotate(0deg) translateY(-58px) scale(1.12)';
    z = 300;
  } else if (partner) {
    transform = `rotate(${rot}deg) translateY(-22px) scale(1.06)`;
    z = 200 + i;
  }
  if (dragging) z = 400;

  return {
    marginLeft: i === 0 ? 0 : -overlap,
    transform,
    zIndex: z,
    step,
    overlap,
    rot,
    arc,
  };
}
