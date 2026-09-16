/**
 * zh-CN —— 本项目**唯一真源文案表**（本批只有简体中文一种语言）。
 *
 * 【键命名规范】（务必遵守，后续批次沿用）
 * - 全小写 ASCII；层级用 `.` 分隔；层级内多词用 `-`（如 `end-turn`）
 * - 二级按「屏 / 来源」划分：`ui.battle.` / `ui.relic.` / `ui.result.` / …
 * - 叶子用**语义名**（`end-turn`），**禁止拼音**
 * - 插值占位写 `{name}`，参数名 ASCII 小驼峰
 *
 * 【本批（S0）只建立这些域】
 * - `label.*` 术语短名（按钮/角标/表头用的固定名词）—— S1 归一后各引用点改走 `t()`
 * - `ui.*`   界面文案 —— 本批只放 S1 触碰到的那些
 * - `tip.*`  释义长文 —— 本批只搬 `tip.status.*`（原 ui/Tip.tsx 的 STATUS_TIP）
 *
 * 【本批不做】`components/**` 与 `data/**` 的大批文案（下一批 S2/S3），以及引擎战报日志（第三批 S4）。
 *
 * 结构是 `as const`：`src/i18n/types.ts` 用它反推 `MessageKey`，改这里即可让全项目键类型同步。
 */
export const zhCN = {
  /** 术语短名（label.*）：全项目唯一真源，供按钮 / 角标 / 表头复用 */
  label: {
    /** 五行中文名（原 types.ts / Glyphs.tsx / BattleScreen.tsx 三份副本合一） */
    wuxing: {
      jin: '金',
      mu: '木',
      shui: '水',
      huo: '火',
      tu: '土',
    },
    /**
     * 五行相生顺序文案。
     * 【必须是旧文案的逐字搬运】原文形如「（木→火→土→金→水）」——箭头两侧无空格。
     * 原 world.ts 与 BattleScreen.tsx 各持一份副本，归一后都改引用本键。
     */
    wuxingChain: '木→火→土→金→水',
    /** 8 个状态中文名（原 statuses.ts label / Glyphs.tsx STATUS_CN / Tip.tsx STATUS_TIP 首行三份副本合一） */
    status: {
      burn: '灼烧',
      frost: '霜寒',
      freeze: '冻结',
      weak: '虚弱',
      armorBreak: '破甲',
      paralyze: '麻痹',
      silence: '沉默',
      flaw: '破绽',
    },
    /** 卡牌类别名（原 BattleScreen.tsx KIND_LABEL / RelicPhase.tsx kindCN 两份副本合一） */
    kind: {
      physical: '物理',
      spell: '术法',
      support: '功能',
    },
  },

  /** 界面文案（ui.*）：按屏 / 来源二级命名 */
  ui: {
    relic: {
      hint: {
        /** 归墟点选超量时的提示（带参：本回合要求化去的张数） */
        quota: '只需化去 {count} 张 —— 先取消一张再选别的',
      },
      tip: {
        /** 归墟印章已选够时的释义首句 */
        ready: '已选够 {count} 张，按下去即刻完成归墟。',
        /** 归墟印章尚缺张数时的释义首句 */
        pending: '还需再点选 {count} 张 —— 弃哪几张由你决定，印章只负责执行。',
      },
    },
  },

  /** 释义长文（tip.*）：长按 / 悬停时显示的浮层文案，可含 \n 换行 */
  tip: {
    /** 状态效果释义（原 ui/Tip.tsx 的 STATUS_TIP，逐字搬运） */
    status: {
      burn: '灼烧\n每回合开始损失「层数 ×4」点气血，持续到回合数耗尽。',
      frost: '霜寒\n减速并削弱护甲，是水行术法的收尾手段。',
      freeze: '冻结\n下回合完全无法行动，是最强的控制。',
      weak: '虚弱\n每层使造成的伤害 −15%（上限 −45%）。',
      armorBreak: '破甲\n每层削减目标 15% 防御，是「性命双修」里的破防关键。',
      paralyze: '麻痹\n每层 30% 概率令下一次攻击落空（上限 75%）。',
      silence: '沉默\n无法使用术法牌，只能出物理牌与功能牌。',
      flaw: '破绽\n下一次攻击必定暴击，且转化为无视防御的真实伤害。',
    },
  },
} as const;
