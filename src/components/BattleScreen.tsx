/**
 * 战斗界面 · v3 编排壳（T09 之后）。
 *
 * 尺寸预算（390×844）：
 *   天时条 36 / 敌方区 238 / 架势条 38 / 我方面板 104 / 手牌区 flex / 操作栏 auto
 *
 * v3 改动要点（保留原因，勿删）：
 * 1. 敌方区改为「三行定高」结构：意图卡 48 + 立绘盒 116 + 信息板 66 = 230。
 *    此前意图卡被挤出可视区（敌方区 260 装不下 意图卡 + 1.35×size 的立绘），
 *    又因 zIndex 低于天时条而被整个盖住 —— 玩家根本看不到敌人要出什么招。
 * 2. 敌人名字/血条移入半透明暗色信息板，立绘后加径向暗色压边，解决「美术复杂
 *    导致文字辨识度低」；三个敌人的血条尺寸、字号、信息板高度全部统一。
 * 3. 手牌按参考图重做：收拢态重度叠压只露左侧一条边（步进 32px，最右一张完整
 *    可见）；选中后整手摊开、被选中的牌上浮放大。金框=可融合、红框=可组合，
 *    并加外发光环，未参与组合的牌降透明以突出可选目标。
 * 4. 战斗日志改为深色底板 + 高亮文字（此前浅底灰字，几乎看不清）。
 * 5. 「结束回合」移到右下角并加二次确认；「阴阳逆转」移到左侧。
 * 6. 中央教学文字收进「?」按钮，首回合后自动隐藏。
 *
 * 【本文件的角色】自 T03–T09 拆分后，本组件退化为**编排壳**：只保留
 *   - Props / 三段静态数据派生（`char` / `month` / `term`）；
 *   - 跨分区共享的派生值（存活敌人与目标 id、`intentOf`、调息的单一真源 `regulateOutcome`）；
 *   - 三个 Hook 的装配（`useBattleFx` / `useParryTiming` / `useHandInteraction`）；
 *   - 七分区组件 + 5 个「全屏覆盖层」展示组件的组合。
 * 所有分区 JSX 与交互逻辑都已迁入 `battle/` 子组件与 Hook，行为与外观逐字保留。
 *
 * 【T09 下沉】背景 / 受击·卡帧闪层 / 归墟流光 · 残影 · 莲花演出 5 块纯展示 JSX 迁入
 * `BattleBackdrop` / `BattleFlash` / `RelicFlows` / `RelicGhosts` / `RelicLotus`，
 * 渲染位置与 zIndex 逐字不变（本壳仅剩装配职责，见 §T09 line 目标 ≤300）。
 *
 * 【调息单一真源】`regulateOutcome(state, regFrom)` 只在本壳调用一次，结果原样转交
 * `OperationBar` —— UI 侧任何地方都不得再自算一套（历史缺陷：引擎把 floor 改成 ceil 时
 * UI 漏改，界面显示「换得 1 点」而引擎实际给 2 点，界面在骗玩家）。
 *
 * 【素材名铁律】本壳不再出现任何裸素材文件名：背景经 `artAssets.BG` + `artUrl()` 拼装，
 * 且已下沉至 `BattleBackdrop`。
 */
import { useState } from 'react';
import type { BattleAction } from '../game/engine/battle';
import { canPlayCard, regulateOutcome } from '../game/engine/battle';
import type { BattleState, StanceId } from '../game/types';
import { CHARACTER_MAP } from '../game/data/actors';
import { LUNAR_MONTH_MAP, SOLAR_TERM_MAP } from '../game/data/world';
import { RelicPhase } from './RelicPhase';
import type { FxHandle } from './fx/Effects';
import { BattleBackdrop } from './battle/BattleBackdrop';
import { BattleFlash } from './battle/BattleFlash';
import { RelicFlows } from './battle/RelicFlows';
import { RelicGhosts } from './battle/RelicGhosts';
import { RelicLotus } from './battle/RelicLotus';
import { TopBar } from './battle/TopBar';
import { EnemyZone } from './battle/EnemyZone';
import { StanceBar } from './battle/StanceBar';
import { PlayerPanel } from './battle/PlayerPanel';
import { HandArea } from './battle/HandArea';
import { ParryPanel } from './battle/ParryPanel';
import { OperationBar } from './battle/OperationBar';
import { useHandInteraction } from './battle/useHandInteraction';
import { useBattleFx } from './battle/useBattleFx';
import { useParryTiming } from './battle/useParryTiming';

