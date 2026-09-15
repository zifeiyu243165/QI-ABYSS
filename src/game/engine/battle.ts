/**
 * 战斗状态机
 * reducer 为纯函数：不调用 Math.random / Date.now，随机一律走 state.rngState。
 */

import type {
  BattleState,
  Card,
  DamageContext,
  DamageDealtInfo,
  DamageNumber,
  Effect,
  Enemy,
  QiType,
  StanceId,
  StatusId,
  WuXing,
} from '../types';
import {
  DRAW_PER_TURN,
  EARLY_PARRY_REDUCE,
  ENEMY_SPACING,
  FAXIU_SHENG_COST_MUL,
  FROST_SLOW_COST_CAP,
  FROST_SLOW_COST_PER_STACK,
  GUARD_SHIELD,
  ENEMY_ZONE_Y,
  FLAW_COMBO_THRESHOLD,
  FLAW_COUNTER_THRESHOLD,
  FLAW_DURATION,
  HAND_LIMIT,
  HAND_DRAW_CAP,
  HITSTOP_MAX_MS,
  HITSTOP_MAX_MUL,
  HITSTOP_MIN_MS,
  HITSTOP_WHEN_HURT_MS,
  JIANZOU_SELF_DAMAGE_RATIO,
  PARALYZE_MISS_CAP,
  PARALYZE_MISS_PER_STACK,
  PARRY_COUNTER_MUL,
  PARRY_TELEGRAPH_MS,
  PARRY_TOTAL_MS,
  PARRY_WINDOW_MS,
  PLAYER_ZONE_Y,
  QISHA_COST_MUL,
  REGULATE_RATIO,
  RELIC_QI_GAIN,
  SANXIU_JIANZOU_THRESHOLD,
  SCREEN_CENTER_X,
  SHI_CAP,
  SHILING_COST_DELTA,
  SUBSTITUTE_RATIO_DEFAULT,
  TANCHEN_SHIELD_PER_CARD,
  TANCHEN_STEAL_MIN,
  ULTIMATE_MUL,
  WUSHENG_KAITIAN_STACKS,
  ZHENGYIN_COST_MUL,
  ZHOUTIAN_THRESHOLD,
} from '../constants';
import { CARDS, EQUIPMENT_MAP, findCombo } from '../data/cards';
import { CHARACTER_MAP } from '../data/actors';
import { ENEMY_MAP, CAMPAIGNS } from '../data/actors';
import { LUNAR_MONTH_MAP, STANCES } from '../data/world';
import { SHI_SHEN_MAP } from '../data/world';
import { WU_XING_KE, WU_XING_SHENG } from '../constants';
import {
  applyDefense,
  getEffectiveAtk,
  getHits,
  getQiCap,
  getWeakMul,
  getYinYangDiff,
  monthDefMul,
  resolveDamage,
  resolveKaitian,
} from './damage';
import { assertNever } from './assertNever';
import { chance, rand, shuffle } from './rng';
import {
  fireBattleStart,
  fireCardPlayed,
  fireDamageDealt,
  fireModifyCardCost,
  fireModifyHeal,  fireTurnEnd,
  fireTurnStart,
  getRegulateMul,
  getStealDiscardShield,
  isForceParry,
} from './hooks';

/* ============================== 工具 ============================== */

function clone(s: BattleState): BattleState {
  return structuredClone(s);
}

function pushLog(s: BattleState, text: string): void {
  s.log.push(text);
  if (s.log.length > 40) s.log.shift();
}

function aliveEnemies(s: BattleState): Enemy[] {
  return s.enemies.filter((e) => e.hp > 0);
}

/**
 * 伤害数字的落点。注意：**刻意用全量敌人（含已阵亡者）**——
 * UI 仍会把阵亡敌人留在场上（降透明度 + 灰度），若只按存活者算下标，
 * 数字就会与立绘错位。此处与 BattleScreen 的渲染顺序保持一致。
 */
function enemyPos(s: BattleState, enemyId: string): { x: number; y: number } {
  const list = s.enemies;
  const idx = list.findIndex((e) => e.id === enemyId);
  const n = list.length;
  const x = SCREEN_CENTER_X + (idx - (n - 1) / 2) * ENEMY_SPACING;
  return { x, y: ENEMY_ZONE_Y };
}

function addNumber(
  s: BattleState,
  targetId: string,
  amount: number,
  kind: 'physical' | 'heal' | 'true' | WuXing,
  crit: boolean,
  wuxing?: string,
): void {
  const isPlayer = targetId === s.player.id;
  const pos = isPlayer ? { x: SCREEN_CENTER_X, y: PLAYER_ZONE_Y } : enemyPos(s, targetId);
  s.pendingNumbers.push({
    id: s.pendingNumbers.length + s.turn * 1000 + s.cardsPlayedThisTurn * 17 + 1,
    targetId,
    amount,
    kind: (wuxing ?? kind) as DamageNumber['kind'],
    crit,
    x: pos.x,
    y: pos.y,
  });
}

function hasStatus(c: { statuses: { id: StatusId }[] }, id: StatusId): boolean {
  return c.statuses.some((st) => st.id === id);
}

/** 取某张手牌的实例下标。以 uid 为准（同 id 手牌有多份），兼容旧的按 id 传参。 */
function findCardIndex(s: BattleState, key: string): number {
  return s.hand.findIndex((c) => c.uid === key || c.id === key);
}

/**
 * 每点伤害倍率对应的卡帧毫秒增量。
 * 由卡帧区间常量推导（HITSTOP_* 是唯一数值来源），避免把 80 / 100 / 300 这类手感数字散落在逻辑里。
 */
const HITSTOP_MS_PER_MUL = (HITSTOP_MAX_MS - HITSTOP_MIN_MS) / (HITSTOP_MAX_MUL - 1);

/* ============================== 创建战局 ============================== */

export interface CreateBattleInput {
  characterId: string;
  equipment: [string | null, string | null];
  campaignId: string;
  lunarMonthId: string;
  solarTermId: string;
  seed: number;
}

export function createBattleState(input: CreateBattleInput): BattleState {
  const char = CHARACTER_MAP[input.characterId];
  if (!char) throw new Error(`未知角色 ${input.characterId}`);
  const campaign = CAMPAIGNS.find((c) => c.id === input.campaignId);
  if (!campaign) throw new Error(`未知战役 ${input.campaignId}`);

  // 组卡池：基础牌 + 本局节气限定牌
  let pool = CARDS.filter((c) => !c.solarTermOnly || c.solarTermOnly === input.solarTermId);
  pool = pool.filter((c) => c.mul > 0 || c.heal || c.shield || c.draw || c.cleanse || c.gainShi || c.gainYang || c.gainYin);
  const deck: Card[] = [];
  for (const c of pool) {
    // 每张卡在牌库里两份：id 相同、uid 不同。手牌的一切定位都必须用 uid。
    deck.push({ ...c, uid: `c${deck.length}` });
    deck.push({ ...c, uid: `c${deck.length}` });
  }

  const enemies: Enemy[] = campaign.enemyIds
    .map((id) => ENEMY_MAP[id])
    .filter(Boolean)
    .map((e) => {
      const clone = structuredClone(e);
      // 敌方「势」资源初始化（数据里可能未显式声明）
      clone.shi = clone.shi ?? 0;
      clone.shiCap = clone.shiCap ?? 4;
      return clone;
    });

  const { yang: yangCap, yin: yinCap } = getQiCap({
    equipment: input.equipment,
  } as BattleState);

  const state: BattleState = {
    phase: 'playerTurn',
    turn: 1,
    player: {
      id: 'player',
      name: char.name,
      hp: char.hp,
      maxHp: char.hp,
      shield: 0,
      atk: char.atk,
      def: char.def,
      wuxing: char.wuxing,
      statuses: [],
    },
    characterId: char.id,
    stance: char.stance,
    equipment: [input.equipment[0], input.equipment[1]],
    shi: 0,
    wushengStacks: 0,
    yang: 3,
    yin: 3,
    yangCap,
    yinCap,
    spentYangThisTurn: 0,
    spentYinThisTurn: 0,
    zhoutianActive: false,
    enemies,
    hand: [],
    deck,
    discard: [],
    relicQuota: 0,
    relicDiscarded: 0,
    solarTermId: input.solarTermId,
    lunarMonthId: input.lunarMonthId,
    regulated: false,
    stanceSwitched: false,
    parried: false,
    parryResult: 'none',
    enemyActed: false,
    cardsPlayedThisTurn: 0,
    attackCardsThisTurn: 0,
    lastSpellWuxing: null,
    faxiuChain: 0,
    comboThisTurn: 0,
    counterHitsThisTurn: 0,
    zhengyinUsed: false,
    qishaActive: false,
    zhengcaiUsed: false,
    bonusHits: char.shishen.includes('shishen') ? 2 : 0,
    rngState: input.seed,
    telegraphStartMs: null,
    stats: {
      shishenTriggers: {},
      maxCombo: 0,
      maxCounterHits: 0,
      maxSingleDamage: 0,
      maxSingleDamageLabel: '',
      parryCount: 0,
      perfectParryCount: 0,
      cardsPlayed: 0,
      turnCount: 1,
    },
    log: [],
    pendingNumbers: [],
    pendingHitstopMs: 0,
    pendingParryGlyph: false,
  };

  // 洗牌 + 起手
  const sh = shuffle(state.deck, state.rngState);
  state.deck = sh.result;
  state.rngState = sh.state;

  pushLog(state, `月令：${LUNAR_MONTH_MAP[input.lunarMonthId]?.label ?? input.lunarMonthId}`);

  const s2 = applyEffects(state, fireBattleStart(ctxOf(state)));
  return startPlayerTurn(s2);
}

