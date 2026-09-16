/**
 * 战斗屏共享常量（T02 · battle/ 基建）。
 *
 * 【来源】自 `src/components/BattleScreen.tsx` 原样搬迁（约 40–63 行）：常量名、数值、
 * 注释一律**逐个保留**，`BattleScreen.tsx` 改为从本文件具名 import —— 行为与外观零变化。
 *
 * 约定（见设计 §八）：
 * - 常量名 `UPPER_SNAKE_CASE`，**具名导出**（项目无 `default` 导出惯例）；
 * - 新的魔法数字先问「能不能进本文件」，但**内联表达式里的既有魔法数字**（如 344）不得顺手整理。
 */

/** 资源路径基址（Vite base，构建后为相对路径）。素材路径一律经 `artAssets.artUrl()` 拼装。 */
export const BASE = import.meta.env.BASE_URL;

/** 阴阳炁条在屏幕上的大致位置：归墟流光一律飞向这里（与 CSS 变量 --dx/--dy 配合） */
export const QI_BAR_TARGET = { x: 292, y: 386 };
/** 归墟流光飞行时长，必须与 global.css 的 relicFlow 动画时长一致 */
export const RELIC_FLOW_MS = 700;

/** 敌方区三段定高（意图卡 / 立绘盒 / 信息板）—— 三个敌人共用，保证横向对齐 */
export const INTENT_H = 48;
export const FIGBOX_H = 116;
export const INFO_H = 66;

/** 手牌尺寸与收拢参数 */
export const CARD_W = 78;
export const CARD_H = 112;
/** 收拢态每张牌露出的宽度（参考图一：只露左侧一条边） */
export const FOLD_STEP = 32;
/** 上拖超过此距离 → 选中 */
export const SELECT_LIFT_PX = 46;
/** 下拖超过此距离 → 取消选中 */
export const RELEASE_BACK_PX = 30;
/** 指针位移超过此距离才算「拖动」而非「轻点」（此前是 4px，手指轻微抖动就被误判成拖动，
 *  于是「轻点已选中的牌去合体」永远走不到合体分支，反而把选中取消了） */
export const MOVE_SLOP_PX = 12;
