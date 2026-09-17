/**
 * 手牌交互 Hook（T06 · 拆分④）。
 *
 * 【来源】自 `BattleScreen.tsx` 的手牌交互区**逐字抽取**：`dragRef`/`drag`、`handExpanded`、
 * `fusibleUids`、`partnerUids`、`tryFuse`、`pickCard`、三个 pointer handler、`playSelected`、
 * `fuseHint`。
 *
 * 【手感与行为】分支顺序、`useMemo` 依赖数组、`dispatch` 调度序列、拖动阈值常量
 * （`MOVE_SLOP_PX=12` / `SELECT_LIFT_PX=46` / `RELEASE_BACK_PX=30`）全部逐字保留。
 *
 * 【融合判定（T06 收紧）】`pickCard` 改为**严格单选**：
 *   ① 点的是已选中的牌 -> 取消选中；
 *   ② 其余情况 -> **一律改选本张**（不自动融合、不弹警告）。
 * 融合**只由操作栏「合并奥义」按钮**触发（经 `tryFuse`），彻底贴合用户原话
 * 「只有主动点选才能触发卡牌合并」—— 此前「点第二张同系牌即当场合体」是误触之源。
 *
 * 【T06 移除 `setWarn`】原分歧③会向调用方写「不同系无法合体」的警告；严格单选后不再需要
 * 该提示（改选本身即反馈），故第 4 个参数与对应分支一并删除（调用点同步更新）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import type { BattleAction } from '../../game/engine/battle';
import { canFuse } from '../../game/engine/battle';
import type { Card } from '../../game/types';
import { MOVE_SLOP_PX, RELEASE_BACK_PX, SELECT_LIFT_PX } from './constants';

/** 正在被拖动的手牌指针状态（供渲染层做位移 / 层级） */
export interface HandDrag {
  /** 被拖动牌的 uid */
  uid: string;
  /** 相对按下点的纵向位移（px） */
  dy: number;
}

/** 指针按下时的锚点记录（不上屏，只存 ref） */
interface DragAnchor {
  uid: string;
  startY: number;
  startX: number;
  moved: boolean;
}

/** `useHandInteraction` 的返回值 */
export interface HandInteraction {
  /** 当前选中的手牌 uid 列表（0 张收拢 / 1 张展开） */
  selectedCards: string[];
  /** 直接改写选中集（供编排壳的次级操作复用） */
  setSelectedCards: Dispatch<SetStateAction<string[]>>;
  /** 拖动中的手牌指针状态（无拖动为 null） */
  drag: HandDrag | null;
  /** 手牌是否处于展开态（有选中牌即展开） */
  handExpanded: boolean;
  /** 可融合的牌（未选中任何牌时用金框标出） */
  fusibleUids: Set<string>;
  /** 选中一张牌后，能与它组合的牌（红框） */
  partnerUids: Set<string>;
  /** 融合两张牌；返回是否成功 */
  tryFuse: (uidA: string, uidB: string) => boolean;
  /** 选中一张牌的唯一入口（轻点 / 上拖都走这里） */
  pickCard: (uid: string) => void;
  /** 手牌指针按下 */
  handleCardPointerDown: (e: ReactPointerEvent<HTMLDivElement>, card: Card) => void;
  /** 手牌指针移动 */
  handleCardPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** 手牌指针抬起 / 取消（同逻辑） */
  handleCardPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** 打出当前选中的牌 */
  playSelected: () => void;
  /** 兜底：选中一张后，若有可组合的牌则合体（供操作栏按钮） */
  fuseHint: Card | null;
}

/**
 * 手牌交互：选中 / 取消 / 融合 / 拖拽 / 出牌。
 *
 * @param hand      当前手牌
 * @param dispatch  战斗 action 派发器
 * @param targetId  当前目标 id（融合 / 出牌时带上）
 * @returns 选中集、拖动状态、可融合 / 可组合集合、各交互回调
 */