function ctxOf(s: BattleState): DamageContext {
  return {
    attacker: s.player,
    defender: aliveEnemies(s)[0] ?? s.player,
    card: null,
    cardsPlayedThisTurn: s.cardsPlayedThisTurn,
    comboThisTurn: s.comboThisTurn,
    counterHitsThisTurn: s.counterHitsThisTurn,
    state: s,
  };
}

/* ============================== 抽牌 ============================== */

function drawCards(s: BattleState, count: number): void {
  for (let i = 0; i < count; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) break;
      const sh = shuffle(s.discard, s.rngState);
      s.deck = sh.result;
      s.rngState = sh.state;
      s.discard = [];
    }
    const card = s.deck.pop();
    if (!card) break;
    // 抽牌用的是 HAND_DRAW_CAP 而非 HAND_LIMIT：留出「超限」空间给归墟阶段处理
    if (s.hand.length >= HAND_DRAW_CAP) {
      s.discard.push(card);
      continue;
    }
    s.hand.push(card);

    // 偏财：每次抽牌 20% 概率额外抽 1 张（每回合仅一次）
    if (!s.zhengcaiUsed && CHARACTER_MAP[s.characterId]?.shishen.includes('piancai') && !s.stats.shishenTriggers['piancai_thisTurn']) {
      const c = chance(s.rngState, 0.2);
      s.rngState = c.state;
      if (c.hit) {
        s.stats.shishenTriggers['piancai_thisTurn'] = 1;
        s.stats.shishenTriggers['piancai'] = (s.stats.shishenTriggers['piancai'] ?? 0) + 1;
        pushLog(s, '偏财·意外之财，额外抽 1 张');
        i--; // 再抽一张
      }
    }
  }
}

/* ============================== 费用 ============================== */

export function cardCost(s: BattleState, card: Card): { yang: number; yin: number } {
  let cost = { yang: card.costYang, yin: card.costYin };

  // 节气修改
  cost = fireModifyCardCost(ctxOf(s), card, cost);

  // 土旺滞气：所有术法消耗 +1
  const month = LUNAR_MONTH_MAP[s.lunarMonthId];
  if (month && card.kind === 'spell') cost.yin += month.spellCostDelta;

  // 失令：每回合首张牌消耗 +1
  const char = CHARACTER_MAP[s.characterId];
  if (char && month && WU_XING_KE[month.wuxing] === char.wuxing && s.cardsPlayedThisTurn === 0) {
    cost.yang += SHILING_COST_DELTA;
  }

  // 法修相生：费用减半（比例走 FAXIU_SHENG_COST_MUL 常量；相生表统一用 constants 的 WU_XING_SHENG，
  // 此前这里内联了一份重复的五行相生映射，是典型的「同一事实两处维护」）。
  if (s.stance === 'faxiu' && card.wuxing && s.lastSpellWuxing) {
    if (WU_XING_SHENG[s.lastSpellWuxing] === card.wuxing) {
      cost = { yang: Math.ceil(cost.yang * FAXIU_SHENG_COST_MUL), yin: Math.ceil(cost.yin * FAXIU_SHENG_COST_MUL) };
    }
  }

  // 七杀：击杀后本回合剩余牌费用减半
  if (s.qishaActive) {
    cost = { yang: Math.ceil(cost.yang * QISHA_COST_MUL), yin: Math.ceil(cost.yin * QISHA_COST_MUL) };
  }

  // 正印锁血后消耗翻倍
  if (s.zhengyinUsed) {
    cost = { yang: cost.yang * ZHENGYIN_COST_MUL, yin: cost.yin * ZHENGYIN_COST_MUL };
  }

  return { yang: Math.max(0, cost.yang), yin: Math.max(0, cost.yin) };
}

/** 尝试支付，支持另一脉按 ratio:1 替代 */
function tryPay(s: BattleState, cost: { yang: number; yin: number }, ratio: number): { yang: number; yin: number } | null {
  let y = s.yang;
  let i = s.yin;
  let restY = cost.yang;
  let restI = cost.yin;

  const payY = Math.min(y, restY);
  y -= payY;
  restY -= payY;
  const payI = Math.min(i, restI);
  i -= payI;
  restI -= payI;

  if (restY > 0) {
    const need = restY * ratio;
    if (i >= need) {
      i -= need;
      restY = 0;
    } else return null;
  }
  if (restI > 0) {
    const need = restI * ratio;
    if (y >= need) {
      y -= need;
      restI = 0;
    } else return null;
  }
  if (restY > 0 || restI > 0) return null;
  return { yang: y, yin: i };
}

export function substituteRatio(s: BattleState): number {
  return STANCES.find((st) => st.id === s.stance)?.substituteRatio ?? 2;
}

export function canPlayCard(s: BattleState, card: Card): boolean {
  // 沉默：术法牌不可打出（金吾卫「锁链缠足」的效果落点 —— 此前该状态零实现）
  if (card.kind === 'spell' && hasStatus(s.player, 'silence')) return false;
  const cost = cardCost(s, card);
  return tryPay(s, cost, substituteRatio(s)) !== null;
}

/* ============================== 回合流转 ============================== */

function startPlayerTurn(s: BattleState): BattleState {
  const next = clone(s);
  next.phase = 'playerTurn';
  next.regulated = false;
  next.stanceSwitched = false;
  next.parried = false;
  next.parryResult = 'none';
  next.enemyActed = false;
  next.cardsPlayedThisTurn = 0;
  next.attackCardsThisTurn = 0;
  next.comboThisTurn = 0;
  next.counterHitsThisTurn = 0;
  next.faxiuChain = 0;
  next.spentYangThisTurn = 0;
  next.spentYinThisTurn = 0;
  next.zhoutianActive = false;
  next.qishaActive = false;
  next.zhengcaiUsed = false;
  next.stats.shishenTriggers['piancai_thisTurn'] = 0;
  next.stats.turnCount = next.turn;
  next.pendingNumbers = [];

  // ⚠️ 刻意**不**在这里重置 zhengyinUsed（正印锁血标记）。
  // 玩家受到的致命伤害只可能发生在敌方回合（enemyAct → applyDamageToPlayer），
  // 而 ENEMY_ACT 分支紧接着就会调用 startPlayerTurn —— 若在此清掉，
  // 「触发后消耗翻倍」会被立刻抹除、永远不可达，反而制造出一个新的「无响应机制」。
  // 正确的清除时机在 finishPlayerTurn（玩家回合结束）末尾：语义为
  // 敌方回合触发锁血 → 玩家接下来的那个回合消耗翻倍 → 该回合结束时归位。

  // 得令：每回合自动 +1 阳炁 +1 阴炁
  const char = CHARACTER_MAP[next.characterId];
  const month = LUNAR_MONTH_MAP[next.lunarMonthId];
  if (char && month && char.wuxing === month.wuxing) {
    next.yang = Math.min(next.yangCap, next.yang + 1);
    next.yin = Math.min(next.yinCap, next.yin + 1);
  }

  // 灼烧结算（玩家）—— 刻意保留「保底 1 血」：DOT 不直接击杀玩家，避免读条式暴毙
  const burn = next.player.statuses.find((st) => st.id === 'burn');
  if (burn) {
    const dmg = burn.stacks * 4;
    next.player.hp = Math.max(1, next.player.hp - dmg);
    pushLog(next, `灼烧发作，损失 ${dmg} 点气血`);
  }

  // 灼烧结算（敌方）—— 状态必须双向生效，禁止「只对玩家有效」的单向机制
  for (const e of next.enemies) {
    const eb = e.statuses.find((st) => st.id === 'burn');
    if (eb && e.hp > 0) {
      const dmg = eb.stacks * 4;
      e.hp = Math.max(0, e.hp - dmg);
      pushLog(next, `${e.name} 灼烧发作，损失 ${dmg} 点气血`);
    }
  }

  drawCards(next, DRAW_PER_TURN);

  const after = applyEffects(next, fireTurnStart(ctxOf(next)));
  // 灼烧可能在回合开始杀死最后一个敌人 —— 必须补判胜负，否则胜利会延迟到下一个动作
  return checkEnd(tickStatuses(after));
}

/**
 * 结束玩家回合的**入口**。
 *
 * 若手牌超过 HAND_LIMIT，不直接交给敌方，而是先进入「归墟」阶段 ——
 * 玩家必须亲自挑出多余的牌化掉，才会真正结算回合。
 * 归墟只要求弃掉「超出上限」的那几张，**弃哪几张由玩家权衡**（这是策略点，
 * 也是设计红线里「绝不无脑一键弃光」的落点）。
 */
