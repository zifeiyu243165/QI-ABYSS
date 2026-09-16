/**
 * 《炁渊》全局数值常量
 * 本文件是唯一数值来源，其他文件不得出现魔法数字。
 */

/* ============================== 微操窗口 ============================== */

/** 敌方攻击前摇时长（ms）：前摇结束后进入弹反判定窗 */
export const PARRY_TELEGRAPH_MS = 350;
/** 弹反判定窗时长（ms） */
export const PARRY_WINDOW_MS = 700;
/** 前摇内按下（过早）：仅减免此比例的伤害 */
export const EARLY_PARRY_REDUCE = 0.4;
/** 敌方防御姿态获得的护盾 */
export const GUARD_SHIELD = 15;
/** 前摇 + 判定窗总时长 */
export const PARRY_TOTAL_MS = PARRY_TELEGRAPH_MS + PARRY_WINDOW_MS;

/**
 * 「挨打」顿帧时长（ms）。
 * 玩家受击必须有打击感反馈，否则敌方回合看起来像「什么都没发生」。
 */
export const HITSTOP_WHEN_HURT_MS = 260;

/* ============================== 结算常量 ============================== */

/**
 * 刮痧下限系数 —— 「性命双修」的代码表达。
 * 当攻击力低于敌方防御阈值时，最终伤害被压到原始值的 10%，
 * 即：机制再华丽，数值不够就是刮痧。
 */
export const SCRAPE_RATIO = 0.1;

/** 刮痧判定阈值：有效攻击力低于 防御 × 此系数 时进入刮痧 */
export const SCRAPE_DEF_FACTOR = 1.5;

/** 减伤公式中的防御软化系数：damage * (1 - def / (def + K)) */
export const DEFENSE_SOFTENING = 120;

/**
 * 麻痹：每层提供的「攻击落空」概率
 * 麻痹来源是雷行附魔（五雷令），效果是让目标下一次动作失手。
 */
export const PARALYZE_MISS_PER_STACK = 0.3;
/** 麻痹落空概率上限 */
export const PARALYZE_MISS_CAP = 0.75;

/* ============================== 霜寒 ============================== */
/**
 * 霜寒（frost）：破甲 + 减速。
 * - 破甲：每层降低目标防御 12%，上限 36%（与 armorBreak 独立叠乘）—— 见 damage.effectiveDefense
 * - 减速：每层为敌方招式增加 1 点「势」消耗，上限 +2 —— 见 battle.enemyAct
 */
/** 霜寒：每层降低目标防御的比例（破甲） */
export const FROST_DEF_PENALTY_PER_STACK = 0.12;
/** 霜寒破甲上限 */
export const FROST_DEF_PENALTY_CAP = 0.36;
/** 霜寒：每层为敌方招式增加的「势」消耗（减速） */
export const FROST_SLOW_COST_PER_STACK = 1;
/** 霜寒减速上限 */
export const FROST_SLOW_COST_CAP = 2;

/** 基础暴击率 */
export const BASE_CRIT_RATE = 0.15;
/** 基础暴击倍率 */
export const BASE_CRIT_MUL = 1.5;
/** 伤官命格暴击倍率 */
export const SHANGGUAN_CRIT_MUL = 2.0;
/** 伤官命格暴击率惩罚 */
export const SHANGGUAN_CRIT_PENALTY = -0.2;

/* ============================== 炁 ============================== */

/** 默认阴阳替代比例：2 点换 1 点 */
export const SUBSTITUTE_RATIO_DEFAULT = 2;
/** 散修架势替代比例：1:1 */
export const SUBSTITUTE_RATIO_SANXIU = 1;

/** 炁上限 */
export const QI_CAP_BASE = 10;

/** 调息比例：2 点换 1 点 */
export const REGULATE_RATIO = 2;

/** 「炁贯周天」触发门槛：单回合双脉各消耗 ≥3 */
export const ZHOUTIAN_THRESHOLD = 3;
/** 炁贯周天全属性加成 */
export const ZHOUTIAN_MUL = 1.1;

/* ============================== 架势 ============================== */

/** 体修「势」上限 */
export const SHI_CAP = 10;
/** 体修每层势提供的倍率增量 */
export const SHI_MUL_PER_STACK = 0.12;
/** 体修 10 层解锁「破军」：攻击 × 层数的真实伤害 */
export const POJUN_LAYERS = 10;

/** 法修五行相生时每张牌费用减半 */
export const FAXIU_SHENG_COST_MUL = 0.5;
/** 法修五行相生每张伤害递增 */
export const FAXIU_SHENG_DMG_STEP = 0.1;
/** 法修五行相生下张术法倍率（五运阴阳双法器流） */
export const FAXIU_SHENG_MUL = 1.5;

/** 散修：阴阳差值每点提供的暴击率 */
export const SANXIU_CRIT_PER_DIFF = 0.04;
/** 散修：阴阳差值每点提供的暴击伤害 */
export const SANXIU_CRITDMG_PER_DIFF = 0.08;
/** 散修差值上限 */
export const SANXIU_DIFF_CAP = 8;
/** 散修「剑走偏锋」触发差值 */
export const SANXIU_JIANZOU_THRESHOLD = 6;
/** 剑走偏锋伤害加成 */
export const JIANZOU_MUL = 2.0;
/** 剑走偏锋自损当前血量比例 */
export const JIANZOU_SELF_DAMAGE_RATIO = 0.3;

