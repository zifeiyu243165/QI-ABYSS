import type { Card, EnchantCombo, Equipment } from '../types';

/* ============================== 装备 ============================== */

export const EQUIPMENT = [
  /* ---- 兵刃（唯一合法的 addBase 来源） ---- */
  {
    id: 'tangdao', name: '唐刀', kind: 'blade',
    atkBonus: 12, qiCapBonus: 0, qiCapSide: 'both', hitsBonus: 0,
    desc: '基础技「斩风」。直刃厚重，一刀两断。攻击 +12。',
  },
  {
    id: 'jian', name: '锏', kind: 'blade',
    atkBonus: 18, qiCapBonus: 0, qiCapSide: 'both', hitsBonus: 0,
    desc: '无刃钝器，靠质量砸开护甲。攻击 +18，但攻速略钝。',
  },
  {
    id: 'miaodao', name: '苗刀', kind: 'blade',
    atkBonus: 8, qiCapBonus: 0, qiCapSide: 'both', hitsBonus: 1,
    desc: '长柄窄刃，走偏锋。攻击 +8，连击段数 +1。',
  },

  /* ---- 法器 ---- */
  {
    id: 'lihuojing', name: '离火镜', kind: 'artifact',
    atkBonus: 0, qiCapBonus: 4, qiCapSide: 'yang', hitsBonus: 0, wuxing: 'huo',
    desc: '阳炁上限 +4，附魔火行。附魔命中附加灼烧。',
  },
  {
    id: 'kanshuipei', name: '坎水佩', kind: 'artifact',
    atkBonus: 0, qiCapBonus: 4, qiCapSide: 'yin', hitsBonus: 0, wuxing: 'shui',
    desc: '阴炁上限 +4，附魔水行。附魔命中附加霜寒（减速 + 破甲）。',
  },
  {
    id: 'wuleiling', name: '五雷令', kind: 'artifact',
    atkBonus: 0, qiCapBonus: 4, qiCapSide: 'yang', hitsBonus: 0, wuxing: 'jin',
    // 【文案对齐实现】引擎里没有任何「击退」机制（grep 全仓库只命中本行 desc 本身），
    // 故删去「击退」；且三条附魔组合中「雷震锏」（锏 + 五雷令）实际施加的是 armorBreak（破甲）而非麻痹，
    // 文案必须如实说明这一例外。
    desc: '阳炁上限 +4，附魔金行。附魔命中附加麻痹，唯「雷震锏」改为破甲。',
  },
] satisfies readonly Equipment[];

export const EQUIPMENT_MAP: Record<string, Equipment> = Object.fromEntries(
  EQUIPMENT.map((e) => [e.id, e]),
);

/**
 * 兵刃 × 法器 → 附魔招式（9 行组合映射）
 * 同一种兵器配不同法器，衍生完全不同的招式名、五行特效与受击反馈。
 */
export const ENCHANT_COMBOS = [
  { bladeId: 'tangdao', artifactId: 'lihuojing', skillName: '赤焰斩', wuxing: 'huo', mul: 0.5, inflict: { id: 'burn', stacks: 2, duration: 2 } },
  { bladeId: 'tangdao', artifactId: 'kanshuipei', skillName: '霜寒斩', wuxing: 'shui', mul: 0.5, inflict: { id: 'frost', stacks: 1, duration: 2 } },
  { bladeId: 'tangdao', artifactId: 'wuleiling', skillName: '奔雷斩', wuxing: 'jin', mul: 0.5, inflict: { id: 'paralyze', stacks: 1, duration: 1 } },

  { bladeId: 'jian', artifactId: 'lihuojing', skillName: '烈焰锏', wuxing: 'huo', mul: 0.6, inflict: { id: 'burn', stacks: 3, duration: 2 } },
  { bladeId: 'jian', artifactId: 'kanshuipei', skillName: '玄冰锏', wuxing: 'shui', mul: 0.6, inflict: { id: 'frost', stacks: 2, duration: 2 } },
  { bladeId: 'jian', artifactId: 'wuleiling', skillName: '雷震锏', wuxing: 'jin', mul: 0.6, inflict: { id: 'armorBreak', stacks: 2, duration: 2 } },

  { bladeId: 'miaodao', artifactId: 'lihuojing', skillName: '火舞苗刀', wuxing: 'huo', mul: 0.4, inflict: { id: 'burn', stacks: 1, duration: 2 } },
  { bladeId: 'miaodao', artifactId: 'kanshuipei', skillName: '霜刃苗刀', wuxing: 'shui', mul: 0.4, inflict: { id: 'frost', stacks: 1, duration: 2 } },
  { bladeId: 'miaodao', artifactId: 'wuleiling', skillName: '电光苗刀', wuxing: 'jin', mul: 0.4, inflict: { id: 'paralyze', stacks: 1, duration: 1 } },
] satisfies readonly EnchantCombo[];

