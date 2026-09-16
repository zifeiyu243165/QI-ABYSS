/**
 * 操作栏 + 战报（T07 · 拆分⑤）。
 *
 * 【来源】自 `BattleScreen.tsx` 的 `{/* ============ 操作栏 ============ *␉}` 区块**逐字搬迁**：
 * 外层 `flex 0 0 auto / column / padding 0 10px 8px / gap 6 / zIndex 10`、两组横排按钮
 * （`gap 8`，次级组 `alignItems center`）、`Tip` 的 `flex:1` 与 `flex:1.15`、
 * 按钮 `style` 里的 `ctaPulse` 与发光 `boxShadow` —— 全部原样保留。
 *
 * 【铁律逐字保留】
 * - `ctaPulse`：出牌（`canPlaySelected`）与合并奥义（`fuseHint`）可用时各自 `1.6s ease-in-out infinite`，
 *   并各自叠加 `0 0 14px rgba(216,84,58,0.7)` / `rgba(212,168,67,0.8)` 外发光；
 * - 调息结果的**单一真源** `regulateOutcome(state, from)`：本组件**不调用、不自算**，
 *   只消费编排壳传入的 `regOutcome` / `canRegulate` / `regFrom`（引擎算一套、UI 只负责呈现）；
 * - 禁用态：四按钮的 `disabled` 全部照旧（`!canPlaySelected` / `!fuseHint` / `!canRegulate` / `isTelegraph`），
 *   实际灰度值由 `JadeButton` 内建的 `opacity: 0.7` 承担（操作栏这一区**没有** 0.45 这个值，
 *   0.45 属手牌区的 `dimmed`，不在此处）；
 * - 战报：`height: 82`、`slice(-40).reverse().slice(0, 12)`、`opacity: 1 - i * 0.05` 逐字保留。
 *
 * 【接入素材】
 * - `ui_玉按钮_主` / `ui_玉按钮_金` / `ui_玉按钮_灰`（9S，`SLICE.jadeButton`）—— 经 `JadeButton` 的
 *   可选 `skin?` 传文件名。**灰玉覆盖「ghost 态」与「disabled 态」两种**：调息键恒用灰玉；
 *   其余三键可用时用主/金玉，禁用时换灰玉（与设计 §三.4「覆盖 ghost + disabled 两态」一致）。
 * - `ui_战报框`（9S，左切片加大 `SLICE.logFrame`）—— 左端有一根装饰柱，故左切片取 14% 对 6%。
 *
 * 【降级铁律】按钮的基底是 `JadeButton` 自身的渐变 + 描金边（`skin` 缺省时它就是全部）；
 * 战报框的基底是外层 div 的深色渐变 + 描金边 + 左粗边 + 圆角 —— 素材只作叠加，缺失即回落到基底。
 * 战报框素材**中部是不透明木纹**，故它必须压在**内容之下**（而非盖在文字上）。
 */
import type { BattleState, Card } from '../../game/types';
import type { BattleAction, RegulateOutcome } from '../../game/engine/battle';
import { t } from '../../i18n';
import { JadeButton } from '../ui/Primitives';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { SLICE, UI } from './artAssets';

interface OperationBarProps {
  /** 战斗状态（战报、是否已调息） */
  state: BattleState;
  /** 战斗 action 派发器 */
  dispatch: (a: BattleAction) => void;
  /** 当前选中的单张牌（未选中或多选时为 undefined） */
  selectedCard: Card | undefined;
  /** 选中牌能否打出 */
  canPlaySelected: boolean;
  /** 当前选中的手牌 uid 列表（合并键文案需判断「恰好一张」） */
  selectedCards: string[];
  /** 可合体目标（null = 无可合体对象） */
  fuseHint: Card | null;
  /** 融合两张牌（返回是否成功） */
  tryFuse: (uidA: string, uidB: string) => boolean;
  /** 打出当前选中的牌 */
  playSelected: () => void;
  /** 是否敌方前摇中（禁用结束回合） */
  isTelegraph: boolean;
  /** 调息方向（阳炁不足时的兜底文案需要） */
  regFrom: 'yang' | 'yin';
  /** 调息判定结果 —— 引擎 `regulateOutcome()` 的返回值，**单一真源** */
  regOutcome: RegulateOutcome;
  /** 调息 UI 可用性（引擎 `canDo` 且非敌方前摇） */
  canRegulate: boolean;
}

