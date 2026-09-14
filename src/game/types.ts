/**
 * 《炁渊》全局类型定义
 * 约定：不使用 enum（tsc erasableSyntaxOnly），一律用 as const 联合类型。
 */

/* ============================== 基础枚举 ============================== */

/** 五行 */
export type WuXing = 'jin' | 'mu' | 'shui' | 'huo' | 'tu';

/** 五行中文名 */
export const WU_XING_LABEL: Record<WuXing, string> = {
  jin: '金',
  mu: '木',
  shui: '水',
  huo: '火',
  tu: '土',
};

/** 炁脉 */
export type QiType = 'yang' | 'yin';

/** 架势 */
export type StanceId = 'tixiu' | 'faxiu' | 'sanxiu';

/** 卡牌类别 */
export type CardKind = 'physical' | 'spell' | 'support';

/** 装备类别 */
export type EquipKind = 'blade' | 'artifact';

/** 十神 */
export type ShiShenId =
  | 'zhengyin' | 'pianying'
  | 'zhengguan' | 'qisha'
  | 'shishen' | 'shangguan'
  | 'zhengcai' | 'piancai'
  | 'bijian' | 'jiecai';

/** 状态 */
export type StatusId =
  | 'burn'      // 灼烧 DOT
  | 'frost'     // 霜寒：减速 + 破甲
  | 'freeze'    // 冻结：下回合无法行动
  | 'weak'      // 虚弱：伤害降低
  | 'armorBreak'// 破甲：防御降低
  | 'paralyze'  // 麻痹：攻击时每层 30% 概率落空（上限 75%）
  | 'silence'   // 沉默：无法使用术法牌
  | 'flaw';     // 破绽：下回合首张攻击牌必暴击且转真实伤害

/* ============================== 伤害修饰器 ============================== */

/**
 * 伤害修饰器操作。
 * - addBase：直接加在基础攻击力上 —— 仅装备（兵刃）可用，见 assertNoIllegalAddBase
 * - addFlat：加在基数之后的固定值
 * - mul：乘算倍率 —— 架势 / 命格 / 节气 / 月令 一律走这里
 */
export type ModifierOp = 'addBase' | 'addFlat' | 'mul';

export interface DamageModifier {
  op: ModifierOp;
  value: number;
  /** 来源标识，形如 'equip.tangdao' / 'stance.tixiu' / 'shishen.qisha' / 'term.jingzhe' / 'month.shen' */
  sourceId: string;
  /** 展示用标签，如「赤焰斩」「得令」「七杀·杀身成仁」 */
  label: string;
}

/** 完整的伤害拆解，供 UI 展示与单测断言 */
export interface DamageBreakdown {
  /** 角色裸攻击力 */
  baseAtk: number;
  /** 兵刃提供的 addBase */
  weaponBonus: number;
  /** 加完装备后的基础攻击力 */
  effectiveAtk: number;
  /** 卡牌倍率 */
  cardMul: number;
  /** 乘算前的基数 ceil(effectiveAtk * cardMul) + addFlat */
  base: number;
  /** 所有乘算倍率（已排序） */
  multipliers: DamageModifier[];
  /** 连乘后的总倍率 */
  totalMul: number;
  /** 是否暴击 */
  crit: boolean;
  /** 暴击倍率 */
  critMul: number;
  /** 是否真实伤害（破绽暴击 / 破军 / 开天） */
  isTrue: boolean;
  /** 目标防御 */
  defense: number;
  /** 减伤后（未含刮痧下限） */
  afterDefense: number;
  /** 是否触发刮痧下限（攻击力低于防御阈值） */
  scraped: boolean;
  /** 最终伤害 */
  final: number;
}

/** 五层变量的统一抽象：任何一层都可以产出修饰器 */
export interface ModifierProvider {
  sourceId: string;
  provideDamage?(ctx: DamageContext): DamageModifier[];
}

/* ============================== 战斗上下文 ============================== */

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  atk: number;
  def: number;
  /** 本命五行（角色有，敌人可无） */
  wuxing?: WuXing;
  statuses: StatusInstance[];
}

export interface StatusInstance {
  id: StatusId;
  stacks: number;
  /** 剩余回合数，-1 表示永久 */
  duration: number;
}

