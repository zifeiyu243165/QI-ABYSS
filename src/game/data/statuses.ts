/**
 * 状态行为注册表 —— 本次最重要的 L1（类型级）守卫。
 *
 * 【为什么需要它】
 * 本项目历史上反复发作的缺陷类型是「数据声明了、引擎没实现」：
 * `StatusId` 里有 `frost`，文案写着「减速 + 破甲」，但引擎里没有任何一处读它 ——
 * 这种「无响应系统」靠人肉比对代码才能发现。
 *
 * 把这份 `Record<StatusId, StatusBehavior>` 作为编译期契约后：
 * 新增一个 StatusId 却不在此登记 → `tsc -b` 直接报错（缺 key）；
 * 想要蒙混过关就必须把「中文名 + 作用对象 + 一句话机制」写清楚。
 *
 * 【单一真源说明】
 * `STATUS_BEHAVIOR` 是「状态中文名 + 机制」的单一真源。
 * UI 层另有一份**人类可读长文案**：
 *   - `src/components/svg/Glyphs.tsx` 的 `STATUS_CN`（状态图标下的小字）
 *   - `src/components/ui/Tip.tsx` 的 `STATUS_TIP`（长按释义浮层）
 * 这两份属于**文案层**，结构差异较大（带换行、带展示长度约束），
 * 强行重构 UI 风险高且收益低，故本次保持不动，留待后续「文案层统一」任务处理。
 * 引擎侧的一切行为都以此表为准。
 */
import type { StatusId } from '../types';

/** 状态的最小行为契约。新增一个 StatusId 而不在此登记 → tsc -b 直接报错。 */
export interface StatusBehavior {
  /** 中文名 */
  label: string;
  /** 该状态作用在谁身上 */
  affects: 'attacker' | 'defender' | 'both';
  /** 一句话机制说明（必须与数据层文案一致） */
  effect: string;
}

export const STATUS_BEHAVIOR: Record<StatusId, StatusBehavior> = {
  burn: {
    label: '灼烧',
    affects: 'both',
    effect: '每回合开始损失「层数 ×4」点气血，持续到回合数耗尽（DOT 保底 1 血，不直接击杀）。',
  },
  frost: {
    label: '霜寒',
    affects: 'defender',
    effect: '破甲：每层降低目标防御 12%（上限 36%，与破甲独立叠乘）；减速：每层使目标招式多耗 1 点「势」（上限 +2）。',
  },
  freeze: {
    label: '冻结',
    affects: 'both',
    effect: '持有者下回合完全无法行动（敌方跳过出招、玩家无法行动）。',
  },
  weak: {
    label: '虚弱',
    affects: 'attacker',
    effect: '攻击方每层造成的伤害 −15%（上限 −45%），对玩家与敌人双向生效。',
  },
  armorBreak: {
    label: '破甲',
    affects: 'defender',
    effect: '每层削减目标 15% 防御（在 effectiveDefense 中与霜寒破甲独立叠乘）。',
  },
  paralyze: {
    label: '麻痹',
    affects: 'attacker',
    effect: '持有者发起攻击时每层 30% 概率落空（上限 75%）。',
  },
  silence: {
    label: '沉默',
    affects: 'attacker',
    effect: '无法使用术法牌，只能出物理牌与功能牌。',
  },
  flaw: {
    label: '破绽',
    affects: 'defender',
    effect: '下一次攻击必定暴击，且转化为无视防御的真实伤害。',
  },
};
