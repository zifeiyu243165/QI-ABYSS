/**
 * 显式键映射表：把「数据枚举值」映射到「文案键」。
 *
 * 【禁止动态拼接】绝不可以写 `t(('label.wuxing.' + wx) as MessageKey)` 之类 ——
 * 动态键会逃过「孤儿键扫描」（见 i18n.test.ts）与类型检查。必须是这里这样的显式表。
 *
 * 【为什么用 `as const satisfies Record<…, MessageKey>`，而不是 `: Record<…, MessageKey>` 注解】
 *   - `satisfies Record<…, MessageKey>` 仍保留「漏一个成员 / 值不是合法键 → tsc 报错」的 L2 契约；
 *   - `as const` 保住**字面量类型**，于是 `WUXING_KEY[wx]` 的类型是「5 个字面量键的并集」，
 *     `t()` 的 `ParamsOf` 判定为 `undefined` → 可以无参调用。
 *     若写成 `: Record<WuXing, MessageKey>`，索引结果会退化为宽 `MessageKey`，
 *     而 `ParamsOf<MessageKey>` 会把并集里出现过的 `{count}` 也算进来 → `t()` 反而要求传参，
 *     与本项目的调用点 `t(WUXING_KEY[wx])` 直接冲突。
 */
import type { CardKind, StatusId, WuXing } from '../game/types';
import type { MessageKey } from './types';

/** 五行 → 中文名键（单一真源，取代原三份副本） */
export const WUXING_KEY = {
  jin: 'label.wuxing.jin',
  mu: 'label.wuxing.mu',
  shui: 'label.wuxing.shui',
  huo: 'label.wuxing.huo',
  tu: 'label.wuxing.tu',
} as const satisfies Record<WuXing, MessageKey>;

/** 卡牌类别 → 中文名键 */
export const KIND_KEY = {
  physical: 'label.kind.physical',
  spell: 'label.kind.spell',
  support: 'label.kind.support',
} as const satisfies Record<CardKind, MessageKey>;

/** 状态 → 中文名键（与 data/statuses.ts 的 STATUS_BEHAVIOR[id].labelKey 必须一致） */
export const STATUS_LABEL_KEY = {
  burn: 'label.status.burn',
  frost: 'label.status.frost',
  freeze: 'label.status.freeze',
  weak: 'label.status.weak',
  armorBreak: 'label.status.armorBreak',
  paralyze: 'label.status.paralyze',
  silence: 'label.status.silence',
  flaw: 'label.status.flaw',
} as const satisfies Record<StatusId, MessageKey>;

/** 状态 → 释义长文键（取代原 ui/Tip.tsx 的 STATUS_TIP） */
export const STATUS_TIP_KEY = {
  burn: 'tip.status.burn',
  frost: 'tip.status.frost',
  freeze: 'tip.status.freeze',
  weak: 'tip.status.weak',
  armorBreak: 'tip.status.armorBreak',
  paralyze: 'tip.status.paralyze',
  silence: 'tip.status.silence',
  flaw: 'tip.status.flaw',
} as const satisfies Record<StatusId, MessageKey>;
