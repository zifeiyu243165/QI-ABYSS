/**
 * 伤害结算管线 —— 七阶段
 *
 * 设计要点：
 * 1. addBase 只允许装备（兵刃）使用，其余来源运行时抛错 → "性命双修"的类型级保障
 * 2. 加法只发生在两处：effectiveAtk = 角色atk + 兵刃；base = ceil(effectiveAtk × 卡倍率) + addFlat
 * 3. 五层变量（月令/节气/十神/架势/装备）一律走 mul
 *    → 因全乘法，五层计算顺序与结果无关，消除了一整类顺序依赖 bug
 */

import type {
  BattleState,
  Combatant,
  DamageBreakdown,
  DamageContext,
  DamageModifier,
  WuXing,
} from '../types';
import {
  BASE_CRIT_MUL,
  BASE_CRIT_RATE,
  COUNTERED_MUL,
  COUNTER_MUL,
  DEFENSE_SOFTENING,
  DELING_MUL,
  FAXIU_SHENG_MUL,
  JIANZOU_MUL,
  KAITIAN_MUL,
  PARRY_COUNTER_MUL,
  QI_CAP_BASE,
  QISHA_LOW_HP_MUL,
  QISHA_LOW_HP_RATIO,
  SANXIU_CRIT_PER_DIFF,
  SANXIU_CRITDMG_PER_DIFF,
  SANXIU_DIFF_CAP,
  SANXIU_JIANZOU_THRESHOLD,
  SCRAPE_DEF_FACTOR,
  SCRAPE_RATIO,
  SHANGGUAN_CRIT_MUL,
  SHANGGUAN_CRIT_PENALTY,
  SHI_MUL_PER_STACK,
  SHILING_CRIT_PENALTY,
  WUSHENG_ATK_PER_STACK,
  ZHOUTIAN_MUL,
} from '../constants';
import { EQUIPMENT_MAP } from '../data/cards';
import { CHARACTER_MAP } from '../data/actors';
import { LUNAR_MONTH_MAP } from '../data/world';
import { WU_XING_KE, WU_XING_SHENG } from '../constants';
import { fireForceCritMul, fireModifyDamage } from './hooks';

/* ============================== 基础数值 ============================== */

export interface AtkBreakdown {
  baseAtk: number;
  weaponBonus: number;
  effectiveAtk: number;
}

export function getEffectiveAtk(state: BattleState): AtkBreakdown {
  const char = CHARACTER_MAP[state.characterId];
  const baseAtk = char?.atk ?? 0;

  let weaponBonus = 0;
  for (const id of state.equipment) {
    if (!id) continue;
    const eq = EQUIPMENT_MAP[id];
    if (eq?.kind === 'blade') weaponBonus += eq.atkBonus;
  }

  return { baseAtk, weaponBonus, effectiveAtk: baseAtk + weaponBonus };
}

export function getQiCap(state: BattleState): { yang: number; yin: number } {
  let cap = QI_CAP_BASE;
  for (const id of state.equipment) {
    if (!id) continue;
    const eq = EQUIPMENT_MAP[id];
    if (eq?.kind === 'artifact') cap += eq.qiCapBonus;
  }
  return { yang: cap, yin: cap };
}

/** 连击段数 */
export function getHits(state: BattleState, card: { hits: number } | null): number {
  let hits = card?.hits ?? 1;
  for (const id of state.equipment) {
    if (!id) continue;
    const eq = EQUIPMENT_MAP[id];
    if (eq) hits += eq.hitsBonus;
  }
  // 食神：连击段数 +2
  hits += state.bonusHits;
  return Math.max(1, hits);
}

/** 阴阳炁差值（散修核心） */
export function getYinYangDiff(state: BattleState): number {
  return Math.min(SANXIU_DIFF_CAP, Math.abs(state.yang - state.yin));
}

/* ============================== 修饰器收集 ============================== */

export function assertNoIllegalAddBase(mods: DamageModifier[]): void {
  for (const m of mods) {
    if (m.op === 'addBase' && !m.sourceId.startsWith('equip.')) {
      throw new Error(
        `[性命双修] 来源 ${m.sourceId} 使用了 addBase —— 只有装备可修改基础值，其余必须是倍率`,
      );
    }
  }
}

/** 装备层：唯一合法的 addBase 来源 */
function equipmentModifiers(state: BattleState): DamageModifier[] {
  const mods: DamageModifier[] = [];
  for (const id of state.equipment) {
    if (!id) continue;
    const eq = EQUIPMENT_MAP[id];
    if (!eq) continue;
    if (eq.kind === 'blade' && eq.atkBonus > 0) {
      mods.push({ op: 'addBase', value: eq.atkBonus, sourceId: `equip.${eq.id}`, label: eq.name });
    }
  }
  return mods;
}

