/**
 * L3 · 测试级契约（contract）
 * ============================================================================
 * 核心思想：让「数据声明了、引擎没实现」这类缺陷**不再靠人肉比对**，
 * 而是「故意塞一个空壳进去，测试必挂」。
 *
 * 本文件回答一个问题：
 *   「我能证明**每一个声明过的机制，都真的改变了某个可观测的数**吗？」
 *
 * 与 battle.test.ts 的分工：
 *   - battle.test.ts 固化的是**具体历史 bug 的回归**（防御只减一次、沉默生效……）。
 *   - 本文件固化的是**「机制 ↔ 数据」之间的覆盖契约**：探针表本身就是一张断言，
 *     「新增一个状态/节气却不写探针」会在 tsc -b 阶段直接编译失败（见 A1 / A3）。
 *
 * 【本文件里凡是「故意设计成这样、别改回去」的地方都写了注释，请勿静默改动。】
 */
/// <reference types="node" />
// A4-7 需读取源码文本做静态令牌扫描：
//  - actors.ts / Figure.tsx 用 Vite 的 ?raw 导入（类型来自 tsconfig 的 vite/client）；
//  - tokens.css 的 ?raw / ?inline / ?url 在 vitest 下**一律被抹成空模块**（已实测），
//    故只能直读文件。src 侧 tsconfig 的 types 仅含 vite/client，这里用三斜线指令为本文件
//    显式引入 node 类型 —— 不改 tsconfig，也不影响其它文件的类型环境。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import actorsSource from '../data/actors.ts?raw';
import figureSource from '../../components/svg/Figure.tsx?raw';
import { describe, expect, it } from 'vitest';
import type { BattleState, Card, Combatant, DamageContext, StanceId, StatusId } from '../types';
import { battleReducer, canPlayCard, cardCost, createBattleState, regulateOutcome } from './battle';
import { effectiveDefense, getCritMul, getQiCap, getWeakMul, resolveDamage } from './damage';
import { fireModifyHeal, fireTurnStart, getRegulateMul, isForceParry } from './hooks';
import {
  HAND_DRAW_CAP,
  HAND_LIMIT,
  PARRY_TELEGRAPH_MS,
  PARRY_TOTAL_MS,
  PARRY_WINDOW_MS,
  QI_CAP_BASE,
  SUBSTITUTE_RATIO_DEFAULT,
} from '../constants';
import { CARD_MAP, CARDS, ENCHANT_COMBOS, EQUIPMENT } from '../data/cards';
import { ENEMIES } from '../data/actors';
import { IMPLEMENTED_TERMS, SOLAR_TERM_MAP, SOLAR_TERMS, STANCES } from '../data/world';
import { STATUS_BEHAVIOR } from '../data/statuses';

/* ============================== 公共构造工具 ============================== */

/** 默认基线：申月 / 大雪（daxue 只有 forceParry，不干扰伤害与回合结算） */
function mk(
  over: Partial<{
    characterId: string;
    equipment: [string | null, string | null];
    campaignId: string;
    lunarMonthId: string;
    solarTermId: string;
    seed: number;
  }> = {},
): BattleState {
  return createBattleState({
    characterId: over.characterId ?? 'luqingya',
    equipment: over.equipment ?? ['tangdao', null],
    campaignId: over.campaignId ?? 'camp_1',
    lunarMonthId: over.lunarMonthId ?? 'shen',
    solarTermId: over.solarTermId ?? 'daxue',
    seed: over.seed ?? 12345,
  });
}

function ctxFor(s: BattleState, card: Card | null, defender: Combatant): DamageContext {
  return {
    attacker: s.player,
    defender,
    card,
    cardsPlayedThisTurn: s.cardsPlayedThisTurn,
    comboThisTurn: s.comboThisTurn,
    counterHitsThisTurn: s.counterHitsThisTurn,
    state: s,
  };
}

/** 打完一整轮：END_TURN（必要时走完归墟）→ ENEMY_ACT（含敌方行动后的 startPlayerTurn） */
function runRound(s: BattleState): BattleState {
  let n = battleReducer(s, { type: 'END_TURN' });
  let guard = 0;
  while (n.phase === 'relic' && guard++ < 30) {
    const last = n.hand[n.hand.length - 1];
    if (!last) break;
    n = battleReducer(n, { type: 'DISCARD_CARD', cardId: last.uid ?? last.id });
  }
  return battleReducer(n, { type: 'ENEMY_ACT' });
}

const ENEMY_JZ = 'enemy_jiaozao';

/** 给指定敌人加一个状态（不可变替换，避免污染共享对象） */
function enemyWithStatus(s: BattleState, enemyId: string, id: StatusId, stacks: number, duration = 2): BattleState {
  return {
    ...s,
    enemies: s.enemies.map((e) => (e.id === enemyId ? { ...e, statuses: [{ id, stacks, duration }] } : e)),
  };
}

/* ==========================================================================
   A1 · 每个状态都必须改变一个可观测量（本组是重头戏）
   ========================================================================== */

interface StatusProbe {
  /** 可观测量的中文说明（断言失败时报出来，方便定位） */
  readonly observable: string;
  /** 基线：不施加该状态 */
  base(): unknown;
  /** 施加该状态后的同一可观测量 */
  applied(): unknown;
}

