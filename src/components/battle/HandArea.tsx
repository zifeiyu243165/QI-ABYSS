/**
 * 手牌区（T06 · 拆分④）。
 *
 * 【来源】自 `BattleScreen.tsx` 手牌区区块**逐字搬迁**：手牌扇形（收拢 / 展开）、
 * 空手牌占位、教学提示（「?」按钮 + 行内提示 + 警告）。容器内边距 `paddingTop:34` /
 * `paddingBottom:8`、`overflow:visible`（选中牌上浮不被裁剪）一律保留。
 *
 * 【布局数学】展开 / 收拢的 `step` / `overlap` / `rot` / `arc` / `zIndex` / `transform`
 * 一律经 `handLayout.ts` 的 `handCardLayout()` 计算（本任务首次接线）—— 数值与结构
 * 与该文件逐字一致，故渲染像素级零变化。
 *
 * 【铁律逐字保留】选中牌上浮 `-58px`/`scale(1.12)`、可合体目标 `-22px`/`scale(1.06)`、层级
 * `300 / 200 + i / 400`、过渡 `190ms cubic-bezier(0.2,0.9,0.3,1.05)`（拖动中 `transition:none`）。
 *
 * 【T06 取消降透明】原「展开态下非选中 / 非伙伴牌 `opacity:0.45`」（`dimmed`）已**彻底移除**：
 * 既然点第二张只是「改选」，把非伙伴牌降透明会**误导玩家以为不能点**。改动方式为从
 * `HandArea` 与 `GameCard` 一并删除该 prop（比传 `dimmed={false}` 更干净，不留死参数）。
 * 不可打出的牌仍按 `playable` 降透明（`0.55`）—— 那是另一层语义，不在本次改动范围。
 *
 * 【交互】轻点 / 上拖选中、再点 / 下拖取消、点红框牌即刻合体 —— 全部委托
 * `useHandInteraction` 的三个 pointer handler，本组件不自持交互状态。
 *
 * 【降级铁律】空手牌占位 = 「CSS 基底槽（常驻 DOM）+ `ui_空手牌槽` 透明叠加层（兄弟节点）+
 *   压在两者之上的文字」。素材缺失 / 404 时叠加层渲染为空 → 基底槽与文字原样可见：
 *   不白屏、不报错、不塌布局。（此前占位只有一行文字，T09 才补上基底槽与素材层。）
 */
import type { PointerEvent as ReactPointerEvent } from 'react';
import { canPlayCard, cardCost } from '../../game/engine/battle';
import type { BattleState, Card } from '../../game/types';
import { t } from '../../i18n';
import { Tip } from '../ui/Tip';
import { ArtLayer } from './ArtLayer';
import { UI } from './artAssets';
import { CARD_H, CARD_W } from './constants';
import { GameCard } from './GameCard';
import { handCardLayout } from './handLayout';
import type { HandDrag } from './useHandInteraction';

interface HandAreaProps {
  /** 战斗状态（本区读取手牌） */
  state: BattleState;
  /** 当前选中的手牌 uid 列表 */
  selectedCards: string[];
  /** 拖动中的手牌指针状态 */
  drag: HandDrag | null;
  /** 手牌是否展开（有选中牌即展开） */
  handExpanded: boolean;
  /** 可融合的牌集合（静止态左金条） */
  fusibleUids: Set<string>;
  /** 可组合的牌集合（选中态红框） */
  partnerUids: Set<string>;
  /** 指针按下 */
  onCardPointerDown: (e: ReactPointerEvent<HTMLDivElement>, card: Card) => void;
  /** 指针移动 */
  onCardPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** 指针抬起 / 取消 */
  onCardPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** 是否显示行内教学提示（首回合后自动收起，可手动切回） */
  showHint: boolean;
  /** 切换教学提示显示 */
  onToggleHint: () => void;
  /** 警告文案（不同系无法合体等） */
  warn: string;
}