/** 月令层：得令 / 失令 / 五行旺衰 */
function monthModifiers(ctx: DamageContext): DamageModifier[] {
  const { state, card } = ctx;
  const char = CHARACTER_MAP[state.characterId];
  const month = LUNAR_MONTH_MAP[state.lunarMonthId];
  // 本命五行以战斗状态为准（支持未来接入新角色 / 动态月令）
  const wuxing = state.player.wuxing ?? char?.wuxing;
  if (!wuxing || !month) return [];

  const mods: DamageModifier[] = [];

  // 得令：本命五行 == 月令 → 全技能倍率 +10%
  if (wuxing === month.wuxing) {
    mods.push({ op: 'mul', value: DELING_MUL, sourceId: `month.${month.id}`, label: '得令' });
  }

  // 五行旺衰
  if (card?.wuxing) {
    const bonus = month.wxBonus[card.wuxing];
    if (bonus) {
      mods.push({
        op: 'mul',
        value: 1 + bonus,
        sourceId: `month.${month.id}.wx`,
        label: month.wuxing === card.wuxing ? '当令' : '失时',
      });
    }
  }
  // 物理攻击在金旺月 +25%
  if (card?.kind === 'physical') {
    const bonus = month.wxBonus['jin'];
    if (bonus) {
      mods.push({ op: 'mul', value: 1 + bonus, sourceId: `month.${month.id}.jin`, label: '金旺·兵刃' });
    }
  }

  return mods;
}

/** 架势层 */
function stanceModifiers(state: BattleState, card: { kind: string; wuxing?: WuXing } | null): DamageModifier[] {
  const mods: DamageModifier[] = [];

  if (state.stance === 'tixiu' && state.shi > 0) {
    mods.push({
      op: 'mul',
      value: 1 + state.shi * SHI_MUL_PER_STACK,
      sourceId: 'stance.tixiu',
      label: `势 · ${state.shi} 层`,
    });
  }

  if (state.stance === 'faxiu' && card?.wuxing && state.lastSpellWuxing) {
    // 相生：木→火→土→金→水
    if (WU_XING_SHENG[state.lastSpellWuxing] === card.wuxing) {
      mods.push({ op: 'mul', value: FAXIU_SHENG_MUL, sourceId: 'stance.faxiu', label: '五行相生' });
    }
  }

  if (state.stance === 'sanxiu') {
    const diff = getYinYangDiff(state);
    if (diff >= SANXIU_JIANZOU_THRESHOLD) {
      mods.push({ op: 'mul', value: JIANZOU_MUL, sourceId: 'stance.sanxiu', label: '剑走偏锋' });
    }
  }

  // 纯阳武圣：双兵刃无限叠加的势
  if (state.wushengStacks > 0) {
    mods.push({
      op: 'mul',
      value: 1 + state.wushengStacks * WUSHENG_ATK_PER_STACK,
      sourceId: 'stance.wusheng',
      label: `纯阳 · ${state.wushengStacks} 层`,
    });
  }

  return mods;
}

/** 十神层 */
function shishenModifiers(state: BattleState): DamageModifier[] {
  const char = CHARACTER_MAP[state.characterId];
  if (!char) return [];
  const mods: DamageModifier[] = [];

  // 七杀隐藏被动：血量 < 10% 时伤害 +30%
  if (char.shishen.includes('qisha') && state.player.hp < state.player.maxHp * QISHA_LOW_HP_RATIO) {
    mods.push({ op: 'mul', value: QISHA_LOW_HP_MUL, sourceId: 'shishen.qisha', label: '七杀·杀身成仁' });
  }

  return mods;
}

/** 五行相克 */
function counterModifier(card: { wuxing?: WuXing } | null, target: Combatant): DamageModifier[] {
  if (!card?.wuxing || !target.wuxing) return [];
  if (WU_XING_KE[card.wuxing] === target.wuxing) {
    return [{ op: 'mul', value: COUNTER_MUL, sourceId: 'wuxing.ke', label: '五行相克' }];
  }
  if (WU_XING_KE[target.wuxing] === card.wuxing) {
    return [{ op: 'mul', value: COUNTERED_MUL, sourceId: 'wuxing.beike', label: '五行被克' }];
  }
  return [];
}

export function collectModifiers(ctx: DamageContext, target: Combatant): DamageModifier[] {
  const { state, card } = ctx;

  const mods: DamageModifier[] = [
    ...equipmentModifiers(state),
    ...monthModifiers(ctx),
    ...stanceModifiers(state, card),
    ...shishenModifiers(state),
    ...counterModifier(card, target),
    ...fireModifyDamage(ctx), // 节气层
  ];

  // 炁贯周天
  if (state.zhoutianActive) {
    mods.push({ op: 'mul', value: ZHOUTIAN_MUL, sourceId: 'qi.zhoutian', label: '炁贯周天' });
  }

  assertNoIllegalAddBase(mods);
  return mods;
}

/* ============================== 暴击 ============================== */

