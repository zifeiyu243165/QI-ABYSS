#!/usr/bin/env node
/**
 * 《炁渊 / QI ABYSS》架构守卫 —— 四层守卫里的 L4（构建级）
 *
 * ## 它是什么
 * 本脚本是「四层守卫」中最外层的一层：L1 类型级（tsc / Record<> 契约）、
 * L2 运行时守卫（assertNever / assertNoIllegalAddBase）、L3 测试级契约（*.test.ts）、
 * **L4 构建级脚本（本文件）**。它用纯文本扫描的方式，把那些「类型系统看不见、
 * 运行时也不会报错」的架构规矩固化下来，作为 CI 兜底。
 *
 * ## 它拦得住什么
 * 拦得住「**不该出现的东西出现了**」这类**词法/结构级**违规：
 *   - 引擎里冒出非确定性随机源（Math.random / Date.now）
 *   - 除 hooks.ts 外有人直接读 state.solarTermId 去分支节气
 *   - tokens.css 之外冒出 hex 颜色字面量（配色铁律）
 *   - 定义了却没人用的 @keyframes（死样式）
 *   - constants.ts 里零引用的常量（数值铁律的空转）
 *   - StatusId 联合类型成员没在 statuses.ts 登记
 *   - 声明 implemented:true 却是空 hooks 的节气（纯 no-op）
 *   - 常量之间的算术关系被改坏（HAND_DRAW_CAP / PARRY_TOTAL_MS）
 *
 * ## 它拦不住什么（很重要，别把它当银弹）
 *   - **拦不住「读对了但算错了」**：比如 effectiveDefense 公式写反、伤害被重复减伤。
 *     这类逻辑错误的职责在 **L3 契约测试**（src/game/engine/contract.test.ts）。
 *   - **拦不住跨文件的语义不一致**：比如数据里写了「减速 +2 势」，引擎实际只减了 1。
 *     文本扫描只能看到符号是否出现，看不到符号的「含义」是否对齐。
 *   - 拦不住依赖新增：npm 依赖是否被偷偷引入要人去 review package.json。
 *
 * ## 退出码语义（接 CI 用）
 *   - 存在 error  → process.exitCode = 1（红）
 *   - 只有 warning → process.exitCode = 0（绿，但黄灯可见）
 *   豁免（exempt）一律打印为 ⚠ 警告而非错误，且每条豁免在下方清单里都写了可读理由，
 *   让「历史债务」一直可见、可追踪，而不是被一句「已豁免」永久掩盖。
 *
 * 只使用 Node 原生模块，零第三方依赖；路径统一走 node:path，Windows / Git Bash 均可运行。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ENGINE = path.join(SRC, 'game', 'engine');

/* ============================== 通用工具 ============================== */

/** 递归收集指定扩展名的文件（排序保证输出稳定） */
function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, exts, out);
    else if (exts.includes(path.extname(ent.name))) out.push(p);
  }
  return out;
}

/** 项目根相对路径，统一用 POSIX 分隔符，输出跨平台一致 */
function toRel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

/**
 * 注释剥离：把 // 行注释与 /* *\/ 块注释替换成等长空格（保留换行 → 行号不变）。
 * 必须保住字符串字面量里的内容，否则 `'a//b'` 会被误判成注释。
 * 这是本脚本能做到的「最小正确」实现，足以覆盖本仓库的源码形态。
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inBlock = false;
  let inLine = false;
  let inStr = null;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += '\n'; } else out += ' ';
      i += 1;
      continue;
    }
    if (inBlock) {
      if (c === '*' && d === '/') { inBlock = false; out += '  '; i += 2; }
      else { out += c === '\n' ? '\n' : ' '; i += 1; }
      continue;
    }
    if (inStr) {
      if (c === '\\') { out += c + (text[i + 1] ?? ''); i += 2; continue; }
      out += c;
      if (c === inStr) inStr = null;
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') { inLine = true; out += '  '; i += 2; continue; }
    if (c === '/' && d === '*') { inBlock = true; out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i += 1; continue; }
    out += c;
    i += 1;
  }
  return out;
}

/** 逐行遍历（过滤空行由调用方决定） */
function eachLine(text, fn) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) fn(lines[i], i + 1);
}

/* ============================== 豁免清单（每条都带理由） ============================== */

