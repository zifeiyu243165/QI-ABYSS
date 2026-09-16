/**
 * i18n 桶出口。
 *
 * 对外只暴露：运行时 `t()` / `interpolate()`、locale 定义、键与参数类型、显式键映射表、存档迁移。
 * 其余组件 / 数据层一律经本文件引用，不要深链内部模块（避免依赖锁定到文件结构）。
 */
export { t } from './t';
export { interpolate } from './interpolate';
export { LOCALES, DEFAULT_LOCALE } from './locale-store';
export type { Locale } from './locale-store';
export type { MessageKey, ParamsOf, LogKey } from './types';
export { KIND_KEY, STATUS_LABEL_KEY, STATUS_TIP_KEY, WUXING_KEY } from './keys';
export { migrateSave } from './save-migration';
