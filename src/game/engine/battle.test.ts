import { describe, expect, it } from 'vitest';
import type { BattleState, Card, Combatant, DamageContext } from '../types';
import { assertNoIllegalAddBase, effectiveDefense, getCritRate, getWeakMul, resolveDamage } from './damage';
import { battleReducer, canPlayCard, cardCost, createBattleState, fuseCards, judgeParry } from './battle';
import { assertNever } from './assertNever';
import {
  FAXIU_SHENG_COST_MUL,
  FAXIU_SHENG_DMG_STEP,
  FROST_DEF_PENALTY_CAP,
  HAND_LIMIT,
  PARRY_TELEGRAPH_MS,
  PARRY_WINDOW_MS,
  SCRAPE_RATIO,
  ZHENGYIN_COST_MUL,
} from '../constants';
import { CARD_MAP } from '../data/cards';
import { SOLAR_TERM_MAP } from '../data/world';
import { STATUS_BEHAVIOR } from '../data/statuses';

/** 手牌上限的测试别名：改动 HAND_LIMIT 时测试跟着走，不用逐处替换字面量 */
const HAND_LIMIT_TEST = HAND_LIMIT;

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

/**
 * 历史缺陷：「怪物无法攻击 / 满血通关」。
 *
 * 根因是 `parryResult` 为全局单值，`enemyAct` 里每只敌人都读它 ——
 * 多敌人同回合出手时，玩家点一次「格挡」会把**所有**攻击一并免疫。
 * 叠加「大雪」节气的 forceParry（无视时机一律判定 perfect），就等于无条件无敌。
 */
describe('回归：一次弹反只抵消一记攻击', () => {
  /** camp_4 = 春雷兽 + 冰魇 + 加班怨灵，三敌同场，最适合验证多目标弹反 */
  const camp4 = (solarTermId: string) =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_4',
      lunarMonthId: 'zi',
      solarTermId,
      seed: 999,
    });

  /** 打完一整轮敌方行动，返回本轮新增的日志 */
  function runEnemyRound(s: BattleState, parryElapsedMs: number) {
    const before = s.player.hp;
    const logLen = s.log.length;
    let n = battleReducer(s, { type: 'END_TURN' });
    /**
     * 手牌超过上限（HAND_LIMIT）时 END_TURN 不会直接交给敌方，而是先停在「归墟」阶段。
     * 这里把多余的牌依次弃掉，模拟真实玩家把归墟走完 —— 否则后续 ENEMY_ACT 会被
     * phase 守卫挡掉，敌人永远不出手，本组测试就失去意义。
     */
    let guard = 0;
    while (n.phase === 'relic' && n.hand.length > 0 && guard++ < 20) {
      const last = n.hand[n.hand.length - 1]!;
      n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    }
    n = battleReducer(n, { type: 'PARRY', elapsedMs: parryElapsedMs });
    n = battleReducer(n, { type: 'ENEMY_ACT' });
    return { next: n, gained: n.log.slice(logLen), hpBefore: before };
  }

  it('大雪下连按 3 回合，仍有攻击照常命中（不再满血通关）', () => {
    let s = camp4('daxue');
    // 推进到「多只敌人同时攻击」的那一轮（春雷兽 雷震四方 + 加班怨灵 絮叨）
    for (let r = 0; r < 3; r++) {
      const { next } = runEnemyRound(s, 99999); // 大雪下时机随意都算 perfect
      s = next;
    }

    expect(s.player.hp).toBeLessThan(s.player.maxHp);
  });

  it('单轮内「被完全弹反」的敌人不超过 1 个', () => {
    let s = camp4('daxue');
    let checked = false;

    for (let r = 0; r < 4 && s.phase !== 'lost' && s.phase !== 'won'; r++) {
      const { next, gained } = runEnemyRound(s, 99999);
      s = next;

      const fullyParried = gained.filter((l) => l.includes('被完全弹反')).length;
      expect(fullyParried).toBeLessThanOrEqual(1);

      // 至少找到一轮「多只敌人出手」的样本，确保这条断言有实际约束力
      // 注意：出招的日志有两种落点 —— 命中写「使用「…」，造成…」，被弹反写「…被完全弹反」
      const attackers = gained.filter((l) => l.includes('使用「') || l.includes('被完全弹反')).length;
      if (attackers >= 2) checked = true;
    }

    expect(checked).toBe(true);
  });

  it('对照：不带强制弹反的节气，打歪时机照样全额挨打', () => {
    let s = camp4('jingzhe');
    const { next, hpBefore } = runEnemyRound(s, 99999); // 远超判定窗 → miss
    expect(next.player.hp).toBeLessThan(hpBefore);
  });
});