/**
 * hex 越界豁免清单。
 * 【记录的是「遗留数量」】—— 守卫每次运行都会把当前实际数量与这里的登记值对比，
 * 一旦增长会额外告警，让债务可见、可追踪。改动 src/styles/** 不在本次任务范围内，
 * 故这些既有 hex 只能先豁免为 ⚠，不能自行修掉。
 */
const HEX_EXEMPT = {
  'src/game/data/actors.ts': {
    count: 9,
    reason: '角色调色板（palette: {robe,trim,hair}）属于「数据」而非「主题」——它是角色立绘的程序化配色输入，不是可被 tokens 统一管理的主题色。',
  },
  'src/components/fx/Effects.tsx': {
    count: 14,
    reason: 'Canvas 粒子颜色。Canvas 2D 无法直接消费 CSS 变量，需 getComputedStyle 逐帧读取后再填 ctx.fillStyle，改动成本高且属独立任务。',
  },
  'src/components/Screens.tsx': {
    count: 4,
    reason: '界面组件遗留色值，属用户尚未拍板的独立「文案/样式统一」任务。',
  },
  'src/components/svg/Figure.tsx': {
    count: 3,
    reason: '程序化 SVG 立绘的描边/瞳色等遗留色值，属用户尚未拍板的独立任务。',
  },
  'src/styles/global.css': {
    count: 3,
    reason: '全局样式遗留色值；本次任务明确禁止修改 src/styles/**，留待用户拍板。',
  },
};

/**
 * 死 keyframe 豁免清单。
 * 这两条经扫描确认在 src/** 中没有任何 animation / animationName 引用它们
 * （`breathe` 只出现在 `.gold-breathe` 这个类名里，而该类名应用的是 `goldBreathe`）。
 * 属于既有遗留债务；global.css 本次不可改，故豁免为 ⚠。详见交付回复的「疑似问题清单」。
 */
const KEYFRAME_EXEMPT = {
  breathe: 'global.css 既有遗留：无任何 animation 引用它（仅在类名 .gold-breathe 中出现）。styles/** 本次不可改。',
  telegraphSweep: 'global.css 既有遗留：无任何 animation 引用它。styles/** 本次不可改。',
};

/**
 * 零引用常量豁免清单。
 * 这些常量在 constants.ts 里被 export，但引擎/UI 中无人引用 ——
 * 引擎内目前用「内联字面量」替代（见交付回复的「疑似问题清单」，是真实的数值铁律债务）。
 * 由于不允许改引擎数值逻辑，这里先豁免为 ⚠，让债务可见。
 */
const CONST_EXEMPT = {
  SUBSTITUTE_RATIO_DEFAULT: '文档用途：默认阴阳替代比例，当前 substituteRatio() 从 STANCES 读取，未引用此常量。',
  SUBSTITUTE_RATIO_SANXIU: '文档用途：散修替代比例，当前由 STANCES[].substituteRatio 承载。',
  POJUN_LAYERS: '文档用途：破军所需势层数，引擎里用了 SHI_CAP 代替（数值同为 10），实为数值未单一来源的债务。',
  SHISHEN_BONUS_HITS: '文档用途：食神额外连击段数，battle.ts 内联了字面量 2，属数值未单一来源的债务。',
  SHISHEN_HIT_MUL: '文档用途：食神每段伤害系数，battle.ts 内联了字面量 0.8，属数值未单一来源的债务。',
  PIANCAI_DRAW_RATE: '文档用途：偏财额外抽牌概率，battle.ts 内联了字面量 0.2，属数值未单一来源的债务。',
};

/* ============================== 各项检查 ============================== */

/**
 * §1 引擎禁随机源。
 * 拦住什么：src/game/engine/** 里出现 Math.random / Date.now —— 它们会破坏确定性，
 * 让「同种子产生同战局」的单测失效，也会让回放/存档校验失效。
 * 注意：必须排除注释行，否则本文件与 rng.ts / battle.ts 的说明性注释会误报。
 */
function checkEngineRandomSource(E, W) {
  const files = walk(ENGINE, ['.ts']);
  const re = /Math\s*\.\s*random|Date\s*\.\s*now/;
  for (const f of files) {
    eachLine(stripComments(readText(f)), (line, ln) => {
      if (re.test(line)) E.push({ file: toRel(f), line: ln, msg: '引擎内禁止非确定性随机源（Math.random / Date.now），随机请走 state.rngState（mulberry32）' });
    });
  }
  void W;
}