export function findCombo(bladeId: string | null, artifactId: string | null): EnchantCombo | null {
  if (!bladeId || !artifactId) return null;
  return ENCHANT_COMBOS.find((c) => c.bladeId === bladeId && c.artifactId === artifactId) ?? null;
}

/* ============================== 卡池（26 张） ============================== */

export const CARDS = [
  /* ---- 物理 8 张 ---- */
  { id: 'card_zhanfeng', name: '斩风', kind: 'physical', costYang: 1, costYin: 0, mul: 1.0, hits: 1, aoe: false, desc: '唐刀基础技。一道直劈，攻击 ×1.0。' },
  { id: 'card_pishan', name: '劈山', kind: 'physical', costYang: 2, costYin: 0, mul: 1.6, hits: 1, aoe: false, desc: '力劈华山。攻击 ×1.6，附加破甲。', inflict: { id: 'armorBreak', stacks: 1, duration: 2 } },
  { id: 'card_hengsao', name: '横扫', kind: 'physical', costYang: 2, costYin: 0, mul: 0.7, hits: 1, aoe: true, desc: '群体攻击 ×0.7。' },
  { id: 'card_lianchi', name: '连刺', kind: 'physical', costYang: 1, costYin: 0, mul: 0.45, hits: 3, aoe: false, desc: '三段连刺，每段攻击 ×0.45。' },
  { id: 'card_pojiaji', name: '破甲击', kind: 'physical', costYang: 1, costYin: 1, mul: 0.9, hits: 1, aoe: false, desc: '攻击 ×0.9，大幅削减防御。', inflict: { id: 'armorBreak', stacks: 2, duration: 2 } },
  { id: 'card_huixuan', name: '回旋斩', kind: 'physical', costYang: 3, costYin: 0, mul: 1.2, hits: 2, aoe: false, desc: '两段回旋，每段攻击 ×1.2。' },
  { id: 'card_bengquan', name: '崩拳', kind: 'physical', costYang: 2, costYin: 0, mul: 2.0, hits: 1, aoe: false, desc: '蓄力一击，攻击 ×2.0，附加虚弱 1 层。', inflict: { id: 'weak', stacks: 1, duration: 1 } },
  { id: 'card_jifengci', name: '疾风刺', kind: 'physical', costYang: 1, costYin: 0, mul: 0.6, hits: 2, aoe: false, desc: '两段快刺，每段攻击 ×0.6，抽 1 张牌。', draw: 1 },

  /* ---- 术法 10 张（五行各 2） ---- */
  { id: 'card_jinfeng', name: '金锋诀', kind: 'spell', wuxing: 'jin', costYang: 0, costYin: 2, mul: 1.3, hits: 1, aoe: false, desc: '金行术法 ×1.3。' },
  { id: 'card_ruijin', name: '锐金斩', kind: 'spell', wuxing: 'jin', costYang: 0, costYin: 3, mul: 1.8, hits: 1, aoe: false, desc: '金行术法 ×1.8，附加破甲。', inflict: { id: 'armorBreak', stacks: 2, duration: 2 } },
  { id: 'card_qingmu', name: '青木诀', kind: 'spell', wuxing: 'mu', costYang: 0, costYin: 2, mul: 1.2, hits: 1, aoe: false, desc: '木行术法 ×1.2，回复 8 点气血。', heal: 8 },
  { id: 'card_tengman', name: '藤蔓缚', kind: 'spell', wuxing: 'mu', costYang: 0, costYin: 2, mul: 0.8, hits: 1, aoe: false, desc: '木行术法 ×0.8，附加虚弱。', inflict: { id: 'weak', stacks: 2, duration: 2 } },
  { id: 'card_hanbing', name: '寒冰咒', kind: 'spell', wuxing: 'shui', costYang: 0, costYin: 2, mul: 1.3, hits: 1, aoe: false, desc: '水行术法 ×1.3，附加霜寒。', inflict: { id: 'frost', stacks: 1, duration: 2 } },
  { id: 'card_chaosheng', name: '潮生诀', kind: 'spell', wuxing: 'shui', costYang: 0, costYin: 3, mul: 1.1, hits: 2, aoe: false, desc: '水行术法 ×1.1 ×2 段，获得 2 阴炁。', gainYin: 2 },
  { id: 'card_lihuo', name: '离火咒', kind: 'spell', wuxing: 'huo', costYang: 0, costYin: 2, mul: 1.4, hits: 1, aoe: false, desc: '火行术法 ×1.4，附加灼烧。', inflict: { id: 'burn', stacks: 2, duration: 2 } },
  { id: 'card_fentian', name: '焚天焰', kind: 'spell', wuxing: 'huo', costYang: 0, costYin: 4, mul: 1.3, hits: 1, aoe: true, desc: '群体火行术法 ×1.3，附加灼烧。', inflict: { id: 'burn', stacks: 3, duration: 2 } },
  { id: 'card_houtu', name: '厚土诀', kind: 'spell', wuxing: 'tu', costYang: 0, costYin: 2, mul: 0.9, hits: 1, aoe: false, desc: '土行术法 ×0.9，获得 12 点护盾。', shield: 12 },
  { id: 'card_yanzjia', name: '岩甲术', kind: 'spell', wuxing: 'tu', costYang: 0, costYin: 3, mul: 0.5, hits: 1, aoe: false, desc: '土行术法 ×0.5，获得 25 点护盾。', shield: 25 },

  /* ---- 功能 4 张 ---- */
  { id: 'card_huiqidan', name: '回气丹', kind: 'support', costYang: 0, costYin: 1, mul: 0, hits: 0, aoe: false, desc: '获得 2 阳炁 + 2 阴炁。', gainYang: 2, gainYin: 2 },
  { id: 'card_hushen', name: '护身咒', kind: 'support', costYang: 1, costYin: 0, mul: 0, hits: 0, aoe: false, desc: '获得 20 点护盾。', shield: 20 },
  { id: 'card_jingxin', name: '净心咒', kind: 'support', costYang: 0, costYin: 1, mul: 0, hits: 0, aoe: false, desc: '驱散自身所有负面状态，抽 1 张牌。', draw: 1, cleanse: true },
  { id: 'card_juqi', name: '聚炁', kind: 'support', costYang: 0, costYin: 0, mul: 0, hits: 0, aoe: false, desc: '抽 2 张牌，获得 1 阳炁。', draw: 2, gainYang: 1 },

  /* ---- 节气限定 4 张（仅对应炁候下进卡池） ---- */
  { id: 'card_guyu', name: '谷雨·润物', kind: 'spell', wuxing: 'mu', costYang: 0, costYin: 2, mul: 0, hits: 0, aoe: false, desc: '回复 22 点气血，并抽 1 张牌。', heal: 22, draw: 1, solarTermOnly: 'guyu' },
  { id: 'card_dashu', name: '大暑·流火', kind: 'spell', wuxing: 'huo', costYang: 0, costYin: 3, mul: 1.5, hits: 1, aoe: true, desc: '全场火行伤害 ×1.5，附加灼烧。', inflict: { id: 'burn', stacks: 2, duration: 2 }, solarTermOnly: 'dashu' },
  { id: 'card_shuangjiang', name: '霜降·凝华', kind: 'spell', wuxing: 'shui', costYang: 0, costYin: 4, mul: 2.2, hits: 1, aoe: false, desc: '单体高伤 ×2.2，附加冻结。', inflict: { id: 'freeze', stacks: 1, duration: 1 }, solarTermOnly: 'shuangjiang' },
  { id: 'card_lichun', name: '立春·破土', kind: 'spell', wuxing: 'tu', costYang: 0, costYin: 1, mul: 0, hits: 0, aoe: false, desc: '获得 2 层「势」（体修核心资源），抽 1 张牌。', draw: 1, gainShi: 2, solarTermOnly: 'lichun' },
] satisfies readonly Card[];

export const CARD_MAP: Record<string, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