describe('回归：敌方攻击必须留下可见反馈（不再「怪物没攻击」）', () => {
  it('ENEMY_ACT 后玩家的伤害数字与顿帧都还在', () => {
    let s = createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_1',
      lunarMonthId: 'shen',
      solarTermId: 'jingzhe',
      seed: 12345,
    });

    s = battleReducer(s, { type: 'END_TURN' });
    s = battleReducer(s, { type: 'ENEMY_ACT' });

    // startPlayerTurn 曾把 pendingNumbers 整个清空，连敌方刚打出的数字一起抹掉
    const playerHits = s.pendingNumbers.filter((n) => n.targetId === s.player.id && n.amount > 0);
    expect(playerHits.length).toBeGreaterThan(0);

    // 此前只有「玩家打人」才有顿帧，挨打完全没有打击感
    expect(s.pendingHitstopMs).toBeGreaterThan(0);
  });
});

/* ==========================================================================
   归墟（弃牌阶段）
   ========================================================================== */

describe('归墟：回合结束时手牌超上限必须先化牌', () => {
  /** camp_2「深夜写字楼」含贪嗔蠹，是归墟夺牌机制的战场 */
  const camp2 = (solarTermId = 'jingzhe') =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_2',
      lunarMonthId: 'shen',
      solarTermId,
      seed: 4242,
    });

  /** 把牌库抽到指定手牌数（用聚炁/疾风刺等抽牌牌不现实，直接改 hand 更稳） */
  function withHand(n: number): BattleState {
    const s = camp2();
    const need = n - s.hand.length;
    for (let i = 0; i < need; i++) {
      const c = s.deck.pop();
      if (!c) break;
      s.hand.push(c);
    }
    return s;
  }

  it('手牌不超限时 END_TURN 直接进入敌方前摇，不触发归墟', () => {
    const s = withHand(HAND_LIMIT_TEST);
    const n = battleReducer(s, { type: 'END_TURN' });
    expect(n.phase).toBe('enemyTelegraph');
  });

  it('手牌超限时 END_TURN 停在归墟，且还需弃置的张数 = 手牌数 - 上限', () => {
    const s = withHand(HAND_LIMIT_TEST + 3);
    const n = battleReducer(s, { type: 'END_TURN' });
    expect(n.phase).toBe('relic');
    expect(n.relicQuota).toBe(3);
    // 停住 = 还没交给敌方
    expect(n.player.hp).toBe(s.player.hp);
  });

  it('弃物理牌得阴炁、弃术法牌得阳炁（损有余而补不足）', () => {
    const s = withHand(HAND_LIMIT_TEST + 2);
    const phys = s.hand.find((c) => c.kind === 'physical')!;
    const spell = s.hand.find((c) => c.kind === 'spell')!;
    expect(phys && spell).toBeTruthy();

    let n = battleReducer(s, { type: 'END_TURN' });
    const yin0 = n.yin;
    const yang0 = n.yang;

    n = battleReducer(n, { type: 'DISCARD_CARD', cardId: phys.uid ?? phys.id });
    expect(n.yin).toBe(Math.min(n.yinCap, yin0 + 1));
    expect(n.yang).toBe(yang0);

    n = battleReducer(n, { type: 'DISCARD_CARD', cardId: spell.uid ?? spell.id });
    expect(n.yang).toBe(Math.min(n.yangCap, yang0 + 1));
  });

  it('弃够额度后自动结算回合并交给敌方', () => {
    const s = withHand(HAND_LIMIT_TEST + 2);
    let n = battleReducer(s, { type: 'END_TURN' });
    expect(n.phase).toBe('relic');

    for (let i = 0; i < 2; i++) {
      const last = n.hand[n.hand.length - 1]!;
      n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    }

    expect(n.phase).toBe('enemyTelegraph');
    expect(n.hand.length).toBe(HAND_LIMIT_TEST);
    expect(n.relicQuota).toBe(0);
  });

  it('弃掉的牌进弃牌堆而不是凭空消失', () => {
    const s = withHand(HAND_LIMIT_TEST + 1);
    let n = battleReducer(s, { type: 'END_TURN' });
    const discard0 = n.discard.length;
    const last = n.hand[n.hand.length - 1]!;
    n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    expect(n.discard.length).toBe(discard0 + 1);
  });

  it('归墟阶段不能出牌（phase 守卫）', () => {
    const s = withHand(HAND_LIMIT_TEST + 1);
    let n = battleReducer(s, { type: 'END_TURN' });
    expect(n.phase).toBe('relic');
    const uid = n.hand[0]!.uid ?? n.hand[0]!.id;
    const before = n.hand.length;
    n = battleReducer(n, { type: 'PLAY_CARD', cardId: uid });
    expect(n.hand.length).toBe(before);
  });

  it('贪嗔蠹：单次归墟弃置达阈值时夺取弃牌换护盾', () => {
    const s = withHand(HAND_LIMIT_TEST + 3);
    let n = battleReducer(s, { type: 'END_TURN' });
    const bug = n.enemies.find((e) => e.id === 'enemy_tanchen')!;
    expect(bug).toBeTruthy();
    const shield0 = bug.shield;

    for (let i = 0; i < 3; i++) {
      const last = n.hand[n.hand.length - 1]!;
      n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    }

    const after = n.enemies.find((e) => e.id === 'enemy_tanchen')!;
    expect(after.shield).toBeGreaterThan(shield0);
    expect(n.log.some((l) => l.includes('吞食归墟弃牌'))).toBe(true);
  });

  it('寒露节气：敌方按弃牌张数夺取护盾（节气 hook 生效）', () => {
    const s = camp2('hanlu');
    const need = HAND_LIMIT_TEST + 2 - s.hand.length;
    for (let i = 0; i < need; i++) {
      const c = s.deck.pop();
      if (!c) break;
      s.hand.push(c);
    }

    let n = battleReducer(s, { type: 'END_TURN' });
    expect(n.phase).toBe('relic');
    const shield0 = n.enemies.map((e) => e.shield);

    for (let i = 0; i < 2; i++) {
      const last = n.hand[n.hand.length - 1]!;
      n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    }

    // 每只存活敌人都按 6 点/张拿到护盾
    n.enemies.forEach((e, i) => {
      if (e.hp <= 0) return;
      expect(e.shield).toBeGreaterThan(shield0[i]!);
    });
    expect(n.log.some((l) => l.includes('寒露肃杀'))).toBe(true);
  });

  it('无归墟时敌方不会白拿护盾（对照）', () => {
    const s = camp2('hanlu');
    const n = battleReducer(s, { type: 'END_TURN' });
    // 手牌没超限，压根不进归墟
    expect(n.phase).toBe('enemyTelegraph');
    expect(n.log.some((l) => l.includes('寒露肃杀'))).toBe(false);
  });
});

