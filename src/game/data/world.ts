import type { LunarMonth, ShiShen, SolarTerm, Stance } from '../types';

/* ============================== 架势 ============================== */

export const STANCES: Stance[] = [
  {
    id: 'tixiu',
    name: '体修·连击蓄势',
    desc: '每打出一张物理牌积攒 1 层「势」，10 层解锁「破军」：下张物理牌造成 攻击×层数 的真实伤害。',
    substituteRatio: 2,
  },
  {
    id: 'faxiu',
    name: '法修·五行轮转',
    desc: '按五行相生顺序（木→火→土→金→水）连续出牌，每张费用减半且伤害递增 10%；相克可打断敌方蓄力并附加虚弱。',
    substituteRatio: 2,
  },
  {
    id: 'sanxiu',
    name: '散修·刀尖舔血',
    desc: '阴阳炁差值越大，暴击率与暴击伤害越高。差值达上限触发「剑走偏锋」：本回合伤害 +100%，回合结束自损 30% 当前血量。',
    substituteRatio: 1,
  },
];

/* ============================== 十神 ============================== */

export const SHI_SHEN: ShiShen[] = [
  { id: 'zhengyin', name: '正印', category: '印星', desc: '每回合首次受致命伤害时锁血 1 点，触发后本回合技能消耗翻倍。', implemented: true },
  { id: 'pianying', name: '偏印', category: '印星', desc: '每回合首次受控时免疫，但下回合攻击 -20%。', implemented: false },
  { id: 'zhengguan', name: '正官', category: '官杀', desc: '每回合打出第 3 张牌时，封印敌方手牌中费用最高的 1 张。', implemented: false },
  { id: 'qisha', name: '七杀', category: '官杀', desc: '击杀任意单位后本回合剩余所有牌费用减半；血量低于 10% 时本回合伤害 +30%（杀身成仁）。', implemented: true },
  { id: 'shishen', name: '食神', category: '食伤', desc: '连击段数 +2，但每段伤害固定为 80%。', implemented: true },
  { id: 'shangguan', name: '伤官', category: '食伤', desc: '暴击伤害从 150% 提升至 200%，但暴击率 -20%。', implemented: true },
  { id: 'zhengcai', name: '正财', category: '财星', desc: '每回合造成伤害后，额外获得 1 阳炁 + 1 阴炁。', implemented: true },
  { id: 'piancai', name: '偏财', category: '财星', desc: '每次抽牌 20% 概率额外抽 1 张（触发后本回合不再触发）。', implemented: true },
  { id: 'bijian', name: '比肩', category: '比劫', desc: '场上每有 1 名友方存活，自身攻击 +5%（上限 +30%）。', implemented: false },
  { id: 'jiecai', name: '劫财', category: '比劫', desc: '打出牌时复制其效果，复制的伤害/治疗减半。', implemented: false },
];

export const SHI_SHEN_MAP: Record<string, ShiShen> = Object.fromEntries(
  SHI_SHEN.map((s) => [s.id, s]),
);

/* ============================== 月令（地支） ============================== */