export function useHandInteraction(
  hand: Card[],
  dispatch: (a: BattleAction) => void,
  targetId: string | null,
): HandInteraction {
  const dragRef = useRef<DragAnchor | null>(null);
  const [drag, setDrag] = useState<HandDrag | null>(null);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  /** 手牌是否处于展开态（有选中牌即展开） */
  const handExpanded = selectedCards.length > 0;

  /** 可融合的牌（未选中任何牌时用金框标出） */
  const fusibleUids = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (canFuse(hand[i]!, hand[j]!)) {
          set.add(hand[i]!.uid ?? hand[i]!.id);
          set.add(hand[j]!.uid ?? hand[j]!.id);
        }
      }
    }
    return set;
  }, [hand]);

  /** 选中一张牌后，能与它组合的牌（红框） */
  const partnerUids = useMemo(() => {
    if (selectedCards.length !== 1) return new Set<string>();
    const a = hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
    if (!a) return new Set<string>();
    return new Set(
      hand.filter((c) => (c.uid ?? c.id) !== (a.uid ?? a.id) && canFuse(a, c)).map((c) => c.uid ?? c.id),
    );
  }, [selectedCards, hand]);

  /** 融合两张牌；返回是否成功 */
  const tryFuse = useCallback(
    (uidA: string, uidB: string) => {
      const a = hand.find((c) => (c.uid ?? c.id) === uidA);
      const b = hand.find((c) => (c.uid ?? c.id) === uidB);
      if (!a || !b) return false;
      if (!canFuse(a, b)) return false;
      dispatch({ type: 'FUSE', cardAId: uidA, cardBId: uidB, targetId: targetId ?? undefined });
      setSelectedCards([]);
      return true;
    },
    [hand, dispatch, targetId],
  );

  /**
   * 选中一张牌的**唯一入口**（轻点、上拖都走这里）。
   *
   * 【T06 严格单选】只做两件事：
   * 1. 点的是已选中的牌 -> 取消选中（收回手牌）；
   * 2. 其余情况 -> **改选本张**（不做任何自动融合、不发警告）。
   * 融合的唯一入口是操作栏「合并奥义」按钮（`tryFuse`）。
   */
  const pickCard = useCallback(
    (uid: string) => {
      const card = hand.find((c) => (c.uid ?? c.id) === uid);
      if (!card) return;

      // ① 点已选中的牌 → 取消
      if (selectedCards.includes(uid)) {
        setSelectedCards((prev) => prev.filter((x) => x !== uid));
        return;
      }
      // ② 其余一律改选（不自动融合、不再 setWarn）
      setSelectedCards([uid]);
    },
    [hand, selectedCards],
  );

  const handleCardPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, card: Card) => {
    const uid = card.uid ?? card.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { uid, startY: e.clientY, startX: e.clientX, moved: false };
    setDrag({ uid, dy: 0 });
  }, []);

  const handleCardPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > MOVE_SLOP_PX || Math.abs(e.clientX - d.startX) > MOVE_SLOP_PX) d.moved = true;
    setDrag({ uid: d.uid, dy });
  }, []);

  const handleCardPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;

      const dy = e.clientY - d.startY;

      // 轻点（未拖动）-> 选中 / 取消 / 合体
      if (!d.moved) {
        pickCard(d.uid);
        return;
      }
      // 上拖 -> 选中
      if (dy < -SELECT_LIFT_PX) {
        pickCard(d.uid);
        return;
      }
      // 下拖 -> 归位（取消选中）
      if (dy > RELEASE_BACK_PX && selectedCards.includes(d.uid)) {
        setSelectedCards((prev) => prev.filter((x) => x !== d.uid));
      }
    },
    [pickCard, selectedCards],
  );

  const playSelected = useCallback(() => {
    const uid = selectedCards[0];
    if (!uid) return;
    dispatch({ type: 'PLAY_CARD', cardId: uid, targetId: targetId ?? undefined });
    setSelectedCards([]);
  }, [selectedCards, dispatch, targetId]);

  /** 兜底：选中一张后，若有可组合的牌则合体 */
  const fuseHint = useMemo(() => {
    if (selectedCards.length !== 1) return null;
    const a = hand.find((c) => (c.uid ?? c.id) === selectedCards[0]);
    if (!a) return null;
    return hand.find((b) => (b.uid ?? b.id) !== (a.uid ?? a.id) && canFuse(a, b)) ?? null;
  }, [selectedCards, hand]);

  return {
    selectedCards,
    setSelectedCards,
    drag,
    handExpanded,
    fusibleUids,
    partnerUids,
    tryFuse,
    pickCard,
    handleCardPointerDown,
    handleCardPointerMove,
    handleCardPointerUp,
    playSelected,
    fuseHint,
  };
}