export interface DamageContext {
  attacker: Combatant;
  defender: Combatant;
  card: Card | null;
  /** 本回合已打出的牌数 */
  cardsPlayedThisTurn: number;
  /** 本回合已造成的连击段数 */
  comboThisTurn: number;
  /** 本回合五行相克命中次数 */
  counterHitsThisTurn: number;
  state: BattleState;
}

/* ============================== 卡牌 ============================== */

export interface Card {
  id: string;
  /**
   * 手牌实例唯一标识。
   * 牌库里每张卡都有 2 份（id 相同、对象不同），因此**任何手牌定位都必须用 uid 而非 id**——
   * 早期用 id 定位导致「融合奥义时同 id 手牌被批量误删」与「同名卡无法分别选中」两个 bug。
   */
  uid?: string;
  name: string;
  kind: CardKind;
  /** 术法卡才有五行；物理卡为 undefined */
  wuxing?: WuXing;
  /** 阳炁消耗 */
  costYang: number;
  /** 阴炁消耗 */
  costYin: number;
  /** 伤害倍率（相对基础攻击力） */
  mul: number;
  /** 连击段数 */
  hits: number;
  /** 是否群体 */
  aoe: boolean;
  /** 描述 */
  desc: string;
  /** 附加状态 */
  inflict?: { id: StatusId; stacks: number; duration: number };
  /** 治疗效果（占最大生命百分比或固定值） */
  heal?: number;
  /** 护盾 */
  shield?: number;
  /** 抽牌 */
  draw?: number;
  /** 驱散自身全部负面状态（净心咒） */
  cleanse?: boolean;
  /** 获得「势」层数（体修核心资源；非体修架势下不生效） */
  gainShi?: number;
  /** 获得炁 */
  gainYang?: number;
  gainYin?: number;
  /** 仅在某些节气下进入卡池 */
  solarTermOnly?: string;
  /** 是否奥义卡（运行时产物） */
  isUltimate?: boolean;
  /** 奥义卡的来源卡名 */
  fusedFrom?: string[];
}

/* ============================== 装备 ============================== */

export interface Equipment {
  id: string;
  name: string;
  kind: EquipKind;
  /** 兵刃：基础攻击力加成（唯一合法的 addBase 来源） */
  atkBonus: number;
  /** 法器：炁上限 */
  qiCapBonus: number;
  /** 连击段数加成 */
  hitsBonus: number;
  /** 五行附魔（法器） */
  wuxing?: WuXing;
  desc: string;
}

/** 兵刃 + 法器 → 附魔招式 */
export interface EnchantCombo {
  bladeId: string;
  artifactId: string;
  /** 招式名，如「赤焰斩」 */
  skillName: string;
  /** 附魔五行 */
  wuxing: WuXing;
  /** 附魔伤害倍率（相对本次物理伤害） */
  mul: number;
  /** 附加状态 */
  inflict?: { id: StatusId; stacks: number; duration: number };
}

/* ============================== 角色 / 敌人 ============================== */

export interface Character {
  id: string;
  name: string;
  /** 日主，如「庚金」 */
  rizhu: string;
  wuxing: WuXing;
  /** 推荐架势 */
  stance: StanceId;
  /** 主星 + 辅星 */
  shishen: [ShiShenId, ShiShenId];
  hp: number;
  atk: number;
  def: number;
  /** 阵营 */
  faction: '道门正宗' | '散修野士' | '自在天';
  /** 一句话背景 */
  lore: string;
  /** 立绘主色（用于程序化 SVG 形象） */
  palette: { robe: string; trim: string; hair: string };
}

export interface Enemy extends Combatant {
  /** 立绘形态参数 */
  shape: 'beast' | 'wraith' | 'insect' | 'dragon' | 'moth';
  /** 意图 */
  intents: EnemyIntent[];
  isBoss: boolean;
  lore: string;
  /**
   * 蓄力层数：由 charge 意图累积，下次攻击伤害 ×(1 + 层数)，结算后清零。
   * 早期版本 charge 只加 e.atk，而敌人伤害走 intent.damage，导致蓄力完全空转。
   */
  chargeStacks: number;
  /** 本回合实际执行的意图（供 UI 展示前摇） */
  currentIntent?: EnemyIntent;
  /** 敌方「势」：出招消耗的资源，让敌人也有资源博弈（设计哲学：阴阳互根／无代价转换禁止） */
  shi: number;
  /** 敌方势的上限 */
  shiCap: number;
}