interface Props {
  state: BattleState;
  dispatch: (a: BattleAction) => void;
  fxRef: React.RefObject<FxHandle | null>;
  onExit?: () => void;
}

export function BattleScreen({ state, dispatch, fxRef, onExit }: Props) {
  const char = CHARACTER_MAP[state.characterId];
  const month = LUNAR_MONTH_MAP[state.lunarMonthId];
  const term = SOLAR_TERM_MAP[state.solarTermId];

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  /** 架势预选：点击架势只改这里，必须再按「确认」才真正下发 SWITCH_STANCE */
  const [pendingStance, setPendingStance] = useState<StanceId | null>(null);

  /* ---------- 战斗特效状态机（T08 · battle/useBattleFx） ---------- */
  const {
    hitstop,
    shake,
    hurt,
    warn,
    setWarn,
    showHint,
    setShowHint,
    lotus,
    relicFlows,
    relicGhosts,
    handleRelicDiscard,
    handleRelicBurst,
  } = useBattleFx(state, dispatch, fxRef);

  /* 回合推进后清掉架势预选，避免上一回合的选择残留到新回合 */
  const [prevTurn, setPrevTurn] = useState(state.turn);
  if (prevTurn !== state.turn) {
    // 【为何不用 useEffect】React 官方推荐「渲染期修正」而非「副作用里 setState」：
    // 副作用在 paint 之后才跑，会先画出一帧带有上一回合预选的架势条；
    // 渲染期修正与 effect 语义等价（都是清空预选），且不多一次多余渲染。
    setPrevTurn(state.turn);
    setPendingStance(null);
  }

  const aliveEnemies = state.enemies.filter((e) => e.hp > 0);
  const targetId = selectedTarget ?? aliveEnemies[0]?.id ?? null;

  /* ---------- 弹反时序（T08 · battle/useParryTiming） ---------- */
  const { inWindow, handleParry } = useParryTiming(state.phase, state.turn, state.parried, dispatch);

  /* ---------- 手牌：收拢 / 展开 + 选中 + 融合（T06 · battle/useHandInteraction） ---------- */
  const {
    selectedCards,
    drag,
    handExpanded,
    fusibleUids,
    partnerUids,
    tryFuse,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    playSelected,
    fuseHint,
  } = useHandInteraction(state.hand, dispatch, targetId, setWarn);

  /* ---------- 派生 ---------- */
  const isTelegraph = state.phase === 'enemyTelegraph';
  /**
   * 转换方向：从较多的那种炁扣（并列时扣阳炁，与引擎语义一致）。
   *
   * 【单一真源】调息的一切判定（能不能转、扣多少、给多少、为什么不能）**全部**来自引擎的
   * regulateOutcome —— UI 不再自算一套，故此处只调用一次并把结果原样传给 `OperationBar`。
   */
  const regFrom: 'yang' | 'yin' = state.yang >= state.yin ? 'yang' : 'yin';
  const regOutcome = regulateOutcome(state, regFrom);
  /** 引擎侧还额外要求「非敌方前摇」，UI 一并纳入可用性判断 */
  const canRegulate = regOutcome.canDo && !isTelegraph;

  const selectedCard =
    selectedCards.length === 1 ? state.hand.find((c) => (c.uid ?? c.id) === selectedCards[0]) : undefined;
  const canPlaySelected = selectedCard ? canPlayCard(state, selectedCard) : false;

  /** 引擎在 enemyAct 用 (turn-1) 取意图，UI 展示必须与之一致 */
  const intentOf = (intents: { type: string; label: string }[], turn: number) =>
    intents[(turn - 1) % intents.length];

  /* ============================== 渲染 ============================== */
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 战斗背景 + 明暗罩（T09 · battle/BattleBackdrop） */}
      <BattleBackdrop />

      {/* 受击红闪 / 卡帧金闪（T09 · battle/BattleFlash） */}
      <BattleFlash hurt={hurt} hitstop={hitstop} />

      {/* ============ 天时条（T03 · battle/TopBar） ============ */}
      <TopBar
        month={month}
        term={term}
        monthId={state.lunarMonthId}
        termId={state.solarTermId}
        turn={state.turn}
        onExit={onExit}
      />

      {/* ============ 敌方区（T05 · battle/EnemyZone） ============ */}
      <EnemyZone
        state={state}
        targetId={targetId}
        intentOf={intentOf}
        onSelectTarget={setSelectedTarget}
        shake={shake}
      />

      {/* ============ 架势条（T03 · battle/StanceBar） ============ */}
      <StanceBar
        stance={state.stance}
        stanceSwitched={state.stanceSwitched}
        pending={pendingStance}
        onSelect={setPendingStance}
        onConfirm={() => {
          if (!pendingStance) return;
          dispatch({ type: 'SWITCH_STANCE', stance: pendingStance });
          setPendingStance(null);
        }}
      />

      {/* ============ 我方面板（T04 · battle/PlayerPanel） ============ */}
      <PlayerPanel state={state} char={char} />

      {/* ============ 手牌区 / 弹反区 ============ */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          position: 'relative',
          padding: '6px 0 0',
          // 高于操作栏：卡片上浮后会盖在按钮之上
          zIndex: 40,
        }}
      >
        {!isTelegraph ? (
          /* 手牌区（T06 · battle/HandArea）—— 手牌扇形 + 空手牌槽 + 教学提示 */
          <HandArea
            state={state}
            selectedCards={selectedCards}
            drag={drag}
            handExpanded={handExpanded}
            fusibleUids={fusibleUids}
            partnerUids={partnerUids}
            onCardPointerDown={handleCardPointerDown}
            onCardPointerMove={handleCardPointerMove}
            onCardPointerUp={handleCardPointerUp}
            showHint={showHint}
            onToggleHint={() => setShowHint((v) => !v)}
            warn={warn}
          />
        ) : (
          /* 弹反面板（T08 · battle/ParryPanel） */
          <ParryPanel state={state} inWindow={inWindow} onParry={handleParry} />
        )}
      </div>

      {/* ============ 操作栏 + 战报（T07 · battle/OperationBar） ============ */}
      <OperationBar
        state={state}
        dispatch={dispatch}
        selectedCard={selectedCard}
        canPlaySelected={canPlaySelected}
        selectedCards={selectedCards}
        fuseHint={fuseHint}
        tryFuse={tryFuse}
        playSelected={playSelected}
        isTelegraph={isTelegraph}
        regFrom={regFrom}
        regOutcome={regOutcome}
        canRegulate={canRegulate}
      />

      {/* ============ 归墟阶段：手牌超上限时的弃牌面板 ============ */}
      {state.phase === 'relic' && (
        <RelicPhase
          state={state}
          dispatch={dispatch}
          onBurst={handleRelicBurst}
          onDiscard={handleRelicDiscard}
        />
      )}

      {/* ---------- 归墟流光（T09 · battle/RelicFlows）：物理=朱红，术法=月白，飞向底部阴阳炁条 ---------- */}
      <RelicFlows flows={relicFlows} />

      {/* ---------- 弃牌残影（T09 · battle/RelicGhosts）：半透明停留片刻，表示对手也看得到 ---------- */}
      <RelicGhosts ghosts={relicGhosts} />

      {/* ---------- 莲花演出（T09 · battle/RelicLotus）：一次化去多张时绽放金色水墨莲花 ---------- */}
      <RelicLotus lotus={lotus} />
    </div>
  );
}
