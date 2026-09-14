#!/usr/bin/env node
/**
 * 立绘抠图 · 去除纯色（默认白底）背景，输出真 alpha 透明 PNG
 *
 * 用法：
 *   node scripts/抠图.mjs                      自动扫描 public/art 下所有「假透明」白底图
 *   node scripts/抠图.mjs 路径1 路径2 ...       只处理指定文件
 *   node scripts/抠图.mjs --all                连已有 alpha 的图也重新处理
 *   node scripts/抠图.mjs --dry                只报告不写文件（先看判定准不准）
 *   node scripts/抠图.mjs --tol 46             放宽容差（深色 / 渐变背景用）
 *   node scripts/抠图.mjs --no-trim            不裁切四周透明包围盒
 *   node scripts/抠图.mjs --max-height 900     输出高度上限（默认 720）
 *   node scripts/抠图.mjs --palette            启用调色板量化（体积更小，可能有色带）
 *   node scripts/抠图.mjs --no-backup          不备份原图（默认备份到 _原图备份/）
 *
 * 原理：
 *   1. 四边多点采样取「中位数」得背景色（不取四角平均 —— 四角可能有人物肢体）
 *   2. 多轮 flood fill（0.6x / 1x / 1.5x 逐级放宽容差）从图像边缘吃掉背景连通域，
 *      抗锯齿过渡带会被后续轮次吃掉，避免残留白边
 *   3. 前景做 8 连通域标记，抹掉散落的小噪点 / 灰雾
 *   4. 边界像素按「到背景色的距离」映射 alpha → 自然的抗锯齿过渡，而非硬切锯齿
 *   5. 裁切透明包围盒 → 缩放 → 压缩输出
 *
 * 为什么这样做：AI 生图返回的「透明背景」通常不是真 alpha，而是把白底 / 棋盘格
 * 烘进了像素。靠肉眼看不出来，要采样四角 RGBA 才能判断（alpha 恒 255 = 假透明）。
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ART_DIR = path.join(ROOT, 'public', 'art');
const BACKUP_DIR = path.join(ROOT, '_原图备份');

/* ============================== 命令行 ============================== */

const argv = process.argv.slice(2);
const opts = {
  tol: 40,
  trim: true,
  dry: false,
  all: false,
  backup: true,
  palette: false,
  maxHeight: 720,
};
const targets = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--tol') opts.tol = Number(argv[++i]);
  else if (a === '--max-height') opts.maxHeight = Number(argv[++i]);
  else if (a === '--no-trim') opts.trim = false;
  else if (a === '--dry') opts.dry = true;
  else if (a === '--all') opts.all = true;
  else if (a === '--palette') opts.palette = true;
  else if (a === '--no-backup') opts.backup = false;
  else if (!a.startsWith('--')) targets.push(a);
}

/* ============================== 工具 ============================== */

const median = (arr) => {
  arr.sort((x, y) => x - y);
  return arr[arr.length >> 1];
};

const fmtSize = (bytes) => (bytes / 1024 / 1024).toFixed(2) + 'MB';
const fmtKB = (bytes) => (bytes / 1024).toFixed(0) + 'KB';

/**
 * 判定是否为「需要抠图的白底假透明」
 * 条件：四周采样点全部 alpha=255（说明没有真透明）且其中绝大多数接近白色
 */
function looksLikeFlatWhite(data, w, h, c) {
  const pts = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1],
  ];
  let whiteish = 0;
  let opaque = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * c;
    if (data[i + 3] === 255) opaque++;
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) whiteish++;
  }
  return opaque === pts.length && whiteish >= 6;
}