function endPlayerTurn(s: BattleState): BattleState {
  if (s.hand.length > HAND_LIMIT) {
    const next = clone(s);
    next.phase = 'relic';
    next.relicQuota = s.hand.length - HAND_LIMIT;
    next.relicDiscarded = 0;
    pushLog(next, `手牌超出上限（${s.hand.length}/${HAND_LIMIT}），进入「归墟」——还需化去 ${next.relicQuota} 张`);
    return next;
  }
  return finishPlayerTurn(s);
}

/**
 * 归墟化炁规则 —— 「损有余而补不足」。
 *
 * - 弃 1 张**物理牌**（阳刚之形）→ 得 1 点**阴炁**
 * - 弃 1 张**术法牌**（阴柔之术）→ 得 1 点**阳炁**
 * - 弃 1 张**功能牌**（不阴不阳）→ 补**当前较少**的那一种炁（并列时补阳炁）
 *
 * 设计红线：弃牌绝不能是纯粹损失，否则玩家会强烈挫败 —— 所以每一张都必须换来实打实的炁。
 */
function relicQiOf(s: BattleState, card: Card): { yang: number; yin: number } {
  if (card.kind === 'physical') return { yang: 0, yin: RELIC_QI_GAIN };
  if (card.kind === 'spell') return { yang: RELIC_QI_GAIN, yin: 0 };
  // 功能牌：哪边少补哪边
  return s.yang <= s.yin ? { yang: RELIC_QI_GAIN, yin: 0 } : { yang: 0, yin: RELIC_QI_GAIN };
}

/** 归墟阶段弃置一张牌（cardKey 传手牌 uid） */
function discardForRelic(s: BattleState, cardKey: string): BattleState {
  if (s.phase !== 'relic') return s;
  const idx = findCardIndex(s, cardKey);
  if (idx < 0) return s;

  const next = clone(s);
  const card = next.hand[idx]!;
  // 按「下标」删除：同名同 id 的牌有两份，按 id 过滤会误删
  next.hand.splice(idx, 1);
  next.discard.push(card);

  const qi = relicQiOf(next, card);
  next.yang = Math.min(next.yangCap, next.yang + qi.yang);
  next.yin = Math.min(next.yinCap, next.yin + qi.yin);
  next.relicQuota -= 1;
  next.relicDiscarded += 1;

  const gainCN = [
    qi.yang > 0 ? `+${qi.yang} 阳炁` : '',
    qi.yin > 0 ? `+${qi.yin} 阴炁` : '',
  ].filter(Boolean).join('，');
  // 结算成哪种炁就从实际结果反推，别用 kind 猜（功能牌是自适应的）
  const intoCN = qi.yang > 0 ? '阳' : '阴';
  pushLog(next, `归墟：「${card.name}」化为${intoCN}炁，${gainCN}`);

  if (next.relicQuota <= 0) return finishRelic(next);
  return next;
}

/**
 * 归墟收尾：先让敌方「夺牌」，再把控制权交给敌方。
 *
 * 敌方夺牌是归墟的策略张力所在 —— 弃得越多，对手吃得越饱，
 * 逼玩家权衡「手牌数量」与「喂饱敌人」之间的取舍。
 * 两条夺牌来源：
 *   1. 贪嗔蠹（真实存在的心猿，任何节气都可能遇到）
 *   2. 节气 hook（寒露）—— 节气只能由 hooks.ts 读取，这里走 getStealDiscardShield
 */
function finishRelic(s: BattleState): BattleState {
  const next = clone(s);
  const discarded = next.relicDiscarded;

  if (discarded >= TANCHEN_STEAL_MIN) {
    for (const e of aliveEnemies(next)) {
      if (e.id !== 'enemy_tanchen') continue;
      const gain = discarded * TANCHEN_SHIELD_PER_CARD;
      e.shield += gain;
      pushLog(next, `${e.name} 吞食归墟弃牌，获得 ${gain} 点护盾`);
    }
  }

  const perCard = getStealDiscardShield(next);
  if (perCard > 0 && discarded > 0) {
    for (const e of aliveEnemies(next)) {
      const gain = discarded * perCard;
      e.shield += gain;
      pushLog(next, `寒露肃杀：${e.name} 夺取归墟弃牌，获得 ${gain} 点护盾`);
    }
  }

  next.relicQuota = 0;
  return finishPlayerTurn(next);
}

/** 真正的回合结算（原 endPlayerTurn 主体） */
function finishPlayerTurn(s: BattleState): BattleState {
  const next = clone(s);

  /**
   * 【顺序铁律】先触发 turnEnd 钩子并结算效果，**再**切换相位。
   *
   * 历史缺陷：旧代码先把 `phase` 置为 'enemyTelegraph' 才调用 fireTurnEnd，
   * 而芒种的 onTurnEnd 判断 `ctx.state.phase === 'playerTurn'` → 恒假 →
   * 该节气永远不扣血、永远不打日志（100% 空转）。现在保证钩子执行时相位仍是 'playerTurn'。
   * 自检：全项目 onTurnEnd 只有芒种一处，且改后已不再依赖 phase。
   */
  const after = applyEffects(next, fireTurnEnd(ctxOf(next)));

  // （2）结算完成后再进入敌方前摇
  after.phase = 'enemyTelegraph';
  after.telegraphStartMs = null;

  // 破绽判定：本回合连击数或相克命中达标
  if (after.comboThisTurn >= FLAW_COMBO_THRESHOLD || after.counterHitsThisTurn >= FLAW_COUNTER_THRESHOLD) {
    const targets = aliveEnemies(after);
    if (targets.length > 0) {
      const r = rand(after.rngState);
      after.rngState = r.state;
      const t = targets[Math.floor(r.value * targets.length)]!;
      if (!hasStatus(t, 'flaw')) {
        t.statuses.push({ id: 'flaw', stacks: 1, duration: FLAW_DURATION });
      }
      pushLog(after, `${t.name} 露出了破绽！`);
    }
  }

  // 剑走偏锋：回合结束自损当前血量的固定比例（比例与差值上限均走常量，不留魔法数字）
  if (after.stance === 'sanxiu') {
    const diff = getYinYangDiff(after); // 已按 SANXIU_DIFF_CAP 夹顶
    if (diff >= SANXIU_JIANZOU_THRESHOLD) {
      const self = Math.floor(after.player.hp * JIANZOU_SELF_DAMAGE_RATIO);
      after.player.hp = Math.max(1, after.player.hp - self);
      pushLog(after, `剑走偏锋反噬，自损 ${self} 点气血`);
    }
  }

  // 正印锁血标记必须**在这里**（玩家回合结束）清除，而不是 startPlayerTurn：
  // 致命伤害只发生在敌方回合，其紧接的 startPlayerTurn 会立刻把它清掉，
  // 导致「触发后消耗翻倍」永远不可达。放在回合结束则语义为：
  // 敌方回合触发锁血 → 玩家接下来的那个回合消耗翻倍 → 该回合结束时归位。
  after.zhengyinUsed = false;

  return after;
}

function tickStatuses(s: BattleState): BattleState {
  const next = clone(s);
  for (const st of next.player.statuses) {
    if (st.duration > 0) st.duration -= 1;
  }
  next.player.statuses = next.player.statuses.filter((st) => st.duration !== 0);
  for (const e of next.enemies) {
    for (const st of e.statuses) {
      if (st.duration > 0) st.duration -= 1;
    }
    e.statuses = e.statuses.filter((st) => st.duration !== 0);
  }
  return next;
}

/* ============================== 出牌 ============================== */