export function HandArea({
  state,
  selectedCards,
  drag,
  handExpanded,
  fusibleUids,
  partnerUids,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
  showHint,
  onToggleHint,
  warn,
}: HandAreaProps) {
  const n = state.hand.length;

  return (
    <>
      {/* 手牌扇形：收拢（重度叠压）/ 展开（摊开） */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          height: '100%',
          paddingTop: 34,
          paddingBottom: 8,
          // 必须 visible：选中的牌会上浮，被裁剪就看不见了
          overflow: 'visible',
        }}
      >
        {state.hand.map((c, i) => {
          const cost = cardCost(state, c);
          const playable = canPlayCard(state, c);
          const uid = c.uid ?? c.id;
          const sel = selectedCards.includes(uid);
          const dragging = drag?.uid === uid;
          const fusible = selectedCards.length === 0 && fusibleUids.has(uid);
          const partner = partnerUids.has(uid);

          /**
           * 布局数学见 `handCardLayout()`：`even = floor((344-CARD_W)/max(1,n-1))`；
           * 展开 `step = max(20,min(CARD_W+6,even))`、收拢 `step = max(16,min(FOLD_STEP,even))`；
           * `overlap = max(0,CARD_W-step)`；`rot`/`arc`/`z` 与原内联版本逐字一致。
           */
          const layout = handCardLayout({
            index: i,
            count: n,
            expanded: handExpanded,
            selected: sel,
            partner,
            dragging,
          });

          return (
            <div
              key={uid}
              onPointerDown={(e) => onCardPointerDown(e, c)}
              onPointerMove={onCardPointerMove}
              onPointerUp={onCardPointerUp}
              onPointerCancel={onCardPointerUp}
              style={{
                flex: '0 0 auto',
                marginLeft: layout.marginLeft,
                transform: layout.transform,
                // margin-left 也要过渡：否则「收拢->摊开」时整排手牌会瞬移，
                // 手指下的牌突然换位，第二次点击自然点空。
                transition: dragging
                  ? 'none'
                  : 'transform 190ms cubic-bezier(0.2, 0.9, 0.3, 1.05), margin-left 190ms cubic-bezier(0.2, 0.9, 0.3, 1.05)',
                zIndex: layout.zIndex,
                position: 'relative',
                touchAction: 'none',
                cursor: 'pointer',
              }}
            >
              <GameCard
                card={c}
                cost={cost}
                playable={playable}
                selected={sel}
                fusible={fusible}
                partner={partner}
              />
            </div>
          );
        })}
        {state.hand.length === 0 && (
          /*
            空手牌槽：与一张牌同尺寸（78×112），手牌清空后给玩家一个「这里本来是手牌」的实体感。
            三层结构（降级铁律）：
              ① 基底槽 —— **常驻 DOM** 的 CSS 绘制（描金虚线边 + 宣纸暖色渐变），素材缺失时原样可见；
              ② 叠加层 —— ui_空手牌槽 素材（BG 78×112），position:absolute + 透明底，缺失即渲染为空；
              ③ 文字   —— zIndex 高于叠加层，永远压在素材之上。
          */
          <div
            style={{
              position: 'relative',
              width: CARD_W,
              height: CARD_H,
              borderRadius: 8,
              border: '1.5px dashed var(--color-miaojin-deep)',
              background: 'linear-gradient(180deg, rgba(247,242,228,0.30) 0%, rgba(236,217,171,0.16) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* ① 叠加层：ui_空手牌槽（BG 78×112） */}
            <ArtLayer fileName={UI.emptySlot} mode="fit" fit={{ w: CARD_W, h: CARD_H }} zIndex={1} />
            {/* ② 文字：压在素材之上 */}
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                color: 'var(--color-card-text)',
                fontSize: 12,
                textAlign: 'center',
                padding: 8,
                textShadow: '0 1px 3px rgba(0,0,0,0.6)',
              }}
            >
              {t('ui.battle.hand-empty')}
            </div>
          </div>
        )}
      </div>

      {/* 教学提示：收进「?」，首回合后自动隐藏，不再挡住画面中心 */}
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 9.5,
        }}
      >
        <Tip text={t('tip.battle.hint')} placement="top">
          <button
            onClick={onToggleHint}
            aria-label={t('ui.battle.hint')}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              fontSize: 11,
              lineHeight: '15px',
              flex: '0 0 auto',
              background: 'rgba(38,29,18,0.85)',
              border: '1px solid var(--color-miaojin)',
              color: 'var(--color-miaojin-light)',
            }}
          >
            ?
          </button>
        </Tip>
        {showHint && (
          <div style={{ color: 'var(--color-xuanzhi-warm)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {t('ui.battle.hint-inline')}
          </div>
        )}
        {warn && (
          <div style={{ color: 'var(--color-miaojin-light)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {warn}
          </div>
        )}
      </div>
    </>
  );
}