/** 纯阳武圣：每层势攻击加成 */
export const WUSHENG_ATK_PER_STACK = 0.03;
/** 纯阳武圣终极技「开天」所需层数 */
export const WUSHENG_KAITIAN_STACKS = 50;
/** 开天倍率 */
export const KAITIAN_MUL = 50;

/* ============================== 命格 ============================== */

/** 七杀：击杀后本回合剩余牌费用减半 */
export const QISHA_COST_MUL = 0.5;
/** 七杀隐藏被动：血量低于此比例时伤害提升 */
export const QISHA_LOW_HP_RATIO = 0.1;
export const QISHA_LOW_HP_MUL = 1.3;

/** 正印锁血后本回合消耗翻倍 */
export const ZHENGYIN_COST_MUL = 2;

/** 食神：额外连击段数 */
export const SHISHEN_BONUS_HITS = 2;
/** 食神：每段伤害系数 */
export const SHISHEN_HIT_MUL = 0.8;

/** 偏财：额外抽牌概率 */
export const PIANCAI_DRAW_RATE = 0.2;

/** 得令：全技能倍率加成 */
export const DELING_MUL = 1.1;
/** 失令：暴击率惩罚 */
export const SHILING_CRIT_PENALTY = -0.1;
/** 失令：首张牌消耗 +1 */
export const SHILING_COST_DELTA = 1;

/* ============================== 破绽 ============================== */

/** 触发破绽所需的连击数门槛 */
export const FLAW_COMBO_THRESHOLD = 3;
/** 触发破绽所需的相克命中次数 */
export const FLAW_COUNTER_THRESHOLD = 1;
/** 破绽持续回合数 */
export const FLAW_DURATION = 1;

/* ============================== 奥义卡 ============================== */

/** 奥义卡伤害倍率 */
export const ULTIMATE_MUL = 1.5;

/* ============================== 弹反 ============================== */

/** 弹反击破后追击伤害倍率 */
export const PARRY_COUNTER_MUL = 0.5;

/* ============================== UI ============================== */

/** 卡帧时长区间（ms），随伤害倍率递增 */
export const HITSTOP_MIN_MS = 100;
export const HITSTOP_MAX_MS = 300;
/** 触发最大卡帧的伤害倍率 */
export const HITSTOP_MAX_MUL = 4;

/**
 * 手牌上限。**回合结束时**按此结算：超出的牌必须走「归墟」弃掉。
 * 注意它**不是**抽牌时的硬上限 —— 见 HAND_DRAW_CAP。
 */
export const HAND_LIMIT = 6;
/**
 * 抽牌硬上限。
 * 【必须大于 HAND_LIMIT】否则抽牌阶段就把手牌压到上限以内，回合结束时永远不超限，
 * 「归墟」阶段永远触发不了，整套机制沦为死代码。超过此值抽到的牌直接进弃牌堆。
 */
export const HAND_DRAW_CAP = 10;
/** 每回合抽牌数 */
export const DRAW_PER_TURN = 3;

/* ============================== 归墟（弃牌阶段） ============================== */

/** 归墟化炁：每主动弃 1 张牌换得的炁点数 */
export const RELIC_QI_GAIN = 1;
/** 归墟弃置达到此张数时播放「大量归墟」的莲花演出 */
export const RELIC_LOTUS_THRESHOLD = 3;
/** 贪嗔蠹归墟夺牌：每张被夺弃牌为它换得的护盾 */
export const TANCHEN_SHIELD_PER_CARD = 9;
/** 贪嗔蠹开始夺牌所需的单次归墟弃置张数 */
export const TANCHEN_STEAL_MIN = 2;

/* ============================== 五行 ============================== */

/** 五行相生：木→火→土→金→水→木 */
export const WU_XING_SHENG: Record<string, string> = {
  mu: 'huo',
  huo: 'tu',
  tu: 'jin',
  jin: 'shui',
  shui: 'mu',
};

/** 五行相克：木克土、土克水、水克火、火克金、金克木 */
export const WU_XING_KE: Record<string, string> = {
  mu: 'tu',
  tu: 'shui',
  shui: 'huo',
  huo: 'jin',
  jin: 'mu',
};

/** 相克时的伤害加成 */
export const COUNTER_MUL = 1.25;
/** 被克时的伤害减免 */
export const COUNTERED_MUL = 0.8;

/* ============================== 版面坐标 ============================== */

/** 竖屏基准宽 390 的中线 */
export const SCREEN_CENTER_X = 195;
/** 敌方区中心 Y */
export const ENEMY_ZONE_Y = 300;
/** 我方角色中心 Y */
export const PLAYER_ZONE_Y = 520;
/** 多个敌人时的横向间距 */
export const ENEMY_SPACING = 100;

/* ============================== 存档 ============================== */

export const SAVE_KEY = 'v1_qiabyss_save';
/**
 * 存档版本。
 * 【S5】1 → 2：新增 `locale` 字段。旧存档由 App.loadSave 的 migrateSave 平滑升级（补 locale，其余保留），
 * **不再**因版本不等而清空玩家进度。
 */
export const SAVE_VERSION = 2;
