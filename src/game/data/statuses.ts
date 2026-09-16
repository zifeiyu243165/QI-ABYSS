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
 * 状态中文名的单一真源 = `src/i18n` 的 `label.status.<id>`，本表只登记它的键（`labelKey`）。
 * UI 层（`BattleScreen` 的状态浮层）改走 `tip.status.<id>` 文案键。
 * 原 `Glyphs.tsx` 的 `STATUS_CN` 与 `ui/Tip.tsx` 的 `STATUS_TIP` 两份副本已在本次迁移中删除。
 * 引擎侧的一切行为仍以本表为准。
 */
import type { MessageKey } from '../../i18n/types';
import type { StatusId } from '../types';

/**
 * 状态的最小行为契约。新增一个 StatusId 而不在此登记 → tsc -b 直接报错。
 *
 * 【本批变更】`label: string` → `labelKey: MessageKey`：
 * 中文名的单一真源已归一为 `src/i18n` 的 `label.status.<id>`（经 `STATUS_LABEL_KEY` 访问），
 * 这里只保存「键」。好处：新增 StatusId 却忘记登记键 → 仍是 tsc 报错；
 * 而键一旦写错 / 未建，`t(labelKey)` 的取值与孤儿键扫描也会一并兜住。
 */
export interface StatusBehavior {
  /** 中文名的文案键（真源在 src/i18n/locales/zh-CN.ts 的 label.status.<id>） */
  labelKey: MessageKey;
  /** 该状态作用在谁身上 */
  affects: 'attacker' | 'defender' | 'both';
  /** 一句话机制说明（必须与数据层文案一致） */
  effect: string;
}

export const STATUS_BEHAVIOR: Record<StatusId, StatusBehavior> = {
  burn: {
    labelKey: 'label.status.burn',
    affects: 'both',
    effect: '每回合开始损失「层数 ×4」点气血，持续到回合数耗尽（DOT 保底 1 血，不直接击杀）。',
  },
  frost: {
    labelKey: 'label.status.frost',
    affects: 'defender',
    effect: '破甲：每层降低目标防御 12%（上限 36%，与破甲独立叠乘）；减速：每层使目标招式多耗 1 点「势」（上限 +2）。',
  },
  freeze: {
    labelKey: 'label.status.freeze',
    affects: 'both',
    effect: '持有者下回合完全无法行动（敌方跳过出招、玩家无法行动）。',
  },
  weak: {
    labelKey: 'label.status.weak',
    affects: 'attacker',
    effect: '攻击方每层造成的伤害 −15%（上限 −45%），对玩家与敌人双向生效。',
  },
  armorBreak: {
    labelKey: 'label.status.armorBreak',
    affects: 'defender',
    effect: '每层削减目标 15% 防御（在 effectiveDefense 中与霜寒破甲独立叠乘）。',
  },
  paralyze: {
    labelKey: 'label.status.paralyze',
    affects: 'attacker',
    effect: '持有者发起攻击时每层 30% 概率落空（上限 75%）。',
  },
  silence: {
    labelKey: 'label.status.silence',
    affects: 'attacker',
    effect: '无法使用术法牌，只能出物理牌与功能牌。',
  },
  flaw: {
    labelKey: 'label.status.flaw',
    affects: 'defender',
    effect: '下一次攻击必定暴击，且转化为无视防御的真实伤害。',
  },
};