function playCard(s: BattleState, cardKey: string, targetId?: string): BattleState {
  const idx = findCardIndex(s, cardKey);
  if (idx < 0) return s;
  const card = s.hand[idx]!;

  // 沉默：术法牌被封（与 canPlayCard 同源校验，防止绕过 UI 直接 dispatch）
  if (card.kind === 'spell' && hasStatus(s.player, 'silence')) return s;

  const cost = cardCost(s, card);
  // 【历史缺陷｜消耗计数失真】此前这里按**名义成本**累加：
  //   next.spentYangThisTurn += Math.min(cost.yang, next.yang + cost.yang);
  // 它完全没有考虑「跨脉替代支付」—— 当阳炁全程为 0、靠阴炁替代支付时，
  // 名义成本仍是 cost.yang > 0，于是 spentYangThisTurn 会一路涨到 3，
  // 误触发「炁贯周天」（zhoutianActive = true），违反铁律 3「机制不该在条件不满足时启动」。
  // 现在改为按「支付前后的实际差值」计：替代支付扣的是另一脉，这里就记为 0。
  // beforeYang / beforeYin 必须取自**进入 playCard 时的 s**（支付前），
  // 且此刻 s.yang / s.yin 尚未被本函数改动过（它们是只读入参）。
  const beforeYang = s.yang;
  const beforeYin = s.yin;
  const paid = tryPay(s, cost, substituteRatio(s));
  if (!paid) return s;

  const next = clone(s);
  next.yang = paid.yang;
  next.yin = paid.yin;
  next.spentYangThisTurn += beforeYang - paid.yang;
  next.spentYinThisTurn += beforeYin - paid.yin;
  next.hand.splice(idx, 1);
  next.discard.push(card);
  next.cardsPlayedThisTurn += 1;
  next.stats.cardsPlayed += 1;

  const isAttack = card.kind === 'physical' || card.kind === 'spell';
  if (isAttack && card.mul > 0) next.attackCardsThisTurn += 1;

  // 炁贯周天：双脉各消耗 ≥3
  if (
    !next.zhoutianActive &&
    next.spentYangThisTurn >= ZHOUTIAN_THRESHOLD &&
    next.spentYinThisTurn >= ZHOUTIAN_THRESHOLD
  ) {
    next.zhoutianActive = true;
    pushLog(next, '炁贯周天！本回合全属性 +10%，抽 1 张牌');
    drawCards(next, 1);
  }

  pushLog(next, `打出「${card.name}」`);

  // ---- 结算效果 ----
  if (card.heal) {
    const amount = fireModifyHeal(next, card.heal);
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + amount);
    addNumber(next, next.player.id, amount, 'heal', false);
    pushLog(next, `回复 ${amount} 点气血`);
  }

  if (card.shield) {
    // 月令土旺：护盾 +30%（此前 defMul 字段被引擎零读取，是空声明）
    const amount = Math.floor(fireModifyHeal(next, card.shield) * monthDefMul(next));
    next.player.shield += amount;
    pushLog(next, `获得 ${amount} 点护盾`);
  }

  if (card.gainYang) next.yang = Math.min(next.yangCap, next.yang + card.gainYang);
  if (card.gainYin) next.yin = Math.min(next.yinCap, next.yin + card.gainYin);

  // 麻痹：攻击牌有概率落空（每层 30%，上限 75%）—— 状态必须双向生效，此前该状态零实现
  let missed = false;
  const paraStacks = next.player.statuses.find((st) => st.id === 'paralyze')?.stacks ?? 0;
  if (paraStacks > 0 && (card.kind === 'physical' || card.kind === 'spell')) {
    const missChance = Math.min(PARALYZE_MISS_CAP, paraStacks * PARALYZE_MISS_PER_STACK);
    const r = rand(next.rngState);
    next.rngState = r.state;
    if (r.value < missChance) {
      missed = true;
      pushLog(next, `麻痹发作，「${card.name}」落空`);
    }
  }

  if (!missed && card.mul > 0 && (card.kind === 'physical' || card.kind === 'spell')) {
    dealCardDamage(next, card, targetId);
  }

  if (card.inflict) {
    const targets = card.aoe ? aliveEnemies(next) : aliveEnemies(next).filter((e) => e.id === targetId).slice(0, 1);
    for (const t of targets) {
      const cur = next.enemies.find((e) => e.id === t.id);
      if (!cur) continue;
      const ex = cur.statuses.find((st) => st.id === card.inflict!.id);
      if (ex) ex.stacks += card.inflict!.stacks;
      else cur.statuses.push({ id: card.inflict!.id, stacks: card.inflict!.stacks, duration: card.inflict!.duration });
    }
  }

  if (card.draw) drawCards(next, card.draw);

  // 净心咒：驱散自身全部负面状态（此前 desc 声明了驱散，引擎零实现 → 空壳牌）
  if (card.cleanse && next.player.statuses.length > 0) {
    const removed = next.player.statuses.length;
    next.player.statuses = [];
    pushLog(next, `净心：驱散 ${removed} 种负面状态`);
  }

  // 立春·破土：直接获得「势」（体修核心资源；非体修架势下无「势」概念，不生效）
  if (card.gainShi) {
    if (next.stance === 'tixiu') {
      const before = next.shi;
      next.shi = Math.min(SHI_CAP, next.shi + card.gainShi);
      if (next.shi > before) pushLog(next, `破土：获得 ${next.shi - before} 层「势」`);
    } else {
      pushLog(next, '「势」为体修专属资源，当前架势下不生效');
    }
  }

  // 架势相关
  if (card.kind === 'physical') {
    if (next.stance === 'tixiu') next.shi = Math.min(SHI_CAP, next.shi + 1);
    const blades = next.equipment.filter((id) => id && EQUIPMENT_MAP[id]?.kind === 'blade').length;
    if (blades >= 2) next.wushengStacks += 1;
  }
  // 法修·相生链维护。**必须在伤害结算之后**：dealCardDamage 会读取 state.faxiuChain
  // 作为「当前是第几环」，若在结算前就自增，读到的是错误的环数。
  if (card.wuxing) {
    const prev = next.lastSpellWuxing;
    if (next.stance === 'faxiu' && prev && WU_XING_SHENG[prev] === card.wuxing) {
      next.faxiuChain += 1;
    } else {
      next.faxiuChain = 0;
    }
    next.lastSpellWuxing = card.wuxing;
  }

  // 正财：造成伤害后 +1 阳 +1 阴
  if (!next.zhengcaiUsed && CHARACTER_MAP[next.characterId]?.shishen.includes('zhengcai') && card.mul > 0) {
    next.zhengcaiUsed = true;
    next.yang = Math.min(next.yangCap, next.yang + 1);
    next.yin = Math.min(next.yinCap, next.yin + 1);
    next.stats.shishenTriggers['zhengcai'] = (next.stats.shishenTriggers['zhengcai'] ?? 0) + 1;
    pushLog(next, '正财·生财有道，获得 1 阳炁 + 1 阴炁');
  }

  const afterHook = applyEffects(next, fireCardPlayed(ctxOf(next), card));
  return checkEnd(afterHook);
}