/* ==========================================================================
   P0-1 正印锁血后「费用翻倍」的时序（不能放在 startPlayerTurn，否则永远不可达）
   ========================================================================== */

describe('回归：正印锁血后「消耗翻倍」只作用于下一回合（不永久翻倍）', () => {
  const su = () =>
    createBattleState({
      characterId: 'sujiangxue', // shishen: ['zhengyin', 'piancai'], stance: faxiu
      equipment: ['tangdao', null],
      campaignId: 'camp_1',
      lunarMonthId: 'zi',
      solarTermId: 'daxue', // 无 onTurnStart/onTurnEnd 干扰
      seed: 555,
    });

  /** 结束玩家回合（必要时走完归墟）→ 敌方行动，返回新状态 */
  function passRound(s: BattleState): BattleState {
    let n = battleReducer(s, { type: 'END_TURN' });
    let guard = 0;
    while (n.phase === 'relic' && guard++ < 30) {
      const last = n.hand[n.hand.length - 1];
      if (!last) break;
      n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
    }
    return battleReducer(n, { type: 'ENEMY_ACT' });
  }

  it('敌方回合触发锁血 → 玩家该回合卡牌消耗翻倍', () => {
    let s = su();
    s = { ...s, player: { ...s.player, hp: 1 } }; // 血量极低，敌方必打出致命伤
    s = passRound(s);

    expect(s.phase).toBe('playerTurn');
    expect(s.zhengyinUsed).toBe(true);
    expect(s.player.hp).toBe(1); // 锁血成功

    const card = CARD_MAP['card_pishan']!; // costYang = 2
    const doubled = cardCost(s, card);
    const control = cardCost({ ...s, zhengyinUsed: false }, card);
    expect(doubled.yang).toBe(control.yang * ZHENGYIN_COST_MUL);
    expect(doubled.yang).toBeGreaterThan(control.yang);
  });

  it('再推进一整轮（未再受致命伤）后消耗恢复正常（防永久翻倍回归）', () => {
    let s = su();
    s = { ...s, player: { ...s.player, hp: 1 } };
    s = passRound(s);
    expect(s.zhengyinUsed).toBe(true);

    // 回满血，确保第二轮敌方打不出致命伤 → 不应再次触发锁血
    s = { ...s, player: { ...s.player, hp: s.player.maxHp } };
    s = passRound(s);

    expect(s.zhengyinUsed).toBe(false);

    const card = CARD_MAP['card_pishan']!;
    const normal = cardCost(s, card);
    const control = cardCost({ ...s, zhengyinUsed: false }, card);
    expect(normal.yang).toBe(control.yang);
  });
});