/**
 * 【探针表 —— 本组测试最大的价值所在】
 *
 * 类型标注 `Record<StatusId, StatusProbe>` 是一道**编译期契约**：
 * 将来给 types.ts 的 StatusId 新增第 9 个状态、却不在这里补一条探针，
 * `npx tsc -b` 会直接报「缺少 key」而失败 ——
 * 于是「数据声明了、引擎没实现」这类缺陷再也没法靠人肉比对混过去。
 *
 * 每条探针都走**真实数据流**（resolveDamage / effectiveDefense / enemyAct / startPlayerTurn /
 * canPlayCard / battleReducer），而不是只对某个纯函数做孤立断言。
 */
const STATUS_PROBES: Record<StatusId, StatusProbe> = {
  burn: {
    observable: '敌人经过一次 startPlayerTurn 灼烧结算后的掉血量',
    base: () => {
      const s = mk({ campaignId: 'camp_1' });
      const hp0 = s.enemies.find((e) => e.id === ENEMY_JZ)!.hp;
      const n = runRound(s);
      return hp0 - n.enemies.find((e) => e.id === ENEMY_JZ)!.hp;
    },
    applied: () => {
      const s = enemyWithStatus(mk({ campaignId: 'camp_1' }), ENEMY_JZ, 'burn', 2);
      const hp0 = s.enemies.find((e) => e.id === ENEMY_JZ)!.hp;
      const n = runRound(s);
      return hp0 - n.enemies.find((e) => e.id === ENEMY_JZ)!.hp;
    },
  },
  frost: {
    observable: 'effectiveDefense(enemy, 1)（真实减伤入口读取的值）',
    base: () => effectiveDefense({ ...mk().enemies[0]!, def: 60, statuses: [] }, 1),
    applied: () => effectiveDefense({ ...mk().enemies[0]!, def: 60, statuses: [{ id: 'frost', stacks: 3, duration: 2 }] }, 1),
  },
  freeze: {
    observable: '敌方回合后玩家掉血量（被冻结的敌人应当完全不出手）',
    base: () => {
      const s = mk({ campaignId: 'camp_1' });
      const hp0 = s.player.hp;
      return hp0 - runRound(s).player.hp;
    },
    applied: () => {
      const s = enemyWithStatus(mk({ campaignId: 'camp_1' }), ENEMY_JZ, 'freeze', 1, 1);
      const hp0 = s.player.hp;
      return hp0 - runRound(s).player.hp;
    },
  },
  weak: {
    observable: 'getWeakMul(敌人)（攻方虚弱倍率，玩家侧/敌人侧共用的单一真源）',
    base: () => getWeakMul({ ...mk().enemies[0]!, statuses: [] }),
    applied: () => getWeakMul({ ...mk().enemies[0]!, statuses: [{ id: 'weak', stacks: 2, duration: 2 }] }),
  },
  armorBreak: {
    observable: 'effectiveDefense(enemy, 1)',
    base: () => effectiveDefense({ ...mk().enemies[0]!, def: 60, statuses: [] }, 1),
    applied: () => effectiveDefense({ ...mk().enemies[0]!, def: 60, statuses: [{ id: 'armorBreak', stacks: 2, duration: 2 }] }, 1),
  },
  paralyze: {
    observable: '200 个种子下敌方「麻痹发作」落空的累计次数',
    base: () => countParalyzeMisses(false),
    applied: () => countParalyzeMisses(true),
  },
  silence: {
    observable: 'canPlayCard(player, 一张术法牌)',
    base: () => canPlayCard(mk(), CARD_MAP['card_lihuo']!),
    applied: () => {
      const s = mk();
      return canPlayCard({ ...s, player: { ...s.player, statuses: [{ id: 'silence', stacks: 1, duration: 2 }] } }, CARD_MAP['card_lihuo']!);
    },
  },
  flaw: {
    observable: '一次物理攻击的 DamageBreakdown「isTrue|crit」',
    base: () => flawBreakdown(false),
    applied: () => flawBreakdown(true),
  },
};

/**
 * 麻痹是概率的：跑 200 个种子统计「落空」发生次数。
 * 【故意不用「一次就必中」的写法】—— 概率断言必须靠统计，否则是不稳定的假测试。
 */
function countParalyzeMisses(withParalyze: boolean): number {
  let misses = 0;
  for (let i = 0; i < 200; i++) {
    let s = mk({ campaignId: 'camp_1', seed: 1000 + i });
    if (withParalyze) s = enemyWithStatus(s, ENEMY_JZ, 'paralyze', 3, 9);
    if (runRound(s).log.some((l) => l.includes('麻痹发作'))) misses++;
  }
  return misses;
}

/**
 * 破绽：镜像引擎 dealCardDamage 的数据流 ——
 * 它读到目标身上有 flaw 时，**正是**以 `{ forceCrit: hasFlaw, isTrue: hasFlaw }` 调用 resolveDamage。
 * 用伤官角色（暴击率被压到 0）保证基线 crit 稳定为 false，消除随机性对断言的干扰。
 */