export function OperationBar({
  state,
  dispatch,
  selectedCard,
  canPlaySelected,
  selectedCards,
  fuseHint,
  tryFuse,
  playSelected,
  isTelegraph,
  regFrom,
  regOutcome,
  canRegulate,
}: OperationBarProps) {
  /** 本次调息的扣费 / 收益（直接取引擎结果，UI 不再自算） */
  const regRatio = regOutcome.cost;
  const regGain = regOutcome.gain;
  /** 调息的源 / 目标炁名（由方向映射到词表，非自算数值） */
  const regFromName = regFrom === 'yang' ? t('ui.battle.yang-essence') : t('ui.battle.yin-essence');
  const regToName = regFrom === 'yang' ? t('ui.battle.yin-essence') : t('ui.battle.yang-essence');
  /** 不可用的原因文案：由引擎给出的 reason 驱动，界面不再自己猜 */
  const regDisabledTip =
    regOutcome.reason === 'targetFull'
      ? t('tip.battle.regulate-full', { to: regToName })
      : t('tip.battle.regulate-short', { from: regFromName, cost: regOutcome.cost });

  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 10px 8px',
        gap: 6,
        zIndex: 10,
      }}
    >
      {/* 主操作：出牌 / 合并奥义（可用时发光提示） */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Tip
          text={t('tip.battle.play', {
            suffix: selectedCard
              ? canPlaySelected
                ? t('tip.battle.play-ok')
                : t('tip.battle.play-disabled')
              : t('tip.battle.play-none'),
          })}
          placement="top"
          style={{ flex: 1 }}
        >
          <JadeButton
            onClick={playSelected}
            disabled={!canPlaySelected}
            variant="primary"
            size="sm"
            skin={canPlaySelected ? UI.btnPrimary : UI.btnGhost}
            style={{
              width: '100%',
              boxShadow: canPlaySelected ? '0 0 14px rgba(216,84,58,0.7), 0 2px 6px rgba(120,90,40,0.3)' : undefined,
              animation: canPlaySelected ? 'ctaPulse 1.6s ease-in-out infinite' : undefined,
            }}
          >
            {t('ui.battle.play-card')}
          </JadeButton>
        </Tip>
        <Tip
          text={t('tip.battle.fuse', {
            suffix: fuseHint ? t('tip.battle.fuse-target', { name: fuseHint.name }) : t('tip.battle.fuse-none'),
          })}
          placement="top"
          style={{ flex: 1 }}
        >
          <JadeButton
            onClick={() => {
              if (!fuseHint) return;
              const a = selectedCards[0];
              if (!a) return;
              tryFuse(a, fuseHint.uid ?? fuseHint.id);
            }}
            disabled={!fuseHint}
            variant="gold"
            size="sm"
            skin={fuseHint ? UI.btnGold : UI.btnGhost}
            style={{
              width: '100%',
              boxShadow: fuseHint ? '0 0 14px rgba(212,168,67,0.8), 0 2px 6px rgba(120,90,40,0.3)' : undefined,
              animation: fuseHint ? 'ctaPulse 1.6s ease-in-out infinite' : undefined,
            }}
          >
            {fuseHint
              ? t('ui.battle.fuse-merge', { name: fuseHint.name })
              : selectedCards.length === 1
                ? t('ui.battle.fuse-none')
                : t('ui.battle.fuse')}
          </JadeButton>
        </Tip>
      </div>

      {/* 次级操作：「阴阳逆转」在左（辅助），「结束回合」在右下（主操作，防误触需连点两次） */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tip
          text={t('tip.battle.regulate', {
            ratio: regRatio,
            gain: regGain,
            suffix: state.regulated
              ? t('tip.battle.regulate-done')
              : isTelegraph
                ? t('tip.battle.regulate-telegraph')
                : canRegulate
                  ? t('tip.battle.regulate-do', {
                      ratio: regRatio,
                      gain: regGain,
                      from: regFromName,
                      to: regToName,
                    })
                  : regDisabledTip,
          })}
          placement="top"
          style={{ flex: 1 }}
        >
          <JadeButton
            onClick={() => dispatch({ type: 'REGULATE', from: regFrom })}
            disabled={!canRegulate}
            variant="ghost"
            size="sm"
            skin={UI.btnGhost}
            style={{ width: '100%' }}
          >
            {state.regulated
              ? t('ui.battle.regulate-used')
              : isTelegraph
                ? t('ui.battle.regulate-telegraph')
                : canRegulate
                  ? t('ui.battle.regulate', { ratio: regRatio, gain: regGain })
                  : regOutcome.reason === 'targetFull'
                    ? t('ui.battle.regulate-full')
                    : t('ui.battle.regulate-short', {
                        side: regFrom === 'yang' ? t('ui.battle.yang') : t('ui.battle.yin'),
                      })}
          </JadeButton>
        </Tip>
        <Tip text={t('tip.battle.end-turn')} placement="top" style={{ flex: 1.15 }}>
          <JadeButton
            onClick={() => dispatch({ type: 'END_TURN' })}
            disabled={isTelegraph}
            variant="primary"
            size="sm"
            skin={isTelegraph ? UI.btnGhost : UI.btnPrimary}
            style={{ width: '100%' }}
          >
            {t('ui.battle.end-turn')}
          </JadeButton>
        </Tip>
      </div>

      {/* 战报：深色底板 + 高亮文字（此前浅底灰字，对比度极低） */}
      <Tip text={t('tip.battle.log')} placement="top" style={{ display: 'block' }}>
        <div
          style={{
            position: 'relative',
            height: 82,
            padding: '5px 8px',
            background: 'linear-gradient(180deg, rgba(38,28,17,0.9), rgba(26,19,11,0.92))',
            border: '1px solid rgba(212,168,67,0.55)',
            borderLeft: '3px solid var(--color-miaojin)',
            borderRadius: 5,
          }}
        >
          {/* ① 叠加层：战报框素材（9S，左切片加大）—— 压在最底，中部木纹不遮文字 */}
          <ArtLayer fileName={UI.logFrame} mode="slice" slice={SLICE.logFrame} zIndex={0} style={{ inset: -1 }} />
          {/* ② 内容层：透明底（让素材透上来）+ 独立滚动视口，高 = 外层内容高 82 */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              height: '100%',
              overflowY: 'auto',
              fontSize: 10.5,
              lineHeight: 1.6,
              color: 'var(--color-mibai)',
              textShadow: '0 1px 2px rgba(0,0,0,0.75)',
            }}
          >
            {state.log
              .slice(-40)
              .reverse()
              .slice(0, 12)
              .map((l, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.05 }}>
                  {l}
                </div>
              ))}
          </div>
        </div>
      </Tip>
    </div>
  );
}