/* ==========================================================================
   P0-2 芒种 100% 空转（onTurnEnd 相位判断冗余 + 触发顺序颠倒）
   ========================================================================== */

describe('回归：芒种节气不再空转', () => {
  const mg = (attackCards = 0) => {
    const s = createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_1',
      lunarMonthId: 'shen',
      solarTermId: 'mangzhong',
      seed: 42,
    });
    return { ...s, attackCardsThisTurn: attackCards };
  };

  it('本回合攻击牌不足 2 张时，回合结束自扣约 10% 血量并打日志', () => {
    const s = mg(0);
    const n = battleReducer(s, { type: 'END_TURN' });
    const expected = Math.max(1, Math.floor(s.player.maxHp * 0.1));
    expect(n.player.hp).toBe(s.player.hp - expected);
    expect(n.log.some((l) => l.includes('芒种'))).toBe(true);
  });

  it('对照：打出 ≥2 张攻击牌时不掉血、不打日志', () => {
    const s = mg(2);
    const n = battleReducer(s, { type: 'END_TURN' });
    expect(n.player.hp).toBe(s.player.hp);
    expect(n.log.some((l) => l.includes('芒种'))).toBe(false);
  });
});

/* ==========================================================================
   P0-3 霜寒（frost）引擎实现：破甲 + 减速
   ========================================================================== */

describe('霜寒：破甲 + 减速（此前引擎零实现）', () => {
  const plain = () =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', null],
      campaignId: 'camp_1',
      lunarMonthId: 'zi',
      solarTermId: 'daxue',
      seed: 7,
    });

  it('三层霜寒使目标防御下降约 36%', () => {
    const enemy = { ...plain().enemies[0]!, def: 100, statuses: [] };
    const before = effectiveDefense(enemy, 1);
    const frosted = { ...enemy, statuses: [{ id: 'frost' as const, stacks: 3, duration: 2 }] };
    const after = effectiveDefense(frosted, 1);
    expect(after).toBeCloseTo(before * (1 - FROST_DEF_PENALTY_CAP), 5);
  });

  it('霜寒减速：势刚好够原价时敌人回气蓄势而非出招', () => {
    const s = plain();
    const frosted: BattleState = {
      ...s,
      enemies: s.enemies.map((e) =>
        e.id === 'enemy_jiaozao' ? { ...e, statuses: [{ id: 'frost' as const, stacks: 1, duration: 2 }] } : e,
      ),
    };
    let n = battleReducer(frosted, { type: 'END_TURN' });
    n = battleReducer(n, { type: 'ENEMY_ACT' });
    expect(n.log.some((l) => l.includes('回气蓄势'))).toBe(true);
    expect(n.player.hp).toBe(frosted.player.hp);
  });

  it('对照：无霜寒时同一意图正常出招，玩家掉血', () => {
    const s = plain();
    let n = battleReducer(s, { type: 'END_TURN' });
    n = battleReducer(n, { type: 'ENEMY_ACT' });
    expect(n.player.hp).toBeLessThan(s.player.hp);
  });
});

/* ==========================================================================
   P1-1 虚弱双向生效
   ========================================================================== */

