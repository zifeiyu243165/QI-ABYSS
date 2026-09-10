# 《炁渊 · QI ABYSS》UI 重制与三个体验问题修复

## TL;DR

把「丑」的根因挖出来了 —— 不是配色问题，是**美术图是整幅场景图**（自带背景 + 烘死的假透明棋盘格），贴到水墨 UI 上就是一块硬边矩形。重做美术资源为**真透明抠图**，并修掉怪物不攻击的逻辑 bug、重写弹反手感。

## 三个问题的处理

### 1. UI 太丑 / 立绘该用 AI 生图

**根因诊断**（不是猜的，是采样验证的）：
```
char_luqingya.png   1024x1536   corners: 2,6,14,255 | ...   opaque=100.0%
enemy_jiaozao.png   1024x1024   corners: 245,243,240,255 ...  lightGrayWhite=64.8%
```
`alpha=255` 说明「透明背景」是假的 —— 棋盘格/白底被烘进了像素。加上原图是「赛博朋克街道上的剑客」这类**整幅场景**，贴到水墨 UI 上必然是一块矩形。

**解法**：
- 用 AI 重新生成 3 张角色立绘，prompt 里**写死背景要求**：`纯白背景（无任何背景元素、无建筑、无天空、无地面阴影、无光效），只有人物本体`
- 自研 flood-fill 抠图管线：背景中位数采样 → 多轮容差扩张（吃掉抗锯齿带）→ 连通域清理噪点 → 边缘羽化 → 包围盒裁切
- 5 张敌人立绘走同一管线处理
- 背景换成淡雅水墨山水（青灰/月白/淡墨），并去除 AI 水印
- **体积 21MB → 1.5MB（-93%）**，透明通道完好
- 保留 `onError` 回退程序化 SVG，图片挂了也不白屏

### 2. 对方怪物不攻击

两个叠加的 bug：
| 位置 | 问题 | 修复 |
|---|---|---|
| `battle.ts` | `intents[next.turn % len]` 索引错位，第 1 回合取到 `charge` 而非攻击 | 改为 `(next.turn - 1) % len` |
| `battle.ts` | `charge` 意图是空操作（加 `e.atk` 但伤害走 `intent.damage`） | 新增 `chargeStacks`，蓄力提升下次伤害 |

回归测试确认：`ENEMY_ACT 后 hp = 108`（初始 120），日志「焦躁鬼 使用「抓挠」，造成 12 点伤害」。

### 3. 弹反手感不好

- 改为**纯 CSS 动画驱动光标**，去掉每帧 `setState` 的卡顿
- 判定改时间戳：`performance.now() - telegraphStartRef.current`
- 红区 = 普通格挡（减伤 40%），金区 = 完美弹反（免伤 + 追击）
- 新增玩家受击闪红、敌人蓄力脉动反馈

### 附带修的布局问题

- `CharacterFigure` 的 `size` 语义修正（原 `size * 2.4` 导致战斗 HUD 立绘溢出遮挡卡牌）
- 补上编队页漏传的 `characterId`（原本永远走 SVG 兜底，看不到 AI 立绘）
- 编队页补上水墨背景，三个页面视觉统一

## 交付概览

| 项 | 结果 |
|---|---|
| 类型检查 | `tsc -b` 零报错 |
| 静态检查 | oxlint 0 error / 0 warning |
| 单元测试 | 9 / 9 通过 |
| 浏览器验证 | 主页→编队→战斗→弹反 全流程截图，9 张图全部加载成功，控制台 0 error |

## 本轮改动文件

**美术资源**（`public/art/`，9 张，1.5MB）
`bg_battle.png`、`char_luqingya.png`、`char_sujiangxue.png`、`char_xiewujiu.png`、`enemy_*.png` ×5

**代码**
- `src/game/engine/battle.ts` — 敌人意图索引 + 蓄力机制 + RESET action
- `src/game/engine/diag.test.ts` — 新增（敌人攻击回归测试）
- `src/game/constants.ts` — 弹反窗口 `700ms`、`EARLY_PARRY_REDUCE=0.4`、`GUARD_SHIELD=15`
- `src/game/types.ts` — Enemy 增加 `chargeStacks` / `currentIntent`
- `src/game/data/actors.ts` — 5 个敌人补 `chargeStacks: 0`
- `src/components/svg/Figure.tsx` — AI 图优先 + SVG 兜底 + 投影/尺寸语义
- `src/components/BattleScreen.tsx` — CSS 弹反面板 + 受击/蓄力反馈 + 布局修正
- `src/components/Screens.tsx` — 主页/编队页背景与立绘
- `src/styles/global.css` — `parrySweep` / `hurtFlash` / `enemy-charging` 动画
- `package.json` — 新增 `build:safe` / `test` 脚本
- `docs/OVERVIEW.md` — 验证结果与美术资源章节更新

## 用户下一步

```bash
npm install
npm run dev        # 本地开发（推荐，手机模式 390×844 预览）
npm run build      # 生产构建
npm run build:safe # 若 build 报 SAFE_DELETE_BULK 就用这个
npm run test       # 9 项单测
```

游戏内验证建议：进战斗后点「结束回合」，观察
① 敌人在你进入弹反面板时是否掉血（应掉）
② 光标扫过金区时点「格挡」，应显示「完美弹反」且免伤

## 已知遗留

- 抠图对**深色/渐变背景**效果有限（flood fill 会被渐变截断）。若后续要加角色，坚持用纯色背景 prompt，别描述完整场景。
- 战斗 HUD 的立绘尺寸（88px）在小屏上略紧凑，可再调。
- 美术资源未做 WebP/AVIF，如需进一步减体积可加一步转码。