/**
 * §2 节气铁律自检。
 * 拦住什么：hooks.ts 之外有人**读取 state.solarTermId 去分支节气效果**。
 * hooks.ts 顶部注释写的自检命令 `grep -r "solarTermId" src/game/engine/` 就是本条的来源，
 * 这里把它自动化，并处理两处「合法写入」：CreateBattleInput 的字段声明、构造时的入参传递。
 * 注意：测试文件（*.test.ts）会大量构造 solarTermId 入参，不属于引擎逻辑，故排除。
 */
function checkSolarTermId(E, W) {
  const files = walk(ENGINE, ['.ts']).filter((f) => !f.endsWith('.test.ts') && path.basename(f) !== 'hooks.ts');
  // 「写」入节气不等于「读 state 分支」，显式精确放行（模式越窄越安全）
  const allow = [/solarTermId:\s*string/, /input\.solarTermId/];
  for (const f of files) {
    eachLine(stripComments(readText(f)), (line, ln) => {
      if (!line.includes('solarTermId')) return;
      if (allow.some((re) => re.test(line))) return;
      E.push({
        file: toRel(f),
        line: ln,
        msg: '节气铁律：仅 hooks.ts 可读取 state.solarTermId（其余须经 fireHook* 间接访问），此处出现疑似直接读取',
      });
    });
  }
  void W;
}

/**
 * §3 hex 越界检查（配色铁律）。
 * 拦住什么：tokens.css 之外出现 hex 颜色字面量（#rgb / #rrggbb / #rrggbbaa）。
 * 已验证干净的文件若出现新 hex → error；已在豁免清单里的遗留文件 → ⚠（并追踪数量增长）。
 */
function checkHexLiterals(E, W) {
  const files = walk(SRC, ['.ts', '.tsx', '.css']);
  const tokensRel = 'src/styles/tokens.css';
  const re = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  for (const f of files) {
    const rel = toRel(f);
    if (rel === tokensRel) continue; // 全项目唯一允许出现 hex 的文件
    let total = 0; // hex 字面量总数（不是行数）——与豁免清单里登记的「遗留数量」同口径
    let firstLine = 0;
    let sample = '';
    eachLine(stripComments(readText(f)), (line, ln) => {
      const m = line.match(re);
      if (!m) return;
      total += m.length;
      if (firstLine === 0) { firstLine = ln; sample = m.join(' '); }
    });
    if (total === 0) continue;

    const exempt = HEX_EXEMPT[rel];
    if (exempt) {
      const grow = total > exempt.count ? `（较登记遗留 ${exempt.count} 处 **增长**！）` : '';
      W.push({ file: rel, line: firstLine, msg: `hex 豁免：本文件出现 ${total} 处 hex 颜色字面量${grow} —— ${exempt.reason}` });
    } else {
      E.push({ file: rel, line: firstLine, msg: `hex 越界：本文件不在豁免清单内，不得出现颜色字面量（${sample}）—— 请改用 tokens.css 的 CSS 变量` });
    }
  }
}

/**
 * §4 死 keyframe 检查。
 * 拦住什么：global.css 里 @keyframes X 定义了 X，但 src/** 里没有任何 animation / animationName
 * 真正引用它 —— 典型的「样式声明了、实际从不播放」。
 */
