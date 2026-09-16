/**
 * 文案运行时 `t()`。
 *
 * 双形态签名（`...args` 用条件类型收窄）让下列错误在 `tsc -b` 阶段直接失败：
 *   - 键不存在 / 拼错
 *   - 带参键没传参数
 *   - 参数名写错
 *   - 参数类型错
 * 详见 `types.ts` 的类型推导与 `i18n.test.ts` 的逐条断言。
 */
import { zhCN } from './locales/zh-CN';
import { interpolate } from './interpolate';
import type { MessageKey, ParamsOf } from './types';

/** 按 `'a.b.c'` 路径取值。键由 MessageKey 保证存在，故不做缺键兜底。 */
function lookup(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const seg of path.split('.')) cur = (cur as Record<string, unknown>)[seg];
  return cur as string;
}

/**
 * @param key 文案键（只能取 zh-CN 里的叶子键）
 * @param args 无参键：不传；带参键：必须传一个参数对象
 */
export function t<K extends MessageKey>(
  key: K,
  ...args: ParamsOf<K> extends undefined ? [] : [ParamsOf<K>]
): string {
  const raw = lookup(zhCN, key);
  const params = args[0];
  return params ? interpolate(raw, params) : raw;
}
