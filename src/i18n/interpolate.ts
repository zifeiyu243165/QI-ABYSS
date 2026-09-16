/**
 * 零依赖占位插值：只替换 `{name}`。
 *
 * 【兜底语义】缺参时**保留原样**（`{name}` 原封不动显示出来）而不是抛错或替换成 `undefined`：
 * 类型层（ParamsOf）已保证正常路径不缺参，这里只为「动态拼参数」这类旁路兜底 ——
 * 出问题时让占位符**可见**，既不崩也不静默丢信息。
 */
export function interpolate(tpl: string, params: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
  );
}