function checkDeadKeyframes(E, W) {
  const css = path.join(SRC, 'styles', 'global.css');
  if (!fs.existsSync(css)) return;
  const defined = [...readText(css).matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  const sources = walk(SRC, ['.ts', '.tsx', '.css']).map((f) => ({ rel: toRel(f), text: readText(f) }));

  for (const name of defined) {
    // 仅在 animation / animationName 声明所在行里查找该名字（比「全文出现」精确：类名撞名不算引用）
    const word = new RegExp(`\\b${name.replace(/[-]/g, '\\-')}\\b`);
    const animLine = new RegExp(`animation(-name)?\\s*:[^;]*${name.replace(/[-]/g, '\\-')}\\b`);
    let ref = null;
    for (const s of sources) {
      eachLine(stripComments(s.text), (line, ln) => {
        if (word.test(line) && animLine.test(line)) ref = { rel: s.rel, line: ln };
      });
      if (ref) break;
    }
    if (ref) continue;

    const exempt = KEYFRAME_EXEMPT[name];
    if (exempt) W.push({ file: 'src/styles/global.css', line: 1, msg: `死 keyframe 豁免：@keyframes ${name} 无任何 animation 引用 —— ${exempt}` });
    else E.push({ file: 'src/styles/global.css', line: 1, msg: `死 keyframe：@keyframes ${name} 定义了却没有任何 animation / animationName 引用它` });
  }
}

/**
 * §5 零引用常量检查（数值铁律）。
 * 拦住什么：constants.ts 里 export 的常量，在 src/ 其它文件里一次都没出现 ——
 * 说明「常量声明了、实际没用」，数值并未真正单一来源。允许白名单（带理由）。
 */
function checkUnusedConstants(E, W) {
  const constFile = path.join(SRC, 'game', 'constants.ts');
  if (!fs.existsSync(constFile)) return;
  const text = readText(constFile);
  const names = [...text.matchAll(/export const ([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const others = walk(SRC, ['.ts', '.tsx']).filter((f) => toRel(f) !== 'src/game/constants.ts');
  const corpus = others.map((f) => stripComments(readText(f))).join('\n');

  for (const name of names) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(corpus)) continue;
    const exempt = CONST_EXEMPT[name];
    if (exempt) W.push({ file: 'src/game/constants.ts', line: 1, msg: `零引用常量豁免：${name} —— ${exempt}` });
    else E.push({ file: 'src/game/constants.ts', line: 1, msg: `零引用常量：${name} 在 constants.ts 之外无人引用（数值未单一来源）` });
  }
}

/**
 * §6 状态完备性检查（类型系统之外的文本兜底）。
 * 拦住什么：types.ts 里 StatusId 联合类型新增了成员，却忘了在 data/statuses.ts 登记行为 ——
 * 那会是一枚「文案承诺了、引擎不认识」的哑弹。
 */
function checkStatusCompleteness(E, W) {
  const typesFile = path.join(SRC, 'game', 'types.ts');
  const statusFile = path.join(SRC, 'game', 'data', 'statuses.ts');
  if (!fs.existsSync(typesFile) || !fs.existsSync(statusFile)) return;

  const t = stripComments(readText(typesFile));
  const m = t.match(/export type StatusId\s*=([\s\S]*?);/);
  if (!m) {
    W.push({ file: toRel(typesFile), line: 1, msg: '未能定位 StatusId 联合类型，状态完备性检查跳过（请检查官方定义是否改名）' });
    return;
  }
  const members = [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]);
  const statusText = readText(statusFile);
  for (const id of members) {
    if (!new RegExp(`\\b${id}\\b`).test(statusText)) {
      E.push({ file: 'src/game/data/statuses.ts', line: 1, msg: `状态完备性：StatusId 成员 "${id}" 未在 STATUS_BEHAVIOR 中登记` });
    }
  }
}

/**
 * §7 节气实装状态自检。
 * 拦住什么：SOLAR_TERMS 里 implemented:true 却 hooks:{} —— 声称已实装、实际什么都不做（纯 no-op 的「声明幻影」）。
 */
function checkImplementedTerms(E, W) {
  const worldFile = path.join(SRC, 'game', 'data', 'world.ts');
  if (!fs.existsSync(worldFile)) return;
  const text = readText(worldFile);
  const start = text.indexOf('export const SOLAR_TERMS');
  if (start < 0) {
    W.push({ file: toRel(worldFile), line: 1, msg: '未能定位 SOLAR_TERMS，节气实装检查跳过' });
    return;
  }
  let curId = null;
  let curImplemented = false;
  eachLine(text.slice(start), (line, ln) => {
    const idm = line.match(/^\s*id:\s*'([^']+)'/);
    if (idm) { curId = idm[1]; curImplemented = false; }
    if (/implemented:\s*true/.test(line)) curImplemented = true;
    if (curId && curImplemented && /hooks:\s*\{\s*\}/.test(line)) {
      E.push({ file: toRel(worldFile), line: ln, msg: `节气 ${curId} 声明 implemented:true 却是空 hooks（{}）—— 纯 no-op，禁止「无响应系统」` });
    }
  });
}

/**
 * §8 常量关系自检。
 * 拦住什么：HAND_DRAW_CAP / HAND_LIMIT / PARRY_* 之间的算术关系被改坏。
 * 这类关系一旦错位，机制会「静默失效」（例如归墟永不触发）。
 */
function evalConst(rhs, table, seen = new Set()) {
  const expr = rhs.trim();
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (seen.has(expr)) return NaN;
  seen.add(expr);
  // 把标识符替换为已解析的数值，再求值
  const substituted = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    if (name in table) return String(evalConst(table[name], table, seen));
    return 'NaN';
  });
  try {
    // 仅含数字与四则运算，来源可信（本项目自有源码）
    // eslint-disable-next-line no-new-func
    return Function(`"use strict";return (${substituted});`)();
  } catch {
    return NaN;
  }
}

