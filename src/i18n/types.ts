/**
 * i18n 类型层：**由 zh-CN 文案表反推**「键」与「参数」的类型。
 *
 * 目的：让 4 类文案错误在 `tsc -b` 阶段被拦住（而不是留到运行时才炸 / 才显示成空）：
 *   1. 键不存在                → `t('no.such.key')`     编译错误
 *   2. 带参键却没传参数        → `t('ui.relic.hint.quota')` 编译错误
 *   3. 参数名写错              → `t('…quota', { nope: 1 })` 编译错误
 *   4. 参数类型错（如传对象）  → `t('…quota', { count: {} })` 编译错误
 *
 * 全部从 `typeof zhCN` 推导，因此**改文案表即自动收紧类型**，无需手工维护键清单。
 */
import type { zhCN } from './locales/zh-CN';

/**
 * 把父键与子键用 `.` 连起来。
 * 【与设计伪码的差异（已修正）】设计原式 `P extends string ? \`${K}.${P}\`` 在叶子处会得到
 * `'jin.'` 这种**带尾点**的键（因为叶子标记是空串 `''`，而 `'' extends string` 为真 → 拼出 `K.`），
 * 最终 `MessageKey` 会变成 `'label.wuxing.jin.'`，`lookup` 按 `.` 切分会多出一段空串而取值失败。
 * 这里加一条 `P extends '' → K` 的空段保护，使叶子键为 `'jin'`、完整键为 `'label.wuxing.jin'`。
 */
type Join<K, P> = K extends string
  ? P extends string
    ? P extends ''
      ? K
      : `${K}.${P}`
    : never
  : never;

/** 取对象类型的全部「叶子路径」；叶子（非对象）贡献空串，由 Join 处理拼接 */
export type Leaves<T> = T extends object
  ? { [K in keyof T & string]-?: Join<K, Leaves<T[K]>> }[keyof T & string]
  : '';

/** 全项目文案键 —— 由 zh-CN 反推，是 `t()` 唯一允许的入参类型 */
export type MessageKey = Leaves<typeof zhCN>;

/** 按 `'a.b.c'` 路径取出值的字面量类型（供 `ParamsOf` 提取占位） */
export type ValueAt<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? ValueAt<T[H], R>
    : never
  : K extends keyof T
    ? T[K]
    : never;

/** 抽出字符串里全部 `{name}` 的占位名 */
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | Placeholders<Rest>
  : never;

/**
 * 某键的参数类型：
 * - 无占位 → `undefined`（`t()` 设计成「不接受第二参」）
 * - 有占位 → `{ 占位名: string | number }`
 */
export type ParamsOf<K extends MessageKey> = Placeholders<ValueAt<typeof zhCN, K> & string> extends never
  ? undefined
  : { [P in Placeholders<ValueAt<typeof zhCN, K> & string>]: string | number };

/**
 * 战报键 = `log.*` 子集 —— 第三批（S4）引擎日志结构化后，引擎**只能**写这些键。
 * 本批尚未建立 log.* 文案，故此处为 `never`（空集是子集，类型成立）。
 */
export type LogKey = Extract<MessageKey, `log.${string}`>;