export interface EnemyIntent {
  /** 意图类型：攻击 / 蓄力 / 防御 / 群攻 / 增益 / 削弱 */
  type: 'attack' | 'charge' | 'guard' | 'aoe' | 'buff' | 'debuff';
  /** 倍率 */
  mul: number;
  /** 伤害数值（直接用，敌人不吃玩家的攻击力体系） */
  damage?: number;
  wuxing?: WuXing;
  label: string;
  /** 招式品阶：决定意图卡的描边与光效 —— 基础 / 精妙 / 凶险 / 杀招 */
  grade?: IntentGrade;
  /** 招式要消耗的「势」（敌方资源）；不足时该意图不可用 */
  cost?: number;
  /** 是否标记为「可弹反」的招式（默认 attack / aoe 可弹反） */
  parryable?: boolean;
  /** 招式附加的状态（打向玩家） */
  inflict?: { id: StatusId; stacks: number; duration: number };
  /** 招式附带的自增益（buff 类意图） */
  selfShield?: number;
  /** 招式附带的自蓄力（charge 类意图） */
  selfCharge?: number;
  /** 招式短注，展示在意图卡上 */
  note?: string;
}

/** 招式品阶 */
export type IntentGrade = 'base' | 'art' | 'dire' | 'kill';

/* ============================== 月令 / 节气 / 十神 ============================== */

export interface LunarMonth {
  id: string;
  /** 地支，如「申」 */
  zhi: string;
  /** 当令五行 */
  wuxing: WuXing;
  label: string;
  /** 全局效果描述 */
  desc: string;
  /** 对本五行术法的增减 */
  wxBonus: Partial<Record<WuXing, number>>;
  /** 术法额外消耗（土旺滞气） */
  spellCostDelta: number;
  /** 防御 / 护盾加成（土旺月 1.3，引擎在 effectiveDefense 与护盾结算处读取） */
  defMul: number;
}

export interface SolarTermHooks {
  onBattleStart?(ctx: DamageContext): Effect[];
  onTurnStart?(ctx: DamageContext): Effect[];
  onTurnEnd?(ctx: DamageContext): Effect[];
  onCardPlayed?(ctx: DamageContext, card: Card): Effect[];
  onDamageDealt?(ctx: DamageContext, dealt: number): Effect[];
  /** 修改卡牌消耗，返回新消耗 */
  modifyCardCost?(ctx: DamageContext, card: Card, cost: { yang: number; yin: number }): { yang: number; yin: number };
  /** 提供伤害修饰器（只允许 mul，节气不得触碰基础值 —— 性命双修） */
  modifyDamage?(ctx: DamageContext): DamageModifier[];
  /** 修改治疗 / 护盾数值 */
  modifyHeal?(amount: number): number;
  /** 强制暴击倍率（霜降固定 150%） */
  forceCritMul?: number;
  /** 调息效率倍率 */
  regulateMul?: number;
  /** 是否强制弹反（大雪） */
  forceParry?: boolean;
}

export interface SolarTerm {
  id: string;
  name: string;
  season: '春' | '夏' | '秋' | '冬';
  desc: string;
  /** 是否已实现（24 槽中 MVP 实现 8 个） */
  implemented: boolean;
  /** 物候粒子类型 */
  particle: 'petal' | 'ear' | 'snow' | 'rain' | 'leaf' | 'fire' | 'frost' | 'none';
  hooks: SolarTermHooks;
}

export interface ShiShen {
  id: ShiShenId;
  name: string;
  category: '印星' | '官杀' | '食伤' | '财星' | '比劫';
  desc: string;
  implemented: boolean;
}

/* ============================== 架势 ============================== */

export interface Stance {
  id: StanceId;
  name: string;
  desc: string;
  /** 阴阳替代比例：散修 1:1，其余 2:1 */
  substituteRatio: number;
}

/* ============================== 效果 ============================== */