function dealCardDamage(s: BattleState, card: Card, targetId?: string): void {
  const targets = card.aoe ? aliveEnemies(s) : [aliveEnemies(s).find((e) => e.id === targetId) ?? aliveEnemies(s)[0]];
  if (targets.length === 0 || !targets[0]) return;

  // 破绽：下回合首张攻击牌必定暴击且转真实伤害
  const first = targets[0];
  const hasFlaw = hasStatus(first, 'flaw');
  if (hasFlaw && !card.aoe) {
    first.statuses = first.statuses.filter((st) => st.id !== 'flaw');
    pushLog(s, `击中破绽！${first.name} 受到真实伤害`);
  }

  // 体修 10 层：破军 —— 攻击 × 层数的真实伤害
  if (s.stance === 'tixiu' && s.shi >= SHI_CAP && card.kind === 'physical') {
    const dmg = resolveTrueShi(s);
    applyDamageToEnemy(s, first.id, dmg, 'physical');
    s.shi = 0;
    pushLog(s, `破军！造成 ${dmg} 点真实伤害`);
    s.pendingHitstopMs = 300;
    return;
  }

  // 纯阳武圣 50 层：开天
  if (s.wushengStacks >= WUSHENG_KAITIAN_STACKS && card.kind === 'physical') {
    const dmg = resolveKaitian(s);
    applyDamageToEnemy(s, first.id, dmg, 'physical');
    s.wushengStacks = 0;
    pushLog(s, `【开天】！${dmg} 点纯粹白字伤害`);
    s.pendingHitstopMs = 300;
    return;
  }

  const hits = getHits(s, card);
  const shishenHits = CHARACTER_MAP[s.characterId]?.shishen.includes('shishen') ?? false;
  const perHitMul = shishenHits ? 0.8 : 1;

  /** 逐次命中收集的事实快照：让 onDamageDealt 对「每个被打中的目标」单独响应 */
  const hitsInfo: DamageDealtInfo[] = [];

  for (const t of targets) {
    const ctx: DamageContext = {
      attacker: s.player,
      defender: t,
      card,
      cardsPlayedThisTurn: s.cardsPlayedThisTurn,
      comboThisTurn: s.comboThisTurn,
      counterHitsThisTurn: s.counterHitsThisTurn,
      state: s,
    };
    const bd = resolveDamage(ctx, t, {
      forceCrit: hasFlaw,
      isTrue: hasFlaw,
      extraMul: perHitMul,
      extraLabel: shishenHits ? '食神·多段' : undefined,
    });

    const perHit = bd.final;
    const total = perHit * hits;
    applyDamageToEnemy(s, t.id, total, card.wuxing ?? 'physical', bd.crit);
    hitsInfo.push({ amount: total, targetId: t.id, crit: bd.crit, isTrue: bd.isTrue });

    s.comboThisTurn += hits;

    // 五行相克：命中计数
    if (card.wuxing && t.wuxing && WU_XING_KE[card.wuxing] === t.wuxing) {
      s.counterHitsThisTurn += 1;
    }

    // 法修·相克：打断敌方蓄力 + 附加虚弱（与上面的相克命中计数是两件事，不重复计数）
    if (s.stance === 'faxiu' && card.kind === 'spell' && card.wuxing && t.wuxing && WU_XING_KE[card.wuxing] === t.wuxing) {
      const cur = s.enemies.find((x) => x.id === t.id);
      if (cur) {
        if (cur.chargeStacks > 0) {
          pushLog(s, `五行相克：${cur.name} 蓄势被打断（清空 ${cur.chargeStacks} 层）`);
          cur.chargeStacks = 0;
        }
        const ex = cur.statuses.find((st) => st.id === 'weak');
        if (ex) ex.stacks += 1;
        else cur.statuses.push({ id: 'weak', stacks: 1, duration: 2 });
      }
    }

    // 卡帧时长：由 HITSTOP_MIN/MAX_MS 与 HITSTOP_MAX_MUL 推导并夹顶（不再写死 100/300/80）
    s.pendingHitstopMs = Math.max(
      s.pendingHitstopMs,
      Math.min(
        HITSTOP_MAX_MS,
        Math.max(HITSTOP_MIN_MS, HITSTOP_MIN_MS + Math.floor((bd.totalMul - 1) * HITSTOP_MS_PER_MUL)),
      ),
    );

    if (total > s.stats.maxSingleDamage) {
      s.stats.maxSingleDamage = total;
      const labels = bd.multipliers.map((m) => m.label).filter(Boolean).join('·');
      s.stats.maxSingleDamageLabel = `${card.name}${labels ? '（' + labels + '）' : ''}`;
    }
  }

  // 附魔：兵刃 + 法器 → 两段伤害
  const combo = findCombo(s.equipment[0], s.equipment[1]) ?? findCombo(s.equipment[1], s.equipment[0]);
  if (combo && card.kind === 'physical') {
    const atk = getEffectiveAtk(s);
    const rawEnchant = Math.floor(atk.effectiveAtk * card.mul * combo.mul);
    const enchTarget = s.enemies.find((e) => e.id === targets[0]!.id);
    const enchantDmg = enchTarget ? applyDefense(rawEnchant, enchTarget, monthDefMul(s)) : rawEnchant;
    applyDamageToEnemy(s, targets[0]!.id, enchantDmg, combo.wuxing);
    if (combo.inflict) {
      const cur = s.enemies.find((e) => e.id === targets[0]!.id);
      if (cur) cur.statuses.push({ ...combo.inflict, duration: combo.inflict.duration });
    }
    pushLog(s, `${combo.skillName}！附魔 ${enchantDmg} 点伤害`);
    // 附魔段不是暴击命中的「主体」，crit 记 false（霜降不会因附魔而冻结）
    hitsInfo.push({ amount: enchantDmg, targetId: targets[0]!.id, crit: false, isTrue: false });
  }

  s.stats.maxCombo = Math.max(s.stats.maxCombo, s.comboThisTurn);
  s.stats.maxCounterHits = Math.max(s.stats.maxCounterHits, s.counterHitsThisTurn);

  // 逐次命中触发 onDamageDealt：多目标 / 多段攻击时，每个被打中的目标都能正确响应
  // （霜降只冻结「被暴击命中的那个敌人」，白露只给「被命中的那个敌人」挂霜寒）。
  //
  // 【历史缺陷｜钩子看不到牌】此前这里用的是 `ctxOf(s)`，而 ctxOf 把 card 设成了 null ——
  // 于是 onDamageDealt 无法判断「这是不是一张术法牌」，白露只能退而求其次挂在
  // 「出牌即触发」的 onCardPlayed 上（既锁错目标，又会被 mul=0 的纯治疗牌误触发）。
  // 现在构造一个**带 card 的 ctx** 再逐次触发，命中事实与牌面信息同时可见。
  const hitCtx: DamageContext = { ...ctxOf(s), card };
  for (const hit of hitsInfo) {
    applyEffects(s, fireDamageDealt(hitCtx, hit));
  }
}

function resolveTrueShi(s: BattleState): number {
  const atk = getEffectiveAtk(s);
  return Math.floor(atk.effectiveAtk * s.shi);
}

/* ============================== 伤害应用 ============================== */

/**
 * 应用最终伤害到敌人：只做「护盾吸收 + 扣血」。
 *
 * 【铁律】防御减伤必须由调用方在传入前用 applyDefense() 完成 —— 本函数绝不自行减伤。
 * 历史缺陷：此处曾再减一次伤，且用的是未削防的原始 e.def、硬编码 120（绕过 DEFENSE_SOFTENING），
 * 导致实际伤害被重复压低、破甲在第二层完全失效。
 */
function applyDamageToEnemy(
  s: BattleState,
  enemyId: string,
  finalDamage: number,
  kind: string,
  crit = false,
): void {
  const e = s.enemies.find((x) => x.id === enemyId);
  if (!e || e.hp <= 0) return;

  let dmg = Math.max(1, Math.floor(finalDamage));

  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    dmg -= absorbed;
  }
  e.hp = Math.max(0, e.hp - dmg);
  addNumber(s, enemyId, dmg, 'physical', crit, kind);

  if (e.hp === 0) {
    pushLog(s, `${e.name} 被斩除`);
    // 七杀：击杀后本回合剩余牌费用减半
    if (CHARACTER_MAP[s.characterId]?.shishen.includes('qisha')) {
      s.qishaActive = true;
      s.stats.shishenTriggers['qisha'] = (s.stats.shishenTriggers['qisha'] ?? 0) + 1;
      pushLog(s, '七杀·连锁，本回合剩余牌费用减半');
    }
    // 击杀获得阳炁
    s.yang = Math.min(s.yangCap, s.yang + 2);
  }
}

function applyDamageToPlayer(s: BattleState, amount: number): void {
  let dmg = Math.max(1, Math.floor(amount));
  if (s.player.shield > 0) {
    const absorbed = Math.min(s.player.shield, dmg);
    s.player.shield -= absorbed;
    dmg -= absorbed;
  }

  const nextHp = s.player.hp - dmg;

  // 正印：每回合首次受致命伤害锁血 1 点
  if (
    nextHp <= 0 &&
    !s.zhengyinUsed &&
    CHARACTER_MAP[s.characterId]?.shishen.includes('zhengyin')
  ) {
    s.zhengyinUsed = true;
    s.player.hp = 1;
    s.stats.shishenTriggers['zhengyin'] = (s.stats.shishenTriggers['zhengyin'] ?? 0) + 1;
    pushLog(s, '正印·护命，气血锁定为 1（你接下来的那个回合消耗翻倍）');
    addNumber(s, s.player.id, 0, 'heal', false);
    return;
  }

  s.player.hp = Math.max(0, nextHp);
  addNumber(s, s.player.id, dmg, 'physical', false);
  // 受击顿帧：此前只有「玩家打人」才有顿帧，挨打完全没有反馈
  s.pendingHitstopMs = Math.max(s.pendingHitstopMs, HITSTOP_WHEN_HURT_MS);

  // 受击获得阴炁（卖血换蓝）
  s.yin = Math.min(s.yinCap, s.yin + 1);
}

/* ============================== 弹反 ============================== */

export function judgeParry(elapsedMs: number): 'perfect' | 'early' | 'miss' {
  if (elapsedMs < PARRY_TELEGRAPH_MS) return 'early';
  if (elapsedMs <= PARRY_TELEGRAPH_MS + PARRY_WINDOW_MS) return 'perfect';
  return 'miss';
}

export function parryTelegraphRatio(): number {
  return PARRY_TELEGRAPH_MS / PARRY_TOTAL_MS;
}

function doParry(s: BattleState, elapsedMs: number): BattleState {
  const next = clone(s);
  const forced = isForceParry(next);
  const result = forced ? 'perfect' : judgeParry(elapsedMs);

  next.parried = true;
  next.parryResult = result;
  next.stats.parryCount += 1;

  if (result === 'perfect') {
    next.stats.perfectParryCount += 1;
    next.pendingParryGlyph = true;
    next.yin = Math.min(next.yinCap, next.yin + 1);
    pushLog(next, forced ? '大雪·自动弹反！' : '完美弹反！伤害全额免疫');

    // 追击：无消耗反击，攻击 × 0.5
    const targets = aliveEnemies(next);
    if (targets[0]) {
      const atk = getEffectiveAtk(next);
      const rawCounter = Math.floor(atk.effectiveAtk * PARRY_COUNTER_MUL);
      const dmg = applyDefense(rawCounter, targets[0], monthDefMul(next));
      applyDamageToEnemy(next, targets[0].id, dmg, 'physical');
      pushLog(next, `追击造成 ${dmg} 点伤害`);
    }
  } else if (result === 'early') {
    pushLog(next, '格挡过早，仅减免部分伤害');
  }
  return checkEnd(next);
}

/* ============================== 敌方行动 ============================== */

