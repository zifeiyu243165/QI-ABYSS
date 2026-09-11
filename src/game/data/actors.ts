import type { Campaign, Character, Enemy } from '../types';

/* ============================== 角色（3 名） ============================== */

export const CHARACTERS: Character[] = [
  {
    id: 'luqingya', name: '陆青崖', rizhu: '庚金', wuxing: 'jin',
    stance: 'tixiu', shishen: ['qisha', 'zhengcai'],
    hp: 120, atk: 22, def: 8,
    faction: '散修野士',
    lore: '白天在便利店夜班收银，深夜拎着唐刀穿行在写字楼的消防通道里。',
    palette: { robe: '#0b2e59', trim: '#ca6924', hair: '#1a1f2b' },
  },
  {
    id: 'sujiangxue', name: '苏绛雪', rizhu: '癸水', wuxing: 'shui',
    stance: 'faxiu', shishen: ['zhengyin', 'piancai'],
    hp: 105, atk: 18, def: 10,
    faction: '道门正宗',
    lore: '正一派最年轻的持镜弟子，手机里存着三百个心猿的档案编号。',
    palette: { robe: '#d6ecff', trim: '#0b2e59', hair: '#1a1f2b' },
  },
  {
    id: 'xiewujiu', name: '谢无咎', rizhu: '丙火', wuxing: 'huo',
    stance: 'sanxiu', shishen: ['shangguan', 'shishen'],
    hp: 95, atk: 25, def: 5,
    faction: '自在天',
    lore: '不站任何一边，只遵循自己的道。滑板袋里那把苗刀从来没洗过血。',
    palette: { robe: '#c23b22', trim: '#f5c518', hair: '#1a1f2b' },
  },
];

export const CHARACTER_MAP: Record<string, Character> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
);

/* ============================== 心猿（5 只） ============================== */

/**
 * 心猿 —— 「执念」的实体化，但世界是**有阴有阳**的。
 *
 * 设计原则（对齐设计哲学 §5.1）：
 * - 心猿不是「仙魔对立」里的恶魔，而是「心理问题」的具象化，因此**有阴执，也有阳华**。
 * - 阴执：焦躁鬼、加班怨灵、贪嗔蠹 —— 都市戾气化形，直白、暴烈、带负面色。
 * - 阳华：金吾卫、春雷兽、冰魇 —— 被「正气」与「节令」淬炼出的精怪，绚烂、华贵、带正面色。
 *   春雷兽是「惊蛰」的第一声雷，是**天地正炁**，不是恶魔；冰魇是「霜降」的凝华，是**仙灵**。
 *
 * 数值强度（v2 增强，对齐用户反馈「对手太弱、没有酣畅感」）：
 * - 杂兵 HP 提升约 1.8 倍，攻击提升约 1.6 倍
 * - BOSS HP 提升约 2 倍，新增「杀招」高伤招式
 * - 每只心猿都有**招式牌组**（intents）与**势**资源，出招有成本、有品阶
 */