export type Effect =
  | { kind: 'damage'; targetId: string; mul: number; wuxing?: WuXing; isTrue?: boolean; hits: number; sourceId: string; label: string }
  | { kind: 'flatDamage'; targetId: string; amount: number; wuxing?: WuXing; sourceId: string }
  | { kind: 'heal'; targetId: string; amount: number; sourceId: string }
  | { kind: 'shield'; targetId: string; amount: number; sourceId: string }
  | { kind: 'gainQi'; yang?: number; yin?: number; sourceId: string }
  | { kind: 'draw'; count: number; sourceId: string }
  | { kind: 'applyStatus'; targetId: string; status: StatusId; stacks: number; duration: number; sourceId: string }
  | { kind: 'cleanse'; targetId: string; sourceId: string }
  | { kind: 'markFlaw'; targetId: string; sourceId: string }
  | { kind: 'selfDamage'; amount: number; sourceId: string }
  | { kind: 'log'; text: string; sourceId: string };

/* ============================== 战役 ============================== */

export interface Campaign {
  id: string;
  name: string;
  desc: string;
  enemyIds: string[];
  /** 通关后解锁下一场 */
  order: number;
}

/* ============================== 战斗状态 ============================== */

export type BattlePhase =
  | 'intro'        // 开场仪式
  | 'playerTurn'
  | 'enemyTelegraph' // 敌方前摇（弹反窗口）
  | 'enemyTurn'
  | 'won'
  | 'lost';

export interface BattleStats {
  /** 十神触发次数 */
  shishenTriggers: Record<string, number>;
  maxCombo: number;
  maxCounterHits: number;
  maxSingleDamage: number;
  maxSingleDamageLabel: string;
  parryCount: number;
  perfectParryCount: number;
  cardsPlayed: number;
  turnCount: number;
}

export interface BattleState {
  phase: BattlePhase;
  turn: number;

  player: Combatant;
  /** 玩家角色定义（含命格等静态数据） */
  characterId: string;
  stance: StanceId;
  equipment: [string | null, string | null];
  /** 体修「势」层数 */
  shi: number;
  /** 纯阳武圣无限叠加的势 */
  wushengStacks: number;

  yang: number;
  yin: number;
  yangCap: number;
  yinCap: number;

  /** 本回合阴阳消耗计数，用于「炁贯周天」 */
  spentYangThisTurn: number;
  spentYinThisTurn: number;
  zhoutianActive: boolean;

  enemies: Enemy[];
  hand: Card[];
  deck: Card[];
  discard: Card[];

  solarTermId: string;
  lunarMonthId: string;

  /** 本回合是否已调息 */
  regulated: boolean;
  /** 本回合是否已切换架势 */
  stanceSwitched: boolean;
  /** 本回合是否已格挡 */
  parried: boolean;
  /** 本次弹反判定结果：perfect 免疫并追击 / early 普通格挡减伤 / miss 未格挡 */
  parryResult: 'none' | 'early' | 'perfect' | 'miss';
  /** 本回合是否已经历敌方行动（防止重复结算） */
  enemyActed: boolean;
  /** 本回合打出牌数 */
  cardsPlayedThisTurn: number;
  /** 本回合打出的攻击牌数（芒种强制进攻判定用） */
  attackCardsThisTurn: number;
  comboThisTurn: number;
  counterHitsThisTurn: number;
  /** 正印锁血是否已用 */
  zhengyinUsed: boolean;
  /** 七杀：本回合是否触发过击杀减费 */
  qishaActive: boolean;
  /** 正财：本回合是否已结算 */
  zhengcaiUsed: boolean;
  /** 食神：额外连击段数 */
  bonusHits: number;
  /** 法修：上一段术法的五行，用于判定相生链（木→火→土→金→水） */
  lastSpellWuxing: WuXing | null;

  /** 种子随机数状态（保证确定性） */
  rngState: number;

  /** 弹反计时：敌方前摇开始时间戳由 UI 提供 */
  telegraphStartMs: number | null;

  stats: BattleStats;
  log: string[];

  /** 一次性 UI 信号：伤害数字 */
  pendingNumbers: DamageNumber[];
  /** 一次性 UI 信号：卡帧时长 */
  pendingHitstopMs: number;
  /** 一次性 UI 信号：完美弹反 */
  pendingParryGlyph: boolean;
}

export interface DamageNumber {
  id: number;
  targetId: string;
  amount: number;
  kind: 'physical' | WuXing | 'heal' | 'true';
  crit: boolean;
  x: number;
  y: number;
}

/* ============================== 存档 ============================== */

export interface SaveData {
  version: number;
  clearedCampaigns: string[];
  selectedCharacterId: string;
  equipment: Record<string, [string | null, string | null]>;
  fxLevel: 'lavish' | 'standard' | 'simple';
}