function flawBreakdown(withFlaw: boolean): string {
  const s = mk({ characterId: 'xiewujiu', campaignId: 'camp_1' });
  const e: Combatant = {
    ...s.enemies[0]!,
    def: 40,
    statuses: withFlaw ? [{ id: 'flaw', stacks: 1, duration: 1 }] : [],
  };
  const hasFlaw = e.statuses.some((st) => st.id === 'flaw');
  const bd = resolveDamage(ctxFor(s, CARD_MAP['card_zhanfeng']!, e), e, { forceCrit: hasFlaw, isTrue: hasFlaw });
  return `${bd.isTrue}|${bd.crit}`;
}

describe('A1 每个状态都必须改变一个可观测量（探针表即契约）', () => {
  it('探针表恰好覆盖 8 个 StatusId（缺一个 → tsc -b 直接报错）', () => {
    expect(Object.keys(STATUS_PROBES).length).toBe(8);
  });

  it('每个状态的「施加后」都严格不同于「基线」——否则疑似无响应机制', () => {
    const ids = Object.keys(STATUS_PROBES) as StatusId[];
    for (const id of ids) {
      const p = STATUS_PROBES[id];
      expect(
        p.applied(),
        `状态 ${id}（可观测量：${p.observable}）在施加前后无差异 —— 涉嫌「数据声明了、引擎没实现」`,
      ).not.toEqual(p.base());
    }
  });

  it('探针抽查：burn/frost/silence/flaw 的基线与施加值具体是什么（防探针被写歪）', () => {
    expect(STATUS_PROBES.burn.base()).toBe(0); // 无灼烧 → 敌人不掉血
    expect(STATUS_PROBES.burn.applied()).toBe(8); // 2 层 × 4 = 8
    expect(STATUS_PROBES.frost.applied()).toBeCloseTo(60 * (1 - 0.36), 5); // 上限 −36%
    expect(STATUS_PROBES.silence.base()).toBe(true);
    expect(STATUS_PROBES.silence.applied()).toBe(false);
    expect(STATUS_PROBES.flaw.base()).toBe('false|false');
    expect(STATUS_PROBES.flaw.applied()).toBe('true|true');
  });
});

/* ==========================================================================
   A2 · 双向生效（禁止单向机制）
   ========================================================================== */

describe('A2 虚弱双向生效', () => {
  /**
   * 这两条正是历史缺陷「藤蔓缚 / 崩拳声称附虚弱，但对敌人无效」的**固化点**。
   * getWeakMul 是玩家侧（resolveDamage）与敌人侧（battle.enemyAct）共用的单一真源，
   * 任何一侧漏读它，下面两个方向就会有一个挂掉。
   */
  it('方向一 · 玩家打敌人：玩家身上有 weak → 伤害倍率下降', () => {
    const s = mk({ characterId: 'xiewujiu' }); // 暴击率 0，排除随机性干扰
    const e: Combatant = { ...s.enemies[0]!, def: 0, statuses: [] };
    const baseBd = resolveDamage(ctxFor(s, CARD_MAP['card_zhanfeng']!, e), e);

    const weakState: BattleState = {
      ...s,
      player: { ...s.player, statuses: [{ id: 'weak', stacks: 2, duration: 2 }] },
    };
    const weakBd = resolveDamage(ctxFor(weakState, CARD_MAP['card_zhanfeng']!, e), e);

    expect(weakBd.totalMul).toBeLessThan(baseBd.totalMul);
    expect(weakBd.totalMul).toBeCloseTo(baseBd.totalMul * getWeakMul(weakState.player), 6);
  });

  it('方向二 · 敌人打玩家：敌人身上有 weak → 玩家掉血下降', () => {
    const hpLost = (withWeak: boolean): number => {
      let s = mk({ campaignId: 'camp_1' });
      if (withWeak) s = enemyWithStatus(s, ENEMY_JZ, 'weak', 2);
      const hp0 = s.player.hp;
      return hp0 - runRound(s).player.hp;
    };
    const plain = hpLost(false);
    const weakened = hpLost(true);
    expect(weakened).toBeLessThan(plain);
    expect(plain).toBeGreaterThan(0); // 对照必须有实际约束力
  });
});

/* ==========================================================================
   A3 · 已实装节气不得是纯 no-op
   ========================================================================== */

interface TermProbe {
  readonly observable: string;
  /** 基线：换一个**无此钩子**的节气（多为 dongzhi / daxue）的同一构造态 */
  base(): unknown;
  applied(): unknown;
}

/** 本回合（首张）物理攻击的阳炁成本 */
function firstAttackCost(term: string, cardId: string): number {
  return cardCost(mk({ solarTermId: term }), CARD_MAP[cardId]!).yang;
}

/** 调息一次（阳→阴）后获得的阴炁 */
function regulateYin(term: string): number {
  const s = mk({ solarTermId: term });
  return battleReducer({ ...s, yang: 10, yin: 0 }, { type: 'REGULATE', from: 'yang' }).yin;
}

/** 芒种：本回合攻击牌数 < 2 时结束回合的玩家掉血量 */
function mangzhongHpLoss(term: string): number {
  const s = mk({ solarTermId: term });
  return s.player.hp - battleReducer({ ...s, attackCardsThisTurn: 0 }, { type: 'END_TURN' }).player.hp;
}