export const ENEMIES: Enemy[] = [
  /* ---------- 阴执 · 杂兵 ---------- */
  {
    id: 'enemy_jiaozao', name: '焦躁鬼', shape: 'wraith',
    hp: 110, maxHp: 110, shield: 0, atk: 16, def: 6, wuxing: 'huo',
    statuses: [],     isBoss: false,
    chargeStacks: 0, shi: 0, shiCap: 3,
    lore: '地铁早高峰挤出来的戾气，见人就咬。它不会思考，只会反应。',
    intents: [
      { type: 'attack', mul: 1.0, damage: 18, wuxing: 'huo', label: '抓挠', grade: 'base', cost: 0, note: '快速试探' },
      { type: 'attack', mul: 1.0, damage: 18, wuxing: 'huo', label: '抓挠', grade: 'base', cost: 0, note: '快速试探' },
      { type: 'buff', mul: 0, label: '躁意上涌', grade: 'art', cost: 1, selfCharge: 1, note: '自身蓄势 +1' },
      { type: 'attack', mul: 1.5, damage: 27, wuxing: 'huo', label: '怒咬', grade: 'dire', cost: 2, note: '消耗势，重击' },
      { type: 'debuff', mul: 0, label: '怨念缠身', grade: 'art', cost: 1, inflict: { id: 'weak', stacks: 1, duration: 2 }, note: '给你虚弱' },
    ],
  },
  {
    id: 'enemy_jiaban', name: '加班怨灵', shape: 'wraith',
    hp: 150, maxHp: 150, shield: 0, atk: 18, def: 10, wuxing: 'tu',
    statuses: [],     isBoss: false,
    chargeStacks: 0, shi: 0, shiCap: 4,
    lore: '连续三个月凌晨两点下班的人留下的东西，已经不记得自己叫什么，只记得还要交东西。',
    intents: [
      { type: 'guard', mul: 0, label: '僵坐', grade: 'base', cost: 0, selfShield: 24, note: '获得护盾' },
      { type: 'attack', mul: 1.2, damage: 22, wuxing: 'tu', label: '重压', grade: 'art', cost: 1, note: '厚土之击' },
      { type: 'attack', mul: 0.8, damage: 14, wuxing: 'tu', label: '絮叨', grade: 'base', cost: 0, note: '连续骚扰' },
      { type: 'debuff', mul: 0, label: '夺炁', grade: 'art', cost: 1, note: '抽走你的炁' },
      { type: 'aoe', mul: 1.1, damage: 20, wuxing: 'tu', label: '全屋熄灯', grade: 'dire', cost: 3, note: '蓄势后的大范围' },
    ],
  },
  {
    id: 'enemy_tanchen', name: '贪嗔蠹', shape: 'insect',
    hp: 130, maxHp: 130, shield: 0, atk: 20, def: 5, wuxing: 'mu',
    statuses: [],     isBoss: false,
    chargeStacks: 0, shi: 0, shiCap: 4,
    lore: '直播间里那句「最后三单」孵化出来的虫，永远填不饱，永远在结茧。',
    intents: [
      { type: 'attack', mul: 0.9, damage: 18, wuxing: 'mu', label: '啃噬', grade: 'base', cost: 0, note: '吸取生机' },
      { type: 'attack', mul: 0.9, damage: 18, wuxing: 'mu', label: '啃噬', grade: 'base', cost: 0, note: '吸取生机' },
      { type: 'aoe', mul: 0.7, damage: 14, wuxing: 'mu', label: '虫群', grade: 'art', cost: 1, note: '数量压制' },
      { type: 'buff', mul: 0, label: '结茧', grade: 'art', cost: 1, selfCharge: 2, note: '蓄势 +2，为化蝶' },
      { type: 'attack', mul: 1.8, damage: 34, wuxing: 'mu', label: '化蝶噬心', grade: 'kill', cost: 3, note: '倾泻全部蓄势' },
    ],
  },

  /* ---------- 阳华 · 节令精怪 ---------- */
  {
    id: 'enemy_jinwu', name: '金吾卫', shape: 'beast',
    hp: 175, maxHp: 175, shield: 0, atk: 20, def: 12, wuxing: 'jin',
    statuses: [],     isBoss: false,
    chargeStacks: 0, shi: 0, shiCap: 4,
    lore: '长安城旧日巡夜的金甲卫士，香火散了，甲胄还亮。它不害人，只认「规矩」——但它的规矩很硬。',
    intents: [
      { type: 'guard', mul: 0, label: '立盾', grade: 'base', cost: 0, selfShield: 28, note: '金甲格挡' },
      { type: 'attack', mul: 1.1, damage: 22, wuxing: 'jin', label: '横刀', grade: 'art', cost: 1, note: '军阵刀法' },
      { type: 'attack', mul: 1.1, damage: 22, wuxing: 'jin', label: '横刀', grade: 'art', cost: 1, note: '军阵刀法' },
      { type: 'attack', mul: 2.0, damage: 40, wuxing: 'jin', label: '金吾大辟', grade: 'kill', cost: 3, note: '斩妖之刑' },
      { type: 'debuff', mul: 0, label: '锁链缠足', grade: 'art', cost: 1, inflict: { id: 'silence', stacks: 1, duration: 1 }, note: '封你术法' },
    ],
  },
  {
    id: 'enemy_chunlei', name: '惊蛰·春雷兽', shape: 'beast',
    hp: 380, maxHp: 380, shield: 0, atk: 26, def: 16, wuxing: 'mu',
    statuses: [],     isBoss: true,
    chargeStacks: 0, shi: 0, shiCap: 5,
    lore: '第一声春雷震落的那头兽。它不是妖，是被节令催生的瑞兽——角上缠着尚未化尽的冬寒，眼里全是新生的绿。',
    intents: [
      { type: 'buff', mul: 0, label: '引雷', grade: 'art', cost: 1, selfCharge: 2, note: '引雷入角，蓄势 +2' },
      { type: 'attack', mul: 1.6, damage: 42, wuxing: 'mu', label: '春雷落', grade: 'dire', cost: 2, note: '雷击单点' },
      { type: 'aoe', mul: 1.1, damage: 28, wuxing: 'mu', label: '雷震四方', grade: 'art', cost: 1, note: '范围雷爆' },
      { type: 'guard', mul: 0, label: '盘角', grade: 'base', cost: 0, selfShield: 40, note: '兽角结阵' },
      { type: 'attack', mul: 2.4, damage: 62, wuxing: 'mu', label: '万雷归一', grade: 'kill', cost: 4, note: '倾泻全部蓄势' },
    ],
  },
  {
    id: 'enemy_bingyan', name: '霜降·冰魇', shape: 'dragon',
    hp: 430, maxHp: 430, shield: 30, atk: 28, def: 19, wuxing: 'shui',
    statuses: [],     isBoss: true,
    chargeStacks: 0, shi: 0, shiCap: 5,
    lore: '凝在华灯上的最后一层白霜，是霜降那日天地收摄的灵气化的形。美得让人忘记害怕——被它盯上的人，会忘记自己为什么出门。',
    intents: [
      { type: 'attack', mul: 1.4, damage: 38, wuxing: 'shui', label: '冰锥', grade: 'base', cost: 0, note: '快速霜刺' },
      { type: 'guard', mul: 0, label: '凝霜', grade: 'base', cost: 0, selfShield: 46, note: '霜甲加身' },
      { type: 'aoe', mul: 1.3, damage: 36, wuxing: 'shui', label: '霜噬', grade: 'dire', cost: 2, note: '寒潮铺场' },
      { type: 'debuff', mul: 0, label: '忘川低语', grade: 'art', cost: 1, inflict: { id: 'weak', stacks: 2, duration: 2 }, note: '夺你心志' },
      { type: 'attack', mul: 2.6, damage: 72, wuxing: 'shui', label: '绝息·冰封', grade: 'kill', cost: 4, note: '霜降绝杀' },
    ],
  },
];

