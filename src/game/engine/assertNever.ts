/**
 * 穷尽性检查工具。
 *
 * 用法：在 switch / if 链的兜底分支里调用 `assertNever(x)`。
 * 只要将来给某个联合类型新增了一个成员却没写处理分支，TypeScript 会在
 * 调用处直接报错（实参不可赋给 `never`）—— 这正是把「忘记实现」变成编译期失败的关键。
 */
export function assertNever(x: never, what = '分支'): never {
  throw new Error(`[穷尽性] 未处理的${what}：${JSON.stringify(x)}`);
}
