/**
 * 界面核验（视觉回归 + 素材降级验证）。
 *
 * 用途
 *   本项目会持续新增美术素材，而「素材缺失时是否白屏 / 报错 / 塌布局」无法靠单测覆盖。
 *   本脚本用真实浏览器驱动 dev server，对战斗界面做三相截图对比：
 *     A 素材齐全     —— 记录「接入素材后」的真实观感
 *     B 素材全部缺失 —— 把 public/art/ui_*.png 临时改名，验证降级（应回落纯 CSS 外观）
 *     C 原样恢复     —— 复核文件数并再截一张，确保 B 相没留下副作用
 *
 * 为什么每个 Phase 都开全新 browser context
 *   否则浏览器会命中 HTTP 缓存，让「素材缺失」这一相变得毫无意义。
 *
 * 用法
 *   1) 另开一个终端：npx vite --port 4319 --strictPort
 *   2) node scripts/界面核验.mjs            # 输出到 .核查截图/
 *   3) node scripts/界面核验.mjs --keep     # 只跑 A 相（不折腾素材，用于日常看效果）
 *
 * 依赖：playwright-core + 本机已安装的 Chromium（不写入 package.json，
 *       路径由 os.homedir() 与环境变量动态解析，可用 QI_PW_CORE /
 *       PLAYWRIGHT_BROWSERS_PATH 覆盖）。
 * 产物落在 .核查截图/（已在 .gitignore 中忽略），可随时重跑覆盖。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'public', 'art');
const OUT = path.join(ROOT, '.核查截图');
const BASE = process.env.QI_ABYSS_BASE ?? 'http://localhost:4319';
const KEEP_ONLY = process.argv.includes('--keep');

/**
 * 浏览器依赖一律动态解析，不写死任何用户名或绝对路径。
 * 可用环境变量覆盖：
 *   QI_PW_CORE              playwright-core 的目录
 *   PLAYWRIGHT_BROWSERS_PATH Chromium 缓存根目录
 */
const HOME = os.homedir();
const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? path.join(HOME, 'AppData', 'Local');

/** 定位 playwright-core 与 Chromium：优先仓库依赖，其次宿主运行环境 */
function resolvePlaywright() {
  const candidates = [
    process.env.QI_PW_CORE,
    path.join(ROOT, 'node_modules', 'playwright-core'),
    path.join(HOME, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return { req: c, mod: require(c) };
    } catch {
      /* 继续找下一个 */
    }
  }
  throw new Error(
    '未找到 playwright-core：请在本仓库安装，或用环境变量 QI_PW_CORE 指定目录',
  );
}

function resolveChrome() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(LOCAL_APP_DATA, 'ms-playwright'),
    path.join(HOME, '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const dir of fs.readdirSync(r)) {
      if (!dir.startsWith('chromium')) continue;
      const exe = path.join(r, dir, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
      const alt = path.join(r, dir, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(alt)) return alt;
    }
  }
  throw new Error('未找到 Chromium，请确认 ms-playwright 缓存目录');
}

const { mod: pw } = resolvePlaywright();
const CHROME = resolveChrome();

fs.mkdirSync(OUT, { recursive: true });

const uiPngs = () => fs.readdirSync(ART).filter((f) => f.startsWith('ui_') && f.endsWith('.png')).sort();
const baks = () => fs.readdirSync(ART).filter((f) => f.endsWith('.png.bak'));

