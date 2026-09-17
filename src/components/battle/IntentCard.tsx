/**
 * 敌方意图卡（T05 · 拆分③）。
 *
 * 【来源】自 `BattleScreen.tsx` 的本地 `IntentCard` 组件**搬迁 + 接入素材**。
 * 净高 `INTENT_H - 8`(=40) / 圆角 5 / padding `2px 5px` / 品阶角标 13×13 / 招式名 11 /
 * 势 pip `5×3`（间距 1）一律逐字保留。
 *
 * 【接入素材】
 * - `ui_意图卡底`（9S）：叠在现有宣纸渐变底之上。
 * - `ui_势条_填充`（9S）：按 `shi/shiCap` 比例做填充宽。
 * - `ui_势条_格`（BG `100% 100%`）：透明底刻线遮罩（纯装饰，数值仍按比例填充，设计 U7）。
 *
 * 【降级铁律】**兄弟三层**：① 基底 CSS —— 卡片渐变/描边/圆角 + 势条 CSS pip 排（常驻 DOM）；
 * ② 叠加层 —— `ArtLayer`/`nineSlice` 素材（`background-color:transparent`）；③ 内容层 `zIndex:1`。
 * 图缺失 → 基底原样可见，不白屏、不报错、无布局跳动。
 */
import { t } from '../../i18n';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { artUrl, nineSlice, SLICE, UI } from './artAssets';
import { INTENT_H } from './constants';

interface IntentCardProps {
  /** 招式名 */
  label: string;
  /** 品阶 base/art/dire/kill */
  grade: string;
  /** 是否处于敌方前摇（高亮） */
  active: boolean;
  /** 本回合是否会出手攻击（决定红系配色） */
  willAttack: boolean;
  /** 招式短注（可选） */
  note?: string;
  /** 当前势 */
  shi: number;
  /** 势上限（决定刻线/填充比例的基准） */
  shiCap: number;
}

export function IntentCard({ label, grade, active, willAttack, note, shi, shiCap }: IntentCardProps) {
  const gradeColor: Record<string, string> = {
    base: 'var(--color-card-text-sub)',
    art: 'var(--color-wx-shui)',
    dire: 'var(--color-hupo)',
    kill: 'var(--color-zhuhong)',
  };
  // 品阶短名与释义一律走 t()，不在本文件留中文字面量
  const gradeName: Record<string, string> = {
    base: t('ui.battle.grade-base'),
    art: t('ui.battle.grade-art'),
    dire: t('ui.battle.grade-dire'),
    kill: t('ui.battle.grade-kill'),
  };
  const gradeTip: Record<string, string> = {
    base: t('tip.battle.grade-base'),
    art: t('tip.battle.grade-art'),
    dire: t('tip.battle.grade-dire'),
    kill: t('tip.battle.grade-kill'),
  };
  const accent = gradeColor[grade] ?? gradeColor['base']!;
  const shiPct = shiCap > 0 ? Math.max(0, Math.min(100, (shi / shiCap) * 100)) : 0;

  return (
    <Tip
      text={t('tip.battle.intent', {
        label,
        grade: gradeTip[grade] ?? grade,
        note: note ? note + '\n' : '',
        shi,
        cap: shiCap,
      })}
      placement="top"
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: INTENT_H - 8,
          // 【T05 遮挡修复】内容内缩 5px < 素材 `ui_意图卡底` 的左右框饰各 8px（`SLICE.intentCard`），
          // 会被边框压住 → 改为左右各 8px（见设计 §五 遮挡排查表）。
          padding: '2px 8px',
          borderRadius: 5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 1,
          background:
            willAttack && active
              ? 'linear-gradient(180deg, rgba(255,236,220,0.99), rgba(240,200,180,0.97))'
              : 'linear-gradient(180deg, rgba(251,247,236,0.97), rgba(236,217,171,0.94))',
          border: `1.5px solid ${willAttack && active ? 'var(--color-zhuhong)' : 'var(--color-miaojin)'}`,
          boxShadow: willAttack && active ? '0 0 12px rgba(194,59,34,0.7)' : '0 2px 6px rgba(0,0,0,0.35)',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
        }}
      >
        {/* ① 叠加层：意图卡底素材（9S）—— 叠在渐变底之上、内容之下 */}
        <ArtLayer fileName={UI.intentCardBg} mode="slice" slice={SLICE.intentCard} zIndex={0} />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <span
            style={{
              fontSize: 8,
              width: 13,
              height: 13,
              lineHeight: '13px',
              borderRadius: 2,
              background: accent,
              color: 'var(--color-xuanzhi-warm)',
              fontWeight: 700,
              flex: '0 0 auto',
            }}
          >
            {gradeName[grade] ?? t('ui.battle.grade-base')}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-brush)',
              fontSize: 11,
              color: willAttack && active ? 'var(--color-card-title)' : 'var(--color-card-text)',
              fontWeight: willAttack && active ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        </div>

        {/* 势：出招资源。基底 pip 排常驻；素材填充/刻线叠在其上 */}
        <div style={{ position: 'relative', zIndex: 1, width: 96, height: 6, margin: '0 auto' }}>
          {/* ③ 基底 CSS 层：CSS pip 排（无素材时可见） */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
            {Array.from({ length: shiCap }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 3,
                  borderRadius: 1,
                  background: i < shi ? 'var(--color-hupo)' : 'rgba(120,100,70,0.28)',
                }}
              />
            ))}
          </div>

          {/* ① 叠加层 · 势条填充（9S）—— 按比例填充 */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${shiPct}%`,
              backgroundColor: 'transparent',
              ...nineSlice(UI.shiFill, SLICE.shiFill),
            }}
          />
          {/* ① 叠加层 · 势条刻线（BG 透明底刻线遮罩） */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'transparent',
              backgroundImage: `url(${artUrl(UI.shiTicks)})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          />
        </div>
      </div>
    </Tip>
  );
}