describe('虚弱：双向生效（此前对敌人是单向无效机制）', () => {
  const camp = () =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', null],
      campaignId: 'camp_1',
      lunarMonthId: 'zi',
      solarTermId: 'daxue',
      seed: 21,
    });

  it('敌人身上的虚弱会压低它打出的伤害', () => {
    const s0 = camp();
    let noWeak = battleReducer(s0, { type: 'END_TURN' });
    noWeak = battleReducer(noWeak, { type: 'ENEMY_ACT' });
    const dmgNoWeak = s0.player.hp - noWeak.player.hp;

    const weakState: BattleState = {
      ...s0,
      enemies: s0.enemies.map((e) =>
        e.id === 'enemy_jiaozao' ? { ...e, statuses: [{ id: 'weak' as const, stacks: 2, duration: 2 }] } : e,
      ),
    };
    let weakRun = battleReducer(weakState, { type: 'END_TURN' });
    weakRun = battleReducer(weakRun, { type: 'ENEMY_ACT' });
    const dmgWeak = weakState.player.hp - weakRun.player.hp;

    expect(dmgWeak).toBeLessThan(dmgNoWeak);
    expect(weakRun.log.some((l) => l.includes('虚弱'))).toBe(true);
  });

  it('玩家身上的虚弱仍然生效（getWeakMul 单一真源）', () => {
    const s = base();
    const enemy = { ...s.enemies[0]!, def: 0 };
    const card = CARD_MAP['card_zhanfeng']!;
    const rng0 = s.rngState;

    const plainBd = resolveDamage(ctxFor({ ...s, rngState: rng0 }, card, enemy), enemy);
    const weakState: BattleState = {
      ...s,
      rngState: rng0,
      player: { ...s.player, statuses: [{ id: 'weak', stacks: 2, duration: 2 }] },
    };
    const weakBd = resolveDamage(ctxFor(weakState, card, enemy), enemy);

    expect(weakBd.totalMul).toBeCloseTo(plainBd.totalMul * getWeakMul(weakState.player), 6);
  });
});

/* ==========================================================================
   P1-2 加班怨灵「夺炁」真实抽走炁
   ========================================================================== */

describe('加班怨灵「夺炁」：真实抽走玩家的炁（此前是无载荷空壳）', () => {
  function jiabanAtDuoQi(over: Partial<BattleState>): BattleState {
    const s0 = createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', null],
      campaignId: 'camp_2',
      lunarMonthId: 'zi',
      solarTermId: 'daxue',
      seed: 13,
    });
    return {
      ...s0,
      phase: 'enemyTelegraph',
      turn: 4, // jiaban.intents[(4-1)%5] === 「夺炁」
      enemies: s0.enemies.filter((e) => e.id === 'enemy_jiaban').map((e) => ({ ...e, shi: 4 })),
      ...over,
    };
  }

  it('轮到「夺炁」时玩家阴阳炁各被抽走 2', () => {
    const s = jiabanAtDuoQi({ yang: 10, yin: 10 });
    const n = battleReducer(s, { type: 'ENEMY_ACT' });
    expect(n.yang).toBe(8);
    expect(n.yin).toBe(8);
    expect(n.log.some((l) => l.includes('夺炁'))).toBe(true);
  });

  it('炁为 0 / 不足时不会被抽成负数，且日志如实反映实际抽走量', () => {
    const s = jiabanAtDuoQi({ yang: 0, yin: 1 });
    const n = battleReducer(s, { type: 'ENEMY_ACT' });
    expect(n.yang).toBe(0);
    expect(n.yin).toBe(0);
    expect(n.yang).toBeGreaterThanOrEqual(0);
    expect(n.yin).toBeGreaterThanOrEqual(0);
    // 「抽走你 0 阳炁 1 阴炁」—— 不得谎称抽走 2
    expect(n.log.some((l) => l.includes('抽走你 0 阳炁 1 阴炁'))).toBe(true);
  });
});

/* ==========================================================================
   P1-3 春分 regulateMul 取整方式
   ========================================================================== */

describe('春分：调息效率 ×1.5 不再被取整抹平（ceil 而非 floor）', () => {
  const regulateWith = (solarTermId: string) => {
    const s = createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', null],
      campaignId: 'camp_1',
      lunarMonthId: 'zi',
      solarTermId,
      seed: 1,
    });
    // 阳炁足够、阴炁不会触顶
    return battleReducer({ ...s, yang: 10, yin: 0 }, { type: 'REGULATE', from: 'yang' });
  };

  it('春分下 2 阳炁换得 2 阴炁，多于基准的 1 阴炁', () => {
    const chunfen = regulateWith('chunfen');
    const plainRun = regulateWith('daxue');
    expect(chunfen.yin).toBe(2);
    expect(plainRun.yin).toBe(1);
    expect(chunfen.yin).toBeGreaterThan(plainRun.yin);
  });
});

/* ==========================================================================
   P1-4 霜降：暴击才冻结，且锁定被击中的目标
   ========================================================================== */