function checkConstantRelations(E, W) {
  const constFile = path.join(SRC, 'game', 'constants.ts');
  if (!fs.existsSync(constFile)) return;
  const text = stripComments(readText(constFile));
  const table = {};
  for (const m of text.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*([^;]+);/g)) {
    table[m[1]] = m[2];
  }
  const val = (n) => (n in table ? evalConst(table[n], table) : NaN);

  const drawCap = val('HAND_DRAW_CAP');
  const handLimit = val('HAND_LIMIT');
  const total = val('PARRY_TOTAL_MS');
  const tele = val('PARRY_TELEGRAPH_MS');
  const win = val('PARRY_WINDOW_MS');

  if (!(drawCap > handLimit)) {
    E.push({ file: 'src/game/constants.ts', line: 1, msg: `常量关系：HAND_DRAW_CAP(${drawCap}) 必须 > HAND_LIMIT(${handLimit})，否则归墟永不触发` });
  }
  if (!(total === tele + win)) {
    E.push({ file: 'src/game/constants.ts', line: 1, msg: `常量关系：PARRY_TOTAL_MS(${total}) 必须 === PARRY_TELEGRAPH_MS(${tele}) + PARRY_WINDOW_MS(${win})` });
  }
  void W;
}

/* ============================== 主流程 ============================== */

const CHECKS = [
  { id: 1, name: '引擎禁随机源（Math.random / Date.now）', run: checkEngineRandomSource },
  { id: 2, name: '节气铁律：仅 hooks.ts 可读 state.solarTermId', run: checkSolarTermId },
  { id: 3, name: 'hex 越界（配色铁律，仅 tokens.css 可含 hex）', run: checkHexLiterals },
  { id: 4, name: '死 keyframe（@keyframes 必须有 animation 引用）', run: checkDeadKeyframes },
  { id: 5, name: '零引用常量（数值铁律）', run: checkUnusedConstants },
  { id: 6, name: '状态完备性（StatusId 成员须在 statuses.ts 登记）', run: checkStatusCompleteness },
  { id: 7, name: '节气实装状态（implemented:true 不得是空 hooks）', run: checkImplementedTerms },
  { id: 8, name: '常量关系（HAND_DRAW_CAP / PARRY_TOTAL_MS）', run: checkConstantRelations },
];

function main() {
  const allErrors = [];
  const allWarnings = [];

  console.log('《炁渊 / QI ABYSS》架构守卫（L4 · 构建级）');
  console.log('═'.repeat(60));

  for (const c of CHECKS) {
    const E = [];
    const W = [];
    c.run(E, W);
    const badge = E.length > 0 ? `✗ ${E.length} error` : W.length > 0 ? `⚠ ${W.length} warn` : '✓ pass';
    console.log(`\n── §${c.id} ${c.name}  [${badge}]`);
    for (const e of E) console.log(`   ✗ ${e.file}:${e.line}  ${e.msg}`);
    for (const w of W) console.log(`   ⚠ ${w.file}:${w.line}  ${w.msg}`);
    allErrors.push(...E);
    allWarnings.push(...W);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✗ ${allErrors.length} 项错误 / ⚠ ${allWarnings.length} 项警告`);
  if (allErrors.length > 0) {
    console.log('存在 error：守卫失败（退出码 1）。豁免项请见上方 ⚠ 条目。');
    process.exitCode = 1;
  } else if (allWarnings.length > 0) {
    console.log('无 error，仅有可追踪的既有债务（⚠）。守卫通过（退出码 0）。');
  } else {
    console.log('全部检查通过。');
  }
}

main();
