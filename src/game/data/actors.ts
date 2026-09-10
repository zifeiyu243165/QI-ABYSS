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

export const ENEMIES: Enemy[] = [
  {
    id: 'enemy_jiaozao', name: '焦躁鬼', shape: 'wraith',
    hp: 60, maxHp: 60, shield: 0, atk: 10, def: 4, wuxing: 'huo',
    statuses: [],     isBoss: false,
    chargeStacks: 0,
    lore: '地铁早高峰挤出来的戾气，见人就咬。',
    intents: [
      { type: 'attack', mul: 1.0, damage: 12, wuxing: 'huo', label: '抓挠' },
      { type: 'charge', mul: 0, label: '蓄势' },
      { type: 'attack', mul: 1.4, damage: 17, wuxing: 'huo', label: '怒咬' },
    ],
  },
  {
    id: 'enemy_jiaban', name: '加班怨灵', shape: 'wraith',
    hp: 85, maxHp: 85, shield: 0, atk: 12, def: 8, wuxing: 'tu',
    statuses: [],     isBoss: false,
    chargeStacks: 0,
    lore: '连续三个月凌晨两点下班的人留下的东西，已经不记得自己叫什么。',
    intents: [
      { type: 'guard', mul: 0, label: '僵坐' },
      { type: 'attack', mul: 1.2, damage: 16, wuxing: 'tu', label: '重压' },
      { type: 'attack', mul: 0.7, damage: 9, wuxing: 'tu', label: '絮叨' },
    ],
  },
  {
    id: 'enemy_tanchen', name: '贪嗔蠹', shape: 'insect',
    hp: 70, maxHp: 70, shield: 0, atk: 14, def: 3, wuxing: 'mu',
    statuses: [],     isBoss: false,
    chargeStacks: 0,
    lore: '直播间里那句「最后三单」孵化出来的虫，永远填不饱。',
    intents: [
      { type: 'attack', mul: 0.9, damage: 13, wuxing: 'mu', label: '啃噬' },
      { type: 'aoe', mul: 0.6, damage: 8, wuxing: 'mu', label: '虫群' },
      { type: 'charge', mul: 0, label: '结茧' },
    ],
  },
  {
    id: 'enemy_chunlei', name: '惊蛰·春雷兽', shape: 'beast',
    hp: 180, maxHp: 180, shield: 0, atk: 18, def: 12, wuxing: 'mu',
    statuses: [],     isBoss: true,
    chargeStacks: 0,
    lore: '第一声春雷震落的那头兽，角上缠着尚未化尽的冬寒。',
    intents: [
      { type: 'charge', mul: 0, label: '引雷' },
      { type: 'attack', mul: 1.8, damage: 30, wuxing: 'mu', label: '春雷落' },
      { type: 'aoe', mul: 1.0, damage: 18, wuxing: 'mu', label: '雷震四方' },
      { type: 'attack', mul: 1.2, damage: 20, wuxing: 'mu', label: '撞角' },
    ],
  },
  {
    id: 'enemy_bingyan', name: '霜降·冰魇', shape: 'dragon',
    hp: 220, maxHp: 220, shield: 20, atk: 20, def: 15, wuxing: 'shui',
    statuses: [],     isBoss: true,
    chargeStacks: 0,
    lore: '凝在华灯上的最后一层白霜，被它盯上的人会忘记自己为什么出门。',
    intents: [
      { type: 'attack', mul: 1.5, damage: 28, wuxing: 'shui', label: '冰锥' },
      { type: 'guard', mul: 0, label: '凝霜' },
      { type: 'aoe', mul: 1.2, damage: 22, wuxing: 'shui', label: '霜噬' },
      { type: 'attack', mul: 2.2, damage: 40, wuxing: 'shui', label: '绝息·冰封' },
    ],
  },
];

export const ENEMY_MAP: Record<string, Enemy> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

/* ============================== 战役（4 场） ============================== */

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'camp_1', order: 1, name: '第一战 · 地铁末班',
    desc: '末班车厢里挤满了不肯散场的焦躁。',
    enemyIds: ['enemy_jiaozao'],
  },
  {
    id: 'camp_2', order: 2, name: '第二战 · 写字楼二十三层',
    desc: '灯还亮着，人已经不是人了。',
    enemyIds: ['enemy_jiaban', 'enemy_jiaozao'],
  },
  {
    id: 'camp_3', order: 3, name: '第三战 · 直播间三二一',
    desc: '上链接的倒计时里，有什么东西孵化了。',
    enemyIds: ['enemy_tanchen', 'enemy_jiaban'],
  },
  {
    id: 'camp_4', order: 4, name: '第四战 · 惊蛰·春雷动',
    desc: '第一声春雷落下时，整座城的霓虹都颤了一下。',
    enemyIds: ['enemy_chunlei', 'enemy_bingyan'],
  },
];
