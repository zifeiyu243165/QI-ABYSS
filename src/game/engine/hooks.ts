/**
 * 节气钩子调度中心
 *
 * 【铁律】本文件是全引擎唯一允许读取 state.solarTermId 的地方。
 * 引擎其余部分一律通过 fireHook* 系列函数间接访问节气效果，
 * 因此新增第 9 个节气只需在 data/world.ts 加一条数据，引擎零改动。
 *
 * 自检：grep -r "solarTermId" src/game/engine/ 应只命中本文件。
 */

import type { BattleState, Card, DamageContext, DamageModifier, Effect, SolarTerm } from '../types';
import { SOLAR_TERM_MAP } from '../data/world';

export function getTerm(state: BattleState): SolarTerm | null {
  return SOLAR_TERM_MAP[state.solarTermId] ?? null;
}

/** 节气提供的伤害修饰器（只允许 mul —— 节气不得触碰基础值，性命双修） */
export function fireModifyDamage(ctx: DamageContext): DamageModifier[] {
  const term = getTerm(ctx.state);
  if (!term?.hooks.modifyDamage) return [];
  const mods = term.hooks.modifyDamage(ctx);
  for (const m of mods) {
    if (m.op !== 'mul') {
      throw new Error(`[hook] 节气 ${term.id} 产出了非 mul 修饰器（${m.op}）—— 违反性命双修`);
    }
  }
  return mods;
}

/** 节气修改卡牌消耗 */
export function fireModifyCardCost(
  ctx: DamageContext,
  card: Card,
  cost: { yang: number; yin: number },
): { yang: number; yin: number } {
  const term = getTerm(ctx.state);
  if (!term?.hooks.modifyCardCost) return cost;
  return term.hooks.modifyCardCost(ctx, card, cost);
}

/** 节气修改治疗 / 护盾数值 */
export function fireModifyHeal(state: BattleState, amount: number): number {
  const term = getTerm(state);
  if (!term?.hooks.modifyHeal) return amount;
  return term.hooks.modifyHeal(amount);
}

/** 节气强制暴击倍率 */
export function fireForceCritMul(state: BattleState): number | null {
  const term = getTerm(state);
  return term?.hooks.forceCritMul ?? null;
}

/** 开局 */
export function fireBattleStart(ctx: DamageContext): Effect[] {
  return getTerm(ctx.state)?.hooks.onBattleStart?.(ctx) ?? [];
}

/** 回合开始 */
export function fireTurnStart(ctx: DamageContext): Effect[] {
  return getTerm(ctx.state)?.hooks.onTurnStart?.(ctx) ?? [];
}

/** 回合结束 */
export function fireTurnEnd(ctx: DamageContext): Effect[] {
  return getTerm(ctx.state)?.hooks.onTurnEnd?.(ctx) ?? [];
}

/** 出牌后 */
export function fireCardPlayed(ctx: DamageContext, card: Card): Effect[] {
  return getTerm(ctx.state)?.hooks.onCardPlayed?.(ctx, card) ?? [];
}

/** 造成伤害后 */
export function fireDamageDealt(ctx: DamageContext, dealt: number): Effect[] {
  return getTerm(ctx.state)?.hooks.onDamageDealt?.(ctx, dealt) ?? [];
}

/** 调息效率倍率 */
export function getRegulateMul(state: BattleState): number {
  return getTerm(state)?.hooks.regulateMul ?? 1;
}

/** 是否强制弹反（大雪） */
export function isForceParry(state: BattleState): boolean {
  return getTerm(state)?.hooks.forceParry ?? false;
}