export const ENEMY_MAP: Record<string, Enemy> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

/* ============================== 战役（4 场） ============================== */

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'camp_1', order: 1, name: '第一战 · 烟火长安',
    desc: '华灯初上，金吾卫巡过街市——它认得你手里的兵刃，「规矩」不许你带着杀意过市。',
    enemyIds: ['enemy_jiaozao', 'enemy_jinwu'],
  },
  {
    id: 'camp_2', order: 2, name: '第二战 · 深夜写字楼',
    desc: '灯还亮着，人已经不是人了。整层楼的怨气都凝在同一个工位上。',
    enemyIds: ['enemy_jiaban', 'enemy_jiaozao', 'enemy_tanchen'],
  },
  {
    id: 'camp_3', order: 3, name: '第三战 · 春雷乍动',
    desc: '第一声春雷落下时，整座城的霓虹都颤了一下——瑞兽踏云而来，它要试试你的道。',
    enemyIds: ['enemy_chunlei', 'enemy_jinwu'],
  },
  {
    id: 'camp_4', order: 4, name: '第四战 · 霜雷交泰',
    desc: '冬与春在同一天撞上。雷在左，霜在右，天地正炁与节令之灵一并压来——此谓「考试」。',
    enemyIds: ['enemy_chunlei', 'enemy_bingyan', 'enemy_jiaban'],
  },
];