describe('霜降：只有暴击命中才冻结，且冻结「被击中的那个敌人」', () => {
  const hook = SOLAR_TERM_MAP['shuangjiang']!.hooks.onDamageDealt!;

  it('非暴击命中时不产生冻结', () => {
    const s = base({ solarTermId: 'shuangjiang' });
    const target = s.enemies[0]!;
    const effs = hook(ctxFor(s, null, target), { amount: 10, targetId: target.id, crit: false, isTrue: false });
    expect(effs.length).toBe(0);
  });

  it('暴击命中时冻结的是 targetId 指向的敌人（而非列表第一个）', () => {
    const s = base({ solarTermId: 'shuangjiang' });
    const first = s.enemies[0]!;
    const second = s.enemies[1]!;
    const effs = hook(ctxFor(s, null, second), { amount: 10, targetId: second.id, crit: true, isTrue: false });
    const applied = effs.find((e) => e.kind === 'applyStatus');
    expect(applied).toBeTruthy();
    if (applied && applied.kind === 'applyStatus') {
      expect(applied.targetId).toBe(second.id);
      expect(applied.targetId).not.toBe(first.id);
      expect(applied.status).toBe('freeze');
    }
  });

  it('引擎逐次命中触发：暴击命中第二个敌人时只有它被冻结', () => {
    const s = base({ solarTermId: 'shuangjiang' });
    const first = s.enemies[0]!;
    const second = s.enemies[1]!;
    const withFlaw: BattleState = {
      ...s,
      yang: 10,
      yin: 10,
      hand: [{ ...CARD_MAP['card_zhanfeng']!, uid: 'fx1' }],
      enemies: s.enemies.map((e) =>
        e.id === second.id ? { ...e, statuses: [...e.statuses, { id: 'flaw' as const, stacks: 1, duration: 1 }] } : e,
      ),
    };
    const r = battleReducer(withFlaw, { type: 'PLAY_CARD', cardId: 'fx1', targetId: second.id });
    expect(r.enemies.find((e) => e.id === second.id)!.statuses.some((st) => st.id === 'freeze')).toBe(true);
    expect(r.enemies.find((e) => e.id === first.id)!.statuses.some((st) => st.id === 'freeze')).toBe(false);
  });
});

/* ==========================================================================
   P1-5 法修：相生链递增 + 相克打断/附虚弱
   ========================================================================== */

describe('法修：desc 的三条承诺（费用减半 / 伤害逐环递增 / 相克打断+虚弱）', () => {
  const faxiuState = () =>
    createBattleState({
      characterId: 'sujiangxue', // stance: faxiu
      equipment: ['tangdao', null],
      campaignId: 'camp_1',
      lunarMonthId: 'shen', // 金旺月：水行日主既不得令也不失令，排除干扰
      solarTermId: 'dongzhi',
      seed: 5,
    });

  it('相生连击的伤害倍率随 faxiuChain 递增（第 N 环 +10%）', () => {
    const s = faxiuState();
    const card = CARD_MAP['card_lihuo']!; // 火
    const enemy = { ...s.enemies[0]!, def: 0 };
    const base2: BattleState = { ...s, stance: 'faxiu', lastSpellWuxing: 'mu' }; // 木→火相生

    const c0 = resolveDamage(ctxFor({ ...base2, faxiuChain: 0, rngState: 1 }, card, enemy), enemy);
    const c2 = resolveDamage(ctxFor({ ...base2, faxiuChain: 2, rngState: 1 }, card, enemy), enemy);

    expect(c2.totalMul - c0.totalMul).toBeCloseTo(2 * FAXIU_SHENG_DMG_STEP, 6);
  });

  it('相生时下一张术法费用减半（走 FAXIU_SHENG_COST_MUL 常量）', () => {
    const s = faxiuState();
    const card = CARD_MAP['card_lihuo']!; // costYin 2
    const st: BattleState = { ...s, stance: 'faxiu', lastSpellWuxing: 'mu' };
    const normal = cardCost({ ...st, lastSpellWuxing: null }, card);
    const halved = cardCost(st, card);
    expect(halved.yin).toBe(Math.ceil(normal.yin * FAXIU_SHENG_COST_MUL));
    expect(halved.yin).toBeLessThan(normal.yin);
  });

  it('相克命中清零敌人蓄力（不重复计入相克次数）', () => {
    const s = faxiuState();
    const jinwu = s.enemies.find((e) => e.id === 'enemy_jinwu')!; // 金；火克金
    const st: BattleState = {
      ...s,
      yang: 10,
      yin: 10,
      hand: [{ ...CARD_MAP['card_lihuo']!, uid: 'fx2' }],
      enemies: s.enemies.map((e) => (e.id === jinwu.id ? { ...e, chargeStacks: 3 } : e)),
    };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'fx2', targetId: jinwu.id });
    const after = r.enemies.find((e) => e.id === jinwu.id)!;
    expect(after.chargeStacks).toBe(0);
    expect(r.log.some((l) => l.includes('相克'))).toBe(true);
    expect(r.counterHitsThisTurn).toBe(1);
  });

  it('相克命中给敌人挂上虚弱', () => {
    const s = faxiuState();
    const jinwu = s.enemies.find((e) => e.id === 'enemy_jinwu')!;
    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [{ ...CARD_MAP['card_lihuo']!, uid: 'fx3' }] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'fx3', targetId: jinwu.id });
    const after = r.enemies.find((e) => e.id === jinwu.id)!;
    expect(after.statuses.some((x) => x.id === 'weak')).toBe(true);
  });
});

