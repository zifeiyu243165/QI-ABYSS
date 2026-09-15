import type { LunarMonth, ShiShen, SolarTerm, Stance } from '../types';

/* ============================== 架势 ============================== */

export const STANCES = [
  {
    id: 'tixiu',
    name: '体修·连击蓄势',
    desc: '每打出一张物理牌积攒 1 层「势」，10 层解锁「破军」：下张物理牌造成 攻击×层数 的真实伤害。',
    substituteRatio: 2,
  },
  {
    id: 'faxiu',
    name: '法修·五行轮转',
    // 【文案对齐实现】补上此前漏写的相生基础倍率：伤害 = FAXIU_SHENG_MUL(×1.5) + 逐环 +10%。
    desc: '按五行相生顺序（木→火→土→金→水）连续出牌，相生基础倍率 ×1.5（每多一环再 +10%），且每张费用减半；相克可打断敌方蓄力并附加虚弱。',
    substituteRatio: 2,
  },
  {
    id: 'sanxiu',
    name: '散修·刀尖舔血',
    // 【文案对齐实现】触发看的是 SANXIU_JIANZOU_THRESHOLD(6)，而差值本身被 SANXIU_DIFF_CAP(8) 夹顶 ——
    // 旧文案的「差值达上限触发」把这两个不同的数混为一谈。
    desc: '阴阳炁差值越大，暴击率与暴击伤害越高。差值达 6 点触发（差值上限 8）「剑走偏锋」：本回合伤害 +100%，回合结束自损 30% 当前血量。',
    substituteRatio: 1,
  },
] satisfies readonly Stance[];

/* ============================== 十神 ============================== */

export const SHI_SHEN = [
  { id: 'zhengyin', name: '正印', category: '印星', desc: '每回合首次受致命伤害时锁血 1 点；触发后，玩家接下来的那个回合技能消耗翻倍。', implemented: true },
  { id: 'pianying', name: '偏印', category: '印星', desc: '每回合首次受控时免疫，但下回合攻击 -20%。', implemented: false },
  { id: 'zhengguan', name: '正官', category: '官杀', desc: '每回合打出第 3 张牌时，封印敌方手牌中费用最高的 1 张。', implemented: false },
  { id: 'qisha', name: '七杀', category: '官杀', desc: '击杀任意单位后本回合剩余所有牌费用减半；血量低于 10% 时本回合伤害 +30%（杀身成仁）。', implemented: true },
  { id: 'shishen', name: '食神', category: '食伤', desc: '连击段数 +2，但每段伤害固定为 80%。', implemented: true },
  { id: 'shangguan', name: '伤官', category: '食伤', desc: '暴击伤害从 150% 提升至 200%，但暴击率 -20%。', implemented: true },
  { id: 'zhengcai', name: '正财', category: '财星', desc: '每回合造成伤害后，额外获得 1 阳炁 + 1 阴炁。', implemented: true },
  { id: 'piancai', name: '偏财', category: '财星', desc: '每次抽牌 20% 概率额外抽 1 张（触发后本回合不再触发）。', implemented: true },
  { id: 'bijian', name: '比肩', category: '比劫', desc: '场上每有 1 名友方存活，自身攻击 +5%（上限 +30%）。', implemented: false },
  { id: 'jiecai', name: '劫财', category: '比劫', desc: '打出牌时复制其效果，复制的伤害/治疗减半。', implemented: false },
] satisfies readonly ShiShen[];

export const SHI_SHEN_MAP: Record<string, ShiShen> = Object.fromEntries(
  SHI_SHEN.map((s) => [s.id, s]),
);

/* ============================== 月令（地支） ============================== */