function enemyAct(s: BattleState): BattleState {
  if (s.enemyActed) return s;
  const next = clone(s);
  next.enemyActed = true;

  const actors = next.enemies.filter((e) => e.hp > 0);

  /**
   * 弹反额度：一次弹反只抵消**一记**攻击。
   *
   * 此前 `parryResult` 是全局单值且每只敌人都读它 —— camp_4 三只敌人一起出手时，
   * 玩家点一次「格挡」会把三刀全部免疫（配合大雪节气的 forceParry 就是「无条件
   * 无敌 + 满血通关」）。现改为一次性额度，抵消一记后其余攻击照常结算。
   * 不可弹反的招式（parryable === false）不消耗额度，额度留给真正能弹的那一记。
   */
  let parryBudget = next.parryResult === 'none' ? 0 : 1;

  for (const e of actors) {
    if (hasStatus(e, 'freeze')) {
      pushLog(next, `${e.name} 被冻结，无法行动`);
      continue;
    }

    // 用 (turn - 1)：保证第一回合执行 intents[0]，否则开局会落在「蓄势」上造成敌人不出手
    const intent = e.intents[(next.turn - 1) % e.intents.length];
    if (!intent) continue;
    e.currentIntent = intent;

    // 麻痹：每层 30% 概率本次招式落空（上限 75%）—— 此前 paralyze 是纯粹的「无响应状态」
    const paraStacks = e.statuses.find((st) => st.id === 'paralyze')?.stacks ?? 0;
    if (paraStacks > 0) {
      const missChance = Math.min(PARALYZE_MISS_CAP, paraStacks * PARALYZE_MISS_PER_STACK);
      const roll = rand(next.rngState);
      next.rngState = roll.state;
      if (roll.value < missChance) {
        pushLog(next, `${e.name} 麻痹发作，「${intent.label}」落空`);
        continue;
      }
    }

    /**
     * 敌方「势」资源：不足则本回合只能「回气」，无法出招 —— 让敌人也有资源博弈。
     * 霜寒·减速：每层为招式增加 1 点「势」消耗（上限 +2）→ 出招更贵、更慢，
     * 势不足时只能回气蓄势（已有的真实机制），所以「减速」有真实落点。
     */
    const frostStacks = e.statuses.find((st) => st.id === 'frost')?.stacks ?? 0;
    const slow = Math.min(FROST_SLOW_COST_CAP, frostStacks * FROST_SLOW_COST_PER_STACK);
    const cost = (intent.cost ?? 0) + slow;
    if (cost > 0 && e.shi < cost) {
      e.shi = Math.min(e.shiCap, e.shi + 1);
      const slowTag = slow > 0 ? `（霜寒减速 +${slow}）` : '';
      pushLog(next, `${e.name} 炁势未聚，回气蓄势（势 ${e.shi}/${e.shiCap}）${slowTag}`);
      continue;
    }
    if (cost > 0) e.shi -= cost;

    switch (intent.type) {
      case 'guard': {
        const gain = intent.selfShield ?? GUARD_SHIELD;
        e.shield += gain;
        pushLog(next, `${e.name} 进入防御姿态，获得 ${gain} 点护盾`);
        continue;
      }

      case 'buff': {
        if (intent.selfCharge) {
          e.chargeStacks += intent.selfCharge;
          pushLog(next, `${e.name} 「${intent.label}」，蓄势 +${intent.selfCharge}（现 ${e.chargeStacks} 层）`);
        }
        if (intent.selfShield) {
          e.shield += intent.selfShield;
          pushLog(next, `${e.name} 「${intent.label}」，获得 ${intent.selfShield} 点护盾`);
        }
        e.shi = Math.min(e.shiCap, e.shi + 1);
        continue;
      }

      case 'charge': {
        e.chargeStacks += 1;
        pushLog(next, `${e.name} 蓄势，下一击伤害 ×${1 + e.chargeStacks}`);
        continue;
      }

      case 'debuff': {
        if (intent.inflict) {
          const ex = next.player.statuses.find((st) => st.id === intent.inflict!.id);
          if (ex) ex.stacks += intent.inflict.stacks;
          else next.player.statuses.push({ ...intent.inflict });
          pushLog(next, `${e.name} 「${intent.label}」，你被施加了状态`);
        }
        // 「夺炁」：直接抽走玩家的阳炁 / 阴炁。用 Math.max(0, ...) 夹住，绝不为负；
        // 日志必须如实反映**实际抽走**的量（玩家该脉为 0 就不谎称抽了 2）。
        if (intent.qiDrain) {
          const yangDrain = Math.min(next.yang, intent.qiDrain.yang ?? 0);
          const yinDrain = Math.min(next.yin, intent.qiDrain.yin ?? 0);
          next.yang -= yangDrain;
          next.yin -= yinDrain;
          // 【历史缺陷｜无意义日志】玩家双脉皆空时抽走量为 0，旧代码照样打印
          // 「抽走你 0 阳炁 0 阴炁」—— 一条什么都没发生的日志会被误读成「机制生效了」。
          // 现在只有在真的抽到东西（总量 > 0）时才打印原文，否则打印一条如实说明。
          if (yangDrain + yinDrain > 0) {
            pushLog(next, `${e.name} 使用「夺炁」，抽走你 ${yangDrain} 阳炁 ${yinDrain} 阴炁`);
          } else {
            pushLog(next, `${e.name} 使用「夺炁」，但你的炁已空，无从抽取`);
          }
        }
        e.shi = Math.min(e.shiCap, e.shi + 1);
        continue;
      }

      case 'attack':
      case 'aoe': {
        // 攻击 / 群攻：蓄力层数在此结算（旧版 charge 只加 e.atk，而伤害走 intent.damage，等于空转）
        const baseDamage = intent.damage;
        // 虚弱：攻击方伤害下降 —— 敌人也必须读到 weak，否则打给敌人的虚弱是单向无效机制
        const weakMul = getWeakMul(e);
        const raw = Math.floor(baseDamage * (1 + e.chargeStacks) * weakMul);
        if (weakMul < 1) pushLog(next, `${e.name} 因虚弱，攻势受阻`);
        if (e.chargeStacks > 0) {
          pushLog(next, `${e.name} 倾泻蓄势之力！`);
          e.chargeStacks = 0;
        }

        // 弹反：intent.parryable === false 的招式无视弹反结果
        const parryable = intent.parryable !== false;
        let dmg = raw;
        let parried = false;
        if (parryable && parryBudget > 0) {
          parryBudget -= 1;
          parried = true;
          if (next.parryResult === 'perfect') {
            dmg = 0;
          } else if (next.parryResult === 'early') {
            dmg = Math.floor(dmg * EARLY_PARRY_REDUCE);
          }
        }

        if (dmg > 0) {
          applyDamageToPlayer(next, dmg);
          const suffix = parried && next.parryResult === 'early' ? '（已被格挡减免）' : '';
          pushLog(next, `${e.name} 使用「${intent.label}」，造成 ${dmg} 点伤害${suffix}`);
          if (intent.inflict) {
            const ex = next.player.statuses.find((st) => st.id === intent.inflict!.id);
            if (ex) ex.stacks += intent.inflict.stacks;
            else next.player.statuses.push({ ...intent.inflict });
          }
        } else {
          pushLog(next, `${e.name} 的「${intent.label}」被完全弹反`);
        }
        break;
      }

      default:
        // 新增一种意图类型却没写处理分支 → 这里编译失败（assertNever 收窄到 never）
        return assertNever(intent, '敌人意图类型');
    }
  }

  next.turn += 1;
  return checkEnd(next);
}

/* ============================== 效果队列 ============================== */

/** 单个效果的处理函数类型（按 kind 分派） */
type EffectHandler<K extends Effect['kind']> = (s: BattleState, eff: Extract<Effect, { kind: K }>) => void;

/**
 * 效果处理器穷尽映射表。
 *
 * 用 `{ [K in Effect['kind']]: EffectHandler<K> }` 约束后，将来给 `Effect` 联合新增一种
 * kind 却没有补 handler → `tsc -b` 直接报错。这比 switch + default 更硬：
 * switch 容易被写成 `default: break` 而静默吞掉新类型。
 *
 * 语义与改造前的 switch 逐字一致（原地修改 s）。
 */
const EFFECT_HANDLERS: { [K in Effect['kind']]: EffectHandler<K> } = {
  damage: (s, eff) => {
    const t = aliveEnemies(s).find((e) => e.id === eff.targetId);
    if (!t) return;
    const atk = getEffectiveAtk(s);
    const raw = Math.floor(atk.effectiveAtk * eff.mul);
    const dmg = eff.isTrue ? raw : applyDefense(raw, t, monthDefMul(s));
    applyDamageToEnemy(s, eff.targetId, dmg, eff.wuxing ?? 'physical');
  },
  flatDamage: (s, eff) => {
    const t = aliveEnemies(s).find((e) => e.id === eff.targetId);
    if (!t) return;
    applyDamageToEnemy(s, eff.targetId, applyDefense(eff.amount, t, monthDefMul(s)), eff.wuxing ?? 'physical');
  },
  heal: (s, eff) => {
    const amount = fireModifyHeal(s, eff.amount);
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + amount);
    addNumber(s, s.player.id, amount, 'heal', false);
  },
  shield: (s, eff) => {
    s.player.shield += Math.floor(fireModifyHeal(s, eff.amount) * monthDefMul(s));
  },
  gainQi: (s, eff) => {
    if (eff.yang) s.yang = Math.min(s.yangCap, s.yang + eff.yang);
    if (eff.yin) s.yin = Math.min(s.yinCap, s.yin + eff.yin);
  },
  draw: (s, eff) => {
    drawCards(s, eff.count);
  },
  applyStatus: (s, eff) => {
    const e = s.enemies.find((x) => x.id === eff.targetId);
    if (!e) return;
    const ex = e.statuses.find((st) => st.id === eff.status);
    if (ex) ex.stacks += eff.stacks;
    else e.statuses.push({ id: eff.status, stacks: eff.stacks, duration: eff.duration });
  },
  cleanse: (s) => {
    s.player.statuses = [];
  },
  markFlaw: (s, eff) => {
    const e = s.enemies.find((x) => x.id === eff.targetId);
    if (e && !hasStatus(e, 'flaw')) e.statuses.push({ id: 'flaw', stacks: 1, duration: FLAW_DURATION });
  },
  selfDamage: (s, eff) => {
    s.player.hp = Math.max(1, s.player.hp - eff.amount);
    addNumber(s, s.player.id, eff.amount, 'physical', false);
  },
  log: (s, eff) => {
    pushLog(s, eff.text);
  },
};