/* ==========================================================================
   P1-6 法器炁上限按侧别累加
   ========================================================================== */

describe('法器炁上限按侧别累加（此前阴阳双脉同加）', () => {
  const mk = (equip: [string | null, string | null]) =>
    createBattleState({
      characterId: 'luqingya',
      equipment: equip,
      campaignId: 'camp_1',
      lunarMonthId: 'zi',
      solarTermId: 'daxue',
      seed: 3,
    });

  it('离火镜只加阳炁上限', () => {
    const none = mk(['tangdao', null]);
    const mirror = mk(['tangdao', 'lihuojing']);
    expect(mirror.yangCap).toBe(none.yangCap + 4);
    expect(mirror.yinCap).toBe(none.yinCap);
  });

  it('坎水佩只加阴炁上限', () => {
    const none = mk(['tangdao', null]);
    const pei = mk(['tangdao', 'kanshuipei']);
    expect(pei.yinCap).toBe(none.yinCap + 4);
    expect(pei.yangCap).toBe(none.yangCap);
  });
});

/* ==========================================================================
   守卫：状态行为注册表 / 穷尽性工具
   ========================================================================== */

describe('守卫：状态行为注册表与穷尽性工具', () => {
  it('STATUS_BEHAVIOR 覆盖全部 8 个 StatusId', () => {
    const ids = ['burn', 'frost', 'freeze', 'weak', 'armorBreak', 'paralyze', 'silence', 'flaw'] as const;
    for (const id of ids) {
      const b = STATUS_BEHAVIOR[id];
      expect(b).toBeTruthy();
      expect(typeof b.label).toBe('string');
      expect(b.effect.length).toBeGreaterThan(0);
    }
    expect(Object.keys(STATUS_BEHAVIOR).length).toBe(8);
  });

  it('frost 的行为描述与实现一致（破甲 12%/层、上限 36%）', () => {
    expect(STATUS_BEHAVIOR.frost.effect).toContain('12%');
    expect(STATUS_BEHAVIOR.frost.effect).toContain('36%');
    // 与常量单一真源对齐
    expect(FROST_DEF_PENALTY_CAP).toBeCloseTo(0.36, 6);
  });

  it('assertNever 收到未处理分支时抛错', () => {
    expect(() => assertNever('unexpected' as never, '测试')).toThrow(/穷尽性/);
  });
});

/* ==========================================================================
   白露：霜寒必须挂在「被命中」的目标上，且只在真命中时触发
   ==========================================================================
   历史缺陷（与「霜降锁错目标」同源，本轮漏网）：
     - 锁错目标：旧钩子挂在 onCardPlayed，把霜寒给「列表里第一个存活敌人」，
       而不是本张术法实际打中的那个。
     - 时机错：desc 写「命中后」，但 onCardPlayed 是「出牌即触发」——
       打出 mul=0 的纯治疗/功能牌也会挂霜寒。
   现迁移到 onDamageDealt（事实快照 hit 携带 targetId），两个问题一次修掉。
   ========================================================================== */