export const LUNAR_MONTHS = [
  { id: 'yin', zhi: '寅', wuxing: 'mu', label: '寅月·木旺', desc: '木行术法 +25%，金行术法 -20%', wxBonus: { mu: 0.25, jin: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'mao', zhi: '卯', wuxing: 'mu', label: '卯月·木旺', desc: '木行术法 +25%，金行术法 -20%', wxBonus: { mu: 0.25, jin: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'chen', zhi: '辰', wuxing: 'tu', label: '辰月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'si', zhi: '巳', wuxing: 'huo', label: '巳月·火旺', desc: '火行术法 +25%，水行术法 -20%', wxBonus: { huo: 0.25, shui: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'wu', zhi: '午', wuxing: 'huo', label: '午月·火旺', desc: '火行术法 +25%，水行术法 -20%', wxBonus: { huo: 0.25, shui: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'wei', zhi: '未', wuxing: 'tu', label: '未月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'shen', zhi: '申', wuxing: 'jin', label: '申月·金旺', desc: '物理攻击（金器）与金行术法 +25%，木行术法 -20%', wxBonus: { jin: 0.25, mu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'you', zhi: '酉', wuxing: 'jin', label: '酉月·金旺', desc: '物理攻击（金器）与金行术法 +25%，木行术法 -20%', wxBonus: { jin: 0.25, mu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'xu', zhi: '戌', wuxing: 'tu', label: '戌月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
  { id: 'hai', zhi: '亥', wuxing: 'shui', label: '亥月·水旺', desc: '水行术法 +25%，土行术法 -20%', wxBonus: { shui: 0.25, tu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'zi', zhi: '子', wuxing: 'shui', label: '子月·水旺', desc: '水行术法 +25%，土行术法 -20%', wxBonus: { shui: 0.25, tu: -0.2 }, spellCostDelta: 0, defMul: 1 },
  { id: 'chou', zhi: '丑', wuxing: 'tu', label: '丑月·土旺', desc: '防御/护盾 +30%，所有术法消耗 +1 炁', wxBonus: {}, spellCostDelta: 1, defMul: 1.3 },
] satisfies readonly LunarMonth[];

export const LUNAR_MONTH_MAP: Record<string, LunarMonth> = Object.fromEntries(
  LUNAR_MONTHS.map((m) => [m.id, m]),
);

/* ============================== 二十四节气 ============================== */
/**
 * 24 条全量留位，MVP 实装 8 条（implemented: true）。
 * 所有效果以钩子数据表达，引擎通过 fireHook 查表调用 —— 新增第 9 个节气只需在此加 1 条数据。
 */

export const SOLAR_TERMS = [
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
    // 【文案对齐实现】旧文案写「本局首张攻击牌」，但引擎判断的是 cardsPlayedThisTurn === 0 ——
    // 即「每回合的第一张牌（且必须是攻击牌）」，不是「本局首张」；先出功能牌则该回合不再生效。
    desc: '春雷乍动：每回合打出的第一张牌若是攻击牌，其伤害 +50% 且消耗翻倍（先出功能牌则不生效）。',
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
        // 注意：不要在这里判断 `ctx.state.phase === 'playerTurn'`。
        // onTurnEnd 只可能由 fireTurnEnd 在回合结算时调用，相位判断是冗余的；
        // 更糟的是历史版本曾在 finishPlayerTurn 里先切到 enemyTelegraph 再触发本钩子，
        // 那个「恒假」的相位判断让芒种 100% 空转（永远不扣血、永远不打日志）。
        // 冗余条件会变成未来复制粘贴的陷阱，故删除。
        if (ctx.state.attackCardsThisTurn < 2) {
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
    // 【文案对齐实现】modifyDamage 只在玩家侧的 resolveDamage 里被调用，敌方伤害不走它 ——
    // 故「所有伤害 +20%」是错的，实际只加成「你的」伤害。
    desc: '赤日炎炎：你的伤害 +20%，但你的治疗与护盾效果 -50%。',
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
    // 【文案对齐实现｜F1 回炉】旧 desc 写「多段术法按命中段数叠加层数（如潮生诀 2 段 → 霜寒 2 层）」，
    // 但引擎实际是「每个被命中的目标各挂 1 层」，与段数无关 —— 界面在骗人（承诺了引擎没有的机制）。
    // 现改为与实现一致的措辞：命中即 +1 层、层数靠**多次出牌**积累、AoE 对每个命中敌人各 +1 层。
    desc: '露凝而白：术法牌额外消耗 20% 阴炁；术法命中即对被命中的每个目标各附加 1 层「霜寒」（减速 + 破甲）——不论该术法有几段，对同一目标每次命中只叠 1 层，层数靠**多次出牌**逐次积累（群体术法则对每个命中的敌人各叠 1 层）。',
    hooks: {
      modifyCardCost: (_ctx, card, cost) =>
        card.kind === 'spell'
          ? { yang: cost.yang, yin: Math.ceil(cost.yin * 1.2) }
          : cost,
      /**
       * 【历史缺陷｜锁错目标 + 触发时机错】旧实现挂在 onCardPlayed（出牌即触发）上，
       * 且把霜寒挂给 `ctx.state.enemies.find(e => e.hp > 0)`，即「列表里第一个存活敌人」——
       *   - 锁错目标：对第二个敌人打术法，霜寒却挂在第一个敌人身上（与「霜降锁错目标」同源，本轮漏网）。
       *   - 时机错：desc 写的是「命中后」，但打出 mul=0 的纯治疗/功能牌也会挂霜寒。
       * 现迁移到 onDamageDealt：事实快照 hit 携带 targetId，锁定**实际被命中的那个敌人**；
       * 且只有真正命中（dealCardDamage 逐次触发）时才会走到这里。
       *
       * 【为什么是「每个被命中目标 +1 层」而不是「按段数叠层」—— 不要改回去】
       * dealCardDamage 的收集循环是**按目标**的：每个目标只 push 一条 hitsInfo
       * （amount = perHit × hits，已把多段合成为「本次对该目标的伤害合计」），
       * 故 onDamageDealt 对每个目标只触发一次 → 白露只挂 1 层。以下三点决定了
       * **保留引擎行为、只改文案**（而非把引擎改成按 hits 逐段 push）：
       *   1. hitsInfo 是**多消费者**的钩子事实：霜降读它的 crit / targetId，未来还会有别的节气读它。
       *      擅改 `DamageDealtInfo.amount` 的语义（从「对该目标伤害合计」变成「单段伤害」）属高危。
       *   2. **平衡**：霜寒破甲上限 3 层（36% 减防）、减速上限 +2 势。若按段数叠层，
       *      一张「连刺 3 段」就能**一发出满**，把本该「多次积累」的机制变成「一发到顶」——
       *      这是未经拍板的平衡改动，不该由修复顺手引入。
       *   3. 本项目一贯做法即「文案对齐实现」（本轮 ④⑤⑧ 均如此）。
       * 该行为已由 battle.test.ts 的固化测试锁定（「命中即 1 层 / 连打两次到 2 层」）。
       */
      onDamageDealt: (ctx, hit) =>
        ctx.card?.kind === 'spell'
          ? [{ kind: 'applyStatus', targetId: hit.targetId, status: 'frost', stacks: 1, duration: 2, sourceId: 'term.bailu' }]
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
    // 归墟夺牌：寒露肃杀，敌方把你弃掉的每一张牌都当作养料换成护盾。
    // ⚠️ implemented 仍为 false，所以本局还抽不到寒露 —— 该效果由单测直接构造寒露状态覆盖。
    desc: '鸿雁来宾，菊有黄华。归墟肃杀：你每弃置 1 张牌，敌方获得 6 点护盾。',
    hooks: {
      stealDiscardShield: 6,
    },
  },
  {
    id: 'shuangjiang', name: '霜降', season: '秋', implemented: true, particle: 'frost',
    desc: '气肃而凝：暴击附带「冻结」（下回合无法行动），但暴击伤害固定为 150%。',
    hooks: {
      forceCritMul: 1.5,
      // 只有**暴击命中的那个目标**才冻结（而非「列表里第一个存活敌人」），
      // 普通命中绝不触发 —— 事实快照 hit 携带了 targetId / crit。
      onDamageDealt: (ctx, hit) => {
        if (!hit.crit) return [];
        const target = ctx.state.enemies.find((e) => e.id === hit.targetId);
        if (!target) return [];
        return [
          { kind: 'applyStatus', targetId: hit.targetId, status: 'freeze', stacks: 1, duration: 1, sourceId: 'term.shuangjiang' },
          { kind: 'log', text: `霜降·凝华，${target.name} 被冻结`, sourceId: 'term.shuangjiang' },
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
    desc: '积雪封路：格挡无需卡时机，必定判定为弹反；但一次弹反只能抵挡一记攻击。',
    hooks: { forceParry: true },
  },
  {
    id: 'dongzhi', name: '冬至', season: '冬', implemented: true, particle: 'snow',
    // 【文案对齐实现】实际公式为 Math.max(1, Math.floor(diff / 2) * 2) ——
    // 约为「当前差额的一半、向下取整到偶数」，而**不是**「×2」；diff=1 时结果为 1。
    desc: '一阳来复：阴阳炁每回合自动向较少的一脉补充（约为当前差额的一半，向下取整至偶数，最少 1 点）。',
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
] satisfies readonly SolarTerm[];

export const SOLAR_TERM_MAP: Record<string, SolarTerm> = Object.fromEntries(
  SOLAR_TERMS.map((t) => [t.id, t]),
);

/** 已实装的节气 —— 开局随机池 */
export const IMPLEMENTED_TERMS = SOLAR_TERMS.filter((t) => t.implemented);