/** 大暑：一次攻击的伤害倍率（土旺月、散修阴阳差 0，排除其它加成干扰） */
function dashuMul(term: string): number {
  const s = mk({ characterId: 'xiewujiu', solarTermId: term, lunarMonthId: 'chen' });
  const e: Combatant = { ...s.enemies[0]!, def: 0, statuses: [] };
  return resolveDamage(ctxFor(s, CARD_MAP['card_zhanfeng']!, e), e).totalMul;
}

/** 白露：一张术法牌的阴炁消耗 */
function bailuSpellYin(term: string): number {
  return cardCost(mk({ solarTermId: term }), CARD_MAP['card_lihuo']!).yin;
}

/**
 * 冬至：回合开始时较弱一脉补炁。
 * 用 camp_3：首回合两只敌人分别是「引雷（buff）」与「立盾（guard）」，**都不攻击玩家**，
 * 于是这一轮里 yin 的唯一变化来源就是冬至 onTurnStart 的补炁（受击 +1 阴炁不会发生）。
 * 月令取子月，避免得令（+1 阳 +1 阴）混淆基线。
 */
function dongzhiYin(term: string): number {
  const s = mk({ campaignId: 'camp_3', solarTermId: term, lunarMonthId: 'zi' });
  return runRound({ ...s, yang: 10, yin: 2 }).yin;
}

/**
 * 【节气探针表】
 * 键用 `Record<string, ...>` 以容纳「未实装」的节气 id；覆盖性由下方的
 * 「表必须覆盖全部已实装节气、且不含未实装节气」两条断言来保证。
 */
const TERM_PROBES: Record<string, TermProbe> = {
  jingzhe: {
    observable: '本回合首张攻击牌的 cardCost.yang',
    base: () => firstAttackCost('dongzhi', 'card_zhanfeng'),
    applied: () => firstAttackCost('jingzhe', 'card_zhanfeng'),
  },
  chunfen: {
    observable: '调息一次（阳→阴）后获得的阴炁',
    base: () => regulateYin('daxue'),
    applied: () => regulateYin('chunfen'),
  },
  mangzhong: {
    observable: 'attackCardsThisTurn=0 时结束回合的玩家掉血量',
    base: () => mangzhongHpLoss('daxue'),
    applied: () => mangzhongHpLoss('mangzhong'),
  },
  dashu: {
    observable: '一次攻击的伤害倍率 totalMul',
    base: () => dashuMul('dongzhi'),
    applied: () => dashuMul('dashu'),
  },
  bailu: {
    observable: '一张术法牌的 cardCost.yin',
    base: () => bailuSpellYin('daxue'),
    applied: () => bailuSpellYin('bailu'),
  },
  shuangjiang: {
    observable: 'getCritMul(state)（暴击倍率）',
    base: () => getCritMul(mk({ characterId: 'xiewujiu', solarTermId: 'dongzhi' })),
    applied: () => getCritMul(mk({ characterId: 'xiewujiu', solarTermId: 'shuangjiang' })),
  },
  daxue: {
    observable: 'isForceParry(state)',
    base: () => isForceParry(mk({ solarTermId: 'dongzhi' })),
    applied: () => isForceParry(mk({ solarTermId: 'daxue' })),
  },
  dongzhi: {
    observable: '较弱一脉在回合开始补炁后的 yin 总量',
    base: () => dongzhiYin('daxue'),
    applied: () => dongzhiYin('dongzhi'),
  },
};