describe('白露：锁对目标 + 「命中后」而非「出牌即」', () => {
  const camp2 = (solarTermId: string) =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_2', // 三只敌人，能验证「锁的是第二个而不是第一个」
      lunarMonthId: 'shen',
      solarTermId,
      seed: 4242,
    });

  it('多敌人战斗：对第二个敌人打术法，霜寒只挂在第二个敌人身上', () => {
    const s = camp2('bailu');
    const first = s.enemies[0]!;
    const second = s.enemies[1]!;
    const spell = { ...CARD_MAP['card_jinfeng']!, uid: 'bl_spell' };
    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [spell] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'bl_spell', targetId: second.id });

    expect(r.enemies.find((e) => e.id === second.id)!.statuses.some((x) => x.id === 'frost')).toBe(true);
    expect(r.enemies.find((e) => e.id === first.id)!.statuses.some((x) => x.id === 'frost')).toBe(false);
  });

  it('打 mul === 0 的功能牌（聚炁）不产生霜寒（「出牌即」已修成「命中后」）', () => {
    const s = camp2('bailu');
    const juqi = { ...CARD_MAP['card_juqi']!, uid: 'bl_juqi' };
    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [juqi] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'bl_juqi', targetId: s.enemies[0]!.id });

    expect(r.enemies.every((e) => !e.statuses.some((x) => x.id === 'frost'))).toBe(true);
  });

  it('打 mul === 0 的术法牌（立春·破土）同样不产生霜寒（它是 spell、但不是攻击牌）', () => {
    const s = camp2('bailu');
    const lichun = { ...CARD_MAP['card_lichun']!, uid: 'bl_lichun' };
    const st: BattleState = { ...s, stance: 'tixiu' as const, yang: 10, yin: 10, hand: [lichun] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'bl_lichun', targetId: s.enemies[0]!.id });

    expect(r.enemies.every((e) => !e.statuses.some((x) => x.id === 'frost'))).toBe(true);
  });
});

/* ==========================================================================
   白露 · 霜寒层数：命中即 1 层、多次出牌叠加（F1 回炉固化）
   ==========================================================================
   【有意为之，勿当 bug 修】旧 desc 曾承诺「多段术法按命中段数叠加层数」，但引擎实测
   与段数无关 —— dealCardDamage 是**按目标**收集 hitsInfo（每个目标只 push 一条，
   amount = perHit × hits 已把多段合成为「本次对该目标的伤害合计」），
   故 onDamageDealt 对每个目标只触发一次 → 霜寒每目标只 +1 层。
   本组测试把这条真实行为**固化**下来，防止未来回归时被误当 bug 改回「按段数叠层」：
     - 多段术法（潮生诀 hits=2）单次出牌 → 霜寒仍只有 1 层；
     - 同一张多段术法连打两次 → 霜寒 2 层（证明新 desc「多次出牌可叠层」的承诺是真的）。
   为什么选「改文案」而非「改引擎」、以及按段叠层的平衡风险，见 world.ts 白露钩子的注释。
   ========================================================================== */

describe('白露 · 霜寒层数：命中即 1 层、多次出牌叠加（F1 固化）', () => {
  /** camp_3 首敌（春雷兽 380 血）血量充足，两发潮生诀也打不死，便于静观层数累积 */
  const setup = () =>
    createBattleState({
      characterId: 'luqingya',
      equipment: ['tangdao', 'lihuojing'],
      campaignId: 'camp_3',
      lunarMonthId: 'shen',
      solarTermId: 'bailu',
      seed: 7788,
    });

  const frostStacksOf = (s: BattleState, enemyId: string): number =>
    s.enemies.find((e) => e.id === enemyId)!.statuses.find((x) => x.id === 'frost')?.stacks ?? 0;

  it('多段术法（潮生诀 hits=2）单次出牌：霜寒只 1 层，不按命中段数叠层', () => {
    const s = setup();
    const target = s.enemies[0]!;
    const spell = { ...CARD_MAP['card_chaosheng']!, uid: 'f1_one' };
    expect(spell.hits).toBe(2); // 先确认这确实是多段术法，否则本测试失去意义

    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [spell] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'f1_one', targetId: target.id });

    // 【有意为之】2 段术法 → 仍只 1 层：段数不叠层，层数靠「多次出牌」积累
    expect(frostStacksOf(r, target.id)).toBe(1);
  });

  it('同一张多段术法连打两次：霜寒叠到 2 层（desc「多次出牌可叠层」为真）', () => {
    const s = setup();
    const target = s.enemies[0]!;
    const a = { ...CARD_MAP['card_chaosheng']!, uid: 'f1_a' };
    const b = { ...CARD_MAP['card_chaosheng']!, uid: 'f1_b' };
    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [a, b] };

    const r1 = battleReducer(st, { type: 'PLAY_CARD', cardId: 'f1_a', targetId: target.id });
    expect(frostStacksOf(r1, target.id)).toBe(1); // 第一次出牌 → 1 层

    const r2 = battleReducer(r1, { type: 'PLAY_CARD', cardId: 'f1_b', targetId: target.id });
    expect(frostStacksOf(r2, target.id)).toBe(2); // 第二次出牌 → 叠到 2 层
  });
});
