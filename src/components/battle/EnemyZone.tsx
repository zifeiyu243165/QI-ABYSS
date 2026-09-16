/**
 * 敌方区容器（T05 · 拆分③）。
 *
 * 【来源】自 `BattleScreen.tsx` 敌方区区块**逐字搬迁**：敌方区高 **238** /
 * `paddingTop:6` / `gap:6` / `zIndex:25` / 整区 `shake` 抖动 key 一律保留；
 * 三行定高意图卡 / 立绘 / 信息板的结构不变。
 *
 * 【接入素材】
 * - `ui_敌方底台`（BG 300×116）：**叠在 `BaguaPlatform` 之下作底层**（设计 U6 双绘）——
 *   整区共享一块底台，定位在立绘盒底缘。`BaguaPlatform` 保留为上层光效。
 * - `ui_破绽标记`（BG 28×28）：**替换**现有「破绽」文字角标（文字角标降为基底，标记叠其上）。
 *
 * 【降级铁律】叠加层 `background-color:transparent`；底台/破绽标记均为**叠在基底之上的兄弟节点**；
 * 图缺失 → 底台消失（本区本无底台视觉）、「破绽」文字角标原样可见，不白屏、不报错。
 *
 * 【铁律逐字保留】`colW = isBoss?126:112` / `figH = isBoss?112:90` /
 * `BaguaPlatform size = isBoss?112:94` / `EnemyFigure size = figH/1.35` / 径向压边 `flawPulse` 动画。
 */
import type { BattleState } from '../../game/types';
import { t } from '../../i18n';
import { EnemyFigure } from '../svg/Figure';
import { BaguaPlatform } from '../svg/Glyphs';
import { ArtLayer } from './ArtLayer';
import { UI } from './artAssets';
import { FIGBOX_H, INTENT_H } from './constants';
import { EnemyInfoPanel } from './EnemyInfoPanel';
import { IntentCard } from './IntentCard';

interface EnemyZoneProps {
  /** 战斗状态（敌方数组、前摇相位、伤害信号） */
  state: BattleState;
  /** 当前选中目标 id（缺省取首个存活敌人） */
  targetId: string | null;
  /** 取意图的单一真源（编排壳持有，必须与引擎 enemyAct 的取法一致） */
  intentOf: (
    intents: { type: string; label: string }[],
    turn: number,
  ) => { type: string; label: string } | undefined;
  /** 点选目标 */
  onSelectTarget: (id: string) => void;
  /** 抖动计数（>0 且本帧有敌方受击数字时触发 shake） */
  shake: number;
}

export function EnemyZone({ state, targetId, intentOf, onSelectTarget, shake }: EnemyZoneProps) {
  const isTelegraph = state.phase === 'enemyTelegraph';

  return (
    <div
      key={`enemy-${shake}`}
      className={shake > 0 && state.pendingNumbers.some((n) => n.targetId !== 'player') ? 'shake' : undefined}
      style={{
        height: 238,
        flex: '0 0 238px',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 6,
        paddingTop: 6,
        zIndex: 25,
      }}
    >
      {/*
        ① 叠加层：敌方底台素材（BG 300×116）—— 整区共享一块底台，铺在立绘盒底缘，
        位于三列（position:relative）之下，因此也位于各列 `BaguaPlatform` 之下（双绘）。
        ArtLayer 的 fit 分支重置 inset，这里用 left/bottom + translateX(-50%) 居中定位。
      */}
      <ArtLayer
        fileName={UI.enemyPlatform}
        mode="fit"
        fit={{ w: 300, h: 116 }}
        zIndex={0}
        style={{ left: '50%', bottom: 68, transform: 'translateX(-50%)' }}
      />

      {state.enemies.map((e) => {
        const dead = e.hp <= 0;
        const hasFlaw = e.statuses.some((s) => s.id === 'flaw');
        const isTarget = e.id === targetId && !dead;
        const intent = intentOf(e.intents, state.turn);
        const willAttack = isTelegraph && (intent?.type === 'attack' || intent?.type === 'aoe') && !dead;
        const grade = (intent as { grade?: string })?.grade ?? 'base';

        const colW = e.isBoss ? 126 : 112;
        const figH = e.isBoss ? 112 : 90;

        return (
          <div
            key={e.id}
            onClick={() => !dead && onSelectTarget(e.id)}
            style={{
              width: colW,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: dead ? 'default' : 'pointer',
              position: 'relative',
            }}
          >
            {/* ① 意图卡：定高，始终占位，保证三列横向对齐 */}
            <div style={{ height: INTENT_H, width: '100%', display: 'flex', alignItems: 'center' }}>
              {!dead && (
                <IntentCard
                  label={intent?.label ?? '——'}
                  grade={grade}
                  active={isTelegraph}
                  willAttack={willAttack}
                  note={(intent as { note?: string })?.note}
                  shi={e.shi}
                  shiCap={e.shiCap}
                />
              )}
            </div>

            {/* ② 立绘盒：定高 + 径向暗色压边 */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: FIGBOX_H,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 10,
                  background:
                    'radial-gradient(ellipse at 50% 58%, rgba(24,16,9,0.5), rgba(24,16,9,0.12) 62%, transparent 78%)',
                  animation: hasFlaw ? 'flawPulse 1.4s ease-in-out infinite' : undefined,
                  boxShadow: isTarget ? 'inset 0 0 0 2px rgba(212,168,67,0.85)' : 'none',
                  pointerEvents: 'none',
                }}
              />
              <BaguaPlatform size={e.isBoss ? 112 : 94} wuxing={e.wuxing} />

              <EnemyFigure
                enemyId={e.id.replace('enemy_', '')}
                shape={e.shape}
                wuxing={e.wuxing}
                size={figH / 1.35}
                dim={dead}
                charging={willAttack}
              />

              {isTarget && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 9,
                    padding: '0 5px',
                    borderRadius: 3,
                    background: 'var(--color-miaojin)',
                    color: 'var(--color-card-title)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('ui.battle.target')}
                </div>
              )}
              {hasFlaw && (
                <div style={{ position: 'absolute', top: 0, right: 0, width: 28, height: 28 }}>
                  {/* ③ 基底 CSS 层：「破绽」文字角标（无素材时可见） */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      fontSize: 9,
                      background: 'linear-gradient(180deg, var(--color-miaojin-light), var(--color-miaojin))',
                      color: 'var(--color-card-title)',
                      padding: '0 4px',
                      borderRadius: 3,
                      fontWeight: 700,
                      border: '1px solid var(--color-xuanzhi-warm)',
                    }}
                  >
                    {t('label.status.flaw')}
                  </div>
                  {/* ① 叠加层：破绽标记素材（BG 28×28）—— 叠在文字角标之上，替换它 */}
                  <ArtLayer fileName={UI.flawMark} mode="fit" fit={{ w: 28, h: 28 }} zIndex={1} />
                </div>
              )}
            </div>

            {/* ③ 信息板：统一规格的暗色底板 */}
            <EnemyInfoPanel enemy={e} dead={dead} />
          </div>
        );
      })}
    </div>
  );
}
