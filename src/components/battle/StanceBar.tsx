/**
 * 架势条 + 预选 + 确认（T03 · 拆分①）。
 *
 * 【来源】自 `BattleScreen.tsx` 架势条区块**逐字搬迁**：高度 38 / flex `0 0 38px` /
 * gap 6 / padding `0 10px` / 字号 11 / `zIndex:10` 保留；**三态配色（
 * active 朱红 / pending 明黄 / idle 宣纸）+ 确认键脉冲动画 `ctaPulse 1.5s` 逐字保留**。
 *
 * 【降级铁律】**兄弟三层**：
 *   ① 叠加层 —— `ui_架势条_底`（9S，作轨道）+ `ui_架势条_亮`（BG 110×34，仅 active 格）；
 *   ② 内容层 —— 三枚架势按钮 + 确认键（`zIndex:1`，压在轨道图之上）；
 *   ③ 基底 CSS 层 —— 轨道容器本无背景（透明）；三按钮各自的渐变/描边即其基底。
 *
 * 【分隔线对齐】素材 `ui_架势条_底` 上烘焙了两道描金竖线（把轨道三等分）。
 * 为让两道竖线与三格按钮的边界对齐：① 三格改为 **gap 0**，使每格恰为轨道 1/3 宽；
 * ② `SLICE.stanceBase` 的横向切片由 5% 微调为 3%（按 8px 端带下 1/3 处的映射反推）。
 * **高度 38 未改**（设计硬约束）。
 */
import { STANCES } from '../../game/data/world';
import type { StanceId } from '../../game/types';
import { t } from '../../i18n';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { SLICE, UI } from './artAssets';

interface StanceBarProps {
  /** 当前生效架势 */
  stance: StanceId;
  /** 本回合是否已切换过（已切换则确认键禁用） */
  stanceSwitched: boolean;
  /** 预选架势（点击只改它，需再按确认） */
  pending: StanceId | null;
  /** 预选变更（传 null 表示取消预选） */
  onSelect: (id: StanceId | null) => void;
  /** 确认切换 */
  onConfirm: () => void;
}

/** 三枚架势按钮共用的非颜色样式（颜色随三态变化，故不含在本常量） */
const stanceBtnBase = {
  width: '100%',
  padding: '5px 2px',
  borderRadius: 5,
  fontSize: 10.5,
  fontFamily: 'var(--font-brush)',
  letterSpacing: 1,
  cursor: 'pointer',
  transition: 'border-color 140ms, background 140ms, box-shadow 140ms',
} as const;

export function StanceBar({ stance, stanceSwitched, pending, onSelect, onConfirm }: StanceBarProps) {
  const confirmReady = pending !== null && !stanceSwitched;

  return (
    <div
      style={{
        height: 38,
        flex: '0 0 38px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        fontSize: 11,
        zIndex: 10,
      }}
    >
      {/* 三格架势轨道：素材只覆盖这三格（不含右侧确认键） */}
      <div style={{ position: 'relative', flex: 1, height: '100%', display: 'flex', alignItems: 'center' }}>
        {/* ① 叠加层：轨道素材（9S） */}
        <ArtLayer fileName={UI.stanceBase} mode="slice" slice={SLICE.stanceBase} zIndex={0} />
        {/* ② 内容层：三格按钮（gap 0 → 每格 1/3，与素材两道竖线对齐） */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', width: '100%' }}>
          {STANCES.map((s) => {
            const active = stance === s.id;
            const isPending = pending === s.id;
            return (
              <Tip
                key={s.id}
                text={t('tip.battle.stance', {
                  name: s.name,
                  desc: s.desc,
                  suffix: active
                    ? t('tip.battle.stance-active')
                    : isPending
                      ? t('tip.battle.stance-pending')
                      : t('tip.battle.stance-idle'),
                })}
                placement="top"
                style={{ flex: 1 }}
              >
                <button
                  onClick={() => onSelect(pending !== null || active ? null : s.id)}
                  style={{
                    ...stanceBtnBase,
                    position: 'relative',
                    border: `1.5px solid ${
                      active
                        ? 'var(--color-miaojin-light)'
                        : isPending
                          ? 'var(--color-minghuang)'
                          : 'rgba(212,168,67,0.45)'
                    }`,
                    background: active
                      ? 'linear-gradient(180deg, var(--color-zhuhong-light), var(--color-zhuhong))'
                      : isPending
                        ? 'linear-gradient(180deg, rgba(245,197,24,0.92), rgba(212,168,67,0.88))'
                        : 'linear-gradient(180deg, rgba(251,247,236,0.92), rgba(236,217,171,0.85))',
                    color: active ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-text-sub)',
                    textShadow: active ? '0 1px 2px rgba(80,20,10,0.5)' : 'none',
                    boxShadow: active
                      ? '0 0 10px rgba(212,168,67,0.5)'
                      : isPending
                        ? '0 0 12px rgba(245,197,24,0.9)'
                        : 'none',
                  }}
                >
                  {/*
                    ① 叠加层：active 格的高亮素材（BG 110×34）。
                    图像层 `background-color:transparent`（ArtLayer 已保证），不盖死按钮基底渐变。
                    ArtLayer 的 fit 分支会重置 inset，这里用 left/top + translate(-50%,-50%) 精确居中。
                  */}
                  {active && (
                    <ArtLayer
                      fileName={UI.stanceGlow}
                      mode="fit"
                      fit={{ w: 110, h: 34 }}
                      zIndex={1}
                      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 2 }}>{s.name.split('·')[0]}</span>
                </button>
              </Tip>
            );
          })}
        </div>
      </div>

      {/*
        确认键：架势切换的**唯一**生效入口。
        点击架势只做预选（明黄高亮），必须再按这里才 dispatch —— 防止误触改掉整套打法。
        位置常驻不隐藏，避免预选时整排按钮横向跳位。
      */}
      <Tip
        text={t('tip.battle.stance-confirm', {
          suffix: stanceSwitched
            ? t('tip.battle.stance-confirm-switched')
            : pending !== null
              ? t('tip.battle.stance-confirm-pending', {
                  name: STANCES.find((x) => x.id === pending)?.name ?? pending,
                })
              : t('tip.battle.stance-confirm-none'),
        })}
        placement="top"
        style={{ flex: '0 0 50px' }}
      >
        <button
          disabled={pending === null || stanceSwitched}
          onClick={onConfirm}
          style={{
            ...stanceBtnBase,
            cursor: confirmReady ? 'pointer' : 'not-allowed',
            border: `1.5px solid ${
              confirmReady ? 'var(--color-miaojin-light)' : 'rgba(212,168,67,0.4)'
            }`,
            background: confirmReady
              ? 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))'
              : 'linear-gradient(180deg, rgba(251,247,236,0.8), rgba(236,217,171,0.7))',
            color: 'var(--color-card-title)',
            fontWeight: 700,
            opacity: confirmReady ? 1 : 0.45,
            boxShadow: confirmReady ? '0 0 12px rgba(212,168,67,0.9)' : 'none',
            animation: confirmReady ? 'ctaPulse 1.5s ease-in-out infinite' : undefined,
          }}
        >
          {t('ui.battle.stance-confirm')}
        </button>
      </Tip>
    </div>
  );
}