/**
 * 效果队列结算（原地修改 s 并返回同一引用）。
 *
 * 注：早期版本带 cascaded 数组与 MAX_CASCADE_DEPTH 递归保护，但从来没有任何分支
 * 往 cascaded 里 push —— 整段是死代码（防死循环的「保护」实际上不存在）。已移除。
 */
function applyEffects(s: BattleState, effects: Effect[]): BattleState {
  if (effects.length === 0) return s;

  for (const eff of effects) {
    // 映射类型 + 联合收窄无法一步调用，这里用最小断言：按 kind 取到的就是该 kind 的处理器。
    const handler = EFFECT_HANDLERS[eff.kind] as (s2: BattleState, e: Effect) => void;
    handler(s, eff);
  }

  return s;
}

/* ============================== 胜负 ============================== */

function checkEnd(s: BattleState): BattleState {
  if (s.phase === 'won' || s.phase === 'lost') return s;
  if (s.player.hp <= 0) {
    s.phase = 'lost';
    pushLog(s, '你倒下了……');
    return s;
  }
  if (aliveEnemies(s).length === 0) {
    s.phase = 'won';
    pushLog(s, '心猿已除，炁归周天。');
    return s;
  }
  return s;
}

/* ============================== 奥义卡 ============================== */

/** 两张同属性牌 → 奥义卡（运行时产物，不占卡表） */
export function canFuse(a: Card, b: Card): boolean {
  if (a.id === b.id) return false;
  const keyOf = (c: Card) => (c.kind === 'physical' ? 'physical' : (c.wuxing ?? c.kind));
  return keyOf(a) === keyOf(b);
}

export function fuseCards(a: Card, b: Card): Card {
  // 此前只继承 mul / inflict，导致「聚炁 + 回气丹」这类纯功能牌融合后
  // mul=0 且不带任何抽牌/回炁效果 —— 得到一张彻底空白的奥义牌。
  // 现在把所有可选效果字段一并求和继承。
  const mul = (a.mul + b.mul) * ULTIMATE_MUL;
  const heal = (a.heal ?? 0) + (b.heal ?? 0);
  const shield = (a.shield ?? 0) + (b.shield ?? 0);
  const draw = (a.draw ?? 0) + (b.draw ?? 0);
  const gainYang = (a.gainYang ?? 0) + (b.gainYang ?? 0);
  const gainYin = (a.gainYin ?? 0) + (b.gainYin ?? 0);
  const gainShi = (a.gainShi ?? 0) + (b.gainShi ?? 0);
  const cleanse = Boolean(a.cleanse || b.cleanse);

  const parts: string[] = [];
  if (mul > 0) parts.push(`伤害 (${a.mul}+${b.mul})×${ULTIMATE_MUL}`);
  if (heal > 0) parts.push(`回复 ${heal}`);
  if (shield > 0) parts.push(`护盾 ${shield}`);
  if (draw > 0) parts.push(`抽 ${draw} 张`);
  if (gainYang > 0) parts.push(`+${gainYang} 阳炁`);
  if (gainYin > 0) parts.push(`+${gainYin} 阴炁`);
  if (gainShi > 0) parts.push(`+${gainShi} 层势`);
  if (cleanse) parts.push('驱散负面');
  if (parts.length === 0) parts.push('无实效果');

  return {
    id: `ult_${a.id}_${b.id}`,
    uid: `ult_${a.uid ?? a.id}_${b.uid ?? b.id}`,
    name: '奥义·' + a.name.slice(0, 2) + b.name.slice(-2),
    kind: a.kind,
    wuxing: a.wuxing,
    costYang: a.costYang + b.costYang,
    costYin: a.costYin + b.costYin,
    mul,
    hits: Math.max(a.hits, b.hits),
    aoe: a.aoe || b.aoe,
    desc: `奥义：${parts.join('，')}，不消耗额外回合。`,
    isUltimate: true,
    fusedFrom: [a.name, b.name],
    inflict: a.inflict ?? b.inflict,
    heal: heal || undefined,
    shield: shield || undefined,
    draw: draw || undefined,
    gainYang: gainYang || undefined,
    gainYin: gainYin || undefined,
    gainShi: gainShi || undefined,
    cleanse: cleanse || undefined,
  };
}

function doFuse(s: BattleState, cardAKey: string, cardBKey: string, targetId?: string): BattleState {
  const ia = findCardIndex(s, cardAKey);
  const ib = findCardIndex(s, cardBKey);
  if (ia < 0 || ib < 0 || ia === ib) return s;
  const a = s.hand[ia]!;
  const b = s.hand[ib]!;
  if (!canFuse(a, b)) return s;

  const next = clone(s);
  const ult = fuseCards(a, b);
  // 【关键】按「下标」删除，绝不按 id 过滤。
  // 牌库里每张卡有两份（id 相同），早期用 filter(c => c.id !== a.id) 会把手上
  // 所有同 id 的牌一起删掉 —— 实测「3 张斩风 + 连刺」融合后手牌直接清空。
  // 先删大下标再删小下标，避免删除后索引位移。
  const [hi, lo] = ia > ib ? [ia, ib] : [ib, ia];
  next.discard.push(next.hand[hi]!);
  next.hand.splice(hi, 1);
  next.discard.push(next.hand[lo]!);
  next.hand.splice(lo, 1);
  next.hand.push(ult);
  pushLog(next, `合并奥义 → 「${ult.name}」`);
  return playCard(next, ult.uid!, targetId);
}

/* ============================== 调息 / 架势 ============================== */

/**
 * 调息结果 —— 引擎与 UI 共用的**唯一**判定结果。
 *
 * 【为什么要有这个类型：单一真源】
 * 历史上「调息」是典型的**双真源**：
 *   - 引擎 doRegulate 自己算一套（扣多少、给多少）；
 *   - UI BattleScreen 又自己算一套（regRatio / regGain / canRegulate）。
 * 两套算法只要有一处取整方式分家，界面就会开始骗人 ——
 * 本轮把引擎的 `Math.floor` 改成 `Math.ceil` 时，UI 侧漏改，于是春分下
 * 界面显示「换得 1 点」而引擎实际给 2 点。这类缺陷的根治办法不是「把 UI 也改成 ceil」
 * （下次还会再漏），而是**把判定收敛到一个导出函数**，两边都只能问它。
 *
 * 【数值语义】
 * - cost 由架势决定：体修 / 法修 2 点，散修 1 点（读 STANCES.substituteRatio）。
 * - gain = clamp(ceil(cost × mul / R), 1, cost)，其中 R = SUBSTITUTE_RATIO_DEFAULT（基准兑换比例 2）。
 *   即：**效率倍率作用在兑换比例上，且收益永不超过成本**。
 *   这条夹顶同时堵住两个历史漏洞：
 *     1. 「倒赚」—— 旧引擎的收益是 `Math.max(1, Math.ceil(mul))`，**与成本无关**：
 *        散修（cost=1）+ 春分（mul=1.5）→ ceil(1.5)=2，即 1 阳炁换 2 阴炁，
 *        凭空多出 1 点炁（违反铁律 4「无代价转换禁止」）。夹顶到 cost 后为 1:1，倒赚消失。
 *     2. 「净亏」—— 目标一脉已满时若仍执行，会扣掉源炁却一点也加不上去，故 canDo=false。
 * - 最后 gain 再按**目标剩余容量**夹顶：gain = min(gain, targetCap − targetCur)（仅当目标未满）。
 *   即「UI 显示即实得」—— 目标差 1 点满时界面不再高报 2 点（见函数内 F2 注释）。
 */
export interface RegulateOutcome {
  /** 本次调息是否可执行 */
  canDo: boolean;
  /** 需要扣掉的点数 */
  cost: number;
  /** 能得到的点数 */
  gain: number;
  /** 不可执行的原因（供 UI 提示） */
  reason: 'ok' | 'used' | 'insufficient' | 'targetFull';
}

/**
 * 调息判定 —— 引擎（doRegulate）与 UI（BattleScreen 的按钮文案 / 可用性）都只能通过它
 * 来决定「能不能转、扣多少、给多少」。**不允许任何一处再自算一套。**
 */
