/**
 * 存档迁移（纯函数，便于单测）。
 *
 * 【背景】S5 给存档加了 `locale` 字段，`SAVE_VERSION` 由 1 升到 2。
 * 旧实现「版本不等 → 直接返回默认值」会在版本升级时**清空玩家的通关记录与装备**（数据丢失 bug）。
 * 这里改为**平滑迁移**：以传入的默认存档为底，合并旧存档字段，最后统一把 version 提升到当前版本。
 *
 * 【为什么是纯函数、且放在 src/i18n/】
 *   - 纯函数去掉对 App 模块级 `DEFAULT_SAVE` 的依赖，可在 vitest（node 环境）里直接测，
 *     无需为了测试去 import 整个 App 组件树；
 *   - 本批只允许新增 `src/i18n/**` 文件，且本次迁移的起因正是 i18n 的 locale 字段，故置于此处；
 *   - `App.tsx` 的 `loadSave` 调用它并传入 `DEFAULT_SAVE`（**原函数名与调用点保持不变**）。
 */
import type { SaveData } from '../game/types';
import { SAVE_VERSION } from '../game/constants';
import { DEFAULT_LOCALE, LOCALES } from './locale-store';

/**
 * @param raw      从 localStorage 解析出来的原始存档（类型未知，可能是任意脏数据）
 * @param fallback 默认存档（App 传入 DEFAULT_SAVE）
 * @returns 迁移后的合法存档
 */
export function migrateSave(raw: unknown, fallback: SaveData): SaveData {
  if (!raw || typeof raw !== 'object') return fallback;
  const old = raw as Partial<SaveData> & { version?: number };

  // 逐字段合并：旧存档里有啥用啥，缺的用默认值补 —— 绝不因版本升级而丢字段。
  const base: SaveData = {
    version: old.version ?? fallback.version,
    clearedCampaigns: old.clearedCampaigns ?? fallback.clearedCampaigns,
    selectedCharacterId: old.selectedCharacterId ?? fallback.selectedCharacterId,
    equipment: old.equipment ?? fallback.equipment,
    fxLevel: old.fxLevel ?? fallback.fxLevel,
    locale: old.locale ?? fallback.locale,
  };

  // v1 → v2：补 locale（其余字段原样保留）。
  // 同时兜底：locale 缺失 / 非受支持取值（脏存档）时一律矫正为默认值。
  if ((old.version ?? 0) < 2 || !LOCALES.includes(base.locale)) {
    base.locale = DEFAULT_LOCALE;
  }

  base.version = SAVE_VERSION;
  return base;
}
