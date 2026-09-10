/**
 * 确定性随机数发生器（mulberry32）
 * 引擎内禁止使用 Math.random / Date.now —— 否则单测无法断言。
 */

export function nextRandom(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** 从状态推进并返回 [0,1) */
export function rand(state: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: r.value, state: r.next };
}

/** 随机整数 [0, max) */
export function randInt(state: number, max: number): { value: number; state: number } {
  const r = rand(state);
  return { value: Math.floor(r.value * max), state: r.state };
}

/** Fisher-Yates 洗牌，返回新数组与新状态 */
export function shuffle<T>(arr: readonly T[], state: number): { result: T[]; state: number } {
  const a = arr.slice();
  let s = state;
  for (let i = a.length - 1; i > 0; i--) {
    const r = randInt(s, i + 1);
    s = r.state;
    const j = r.value;
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return { result: a, state: s };
}

/** 概率判定：返回是否命中 */
export function chance(state: number, p: number): { hit: boolean; state: number } {
  const r = rand(state);
  return { hit: r.value < p, state: r.state };
}
