import { describe, expect, it } from 'vitest';
import type { BattleState, Card, Combatant, DamageContext } from '../types';
import { assertNoIllegalAddBase, effectiveDefense, getCritRate, resolveDamage } from './damage';
import { battleReducer, canPlayCard, cardCost, createBattleState, fuseCards, judgeParry } from './battle';
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

/* ================================================================== */

/**
 * 以下为「审计缺陷」的回归固化。
 * 这些缺陷的共同点是：静态阅读代码时看起来完全正常，只有拿管线计算值与实战值对比才暴露。
 */
describe('回归：防御减伤只生效一次', () => {
  it('管线 final 必须等于实战扣血（不再二次减伤）', () => {
    const s = createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', null], // 卸掉法器，排除附魔伤害干扰
      campaignId: 'camp_3', // 春雷兽 380 血，不会被一击打死导致扣血被截断
      lunarMonthId: 'shen',
      solarTermId: 'dongzhi', // 无伤害修饰的节气
      seed: 999,
    });
    const enemy = s.enemies[0]!;
    const card = CARD_MAP['card_zhanfeng']!;

    // 让「预测」与「实战」从同一个 rngState 出发，暴击结果才会一致
    const rng0 = s.rngState;
    const bd = resolveDamage(ctxFor({ ...s, rngState: rng0 }, card, enemy), enemy);

    const hpBefore = enemy.hp;
    const played = battleReducer(
      { ...s, rngState: rng0, hand: [{ ...card, uid: 'reg1' }], yang: 10, yin: 10 },
      { type: 'PLAY_CARD', cardId: 'reg1', targetId: enemy.id },
    );
    const after = played.enemies.find((e) => e.id === enemy.id)!;

    expect(hpBefore - after.hp).toBe(bd.final);
  });
});

describe('回归：暴击率真正参与结算', () => {
  it('散修拉满阴阳差后能打出暴击（getCritRate 不再是死函数）', () => {
    let crits = 0;
    for (let i = 0; i < 60; i++) {
      const s = createBattleState({
        characterId: 'xiewujiu', // 散修 · 刀尖舔血
        equipment: ['miaodao', null],
        campaignId: 'camp_3',
        lunarMonthId: 'chen', // 土旺月，避免得令/金旺加成的干扰
        solarTermId: 'dongzhi',
        seed: 2000 + i,
      });
      s.yang = 10;
      s.yin = 0; // 阴阳差 = 8（上限）
      const enemy = s.enemies[0]!;
      const bd = resolveDamage(ctxFor(s, CARD_MAP['card_zhanfeng']!, enemy), enemy);
      if (bd.crit) crits++;
    }
    // 暴击率 = 15% 基础 − 20%（伤官）+ 8 × 4%（散修）= 27%，60 次采样期望约 16 次
    expect(crits).toBeGreaterThan(3);
  });
});

describe('回归：融合奥义按实例删除，不误伤同名手牌', () => {
  it('手上有 3 张同 id 卡时融合两张，应仍剩 2 张', () => {
    const s = base();
    const zf = CARD_MAP['card_zhanfeng']!;
    const lc = CARD_MAP['card_lianchi']!;
    const hand = [
      { ...zf, uid: 'u1' },
      { ...zf, uid: 'u2' },
      { ...zf, uid: 'u3' },
      { ...lc, uid: 'u4' },
    ];

    const result = battleReducer(
      { ...s, hand, yang: 10, yin: 10 },
      { type: 'FUSE', cardAId: 'u1', cardBId: 'u4', targetId: s.enemies[0]!.id },
    );

    // 早期按 id 过滤的写法会把 u1/u2/u3 一并删掉，这里必须剩 2 张
    expect(result.hand.filter((c) => c.id === zf.id).length).toBe(2);
  });
});

describe('回归：沉默与麻痹不再是「无响应状态」', () => {
  it('沉默只封锁术法牌，物理牌不受影响', () => {
    const s = base();
    const spell = CARD_MAP['card_lihuo']!;
    const physical = CARD_MAP['card_zhanfeng']!;

    expect(canPlayCard(s, spell)).toBe(true);

    const silenced: BattleState = {
      ...s,
      player: {
        ...s.player,
        statuses: [{ id: 'silence', stacks: 1, duration: 2 }],
      },
    };

    expect(canPlayCard(silenced, spell)).toBe(false);
    expect(canPlayCard(silenced, physical)).toBe(true);
  });
});

describe('回归：月令 defMul 真正参与计算', () => {
  it('土旺月的防御加成生效于 effectiveDefense', () => {
    const enemy = { ...base().enemies[0]!, def: 20 };
    const plain = effectiveDefense(enemy, 1);
    const tumonth = effectiveDefense(enemy, 1.3);
    expect(tumonth).toBeCloseTo(plain * 1.3, 5);
  });
});

describe('回归：净心咒真正驱散负面状态（此前 desc 声明了、引擎零实现）', () => {
  it('打出后自身负面状态被清空', () => {
    const s = base();
    const jx = { ...CARD_MAP['card_jingxin']!, uid: 'jx' };
    const withDebuff: BattleState = {
      ...s,
      yin: 10,
      hand: [jx],
      player: {
        ...s.player,
        statuses: [
          { id: 'weak', stacks: 2, duration: 2 },
          { id: 'burn', stacks: 1, duration: 1 },
        ],
      },
    };

    const r = battleReducer(withDebuff, { type: 'PLAY_CARD', cardId: 'jx' });
    expect(r.player.statuses.length).toBe(0);
    // 同时仍要完成「抽 1 张牌」的既有承诺
    expect(r.hand.length).toBeGreaterThanOrEqual(1);
  });
});

describe('回归：立春·破土真正给予「势」（此前是空声明）', () => {
  it('体修架势下获得 2 层势', () => {
    const s = base();
    const lc = { ...CARD_MAP['card_lichun']!, uid: 'lc' };
    const st: BattleState = { ...s, stance: 'tixiu', shi: 0, yin: 10, hand: [lc] };

    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'lc' });
    expect(r.shi).toBe(2);
  });
});

describe('回归：功能牌融合不再产出「空白奥义牌」', () => {
  it('聚炁 + 回气丹 融合后保留抽牌与回炁', () => {
    const a = CARD_MAP['card_juqi']!; // 抽 2 张，+1 阳炁
    const b = CARD_MAP['card_huiqidan']!; // +2 阳炁，+2 阴炁

    const ult = fuseCards(a, b);
    expect(ult.mul).toBe(0);
    expect(ult.draw).toBe(2);
    expect(ult.gainYang).toBe(3);
    expect(ult.gainYin).toBe(2);
    expect(ult.desc).not.toContain('无实效果');
  });
});
