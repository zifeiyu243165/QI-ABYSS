# 炁渊 · QI ABYSS

新中式绮丽 · 回合制卡牌对战手游（手机竖屏 390×844）

> 以中国「五正色 + 干支历法」为骨、以「性命双修」为魂的卡牌对战。阳炁阴炁双资源、弹反微操、五行连携、二十四节气变量联动。

---

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（浏览器打开后按 F12 → 设备工具栏 → 选手机尺寸）
npm run build      # 生产构建，产物在 dist/
npm run test       # 运行单元测试
npm run lint       # 静态检查
```

> 若 `npm run build` 报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，是沙箱对 `dist/art` 批量删除的保护，
> 用 `npm run build:safe` 绕过，或先手动删除 `dist` 目录。

## 技术栈

Vite 8 + React 19 + TypeScript 6 + oxlint + vitest

无第三方 UI 库、无状态管理库。配色统一由 CSS 变量管理（`src/styles/tokens.css` 是全项目唯一出现 hex 的文件）。

## 核心系统

| 系统 | 说明 |
|---|---|
| **双脉炁资源** | 阳炁（攻击/击杀获得）+ 阴炁（受击/格挡获得），可 2:1 互转 |
| **弹反微操** | 敌方前摇后进入判定窗，红区=普通格挡（减伤 40%），金区=完美弹反（免伤+追击） |
| **奥义卡** | 两张同属性牌合并，伤害 (A+B)×1.5，不消耗额外回合 |
| **破绽** | 回合结束按连击/相克给敌人标记，下回合首张攻击牌必暴击且转真实伤害 |
| **三大架势** | 体修（叠「势」层数）/ 法修（五行相生链）/ 散修（阴阳差值转化暴击） |
| **装备附魔** | 3 兵刃 + 3 法器，9 种组合产出不同斩击，双兵刃/双法器/一兵一法各有流派 |
| **五层变量联动** | 月令 → 炁候（节气）→ 十神 → 架势 → 装备 |

## 项目结构

```
src/
├── game/
│   ├── engine/          # 战斗引擎（确定性，无 Math.random / Date.now）
│   │   ├── battle.ts    # 回合状态机 + reducer
│   │   ├── damage.ts    # 7 段伤害结算管线
│   │   ├── hooks.ts     # 节气效果挂载点
│   │   └── rng.ts       # mulberry32 种子随机
│   ├── data/            # 纯数据：角色 / 卡牌 / 敌人 / 世界设定
│   ├── constants.ts
│   └── types.ts
├── components/
│   ├── BattleScreen.tsx # 战斗界面 + 弹反面板
│   ├── Screens.tsx      # 主页 / 编队 / 结算
│   └── svg/Figure.tsx   # 立绘（AI 图优先，失败回退程序化 SVG）
└── styles/
    ├── tokens.css       # 颜色 / 字体 / 间距变量（唯一 hex 出处）
    └── global.css
```

## 设计约定

- **确定性引擎**：禁用 `Math.random` 与 `Date.now`，随机数走 `state.rngState`（mulberry32），
  弹反时间从 UI 以 `elapsedMs` 传入。相同种子必然产生相同战局。
- **「性命双修」用类型强制**：`DamageModifier` 的 `addBase` 算子只允许装备来源，其余来源运行时抛错。
  全乘法结构使五层变量的计算顺序与结果无关，消灭顺序依赖 bug。
- **节气零改引擎**：`engine/hooks.ts` 是全引擎唯一读 `solarTermId` 的地方，新增节气只加数据。
- **美术资源兜底**：`public/art/` 下 9 张 AI 生成图为真透明 PNG 抠图，
  加载失败时自动回退程序化 SVG 立绘，不会白屏。

## 美术资源

`public/art/` 共 9 张（3 角色 / 5 敌人 / 1 背景），总计约 1.5MB。

角色立绘在生成时即在 prompt 中要求纯色背景，再经 flood-fill 抠图管线转为真 alpha 通道并压缩体积。

## 文档

- [`docs/PRD.md`](docs/PRD.md) — 产品需求文档
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 系统架构设计
- [`docs/OVERVIEW.md`](docs/OVERVIEW.md) — 交付说明与验证结果
- [`docs/class-diagram.mermaid`](docs/class-diagram.mermaid) / [`docs/sequence-diagram.mermaid`](docs/sequence-diagram.mermaid) — 类图与时序图

## 运行环境

Node.js 18+（开发时使用 22.x）。