export function getCritRate(state: BattleState, target: Combatant): number {
  const char = CHARACTER_MAP[state.characterId];
  const month = LUNAR_MONTH_MAP[state.lunarMonthId];
  let rate = BASE_CRIT_RATE;

  if (char?.shishen.includes('shangguan')) rate += SHANGGUAN_CRIT_PENALTY;

  // 散修：阴阳差值越大暴击率越高
  if (state.stance === 'sanxiu') rate += getYinYangDiff(state) * SANXIU_CRIT_PER_DIFF;

  // 失令：本命五行被月令所克 → 暴击率 -10%
  const wuxing = state.player.wuxing ?? char?.wuxing;
  if (wuxing && month && WU_XING_KE[month.wuxing] === wuxing) rate += SHILING_CRIT_PENALTY;

  // 霜寒状态降低目标闪避无关，这里仅作占位（不可删除：future debuff）
  void target;

  return Math.max(0, Math.min(1, rate));
}

export function getCritMul(state: BattleState): number {
  const char = CHARACTER_MAP[state.characterId];
  let mul = BASE_CRIT_MUL;

  if (char?.shishen.includes('shangguan')) mul = SHANGGUAN_CRIT_MUL;

  if (state.stance === 'sanxiu') mul += getYinYangDiff(state) * SANXIU_CRITDMG_PER_DIFF;

  // 节气强制暴击倍率（霜降固定 150%）
  const forced = fireForceCritMul(state);
  if (forced !== null) mul = forced;

  return mul;
}

/* ============================== 七阶段结算 ============================== */

export interface ResolveOptions {
  /** 真实伤害（破绽暴击 / 破军 / 开天） */
  isTrue?: boolean;
  /** 必定暴击 */
  forceCrit?: boolean;
  /** 额外倍率（奥义卡 1.5 / 开天 50） */
  extraMul?: number;
  /** 额外倍率标签 */
  extraLabel?: string;
}

export function resolveDamage(
  ctx: DamageContext,
  target: Combatant,
  opts: ResolveOptions = {},
): DamageBreakdown {
  const { state, card } = ctx;

  // ---- 阶段 1：基数 ----
  const atk = getEffectiveAtk(state);
  const addBaseMods = equipmentModifiers(state).filter((m) => m.op === 'addBase');
  const weaponBonus = addBaseMods.reduce((s, m) => s + m.value, 0);
  const effectiveAtk = atk.baseAtk + weaponBonus;

  // ---- 阶段 2：卡牌倍率 ----
  const cardMul = card ? card.mul : PARRY_COUNTER_MUL;

  // ---- 阶段 3：收集修饰器 ----
  const allMods = collectModifiers(ctx, target);
  const flatAdd = allMods.filter((m) => m.op === 'addFlat');
  const muls = allMods.filter((m) => m.op === 'mul');

  if (opts.extraMul) {
    muls.push({ op: 'mul', value: opts.extraMul, sourceId: 'card.extra', label: opts.extraLabel ?? '强化' });
  }

  // ---- 阶段 4：连乘 ----
  const base = Math.ceil(effectiveAtk * cardMul) + flatAdd.reduce((s, m) => s + m.value, 0);
  let totalMul = 1;
  for (const m of muls) totalMul *= m.value;

  // ---- 阶段 5：暴击 ----
  const crit = opts.forceCrit === true;
  const critMul = crit ? getCritMul(state) : 1;

  // ---- 阶段 6：减伤 + 刮痧下限 ----
  const raw = base * totalMul * critMul;
  const defense = Math.max(0, target.def);
  let afterDefense = opts.isTrue
    ? raw
    : raw * (1 - defense / (defense + DEFENSE_SOFTENING));

  // 性命双修：攻击力低于防御阈值 → 一切机制都是刮痧
  const scraped = !opts.isTrue && effectiveAtk < defense * SCRAPE_DEF_FACTOR;
  if (scraped) {
    afterDefense = Math.min(afterDefense, raw * SCRAPE_RATIO);
  }

  // ---- 阶段 7：护盾不在伤害计算内，由 applyDamage 处理 ----
  const final = Math.max(1, Math.floor(afterDefense));

  return {
    baseAtk: atk.baseAtk,
    weaponBonus,
    effectiveAtk,
    cardMul,
    base,
    multipliers: muls,
    totalMul,
    crit,
    critMul,
    isTrue: opts.isTrue === true,
    defense,
    afterDefense,
    scraped,
    final,
  };
}

/** 破军 / 开天等固定倍率真实伤害 */
export function resolveTrueDamage(state: BattleState, mul: number): number {
  const atk = getEffectiveAtk(state);
  return Math.floor(atk.effectiveAtk * mul);
}

/** 开天：基础攻击 × 50 倍纯粹白字伤害 */
export function resolveKaitian(state: BattleState): number {
  return resolveTrueDamage(state, KAITIAN_MUL);
}
