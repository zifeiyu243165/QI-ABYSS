/**
 * 弹反时序（T08 · 拆分⑥）。
 *
 * 【来源】自 `BattleScreen.tsx` 的「敌方前摇：CSS 动画驱动」区块**逐字抽取**：
 * `telegraphStartRef` / `actDispatched` / `inWindow` 三个读写点、前摇 `useEffect`、`handleParry`。
 *
 * 【时序铁律 · 一个字都不许动】完美弹反窗口的读写顺序：
 *   ① `phase !== 'enemyTelegraph'`：先 `actDispatched.current = false`，再 `setInWindow(false)`，直接返回；
 *   ② 进入前摇：先记 `telegraphStartRef.current = performance.now()`，再 `setInWindow(false)`；
 *   ③ 定时器：`PARRY_TELEGRAPH_MS` 后开窗（`setInWindow(true)`）；
 *   ④ `PARRY_TOTAL_MS` 后**先查** `actDispatched.current` → **置位** → 再 `dispatch({ type:'ENEMY_ACT' })`。
 *   ⑤ `handleParry`：`state.parried || phase !== 'enemyTelegraph'` 早退；
 *      否则 `dispatch({ type:'PARRY', elapsedMs: performance.now() - telegraphStartRef.current })`。
 *
 * 【契约】`elapsedMs` 由 UI 侧读取 `performance.now()` 后传给引擎 —— 引擎层禁用 `Date.now`
 * （守卫 §1），因此「谁读时钟」这件事必须留在 UI 层，本 Hook 不得改由引擎代算。
 *
 * 【依赖数组】前摇 effect 为 `[phase, turn, dispatch]`（`turn` 进数组是为了让同一前摇阶段在
 * 跨回合时也能重建定时器）；`handleParry` 为 `[parried, phase, dispatch]` —— 两者与原内联版本一致。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleAction } from '../../game/engine/battle';
import type { BattleState } from '../../game/types';
import { PARRY_TELEGRAPH_MS, PARRY_TOTAL_MS } from '../../game/constants';

/** `useParryTiming` 的返回值 */
export interface ParryTiming {
  /** 游标是否已进入金色（完美弹反）窗口 */
  inWindow: boolean;
  /** 按下格挡按钮 */
  handleParry: () => void;
}

/**
 * 弹反前摇计时：开窗 + 到点自动让敌方出手 + 玩家按下时的判定派发。
 *
 * @param phase    当前战斗阶段（仅 `enemyTelegraph` 期间计时）
 * @param turn     当前回合数（参与 effect 依赖，跨回合重建定时器）
 * @param parried  本回合是否已经弹反过（已弹反则按钮不再响应）
 * @param dispatch 战斗 action 派发器
 * @returns 开窗状态与按下回调
 */
export function useParryTiming(
  phase: BattleState['phase'],
  turn: number,
  parried: boolean,
  dispatch: (a: BattleAction) => void,
): ParryTiming {
  /* ---------- 敌方前摇：CSS 动画驱动 ---------- */
  const telegraphStartRef = useRef(0);
  const actDispatched = useRef(false);
  const [inWindow, setInWindow] = useState(false);

  useEffect(() => {
    if (phase !== 'enemyTelegraph') {
      actDispatched.current = false;
      /**
       * 【为什么这里豁免 lint】离开前摇必须**立即关窗**（幂等写入，值不同才重渲染）。
       * 该 pattern 是从 `BattleScreen.tsx` **逐字搬迁**的：拆分前主壳有 758 行，
       * oxlint 的 React Compiler lint 因复杂度过高直接跳过分析，所以从未报过此提示；
       * 拆成小文件后它第一次被解析到 —— 属**暴露**既有写法，而非本次新引入。
       * 因本 Hook 被「完美弹反窗口读写时序零变化 · 一个字都不许动」铁律锁定，
       * 此处**不重构**（改成渲染期派生同样正确，但会改动受保护的时序代码），只做定向豁免。
       */
      // eslint-disable-next-line react/set-state-in-effect
      setInWindow(false);
      return;
    }
    telegraphStartRef.current = performance.now();
    setInWindow(false);
    const t1 = window.setTimeout(() => setInWindow(true), PARRY_TELEGRAPH_MS);
    const t2 = window.setTimeout(() => {
      if (!actDispatched.current) {
        actDispatched.current = true;
        dispatch({ type: 'ENEMY_ACT' });
      }
    }, PARRY_TOTAL_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [phase, turn, dispatch]);

  const handleParry = useCallback(() => {
    if (parried || phase !== 'enemyTelegraph') return;
    dispatch({ type: 'PARRY', elapsedMs: performance.now() - telegraphStartRef.current });
  }, [parried, phase, dispatch]);

  return { inWindow, handleParry };
}