export function regulateOutcome(s: BattleState, from: QiType): RegulateOutcome {
  /** 扣费点数由架势决定：体修/法修 2 点，散修 1 点 */
  const cost = STANCES.find((x) => x.id === s.stance)?.substituteRatio ?? REGULATE_RATIO;
  const mul = getRegulateMul(s);
  /**
   * 收益基线上界：效率倍率作用在**兑换比例**上，且夹顶到 [1, cost]。
   * - 基准（mul=1）cost=2 → ceil(2×1/2)=1（与旧行为一致）
   * - 散修（cost=1）基准 → ceil(1×1/2)=1（1:1，与架势文案一致）
   * - 体修/法修（cost=2）+ 春分（mul=1.5）→ ceil(2×1.5/2)=2（春分的效率提升真正落地）
   * - 散修（cost=1）+ 春分 → clamp(ceil(1×1.5/2)=1, 1, 1)=1（**不倒赚**：1 阳炁换 1 阴炁）
   * 用 ceil 而非 floor：floor(1.5)=1 会把春分的「效率提升」抹平成一句空话（历史受害者）。
   *
   * 【前瞻守卫｜不要删】`Math.min(cost, …)` 这个上界在当前已实装节气下**恒不触发**（QA 称其
   * 「死守卫」）：现有节气 regulateMul 最大 1.5，cost=2 → ceil(2×1.5/2)=2=cost、
   * cost=1 → ceil(1×1.5/2)=1=cost，故 min 从不收紧结果。**但它必须保留**：这是给未来高倍率
   * 节气的前瞻防御 —— 若某节气给 mul=3，ceil(2×3/2)=3 > cost=2，无此界就会「倒赚」
   * （1 阳炁换 3 阴炁，违反铁律 4）。**未来新增高倍率节气时，也请勿移除它。**
   */
  const rawGain = Math.max(1, Math.min(cost, Math.ceil((cost * mul) / SUBSTITUTE_RATIO_DEFAULT)));

  // 原因判定优先级不变：used → insufficient → targetFull（前者命中即提前返回，后者不被新逻辑吃掉）
  if (s.regulated) return { canDo: false, cost, gain: rawGain, reason: 'used' };
  const src = from === 'yang' ? s.yang : s.yin;
  if (src < cost) return { canDo: false, cost, gain: rawGain, reason: 'insufficient' };
  // 目标炁已满时不允许执行 —— 否则就是「净亏」：扣了源炁却一点也加不上去。
  const targetCur = from === 'yang' ? s.yin : s.yang;
  const targetCap = from === 'yang' ? s.yinCap : s.yangCap;
  if (targetCur >= targetCap) return { canDo: false, cost, gain: rawGain, reason: 'targetFull' };

  /**
   * 【剩余容量夹顶｜UI 显示即实得】—— F2 回炉修复
   * 历史病根（与「① UI floor vs 引擎 ceil」同源）：界面**自己算**，算出个与引擎不一致的数。
   *   - 旧病根 A：UI 用 floor、引擎用 ceil → 春分下界面显示「换得 1 点」而引擎给 2 点；
   *   - 旧病根 B（本轮残留）：上面修了取整方式，却漏了「剩余容量」—— 目标差 1 点满时
   *     UI 仍按 gain=2 显示「换得 2 点阴炁」，引擎却只加得进 1 点 → UI **高报 1 点**。
   * 根治办法同前：把「目标剩余容量」也收进这条单一真源，界面能拿到的就只有引擎实得的数。
   * 不变量：此处已确认 targetCur < targetCap（targetFull 分支已在上面提前返回），
   *   故 targetCap − targetCur ≥ 1，夹顶后 gain ∈ [1, rawGain]，**绝不会夹出 0**。
   * 与 doRegulate 同源：那边 `Math.min(cap, cur + gain)` 在本夹顶后成为恒真的防御性冗余，
   *   不构成「第二套夹法」；两处一致，故无需（也不应）再改 doRegulate。
   */
  const gain = Math.min(rawGain, targetCap - targetCur);

  return { canDo: true, cost, gain, reason: 'ok' };
}

/**
 * 调息（阴阳逆转）：把较多的那种炁按架势比例转成另一种。
 *
 * 【历史 Bug 1｜静默失效】旧代码写死 `source >= REGULATE_RATIO(2)` 才执行，
 * 于是「阳炁 0 / 阴炁 1」时两个分支都不进入 —— 不改 state、不置 regulated、
 * 也不报错。按钮看起来能点，点下去毫无反应。
 * 现在「能否转换」统一由 regulateOutcome 判定，UI 侧据此禁用按钮。
 *
 * 【历史 Bug 2｜数据与引擎不符】散修的 `substituteRatio` 是 1（界面 Tip 也照此显示
 * 「按 1 : 1 转换」），但旧代码一律按 REGULATE_RATIO(2) 扣费 —— 界面在骗人。
 * 现在改为**按架势读取扣费点数**（regulateOutcome 内），散修才真正做到 1:1。
 */
function doRegulate(s: BattleState, from: QiType): BattleState {
  const outcome = regulateOutcome(s, from);
  if (!outcome.canDo) return s;

  const next = clone(s);
  if (from === 'yang') {
    next.yang -= outcome.cost;
    next.yin = Math.min(next.yinCap, next.yin + outcome.gain);
    pushLog(next, `调息：${outcome.cost} 阳炁 → ${outcome.gain} 阴炁`);
  } else {
    next.yin -= outcome.cost;
    next.yang = Math.min(next.yangCap, next.yang + outcome.gain);
    pushLog(next, `调息：${outcome.cost} 阴炁 → ${outcome.gain} 阳炁`);
  }
  next.regulated = true;
  return next;
}

function doSwitchStance(s: BattleState, stance: StanceId): BattleState {
  if (s.stanceSwitched || s.stance === stance) return s;
  const next = clone(s);
  next.stance = stance;
  next.stanceSwitched = true;
  pushLog(next, `切换架势：${STANCES.find((x) => x.id === stance)?.name ?? stance}（消耗本回合一次行动）`);
  return next;
}

/* ============================== Reducer ============================== */

export type BattleAction =
  | { type: 'RESET'; state: BattleState }
  /** cardId 传手牌实例 uid；兼容旧的传卡牌定义 id（取第一张匹配） */
  | { type: 'PLAY_CARD'; cardId: string; targetId?: string }
  /** 同上 —— 只有传 uid 才能精确区分同名手牌 */
  | { type: 'FUSE'; cardAId: string; cardBId: string; targetId?: string }
  | { type: 'REGULATE'; from: QiType }
  | { type: 'SWITCH_STANCE'; stance: StanceId }
  | { type: 'END_TURN' }
  /** 归墟阶段：弃置一张手牌，换回另一种炁（cardId 传手牌 uid） */
  | { type: 'DISCARD_CARD'; cardId: string }
  | { type: 'PARRY'; elapsedMs: number }
  | { type: 'ENEMY_ACT' }
  | { type: 'CONSUME_FX' };

export function battleReducer(state: BattleState, action: BattleAction): BattleState {
  switch (action.type) {
    case 'RESET':
      return action.state;

    case 'PLAY_CARD':
      if (state.phase !== 'playerTurn') return state;
      return playCard(state, action.cardId, action.targetId);

    case 'FUSE':
      if (state.phase !== 'playerTurn') return state;
      return doFuse(state, action.cardAId, action.cardBId, action.targetId);

    case 'REGULATE':
      if (state.phase !== 'playerTurn') return state;
      return doRegulate(state, action.from);

    case 'SWITCH_STANCE':
      if (state.phase !== 'playerTurn') return state;
      return doSwitchStance(state, action.stance);

    case 'END_TURN':
      if (state.phase !== 'playerTurn') return state;
      return endPlayerTurn(state);

    case 'DISCARD_CARD':
      return discardForRelic(state, action.cardId);

    case 'PARRY':
      if (state.phase !== 'enemyTelegraph' || state.parried) return state;
      return doParry(state, action.elapsedMs);

    case 'ENEMY_ACT': {
      if (state.phase !== 'enemyTelegraph') return state;
      const acted = enemyAct(state);
      /**
       * enemyAct 产生的伤害数字必须活过 startPlayerTurn。
       *
       * startPlayerTurn 会清空 pendingNumbers（为本回合腾出画面），但它把「敌方刚刚
       * 打出的数字」也一并抹掉了 —— 玩家挨打后既看不到飘字、也看不到顿帧，
       * 体感上就是「怪物没有攻击」。这里把敌方的数字取了回来重新挂上。
       */
      const enemyNumbers = acted.pendingNumbers;
      const started = startPlayerTurn(acted);
      started.pendingNumbers = enemyNumbers;
      return started;
    }

    case 'CONSUME_FX': {
      const next = clone(state);
      next.pendingNumbers = [];
      next.pendingHitstopMs = 0;
      next.pendingParryGlyph = false;
      return next;
    }

    default:
      return state;
  }
}

export { SHI_SHEN_MAP };