/** 采样四边中位数，得到背景色 */
function sampleBackground(data, w, h, c) {
  const rs = [];
  const gs = [];
  const bs = [];
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  const grab = (x, y) => {
    const i = (y * w + x) * c;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < w; x += step) {
    grab(x, 0);
    grab(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    grab(0, y);
    grab(w - 1, y);
  }
  return [median(rs), median(gs), median(bs)];
}

/* ============================== 核心抠图 ============================== */

async function cutout(file, o) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const total = w * h;

  // ---- 1. 背景色 ----
  const bg = sampleBackground(data, w, h, c);

  // ---- 2. 预计算「到背景色的平方距离」，避免 BFS 里重复算 ----
  const distArr = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * c;
    const dr = data[p] - bg[0];
    const dg = data[p + 1] - bg[1];
    const db = data[p + 2] - bg[2];
    distArr[i] = dr * dr + dg * dg + db * db;
  }

  // ---- 3. 多轮 flood fill：从边缘向内吃背景 ----
  const isBg = new Uint8Array(total);
  for (const factor of [0.6, 1, 1.5]) {
    const thr = o.tol * factor;
    const thr2 = thr * thr * 3;
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const tryPush = (idx) => {
      if (isBg[idx] || distArr[idx] > thr2) return;
      isBg[idx] = 1;
      queue[tail++] = idx;
    };

    for (let x = 0; x < w; x++) {
      tryPush(x);
      tryPush((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      tryPush(y * w);
      tryPush(y * w + w - 1);
    }

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0) tryPush(idx - 1);
      if (x < w - 1) tryPush(idx + 1);
      if (y > 0) tryPush(idx - w);
      if (y < h - 1) tryPush(idx + w);
    }
  }

  // ---- 4. 前景 8 连通域清理：抹掉散落噪点 ----
  const comp = new Int32Array(total).fill(-1);
  const sizes = [];
  for (let seed = 0; seed < total; seed++) {
    if (isBg[seed] || comp[seed] >= 0) continue;
    const id = sizes.length;
    let count = 0;
    const q = [seed];
    comp[seed] = id;
    for (let head = 0; head < q.length; head++) {
      const idx = q[head];
      count++;
      const x = idx % w;
      const y = (idx / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (isBg[ni] || comp[ni] >= 0) continue;
          comp[ni] = id;
          q.push(ni);
        }
      }
    }
    sizes.push(count);
  }

  const maxSize = sizes.reduce((m, s) => (s > m ? s : m), 0);
  const keep = new Set();
  sizes.forEach((s, id) => {
    if (s === maxSize || s > total * 0.0005) keep.add(id);
  });
  let noiseRemoved = 0;
  for (let i = 0; i < total; i++) {
    if (!isBg[i] && !keep.has(comp[i])) {
      isBg[i] = 1;
      noiseRemoved++;
    }
  }

  // ---- 5. 生成输出像素 + 边界 alpha 映射 ----
  const out = Buffer.alloc(total * 4);
  const dLow = o.tol * o.tol * 1.2;   // 低于此距离 → 视为背景残留，全透明
  const dHigh = o.tol * o.tol * 12;   // 高于此距离 → 全不透明
  const alphaOf = (i) => {
    if (isBg[i]) return 0;
    const d = distArr[i];
    if (d <= dLow) return 0;
    if (d >= dHigh) return 255;
    return Math.round(((d - dLow) / (dHigh - dLow)) * 255);
  };

  for (let i = 0; i < total; i++) {
    const p = i * c;
    const q = i * 4;
    out[q] = data[p];
    out[q + 1] = data[p + 1];
    out[q + 2] = data[p + 2];
    out[q + 3] = alphaOf(i);
  }

  // 再对紧邻背景的前景像素做一次 3x3 最小值羽化，消除硬锯齿
  const alphaSnap = new Uint8Array(total);
  for (let i = 0; i < total; i++) alphaSnap[i] = out[i * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (isBg[i]) continue;
      let min = 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const a = alphaSnap[(y + dy) * w + (x + dx)];
          if (a < min) min = a;
        }
      }
      if (min < 255) out[i * 4 + 3] = (out[i * 4 + 3] * 3 + min) >> 2;
    }
  }

  // ---- 6. 裁切透明包围盒 ----
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('整张图都被判定为背景 —— 容差过大或背景非纯色，请用 --tol 调小重试');

  let srcBuf = out;
  let sw = w;
  let sh = h;
  let trimmed = false;
  if (o.trim && (minX > 0 || minY > 0 || maxX < w - 1 || maxY < h - 1)) {
    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const cropped = Buffer.alloc(tw * th * 4);
    for (let y = 0; y < th; y++) {
      const from = ((minY + y) * w + minX) * 4;
      out.copy(cropped, y * tw * 4, from, from + tw * 4);
    }
    srcBuf = cropped;
    sw = tw;
    sh = th;
    trimmed = true;
  }

  // ---- 7. 缩放 + 压缩 ----
  let pipe = sharp(srcBuf, { raw: { width: sw, height: sh, channels: 4 } });
  if (o.maxHeight && sh > o.maxHeight) {
    pipe = pipe.resize({ height: o.maxHeight, withoutEnlargement: true });
  }
  pipe = pipe.png(
    o.palette
      ? { compressionLevel: 9, palette: true, quality: 88, effort: 10 }
      : { compressionLevel: 9, effort: 10 },
  );
  const pngBuf = await pipe.toBuffer();

  return {
    before: fs.statSync(file).size,
    after: pngBuf.length,
    buf: pngBuf,
    bg,
    srcW: w,
    srcH: h,
    outW: trimmed ? sw : Math.round(sw * Math.min(1, o.maxHeight / sh)),
    outH: Math.min(sh, o.maxHeight),
    trimmed,
    noiseRemoved,
  };
}

