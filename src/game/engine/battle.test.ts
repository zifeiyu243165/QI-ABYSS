import { describe, expect, it } from 'vitest';
import type { BattleState, Card, Combatant, DamageContext } from '../types';
import { assertNoIllegalAddBase, getCritRate, resolveDamage } from './damage';
import { battleReducer, cardCost, createBattleState, judgeParry } from './battle';
import { PARRY_TELEGRAPH_MS, PARRY_WINDOW_MS, SCRAPE_RATIO } from '../constants';
import { CARD_MAP } from '../data/cards';

function base(
  over: Partial<{ lunarMonthId: string; solarTermId: string; characterId: string; seed: number }> = {},
): BattleState {
  return createBattleState({
    characterId: over.characterId ?? 'luqingya',
    equipment: ['tangdao', 'lihuojing'],
    campaignId: 'camp_1',
    lunarMonthId: over.lunarMonthId ?? 'shen',
    solarTermId: over.solarTermId ?? 'jingzhe',
    seed: over.seed ?? 12345,
  });
}

function ctxFor(s: BattleState, card: Card | null, defender: Combatant): DamageContext {
  return {
    attacker: s.player,
    defender,
    card,
    cardsPlayedThisTurn: s.cardsPlayedThisTurn,
    comboThisTurn: 0,
    counterHitsThisTurn: 0,
    state: s,
  };
}

/* ================================================================== */

describe('性命双修：数值是地基，机制是高楼', () => {
  it('攻击力低于敌方防御阈值时，伤害被压到刮痧下限', () => {
    const s = base();
    const tank = { ...s.enemies[0]!, def: 400 }; // 远超玩家有效攻击力
    const card = CARD_MAP['card_zhanfeng']!;
    const bd = resolveDamage(ctxFor(s, card, tank), tank);

    expect(bd.scraped).toBe(true);
    const raw = bd.base * bd.totalMul * bd.critMul;
    expect(bd.final).toBeLessThanOrEqual(Math.max(1, Math.floor(raw * SCRAPE_RATIO)));
  });

  it('攻击力充足时不触发刮痧', () => {
    const s = base();
    const weak = { ...s.enemies[0]!, def: 0 };
    const card = CARD_MAP['card_zhanfeng']!;
    const bd = resolveDamage(ctxFor(s, card, weak), weak);
    expect(bd.scraped).toBe(false);
  });

  it('只有装备可以 addBase，其余来源运行时抛错', () => {
    // 合法：装备
    expect(() =>
      assertNoIllegalAddBase([{ op: 'addBase', value: 12, sourceId: 'equip.tangdao', label: '唐刀' }]),
    ).not.toThrow();

    // 非法：架势 / 命格 / 节气 / 月令
    for (const src of ['stance.tixiu', 'shishen.qisha', 'term.jingzhe', 'month.shen']) {
      expect(() =>
        assertNoIllegalAddBase([{ op: 'addBase', value: 5, sourceId: src, label: 'x' }]),
      ).toThrow(/性命双修/);
    }
  });
});

/* ================================================================== */

describe('失令分支（MVP 无木行角色，但逻辑必须正确）', () => {
  it('本命五行被月令所克时，暴击率下降', () => {
    // 申月金旺，金克木 → 木行角色失令
    const shiling = base({ lunarMonthId: 'shen' });
    shiling.player.wuxing = 'mu';

    // 得令对照：金行角色在申月
    const deling = base({ lunarMonthId: 'shen' });
    deling.player.wuxing = 'jin';

    const r1 = getCritRate(shiling, shiling.enemies[0]!);
    const r2 = getCritRate(deling, deling.enemies[0]!);

    expect(r1).toBeLessThan(r2);
    expect(r2 - r1).toBeCloseTo(0.1, 5);
  });
});

/* ================================================================== */

describe('双脉炁守恒', () => {
  it('连续出牌后阴阳炁不会出现负数或溢出', () => {
    let s = base();
    const ids = s.hand.map((c) => c.id);
    for (const id of ids) {
      s = battleReducer(s, { type: 'PLAY_CARD', cardId: id });
      expect(s.yang).toBeGreaterThanOrEqual(0);
      expect(s.yin).toBeGreaterThanOrEqual(0);
      expect(s.yang).toBeLessThanOrEqual(s.yangCap);
      expect(s.yin).toBeLessThanOrEqual(s.yinCap);
      expect(s.player.hp).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ================================================================== */

describe('节气：数据驱动，不改引擎', () => {
  it('惊蛰下首张攻击牌消耗翻倍，冬至下不翻倍', () => {
    const card = CARD_MAP['card_zhanfeng']!;
    const jingzhe = base({ solarTermId: 'jingzhe' });
    const dongzhi = base({ solarTermId: 'dongzhi' });

    expect(cardCost(jingzhe, card).yang).toBe(card.costYang * 2);
    expect(cardCost(dongzhi, card).yang).toBe(card.costYang);
  });

  it('相同种子产生完全相同的战局（引擎无隐藏随机源）', () => {
    const a = base({ seed: 777 });
    const b = base({ seed: 777 });
    expect(a.hand.map((c) => c.id)).toEqual(b.hand.map((c) => c.id));
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });
});

/* ================================================================== */

describe('弹反判定窗口', () => {
  it('前摇内按下判定为 early，窗口内为 perfect，超时为 miss', () => {
    expect(judgeParry(PARRY_TELEGRAPH_MS - 1)).toBe('early');
    expect(judgeParry(PARRY_TELEGRAPH_MS + 1)).toBe('perfect');
    expect(judgeParry(PARRY_TELEGRAPH_MS + PARRY_WINDOW_MS + 1)).toBe('miss');
  });
});
