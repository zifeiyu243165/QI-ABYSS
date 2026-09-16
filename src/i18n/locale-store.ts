/**
 * locale 定义。
 *
 * 本批（S0）只落地「类型 + 默认值」——**不做** React Context、不做切换 UI、不做第二语言内容，
 * 仅满足 S5「locale 持久化 + 存档迁移」所需。后续批次若要加语言，只需往 `LOCALES` 里加成员。
 */
export const LOCALES = ['zh-CN'] as const;

/** 受支持的界面语言 */
export type Locale = (typeof LOCALES)[number];

/** 默认语言（也是本批唯一语言） */
export const DEFAULT_LOCALE: Locale = 'zh-CN';