/* ============================== 主流程 ============================== */

async function main() {
  let files;
  if (targets.length > 0) {
    files = targets.map((t) => (path.isAbsolute(t) ? t : path.resolve(ROOT, t)));
  } else {
    if (!fs.existsSync(ART_DIR)) {
      console.error('找不到素材目录：' + ART_DIR);
      process.exit(1);
    }
    files = fs
      .readdirSync(ART_DIR)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .map((f) => path.join(ART_DIR, f))
      .sort();
  }

  console.log('');
  console.log('抠图 · 模式 ' + (opts.dry ? '仅报告（--dry）' : '写入') + ' · 容差 ' + opts.tol + ' · 高度上限 ' + opts.maxHeight);
  console.log('素材目录 ' + ART_DIR);
  console.log('─'.repeat(72));

  let done = 0;
  let skipped = 0;

  for (const file of files) {
    const name = path.basename(file);
    if (!fs.existsSync(file)) {
      console.log('  跳过  ' + name + ' —— 文件不存在');
      skipped++;
      continue;
    }

    // 预检：判断是否值得处理
    const head = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const needIt = looksLikeFlatWhite(head.data, head.info.width, head.info.height, head.info.channels);
    if (!needIt && !opts.all) {
      const hasAlpha = head.data.some((v, i) => i % head.info.channels === 3 && v < 255);
      console.log(
        '  跳过  ' + name + ' —— ' + (hasAlpha ? '已有 alpha 通道，无需抠图' : '四周非纯白（背景图？）'),
      );
      skipped++;
      continue;
    }

    try {
      const r = await cutout(file, opts);
      const saved = ((1 - r.after / r.before) * 100).toFixed(0);
      console.log('');
      console.log('  处理  ' + name);
      console.log(
        '        背景色 rgb(' + r.bg.join(',') + ')' +
          ' · 原 ' + r.srcW + 'x' + r.srcH +
          ' → 出 ' + r.outW + 'x' + r.outH +
          (r.trimmed ? '（已裁包围盒）' : ''),
      );
      console.log(
        '        体积 ' + fmtSize(r.before) + ' → ' + fmtKB(r.after) +
          '（-' + saved + '%）' +
          (r.noiseRemoved > 0 ? ' · 清除噪点 ' + r.noiseRemoved + 'px' : ''),
      );

      if (opts.dry) {
        console.log('        [--dry] 未写入');
      } else {
        if (opts.backup && !fs.existsSync(path.join(BACKUP_DIR, name))) {
          fs.mkdirSync(BACKUP_DIR, { recursive: true });
          fs.copyFileSync(file, path.join(BACKUP_DIR, name));
        }
        fs.writeFileSync(file, r.buf);
        console.log('        已写入' + (opts.backup ? '（原图备份至 _原图备份/）' : ''));
      }
      done++;
    } catch (e) {
      console.log('  失败  ' + name + ' —— ' + e.message);
      skipped++;
    }
  }

  console.log('');
  console.log('─'.repeat(72));
  console.log('完成：处理 ' + done + ' 张，跳过 ' + skipped + ' 张');
  if (done > 0 && !opts.dry) {
    console.log('');
    console.log('提示：若边缘仍有白边，用 --tol 调小（如 30）重跑；');
    console.log('      若主体被误删，用 --tol 调大（如 50）。原图在 _原图备份/ 可随时还原。');
  }
  console.log('');
}

main().catch((e) => {
  console.error('脚本异常：' + e.message);
  process.exit(1);
});