export const LUNAR_MONTHS: LunarMonth[] = [
  { id: 'yin', zhi: '寅', wuxing: 'mu', label: '寅月·木旺', desc: '木行术法 +25%，金行术法 -20%', wxBonus: { mu: 0.25, jin: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'mao', zhi: '卯', wuxing: 'mu', label: '卯月·木旺', desc: '木行术法 +25%，金行术法 -20%', wxBonus: { mu: 0.25, jin: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'chen', zhi: '辰', wuxing: 'tu', label: '辰月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'si', zhi: '巳', wuxing: 'huo', label: '巳月·火旺', desc: '火行术法 +25%，水行术法 -20%', wxBonus: { huo: 0.25, shui: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'wu', zhi: '午', wuxing: 'huo', label: '午月·火旺', desc: '火行术法 +25%，水行术法 -20%', wxBonus: { huo: 0.25, shui: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'wei', zhi: '未', wuxing: 'tu', label: '未月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'shen', zhi: '申', wuxing: 'jin', label: '申月·金旺', desc: '物理攻击（金器）+25%，木行术法 -20%', wxBonus: { jin: 0.25, mu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'you', zhi: '酉', wuxing: 'jin', label: '酉月·金旺', desc: '物理攻击（金器）+25%，木行术法 -20%', wxBonus: { jin: 0.25, mu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'xu', zhi: '戌', wuxing: 'tu', label: '戌月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'hai', zhi: '亥', wuxing: 'shui', label: '亥月·水旺', desc: '水行术法 +25%，土行术法 -20%', wxBonus: { shui: 0.25, tu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'zi', zhi: '子', wuxing: 'shui', label: '子月·水旺', desc: '水行术法 +25%，土行术法 -20%', wxBonus: { shui: 0.25, tu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'chou', zhi: '丑', wuxing: 'tu', label: '丑月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
];

export const LUNAR_MONTH_MAP: Record<string, LunarMonth> = Object.fromEntries(
  LUNAR_MONTHS.map((m) => [m.id, m]),
);

/* ============================== 二十四节气 ============================== */
/**
 * 24 条全量留位，MVP 实装 8 条（implemented: true）。
 * 所有效果以钩子数据表达，引擎通过 fireHook 查表调用 —— 新增第 9 个节气只需在此加 1 条数据。
 */

export const SOLAR_TERMS: SolarTerm[] = [
  /* ---- 春 · 生发 ---- */
  {
    id: 'lichun', name: '立春', season: '春', implemented: false, particle: 'petal',
    desc: '东风解冻，蛰虫始振。',
    hooks: {},
  },
  {
    id: 'yushui', name: '雨水', season: '春', implemented: false, particle: 'rain',
    desc: '獭祭鱼，鸿雁来。',
    hooks: {},
  },
  {
    id: 'jingzhe', name: '惊蛰', season: '春', implemented: true, particle: 'leaf',
    desc: '春雷乍动：本局首张攻击牌伤害 +50%，但该牌消耗翻倍。',
    hooks: {
      modifyCardCost: (ctx, card, cost) => {
        // 本回合首张、且为攻击牌 → 消耗翻倍
        if (ctx.state.cardsPlayedThisTurn === 0 && (card.kind === 'physical' || card.kind === 'spell')) {
          return { yang: cost.yang * 2, yin: cost.yin * 2 };
        }
        return cost;
      },
      modifyDamage: (ctx) =>
        ctx.state.cardsPlayedThisTurn === 0
          ? [{ op: 'mul', value: 1.5, sourceId: 'term.jingzhe', label: '惊蛰·春雷' }]
          : [],
    },
  },
  {
    id: 'chunfen', name: '春分', season: '春', implemented: true, particle: 'petal',
    desc: '昼夜均而寒暑平：调息（阴阳转换）效率 ×1.5。',
    hooks: { regulateMul: 1.5 },
  },
  {
    id: 'qingming', name: '清明', season: '春', implemented: false, particle: 'petal',
    desc: '桐始华，虹始见。',
    hooks: {},
  },
  {
    id: 'guyu', name: '谷雨', season: '春', implemented: false, particle: 'rain',
    desc: '雨生百谷。',
    hooks: {},
  },

  /* ---- 夏 · 盛放 ---- */
  {
    id: 'lixia', name: '立夏', season: '夏', implemented: false, particle: 'leaf',
    desc: '蝼蝈鸣，蚯蚓出。',
    hooks: {},
  },
  {
    id: 'xiaoman', name: '小满', season: '夏', implemented: false, particle: 'ear',
    desc: '苦菜秀，麦秋至。',
    hooks: {},
  },
  {
    id: 'mangzhong', name: '芒种', season: '夏', implemented: true, particle: 'ear',
    desc: '忙种时节：每回合必须打出至少 2 张攻击牌，否则自扣 10% 血量。',
    hooks: {
      onTurnEnd: (ctx) => {
        if (ctx.state.phase === 'playerTurn' && ctx.state.attackCardsThisTurn < 2) {
          const dmg = Math.max(1, Math.floor(ctx.state.player.maxHp * 0.1));
          return [
            { kind: 'selfDamage', amount: dmg, sourceId: 'term.mangzhong' },
            { kind: 'log', text: `芒种·误了农时，自损 ${dmg} 点气血`, sourceId: 'term.mangzhong' },
          ];
        }
        return [];
      },
    },
  },
  {
    id: 'xiazhi', name: '夏至', season: '夏', implemented: false, particle: 'fire',
    desc: '鹿角解，蝉始鸣。',
    hooks: {},
  },
  {
    id: 'xiaoshu', name: '小暑', season: '夏', implemented: false, particle: 'fire',
    desc: '温风至，蟋蟀居壁。',
    hooks: {},
  },
  {
    id: 'dashu', name: '大暑', season: '夏', implemented: true, particle: 'fire',
    desc: '赤日炎炎：所有伤害 +20%，但治疗与护盾效果 -50%。',
    hooks: {
      modifyDamage: () => [{ op: 'mul', value: 1.2, sourceId: 'term.dashu', label: '大暑·流火' }],
      modifyHeal: (amount) => Math.floor(amount * 0.5),
    },
  },

  /* ---- 秋 · 肃杀 ---- */
  {
    id: 'liqiu', name: '立秋', season: '秋', implemented: false, particle: 'leaf',
    desc: '凉风至，白露降。',
    hooks: {},
  },
  {
    id: 'chushu', name: '处暑', season: '秋', implemented: false, particle: 'leaf',
    desc: '鹰乃祭鸟，天地始肃。',
    hooks: {},
  },
  {
    id: 'bailu', name: '白露', season: '秋', implemented: true, particle: 'frost',
    desc: '露凝而白：术法牌额外消耗 20% 阴炁，但命中后必附加「霜寒」（减速 + 破甲）。',
    hooks: {
      modifyCardCost: (_ctx, card, cost) =>
        card.kind === 'spell'
          ? { yang: cost.yang, yin: Math.ceil(cost.yin * 1.2) }
          : cost,
      onCardPlayed: (ctx, card) =>
        card.kind === 'spell' && ctx.state.enemies.some((e) => e.hp > 0)
          ? [{
              kind: 'applyStatus',
              targetId: ctx.state.enemies.find((e) => e.hp > 0)?.id ?? '',
              status: 'frost',
              stacks: 1,
              duration: 2,
              sourceId: 'term.bailu',
            }]
          : [],
    },
  },
  {
    id: 'qiufen', name: '秋分', season: '秋', implemented: false, particle: 'leaf',
    desc: '雷始收声，蛰虫坯户。',
    hooks: {},
  },
  {
    id: 'hanlu', name: '寒露', season: '秋', implemented: false, particle: 'frost',
    desc: '鸿雁来宾，菊有黄华。',
    hooks: {},
  },
  {
    id: 'shuangjiang', name: '霜降', season: '秋', implemented: true, particle: 'frost',
    desc: '气肃而凝：暴击附带「冻结」（下回合无法行动），但暴击伤害固定为 150%。',
    hooks: {
      forceCritMul: 1.5,
      onDamageDealt: (ctx, dealt) => {
        void dealt;
        const target = ctx.state.enemies.find((e) => e.hp > 0);
        if (!target) return [];
        return [
          { kind: 'applyStatus', targetId: target.id, status: 'freeze', stacks: 1, duration: 1, sourceId: 'term.shuangjiang' },
          { kind: 'log', text: '霜降·凝华，敌方被冻结', sourceId: 'term.shuangjiang' },
        ];
      },
    },
  },

  /* ---- 冬 · 藏养 ---- */
  {
    id: 'lidong', name: '立冬', season: '冬', implemented: false, particle: 'snow',
    desc: '水始冰，地始冻。',
    hooks: {},
  },
  {
    id: 'xiaoxue', name: '小雪', season: '冬', implemented: false, particle: 'snow',
    desc: '虹藏不见，天气上腾。',
    hooks: {},
  },
  {
    id: 'daxue', name: '大雪', season: '冬', implemented: true, particle: 'snow',
    desc: '积雪封路：所有「格挡」自动升级为「弹反」，无需卡时机。',
    hooks: { forceParry: true },
  },
  {
    id: 'dongzhi', name: '冬至', season: '冬', implemented: true, particle: 'snow',
    desc: '一阳来复：阴阳炁每回合自动向低的一方补充，补充量 ×2。',
    hooks: {
      onTurnStart: (ctx) => {
        const { yang, yin } = ctx.state;
        if (yang === yin) return [];
        const diff = Math.abs(yang - yin);
        const amount = Math.max(1, Math.floor(diff / 2) * 2);
        return yang < yin
          ? [{ kind: 'gainQi', yang: amount, sourceId: 'term.dongzhi' }]
          : [{ kind: 'gainQi', yin: amount, sourceId: 'term.dongzhi' }];
      },
    },
  },
  {
    id: 'xiaohan', name: '小寒', season: '冬', implemented: false, particle: 'snow',
    desc: '雁北乡，鹊始巢。',
    hooks: {},
  },
  {
    id: 'dahan', name: '大寒', season: '冬', implemented: false, particle: 'snow',
    desc: '鸡始乳，征鸟厉疾。',
    hooks: {},
  },
];

export const SOLAR_TERM_MAP: Record<string, SolarTerm> = Object.fromEntries(
  SOLAR_TERMS.map((t) => [t.id, t]),
);

/** 已实装的节气 —— 开局随机池 */
export const IMPLEMENTED_TERMS = SOLAR_TERMS.filter((t) => t.implemented);