describe('A3 已实装节气不得是纯 no-op', () => {
  it('A3-1 所有 implemented:true 的节气，其 hooks 至少含 1 个键', () => {
    for (const t of SOLAR_TERMS) {
      if (!t.implemented) continue;
      expect(Object.keys(t.hooks).length, `节气 ${t.id} 声明已实装，却没有任何钩子（纯 no-op）`).toBeGreaterThan(0);
    }
  });

  it('A3-2 节气探针表覆盖全部已实装节气，且不含未实装节气', () => {
    const implementedIds = IMPLEMENTED_TERMS.map((t) => t.id);
    for (const id of implementedIds) {
      expect(TERM_PROBES[id], `已实装节气 ${id} 缺少探针`).toBeTruthy();
    }
    for (const key of Object.keys(TERM_PROBES)) {
      expect(implementedIds, `探针表里出现了未实装节气 ${key}（探针与实现脱节）`).toContain(key);
    }
  });

  it('A3-3 每个已实装节气都改变一个可观测量（基线 vs 施加）', () => {
    const ids = Object.keys(TERM_PROBES);
    expect(ids.length).toBe(IMPLEMENTED_TERMS.length);
    for (const id of ids) {
      const p = TERM_PROBES[id]!;
      expect(p.applied(), `节气 ${id}（可观测量：${p.observable}）与基线无差异 —— 疑似空转`).not.toEqual(p.base());
    }
  });

  it('惊蛰：首张攻击牌消耗翻倍，且 modifyDamage 产出 1.5 倍修饰器', () => {
    const s = mk({ solarTermId: 'jingzhe' });
    const card = CARD_MAP['card_zhanfeng']!;
    expect(cardCost(s, card).yang).toBe(card.costYang * 2);
    expect(cardCost({ ...s, cardsPlayedThisTurn: 1 }, card).yang).toBe(card.costYang); // 只翻首张
    const e: Combatant = { ...s.enemies[0]!, def: 0 };
    const bd = resolveDamage(ctxFor(s, card, e), e);
    expect(bd.multipliers.find((m) => m.sourceId === 'term.jingzhe')?.value).toBe(1.5);
  });

  it('春分：调息效率 ×1.5（ceil 取整后确实多产出）', () => {
    expect(regulateYin('chunfen')).toBeGreaterThan(regulateYin('daxue'));
    expect(getRegulateMul(mk({ solarTermId: 'chunfen' }))).toBeCloseTo(1.5, 6);
  });

  it('芒种：本回合攻击牌 <2 张时结束回合自扣血', () => {
    expect(mangzhongHpLoss('mangzhong')).toBeGreaterThan(0);
    expect(mangzhongHpLoss('mangzhong')).toBeGreaterThan(mangzhongHpLoss('daxue'));
  });

  it('大暑：伤害倍率 >1，且治疗/护盾被减半', () => {
    expect(dashuMul('dashu')).toBeGreaterThan(dashuMul('dongzhi'));
    const dashu = mk({ solarTermId: 'dashu' });
    const plain = mk({ solarTermId: 'dongzhi' });
    expect(fireModifyHeal(dashu, 20)).toBe(10);
    expect(fireModifyHeal(dashu, 20)).toBeLessThan(fireModifyHeal(plain, 20));
  });

  it('白露：术法阴炁消耗上升，且出术法后敌人被挂上霜寒', () => {
    const card = CARD_MAP['card_lihuo']!;
    expect(bailuSpellYin('bailu')).toBeGreaterThan(bailuSpellYin('daxue'));

    const s = mk({ solarTermId: 'bailu' });
    const st: BattleState = { ...s, yang: 10, yin: 10, hand: [{ ...card, uid: 'bl1' }] };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'bl1', targetId: st.enemies[0]!.id });
    expect(r.enemies[0]!.statuses.some((x) => x.id === 'frost')).toBe(true);
  });

  it('霜降：暴击倍率被强制为 1.5，且暴击命中时敌人被冻结', () => {
    const sj = mk({ characterId: 'xiewujiu', solarTermId: 'shuangjiang' });
    const dz = mk({ characterId: 'xiewujiu', solarTermId: 'dongzhi' });
    expect(getCritMul(sj)).toBeCloseTo(1.5, 6);
    expect(getCritMul(sj)).toBeLessThan(getCritMul(dz)); // 伤官基线为 2.0

    const target = sj.enemies[0]!;
    const st: BattleState = {
      ...sj,
      yang: 10,
      yin: 10,
      hand: [{ ...CARD_MAP['card_zhanfeng']!, uid: 'sj1' }],
      enemies: sj.enemies.map((e) => (e.id === target.id ? { ...e, statuses: [{ id: 'flaw', stacks: 1, duration: 1 }] } : e)),
    };
    const r = battleReducer(st, { type: 'PLAY_CARD', cardId: 'sj1', targetId: target.id });
    expect(r.enemies.find((e) => e.id === target.id)!.statuses.some((x) => x.id === 'freeze')).toBe(true);
  });

  it('大雪：isForceParry(state) 为 true（格挡无视时机）', () => {
    expect(isForceParry(mk({ solarTermId: 'daxue' }))).toBe(true);
    expect(isForceParry(mk({ solarTermId: 'dongzhi' }))).toBe(false);
  });

  it('冬至：回合开始时较弱的一脉获得补充炁', () => {
    expect(dongzhiYin('dongzhi')).toBeGreaterThan(dongzhiYin('daxue'));

    const s = mk({ solarTermId: 'dongzhi', lunarMonthId: 'zi' });
    const ctx = ctxFor({ ...s, yang: 10, yin: 2 }, null, s.enemies[0]!);
    const qi = fireTurnStart(ctx).find((e) => e.kind === 'gainQi');
    expect(qi && qi.kind === 'gainQi' ? qi.yin ?? 0 : 0).toBeGreaterThan(0);
  });
});

/* ==========================================================================
   A4 · 数据完备性（静态数据扫描，不需要跑战斗）
   ========================================================================== */

/**
 * 节气 hooks 里通过 applyStatus 施加的状态 —— **手工维护**清单。
 * 因为 hooks 是函数，无法像数据表那样静态枚举，只能人肉登记 + 注释说明来源：
 *   - bailu.onDamageDealt       → 'frost'
 *   - shuangjiang.onDamageDealt → 'freeze'
 * 新增节气若引入新状态而忘记登记，本清单的「闭合检查」不会自动发现 —— 这是本检查的已知盲区，
 * 因此**新增节气时必须同步更新这里**。
 */
const HOOK_APPLIED_STATUSES: StatusId[] = ['frost', 'freeze'];

