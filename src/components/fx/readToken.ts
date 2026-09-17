/**
 * CSS 变量读取器（T09 · 特效层取色的唯一入口）。
 *
 * 【为什么需要它】`scripts/架构守卫.mjs` 的 §3「hex 越界」铁律规定：全项目只有
 * `src/styles/tokens.css` 能写颜色字面量。Canvas 2D 无法直接消费 CSS 变量，必须先用
 * `getComputedStyle` 把变量读成字符串再喂给 `ctx.fillStyle`。本模块把这个读取动作收敛到
 * 一处，并做**模块级缓存** —— 特效每帧都会取色，逐帧 `getComputedStyle` 会触发样式重算。
 *
 * 【命名规则】传 `'--color-x'` 原样读取；传 `'minghuang'` 自动补成 `'--color-minghuang'`。
 * 读取失败（变量未定义 / 空串）回落 `'transparent'` —— 画布上「什么都不画」，
 * 不会抛错、不会退回硬编码色（那样又会破坏 hex 铁律）。
 */

const cache = new Map<string, string>();

/** 读取一个 CSS 颜色变量（带缓存）；`name` 可写全名 `--color-*` 或短名 `*`。 */
export function readToken(name: string): string {
  const key = name.startsWith('--') ? name : `--color-${name}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  cache.set(key, v);
  return v || 'transparent';
}