/** 走一相：打开主界面 → 入局 → 等开场动画结束 → 采集指标 + 截图 */
async function runPhase(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  /**
   * 固定种子，让 A/B/C 三相进入**完全相同的战局**，截图才有可比性。
   *
   * `App.tsx` 开局时用 `Math.random()` 抽种子 —— 那是 UI 层行为（引擎本身仍是确定性的，
   * 随机一律走 `state.rngState`），但会让每次刷新抽到不同的月令/手牌。
   * 这里在页面脚本执行前覆写成固定序列：不触碰生产代码，又让三相可比。
   */
  await ctx.addInitScript(() => {
    let s = 20260916;
    Math.random = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  });

  const page = await ctx.newPage();
  const bucket = { consoleErrors: [], pageErrors: [], failedRequests: [], responses4xx: [], artImages: 0, artNotImage: [] };

  page.on('console', (m) => {
    if (m.type() === 'error') bucket.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => bucket.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => bucket.failedRequests.push(`${r.url()} :: ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400) bucket.responses4xx.push(`${r.status()} ${decodeURIComponent(u)}`);
    if (!u.includes('/art/')) return;
    const ct = r.headers()['content-type'] ?? '';
    if (ct.startsWith('image/')) bucket.artImages += 1;
    else bucket.artNotImage.push(`${r.status()} ${ct} ${decodeURIComponent(u.split('/art/')[1])}`);
  });

  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('.screen-frame', { timeout: 20000 });
  await page.locator('button', { hasText: /入/ }).first().click();
  // 【T01】主界面「入局」现在先进**择道面板**：先给它留一张截图，再点底部确认键（文本同样含「入」）开战。
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, `${label}-择道面板.png`) });
  await page.locator('button', { hasText: /入/ }).first().click();
  await page.waitForTimeout(4600); // 开场动画时长

  const metrics = await page.evaluate(() => {
    const frame = document.querySelector('.screen-frame');
    const fr = frame?.getBoundingClientRect();
    const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 200);
    return {
      frameW: Math.round(fr?.width ?? 0),
      frameH: Math.round(fr?.height ?? 0),
      overlayLayers: document.querySelectorAll('[aria-hidden]').length,
      buttons: document.querySelectorAll('button').length,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      textSample: text,
    };
  });
  await page.screenshot({ path: path.join(OUT, `${label}.png`) });
  await ctx.close();
  return { phase: label, uiPngsNow: uiPngs().length, bucket, metrics };
}

async function run() {
  if (!fs.existsSync(ART)) throw new Error(`素材目录不存在：${ART}`);
  if (baks().length > 0) throw new Error(`检测到上次残留的 .bak 文件，请先恢复：${baks().join(', ')}`);

  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const report = { phases: [], counts: {} };

  try {
    report.counts.before = uiPngs().length;
    if (KEEP_ONLY) {
      report.phases.push(await runPhase(browser, 'A-素材齐全'));
      console.log('已生成 A 相截图（--keep：未触碰素材文件）');
    } else {
      report.phases.push(await runPhase(browser, 'A-素材齐全'));

      // B 相：全部 ui_*.png 临时改名
      const names = uiPngs();
      for (const n of names) fs.renameSync(path.join(ART, n), path.join(ART, `${n}.bak`));
      report.counts.renamed = names.length;
      report.counts.duringB = uiPngs().length;
      report.phases.push(await runPhase(browser, 'B-素材缺失'));

      // C 相：原样恢复
      for (const f of baks()) fs.renameSync(path.join(ART, f), path.join(ART, f.replace(/\.bak$/, '')));
      report.counts.after = uiPngs().length;
      report.counts.bakLeft = baks().length;
      report.phases.push(await runPhase(browser, 'C-已恢复'));
    }
  } finally {
    // 无论成败都必须恢复素材，避免把仓库留在「素材被改名」的状态
    for (const f of baks()) fs.renameSync(path.join(ART, f), path.join(ART, f.replace(/\.bak$/, '')));
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  // 控制台摘要：只报「该警惕的」
  let bad = 0;
  for (const p of report.phases) {
    const { bucket: b, metrics: m } = p;
    const issues = b.consoleErrors.length + b.pageErrors.length + b.responses4xx.length;
    bad += issues;
    console.log(
      `${p.phase.padEnd(12)} 画布 ${m.frameW}x${m.frameH} · 叠加层 ${String(m.overlayLayers).padStart(2)} · ` +
        `图 ${String(b.artImages).padStart(2)} · 非图响应 ${String(b.artNotImage.length).padStart(2)} · ` +
        `console错误 ${b.consoleErrors.length} · page错误 ${b.pageErrors.length} · 4xx ${b.responses4xx.length}`,
    );
    if (b.pageErrors.length) console.log(`   pageError: ${b.pageErrors.slice(0, 3).join(' | ')}`);
    if (b.consoleErrors.length) console.log(`   consoleError: ${b.consoleErrors.slice(0, 3).join(' | ')}`);
  }
  console.log(`\n素材数：${report.counts.before} → ${report.counts.duringB ?? '-'} → ${report.counts.after ?? '-'}，残留 .bak ${report.counts.bakLeft ?? 0}`);
  console.log(`截图与 report.json 位于 ${OUT}`);

  if (bad > 0 && !KEEP_ONLY) {
    console.log('\n注意：B 相出现的「非图响应 / 4xx」是预期现象（图缺失时 dev server 返回 SPA fallback），');
    console.log('      判定降级是否成功要看 **pageError / consoleError 是否为 0**、以及截图里布局是否完好。');
  }
}

run().catch((e) => {
  console.error('核验脚本失败：', e);
  process.exit(1);
});