describe('A4 数据完备性（静态扫描）', () => {
  it('A4-1 状态引用闭合：所有情报里的 inflict 都被引擎认识且有探针', () => {
    const referenced = new Set<StatusId>();
    for (const c of CARDS) if (c.inflict) referenced.add(c.inflict.id);
    for (const e of ENEMIES) {
      for (const intent of e.intents) {
        const inf = (intent as { inflict?: { id: StatusId } }).inflict;
        if (inf) referenced.add(inf.id);
      }
    }
    for (const combo of ENCHANT_COMBOS) if (combo.inflict) referenced.add(combo.inflict.id);
    for (const s of HOOK_APPLIED_STATUSES) referenced.add(s);

    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(STATUS_BEHAVIOR[id], `状态 ${id} 未被引擎认识（STATUS_BEHAVIOR 未登记）`).toBeTruthy();
      expect(STATUS_PROBES[id], `状态 ${id} 在 A1 探针表中缺少探针`).toBeTruthy();
    }
  });

  it('A4-2 卡的伤害字段自洽（有倍率必有段数；功能牌必有实效果）', () => {
    for (const c of CARDS) {
      if (c.mul > 0) expect(c.hits, `卡 ${c.id} 有伤害倍率却 hits < 1`).toBeGreaterThanOrEqual(1);
      if (c.kind === 'support') {
        const hasReal = Boolean(c.heal || c.shield || c.draw || c.cleanse || c.gainYang || c.gainYin || c.gainShi);
        expect(hasReal, `功能牌 ${c.id} 没有任何实效果 —— 这是一张打出去什么都不发生的空壳牌`).toBe(true);
      }
    }
  });

  it('A4-3 节气限定牌都有归属', () => {
    for (const c of CARDS) {
      if (c.solarTermOnly) {
        expect(SOLAR_TERM_MAP[c.solarTermOnly], `卡 ${c.id} 指向不存在的节气 ${c.solarTermOnly}`).toBeTruthy();
      }
    }
  });

  it('A4-4 每只心猿至少有一张攻击意图（不允许无威胁的敌人）', () => {
    for (const e of ENEMIES) {
      const hasAttack = e.intents.some((i) => i.type === 'attack' || i.type === 'aoe');
      expect(hasAttack, `敌人 ${e.id} 没有任何攻击/群攻意图 —— 它永远打不死玩家`).toBe(true);
    }
  });

  it('A4-5 每张卡的成本都能被某套装备的炁上限支付', () => {
    const blades: (string | null)[] = [null, ...EQUIPMENT.filter((e) => e.kind === 'blade').map((e) => e.id)];
    const artifacts: (string | null)[] = [null, ...EQUIPMENT.filter((e) => e.kind === 'artifact').map((e) => e.id)];
    for (const b of blades) {
      for (const a of artifacts) {
        const cap = getQiCap({ equipment: [b, a] } as BattleState);
        for (const c of CARDS) {
          expect(c.costYang, `卡 ${c.id} 的阳炁成本 ${c.costYang} 超过上限 ${cap.yang}（组合 ${b}+${a}）`).toBeLessThanOrEqual(cap.yang);
          expect(c.costYin, `卡 ${c.id} 的阴炁成本 ${c.costYin} 超过上限 ${cap.yin}（组合 ${b}+${a}）`).toBeLessThanOrEqual(cap.yin);
        }
      }
    }
  });

  it('A4-6 装备自洽（有炁上限必有侧别；兵刃必须提供攻击加成）', () => {
    for (const e of EQUIPMENT) {
      if (e.qiCapBonus > 0) {
        expect(['yang', 'yin', 'both'], `装备 ${e.id} 声明了 qiCapBonus 却没有合法的 qiCapSide`).toContain(e.qiCapSide);
      }
      if (e.kind === 'blade') {
        expect(e.atkBonus, `兵刃 ${e.id} 未提供任何攻击加成（作为唯一合法 addBase 来源却什么都不加）`).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 【决策① 防回归】角色配色的 var() 引用必须指向 tokens.css 里真实存在的令牌。
   *
   * 为什么必须测：角色 palette 从数据层透传到 SVG 的 fill / stroke 表现属性后，
   * 若引用了**不存在**的 var(--x)，浏览器不会抛错，只会静默走 fallback
   * （角色变透明 / 变黑）—— 类型系统也看不见字符串里的令牌名是否拼错。
   * 这类缺陷「不报错、只静默显示异常」，只有静态扫描能拦，故补这一条断言。
   */
  it('A4-7 角色配色引用的令牌都真实存在于 tokens.css（防拼错令牌名静默失效）', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const tokensCss = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
    // 令牌定义形如 `--color-xxx:`；而 var(--yyy) 里没有冒号，不会被误判成定义
    const defined = new Set([...tokensCss.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
    expect(defined.size, 'tokens.css 未解析到任何令牌，扫描正则可能失配').toBeGreaterThan(0);

    // 数据层（角色 palette）与程序化 SVG 立绘兜底：两处 var() 引用都必须落在令牌集合内
    const consumers: readonly (readonly [string, string])[] = [
      ['src/game/data/actors.ts', actorsSource],
      ['src/components/svg/Figure.tsx', figureSource],
    ];
    for (const [rel, text] of consumers) {
      const used = [...text.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*\)/g)].map((m) => m[1]);
      expect(used.length, `${rel} 未引用任何 var(--*) 令牌（配色铁律可能被绕过）`).toBeGreaterThan(0);
      for (const name of used) {
        expect(
          defined.has(name),
          `${rel} 引用了 tokens.css 中不存在的令牌 ${name} —— 会降级为无色/黑色，静默显示异常`,
        ).toBe(true);
      }
    }
  });
});

/* ==========================================================================
   A5 · 常量关系自检
   ========================================================================== */

describe('A5 常量关系自检', () => {
  it('A5-1 HAND_DRAW_CAP > HAND_LIMIT（否则归墟永不触发）', () => {
    expect(HAND_DRAW_CAP).toBeGreaterThan(HAND_LIMIT);
  });

  it('A5-2 PARRY_TOTAL_MS === PARRY_TELEGRAPH_MS + PARRY_WINDOW_MS', () => {
    expect(PARRY_TOTAL_MS).toBe(PARRY_TELEGRAPH_MS + PARRY_WINDOW_MS);
  });

  it('A5-3 QI_CAP_BASE > 0 且所有卡的成本都不超过它', () => {
    expect(QI_CAP_BASE).toBeGreaterThan(0);
    for (const c of CARDS) {
      expect(c.costYang, `卡 ${c.id} 阳炁成本超过 QI_CAP_BASE`).toBeLessThanOrEqual(QI_CAP_BASE);
      expect(c.costYin, `卡 ${c.id} 阴炁成本超过 QI_CAP_BASE`).toBeLessThanOrEqual(QI_CAP_BASE);
    }
  });
});

/* ==========================================================================
   A6 · 调息（阴阳逆转）—— 引擎与 UI 共用的单一真源 regulateOutcome
   ==========================================================================
   QA 实测的本轮残留缺陷：
     1. UI 用 floor、引擎用 ceil → 春分下界面显示「换得 1 点」而引擎实际给 2 点（界面骗玩家）。
     2. 目标一脉已满时仍扣源炁 → 净亏（扣了阳炁却一点阴炁都加不上）。
     3. 散修（cost=1）+ 春分 → 若收益不与成本夹顶，会「1 阳炁换 2 阴炁」凭空多出炁 → 倒赚
        （违反铁律 4「无代价转换禁止」）。
   根治办法不是「把 UI 也改成 ceil」（下次还会漏），而是把判定收敛到导出的 regulateOutcome。
   ========================================================================== */

describe('A6 调息：单一真源 regulateOutcome（禁止倒赚 / 净亏 / 双真源）', () => {
  /** 以「源炁充足、目标未满」的构造态取一次调息判定 */
  const regFor = (stance: StanceId, term: string) =>
    regulateOutcome({ ...mk({ solarTermId: term }), stance, yang: 10, yin: 0 }, 'yang');

  it('A6-1 三种架势 × 全部已实装节气：收益恒不超过成本（禁止倒赚）', () => {
    for (const st of STANCES) {
      for (const term of IMPLEMENTED_TERMS) {
        const o = regFor(st.id, term.id);
        expect(
          o.gain,
          `架势 ${st.id} / 节气 ${term.id} 的调息收益超过了成本 —— 凭空增炁（违反「无代价转换禁止」）`,
        ).toBeLessThanOrEqual(o.cost);
        expect(o.gain).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('A6-2 目标一脉已满时 canDo === false（禁止净亏），且引擎确实不改 state', () => {
    const s = mk(); // 体修，cost = 2；equipment ['tangdao', null] → yinCap = QI_CAP_BASE
    const toFullYin = { ...s, stance: 'tixiu' as const, yang: 4, yin: s.yinCap };
    const oYang = regulateOutcome(toFullYin, 'yang');
    expect(oYang.canDo).toBe(false);
    expect(oYang.reason).toBe('targetFull');

    const toFullYang = { ...s, stance: 'tixiu' as const, yin: 4, yang: s.yangCap };
    const oYin = regulateOutcome(toFullYang, 'yin');
    expect(oYin.canDo).toBe(false);
    expect(oYin.reason).toBe('targetFull');

    // 净亏的落点：旧代码会「扣掉 2 阳炁、一点阴炁都加不上」，现在必须原样返回
    const r = battleReducer(toFullYin, { type: 'REGULATE', from: 'yang' });
    expect(r.yang).toBe(toFullYin.yang);
    expect(r.yin).toBe(toFullYin.yin);
    expect(r.regulated).toBe(false);
  });

  it('A6-3 春分下体修/法修（cost = 2）的收益严格大于无节气基线（效率提升真正落地）', () => {
    for (const stance of ['tixiu', 'faxiu'] as const) {
      const base = regFor(stance, 'daxue'); // 无 regulateMul 的节气
      const chunfen = regFor(stance, 'chunfen');
      expect(base.cost).toBe(2);
      expect(chunfen.gain).toBeGreaterThan(base.gain);
    }
  });

  it('A6-4 春分下散修（cost = 1）的收益恰好等于成本（不对散修倒赚）', () => {
    const base = regFor('sanxiu', 'daxue');
    const chunfen = regFor('sanxiu', 'chunfen');
    expect(base.cost).toBe(1);
    expect(chunfen.cost).toBe(1);
    expect(base.gain).toBe(1);
    expect(chunfen.gain).toBe(chunfen.cost);
    expect(chunfen.gain).toBe(1);
  });

  it('A6-5 引擎执行结果与 regulateOutcome 完全一致（杜绝双真源再次分家）', () => {
    for (const st of STANCES) {
      for (const term of IMPLEMENTED_TERMS) {
        const s0 = { ...mk({ solarTermId: term.id }), stance: st.id, yang: 10, yin: 0 };
        const o = regulateOutcome(s0, 'yang');
        const r = battleReducer(s0, { type: 'REGULATE', from: 'yang' });
        expect(r.yang, `架势 ${st.id} / 节气 ${term.id}：扣费与 regulateOutcome 不符`).toBe(10 - o.cost);
        expect(r.yin, `架势 ${st.id} / 节气 ${term.id}：收益与 regulateOutcome 不符`).toBe(o.gain);
        expect(r.regulated).toBe(true);
      }
    }
    // 基准兑换比例常量必须真的被引擎用上（本轮「顺手还掉」的一笔零引用债务）
    expect(SUBSTITUTE_RATIO_DEFAULT).toBe(2);
  });

  it('A6-6 目标仅差 1 点满：gain 按剩余容量夹顶，UI 显示即实得（禁止高报）且 gain ≥ 1', () => {
    // 体修（cost=2）+ 春分（mul=1.5）→ 基线 gain=2；目标阴炁「差 1 点满」→ 夹顶后应为 1
    const s = mk({ solarTermId: 'chunfen' });
    const st: BattleState = { ...s, stance: 'tixiu', yang: 10, yin: s.yinCap - 1 };
    const o = regulateOutcome(st, 'yang');
    expect(o.canDo).toBe(true);
    expect(o.reason).toBe('ok');
    expect(o.gain).toBe(1); // 旧实现返回 2 → UI「换得 2 点阴炁」高报 1 点（F2 残留缺陷）

    // 「UI 显示即实得」：引擎执行后的**实际增量**必须等于 regulateOutcome 给出的 gain
    const r = battleReducer(st, { type: 'REGULATE', from: 'yang' });
    expect(r.yin - st.yin).toBe(o.gain);
    expect(r.yin).toBe(st.yinCap); // 夹到上限，未溢出

    // 反方向（阴→阳）同样成立，防止只修一条脉
    const st2: BattleState = { ...s, stance: 'tixiu', yin: 10, yang: s.yangCap - 1 };
    const o2 = regulateOutcome(st2, 'yin');
    expect(o2.gain).toBe(1);
    const r2 = battleReducer(st2, { type: 'REGULATE', from: 'yin' });
    expect(r2.yang - st2.yang).toBe(o2.gain);
    expect(r2.yang).toBe(st2.yangCap);

    // 不变量：targetCur < targetCap ⇒ targetCap − targetCur ≥ 1 ⇒ 夹顶后 gain 仍 ≥ 1（绝不夹出 0）
    expect(o.gain).toBeGreaterThanOrEqual(1);
    expect(o2.gain).toBeGreaterThanOrEqual(1);
  });
});

/* ==========================================================================
   A7 · 炁贯周天的消耗计数必须按「实际差值」计（跨脉替代支付不得误触发）
   ==========================================================================
   历史缺陷：playCard 按**名义成本**累加 spentYangThisTurn / spentYinThisTurn，
   完全没有考虑「跨脉替代支付」。QA 实测：全程 yang === 0、靠阴炁替代支付时，
   spentYangThisTurn 依然涨到 3 → 误触发「炁贯周天」（zhoutianActive === true），
   违反铁律 3「机制不该在条件不满足时启动」。
   ========================================================================== */

describe('A7 炁贯周天：跨脉替代支付时不得误触发', () => {
  it('阳炁全程为 0、靠阴炁替代支付 → spentYangThisTurn === 0 且 zhoutianActive === false', () => {
    // 苏绛雪（法修，替代比例 2:1）：命格不含「正财」—— 否则造成伤害会回炁，
    // 会破坏「阳炁恒为 0」的构造态，测试就不再是对准这个缺陷的。
    const s = createBattleState({
      characterId: 'sujiangxue',
      equipment: ['tangdao', null],
      campaignId: 'camp_3', // 春雷兽 380 血，三下破甲击打不死 → 排除「击杀回阳炁」的干扰
      lunarMonthId: 'shen',
      solarTermId: 'daxue',
      seed: 2024,
    });
    // 破甲击（costYang 1 / costYin 1）+ 阳炁 0：支付时必然走「阴炁替代」路径
    const cards = [0, 1, 2].map((i) => ({ ...CARD_MAP['card_pojiaji']!, uid: `zt${i}` }));
    let st: BattleState = { ...s, yang: 0, yin: 10, hand: cards };

    for (const c of cards) {
      st = battleReducer(st, { type: 'PLAY_CARD', cardId: c.uid!, targetId: st.enemies[0]!.id });
    }

    expect(st.yang).toBe(0); // 全程未用到阳炁
    expect(st.spentYangThisTurn).toBe(0); // 旧代码按名义成本累加 → 此处会涨到 3
    expect(st.zhoutianActive).toBe(false); // 旧代码会误触发「炁贯周天」
  });
});
