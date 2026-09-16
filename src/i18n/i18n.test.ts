/**
 * L3 · 文案层契约（i18n）
 *
 * 把「搬家不改字」固化成测试：
 *   - 孤儿键扫描：zh-CN 的每个叶子键都必须在 src/** 里被**字面量**引用（防止表里堆死键）；
 *   - 插值无残留：带 {name} 的键用 interpolate 传齐参数后不得残留 `{`；
 *   - t() 正确性：抽查取值与插值结果；
 *   - 5 张重复映射表归一：WUXING_KEY / KIND_KEY / 每个 StatusId 的 label/tip 键必须齐全且与
 *     STATUS_BEHAVIOR[id].labelKey 一致；
 *   - 相克关系字面量只允许出现在 constants.ts（单一真源 WU_XING_KE）；
 *   - S5 存档 v1→v2 平滑迁移（不得清空玩家进度）。
 *
 * 注意：本文件位于 src/i18n/ 之下，而 L4 守卫的「中文越界」扫描会整体排除 src/i18n/**。
 */
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../game/constants';
import { STATUS_BEHAVIOR } from '../game/data/statuses';
import type { CardKind, SaveData, StatusId, WuXing } from '../game/types';
import { interpolate } from './interpolate';
import { KIND_KEY, STATUS_LABEL_KEY, STATUS_TIP_KEY, WUXING_KEY } from './keys';
import { DEFAULT_LOCALE, LOCALES } from './locale-store';
import { zhCN } from './locales/zh-CN';
import { migrateSave } from './save-migration';
import { t } from './t';

/* ============================== 工具 ============================== */

type Leaf = readonly [key: string, value: string];

/** 把文案表拍平成 [完整键, 值] 列表 */
function flatten(obj: Record<string, unknown>, prefix = '', out: Leaf[] = []): Leaf[] {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

const LEAVES = flatten(zhCN as unknown as Record<string, unknown>);

/** src 根目录 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 递归收集源码文件（.ts/.tsx） */
function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) listSourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const SOURCE_FILES = listSourceFiles(SRC);
/** 全量源码文本（用于「字面量引用」扫描） */
const SOURCE_CORPUS = SOURCE_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');

/** 正则转义（把键里的 `.` 等元字符原样匹配） */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ============================== 测试 ============================== */

describe('S0 文案运行时（键表 / 插值 / t()）', () => {
  it('孤儿键：zh-CN 的每个叶子键都在 src/** 里被字面量引用过', () => {
    expect(LEAVES.length).toBeGreaterThan(0);
    const missing = LEAVES.map(([k]) => k).filter(
      (k) => !new RegExp(`['"\`]${escapeRe(k)}['"\`]`).test(SOURCE_CORPUS),
    );
    expect(missing, `以下文案键在 src/** 中无任何字面量引用（疑似死键）：${missing.join(', ')}`).toEqual([]);
  });

  it('插值无残留：带 {name} 的键传齐参数后不残留花括号', () => {
    const withParams = LEAVES.filter(([, v]) => /\{\w+\}/.test(v));
    expect(withParams.length, '本批应有带参键，若为 0 说明插值路径无人覆盖').toBeGreaterThan(0);
    for (const [key, raw] of withParams) {
      const params: Record<string, string> = {};
      for (const m of raw.matchAll(/\{(\w+)\}/g)) params[m[1]!] = 'X';
      expect(interpolate(raw, params).includes('{'), `${key} 插值后仍残留 {`).toBe(false);
    }
    // 缺参兜底：缺参数时保留占位原样且不崩
    expect(interpolate('{a}·{b}', { a: '1' })).toBe('1·{b}');
  });

  it('t() 正确性：抽查 3 个键（含 1 个带参键）', () => {
    expect(t('label.wuxing.jin')).toBe('金');
    expect(t('label.kind.spell')).toBe('术法');
    expect(t('ui.relic.hint.quota', { count: 3 })).toBe('只需化去 3 张 —— 先取消一张再选别的');
  });
});

describe('S1 五张映射表归一后的锁表断言', () => {
  it('WUXING_KEY 覆盖全部 WuXing，且 t() 结果非空', () => {
    const ids: WuXing[] = ['jin', 'mu', 'shui', 'huo', 'tu'];
    expect(Object.keys(WUXING_KEY).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(t(WUXING_KEY[id]).length).toBeGreaterThan(0);
  });

  it('KIND_KEY 覆盖全部 CardKind，且 t() 结果非空', () => {
    const ids: CardKind[] = ['physical', 'spell', 'support'];
    expect(Object.keys(KIND_KEY).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(t(KIND_KEY[id]).length).toBeGreaterThan(0);
  });

  it('每个 StatusId 必有 label.status.* 与 tip.status.*，且与 STATUS_BEHAVIOR.labelKey 一致', () => {
    const ids = Object.keys(STATUS_BEHAVIOR) as StatusId[];
    expect(ids.length).toBe(8);
    for (const id of ids) {
      expect(t(STATUS_LABEL_KEY[id]).length, `状态 ${id} 缺少中文名键`).toBeGreaterThan(0);
      expect(t(STATUS_TIP_KEY[id]).length, `状态 ${id} 缺少释义长文键`).toBeGreaterThan(0);
      // STATUS_BEHAVIOR 是 L1 契约表，其 labelKey 必须指向同一真源键
      expect(STATUS_BEHAVIOR[id].labelKey).toBe(STATUS_LABEL_KEY[id]);
    }
  });

  it('相克关系字面量只允许出现在 constants.ts（单一真源 WU_XING_KE）', () => {
    const re = /mu\s*:\s*['"]tu['"]/;
    const offenders = SOURCE_FILES.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) =>
      f.replace(/\\/g, '/'),
    );
    expect(offenders.length, `相克字面量副本：${offenders.join(', ')}`).toBe(1);
    expect(offenders[0]).toContain('src/game/constants.ts');
  });
});

describe('S5 存档 locale 持久化与迁移', () => {
  const FALLBACK: SaveData = {
    version: 1,
    clearedCampaigns: [],
    selectedCharacterId: 'luqingya',
    equipment: {},
    fxLevel: 'lavish',
    locale: 'zh-CN',
  };

  it('SAVE_VERSION 已升到 2，且默认 locale 在受支持集合内', () => {
    expect(SAVE_VERSION).toBe(2);
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('v1 老存档升级后进度不被清空，且补上 locale/version', () => {
    const v1 = {
      version: 1,
      clearedCampaigns: ['camp_1', 'camp_2'],
      selectedCharacterId: 'sujiangxue',
      equipment: { sujiangxue: ['miaodao', 'kanshuipei'] },
      fxLevel: 'standard',
    };
    const out = migrateSave(v1, FALLBACK);
    expect(out.clearedCampaigns).toEqual(['camp_1', 'camp_2']); // 关键：不得被清空
    expect(out.selectedCharacterId).toBe('sujiangxue');
    expect(out.equipment.sujiangxue).toEqual(['miaodao', 'kanshuipei']);
    expect(out.locale).toBe(DEFAULT_LOCALE);
    expect(out.version).toBe(SAVE_VERSION);
  });

  it('v2 存档保留自身内容；脏数据回退默认存档', () => {
    const v2 = { ...FALLBACK, version: 2, clearedCampaigns: ['camp_3'] };
    expect(migrateSave(v2, FALLBACK).clearedCampaigns).toEqual(['camp_3']);
    expect(migrateSave(null, FALLBACK)).toBe(FALLBACK);
    expect(migrateSave('oops', FALLBACK)).toBe(FALLBACK);
  });
});
