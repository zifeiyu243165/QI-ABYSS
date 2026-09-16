import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleAction } from '../game/engine/battle';
import type { BattleState, Card } from '../game/types';
import { RELIC_LOTUS_THRESHOLD, RELIC_QI_GAIN, TANCHEN_SHIELD_PER_CARD, TANCHEN_STEAL_MIN } from '../game/constants';
import { KIND_KEY, t } from '../i18n';
import { playSfx } from '../game/audio';
import { Tip } from './ui/Tip';

/** 弃牌化炁的视觉载荷：交给外层去画流光（面板会随归墟结束而卸载，流光不能挂在面板里） */
export interface DiscardFlow {
  name: string;
  /** true = 化为阳炁（月白流光），false = 化为阴炁（朱红流光） */
  yang: boolean;
  origin: { x: number; y: number };
}

/** 太极旋涡：用纯 CSS 圆形叠出来，不依赖任何图形资源 */
function Taiji({ size = 78, spinning = true }: { size?: number; spinning?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--color-shiqing)',
        position: 'relative',
        overflow: 'hidden',
        border: '2.5px solid var(--color-miaojin)',
        boxShadow: '0 0 22px rgba(212,168,67,0.8), inset 0 0 14px rgba(0,0,0,0.5)',
        animation: spinning ? 'taijiSpin 7s linear infinite' : undefined,
      }}
    >
      {/* 右半：阳（宣纸白） */}
      <div style={{ position: 'absolute', left: '50%', top: 0, width: '50%', height: '100%', background: 'var(--color-xuanzhi)' }} />
      {/* 上凸起：白 */}
      <div style={{ position: 'absolute', left: '25%', top: '0%', width: '50%', height: '50%', borderRadius: '50%', background: 'var(--color-xuanzhi)' }} />
      {/* 下凸起：石青 */}
      <div style={{ position: 'absolute', left: '25%', top: '50%', width: '50%', height: '50%', borderRadius: '50%', background: 'var(--color-shiqing)' }} />
      {/* 阳中之阴点 */}
      <div style={{ position: 'absolute', left: '43.75%', top: '18.75%', width: '12.5%', height: '12.5%', borderRadius: '50%', background: 'var(--color-shiqing)' }} />
      {/* 阴中之阳点 */}
      <div style={{ position: 'absolute', left: '43.75%', top: '68.75%', width: '12.5%', height: '12.5%', borderRadius: '50%', background: 'var(--color-xuanzhi)' }} />
    </div>
  );
}

/**
 * 归墟阶段（弃牌）。
 *
 * 设计要点（严格对齐用户给的红线）：
 * - **绝不无脑一键弃光**：只要求弃掉超出上限的那几张，且「弃哪几张」完全由玩家点选/拖拽决定。
 *   印章只负责「执行」，不替玩家做选择。
 * - **绝不弹二级确认**：拖入旋涡即刻化去，印章一按即走，全程没有「您确定要弃掉这张牌吗？」。
 * - **绝不纯损失**：每张牌化去都换回实打实的炁，并在牌面上直接标出「化去得什么」。
 */
export function RelicPhase({
  state,
  dispatch,
  onBurst,
  onDiscard,
}: {
  state: BattleState;
  dispatch: React.Dispatch<BattleAction>;
  /** 本次归墟累计化去达到阈值时通知外层绽放莲花 */
  onBurst: (discarded: number, yang: boolean) => void;
  /**
   * 每次化去一张牌时通知外层画流光。
   * **必须由外层渲染**：归墟面板在化完最后一张的瞬间就卸载了，
   * 把流光挂在面板里会被硬生生切断 —— 实测「流光数 = 0」。
   */
  onDiscard: (flow: DiscardFlow) => void;
}) {
  const hand = state.hand;
  const quota = state.relicQuota;

  const [marked, setMarked] = useState<string[]>([]);
  const [dragUid, setDragUid] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [overVortex, setOverVortex] = useState(false);
  const [hint, setHint] = useState('');

  const vortexRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<{ uid: string; x: number; y: number; moved: boolean } | null>(null);
  const burstDone = useRef(false);
  const discardedRef = useRef(0);

  /** 弃这张牌换回什么炁 —— 与引擎 relicQiOf 必须一致 */
  const yieldOf = useCallback(
    (c: Card): { yang: boolean; text: string; color: string } => {
      if (c.kind === 'physical') return { yang: false, text: `化去 +${RELIC_QI_GAIN} 阴炁`, color: 'var(--color-shishui)' };
      if (c.kind === 'spell') return { yang: true, text: `化去 +${RELIC_QI_GAIN} 阳炁`, color: 'var(--color-hupo)' };
      return state.yang <= state.yin
        ? { yang: true, text: `化去 +${RELIC_QI_GAIN} 阳炁`, color: 'var(--color-hupo)' }
        : { yang: false, text: `化去 +${RELIC_QI_GAIN} 阴炁`, color: 'var(--color-shishui)' };
    },
    [state.yang, state.yin],
  );

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(''), 1800);
    return () => window.clearTimeout(t);
  }, [hint]);

  /** 贪嗔蠹在场时的夺牌预警 */
  const greedyAlive = state.enemies.some((e) => e.id === 'enemy_tanchen' && e.hp > 0);

  /** 取位置 → 通知外层画流光 → 真正下发弃牌 */
  const commitDiscard = useCallback(
    (card: Card) => {
      const uid = card.uid ?? card.id;
      const el = rowRefs.current.get(uid);
      const r = el?.getBoundingClientRect();
      const y2 = yieldOf(card);

      // 先把卡牌当前位置交给外层：dispatch 之后列表重排，就再也量不到原位了
      onDiscard({
        name: card.name,
        yang: y2.yang,
        origin: { x: r ? r.left + r.width / 2 : 195, y: r ? r.top + r.height / 2 : 420 },
      });

      playSfx('relicDrop');
      window.setTimeout(() => playSfx('qiFlow', 0.4), 140);

      discardedRef.current += 1;
      dispatch({ type: 'DISCARD_CARD', cardId: uid });

      // 一次归墟化去足够多 → 莲花绽放（只在第一次触发）
      if (!burstDone.current && discardedRef.current >= RELIC_LOTUS_THRESHOLD) {
        burstDone.current = true;
        onBurst(discardedRef.current, y2.yang);
      }
    },
    [dispatch, onBurst, onDiscard, yieldOf],
  );

  const toggleMark = useCallback(
    (uid: string) => {
      setMarked((prev) => {
        if (prev.includes(uid)) return prev.filter((x) => x !== uid);
        if (prev.length >= quota) {
          setHint(t('ui.relic.hint.quota', { count: quota }));
          return prev;
        }
        return [...prev, uid];
      });
    },
    [quota],
  );

  /** 印章执行：把已点选的牌一次化去 */
  const executeMarked = useCallback(() => {
    if (marked.length < quota) return;
    const cards = marked
      .map((uid) => hand.find((c) => (c.uid ?? c.id) === uid))
      .filter((c): c is Card => Boolean(c));
    // 先取位置再下发：dispatch 后列表会重排，届时就量不到原位了
    cards.forEach((c) => commitDiscard(c));
    setMarked([]);
  }, [marked, quota, hand, commitDiscard]);

  /* ---------- 拖拽 ---------- */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, card: Card) => {
    const uid = card.uid ?? card.id;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { uid, x: e.clientX, y: e.clientY, moved: false };
    setDragUid(uid);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8) d.moved = true;
    setDragPos({ x: e.clientX, y: e.clientY });

    const vr = vortexRef.current?.getBoundingClientRect();
    setOverVortex(
      Boolean(vr && e.clientX >= vr.left && e.clientX <= vr.right && e.clientY >= vr.top && e.clientY <= vr.bottom),
    );
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, card: Card) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragUid(null);
    setDragPos(null);
    if (!d) return;

    const vr = vortexRef.current?.getBoundingClientRect();
    const inVortex =
      Boolean(vr) && e.clientX >= vr!.left && e.clientX <= vr!.right && e.clientY >= vr!.top && e.clientY <= vr!.bottom;
    setOverVortex(false);

    // 拖进旋涡 → 直接化去；只是轻点 → 切换点选
    if (inVortex && d.moved) {
      commitDiscard(card);
      return;
    }
    if (!d.moved) toggleMark(d.uid);
  };

  const sorted = hand;
  const ready = marked.length >= quota;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 88,
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(circle at 50% 42%, rgba(30,22,14,0.82) 0%, rgba(18,13,8,0.95) 72%)',
        animation: 'relicPanelIn 220ms ease-out',
      }}
    >
      {/* ---------- 抬头 ---------- */}
      <div style={{ padding: '10px 14px 6px', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-brush)',
            fontSize: 30,
            letterSpacing: 12,
            color: 'var(--color-miaojin-light)',
            textShadow: '0 0 18px rgba(212,168,67,0.8), 0 2px 6px rgba(0,0,0,0.9)',
          }}
        >
          归　墟
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--color-mibai-dim)', marginTop: 2, letterSpacing: 1 }}>
          损有余而补不足 · 还需化去{' '}
          <span style={{ color: 'var(--color-minghuang)', fontWeight: 700, fontSize: 13 }}>{quota}</span> 张
        </div>
        {greedyAlive && (
          <div style={{ fontSize: 9.5, color: 'var(--color-liuguang-yin)', marginTop: 4 }}>
            ⚠ 贪嗔蠹正觊觎你的弃牌：单次化去 ≥{TANCHEN_STEAL_MIN} 张，它会吞食并换取护盾（每张 {TANCHEN_SHIELD_PER_CARD} 点）
          </div>
        )}
      </div>

      {/* ---------- 手牌列表 ---------- */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: '4px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {sorted.map((c) => {
          const uid = c.uid ?? c.id;
          const isMarked = marked.includes(uid);
          const y2 = yieldOf(c);
          const dragging = dragUid === uid;
          // 【S1 归一】卡片类别中文名统一走 label.kind.<id>
          const kindCN = t(KIND_KEY[c.kind]);
          return (
            <div
              key={uid}
              ref={(el) => {
                if (el) rowRefs.current.set(uid, el);
                else rowRefs.current.delete(uid);
              }}
              onPointerDown={(e) => onPointerDown(e, c)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, c)}
              onPointerCancel={(e) => onPointerUp(e, c)}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 9px',
                borderRadius: 8,
                touchAction: 'none',
                cursor: 'grab',
                background: isMarked
                  ? 'linear-gradient(160deg, rgba(245,197,24,0.95), rgba(212,168,67,0.9))'
                  : 'linear-gradient(160deg, rgba(251,247,236,0.96), rgba(236,217,171,0.9))',
                border: `2px solid ${isMarked ? 'var(--color-minghuang)' : 'rgba(212,168,67,0.6)'}`,
                boxShadow: isMarked
                  ? '0 0 18px rgba(245,197,24,0.95), 0 3px 10px rgba(0,0,0,0.45)'
                  : '0 3px 10px rgba(0,0,0,0.4)',
                opacity: dragging ? 0.45 : 1,
                transform: dragging ? 'scale(0.97)' : 'none',
                transition: 'background 140ms, border-color 140ms, opacity 140ms',
              }}
            >
              {/* 已选角标 */}
              <div
                style={{
                  flex: '0 0 auto',
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  background: isMarked ? 'var(--color-zhuhong)' : 'rgba(120,100,70,0.18)',
                  color: isMarked ? 'var(--color-xuanzhi-warm)' : 'var(--color-card-text-sub)',
                }}
              >
                {isMarked ? marked.indexOf(uid) + 1 : ''}
              </div>

              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-brush)',
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--color-card-title)',
                    }}
                  >
                    {c.name}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--color-card-text-sub)' }}>{kindCN}</span>
                  {c.isUltimate && (
                    <span
                      style={{
                        fontSize: 8,
                        padding: '0 3px',
                        borderRadius: 2,
                        background: 'var(--color-minghuang)',
                        color: 'var(--color-card-title)',
                        fontWeight: 700,
                      }}
                    >
                      奥义
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    color: 'var(--color-card-text-sub)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.desc}
                </div>
              </div>

              {/* 化炁收益：让玩家一眼看到「弃了不亏」 */}
              <div
                style={{
                  flex: '0 0 auto',
                  fontSize: 10,
                  fontWeight: 700,
                  color: y2.color,
                  textAlign: 'right',
                  lineHeight: 1.25,
                }}
              >
                {y2.text.split(' ')[0]}
                <br />
                {y2.text.split(' ')[1]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- 底部：旋涡 + 印章 ---------- */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 16px 14px',
        }}
      >
        {/* 太极旋涡：拖放目标 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div
            ref={vortexRef}
            style={{
              borderRadius: '50%',
              padding: 3,
              background: overVortex
                ? 'radial-gradient(circle, rgba(245,197,24,0.75), transparent 72%)'
                : 'radial-gradient(circle, rgba(212,168,67,0.28), transparent 72%)',
              transition: 'background 140ms',
              animation: overVortex ? 'vortexPulse 620ms ease-in-out infinite' : undefined,
            }}
          >
            <Taiji />
          </div>
          <div style={{ fontSize: 9, color: 'var(--color-danjinhui)', letterSpacing: 1 }}>
            {overVortex ? '松手化去' : '拖牌至此'}
          </div>
        </div>

        {/* 朱红篆体印章：一键执行（不替玩家做选择） */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Tip
            text={
              `归墟\n把点选好的牌一次化去。\n` +
              (ready
                ? t('ui.relic.tip.ready', { count: quota })
                : t('ui.relic.tip.pending', { count: quota - marked.length }))
            }
            placement="top"
          >
            <button
              onClick={executeMarked}
              disabled={!ready}
              style={{
                width: 96,
                height: 72,
                borderRadius: 8,
                cursor: ready ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-brush)',
                fontSize: 25,
                letterSpacing: 4,
                color: ready ? 'var(--color-xuanzhi-warm)' : 'rgba(230,215,190,0.45)',
                background: ready
                  ? 'linear-gradient(158deg, var(--color-zhuhong-light), var(--color-zhuhong))'
                  : 'linear-gradient(158deg, rgba(120,60,45,0.75), rgba(80,40,30,0.8))',
                border: `3px solid ${ready ? 'var(--color-miaojin)' : 'rgba(212,168,67,0.4)'}`,
                outline: `1.5px solid ${ready ? 'var(--color-miaojin-deep)' : 'rgba(212,168,67,0.25)'}`,
                outlineOffset: -7,
                boxShadow: ready
                  ? '0 0 22px rgba(216,84,58,0.85), inset 0 2px 8px rgba(0,0,0,0.35)'
                  : 'inset 0 2px 8px rgba(0,0,0,0.4)',
                textShadow: ready ? '0 0 10px rgba(255,229,150,0.7)' : 'none',
                animation: ready ? 'ctaPulse 1.6s ease-in-out infinite' : undefined,
              }}
            >
              归墟
            </button>
          </Tip>
          <div style={{ fontSize: 9, color: 'var(--color-danjinhui)' }}>
            {ready ? '一按化去' : `已选 ${marked.length}/${quota}`}
          </div>
        </div>
      </div>

      {/* ---------- 提示条 ---------- */}
      {hint && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 96,
            transform: 'translateX(-50%)',
            padding: '5px 12px',
            borderRadius: 14,
            background: 'rgba(194,59,34,0.94)',
            color: 'var(--color-xuanzhi-warm)',
            fontSize: 10.5,
            whiteSpace: 'nowrap',
            zIndex: 3,
          }}
        >
          {hint}
        </div>
      )}

      {/* ---------- 拖拽中跟手的牌影（只在面板存活期间需要，无需上提） ---------- */}
      {dragUid && dragPos && (
        <div
          style={{
            position: 'absolute',
            left: dragPos.x - 52,
            top: dragPos.y - 20,
            width: 104,
            height: 40,
            borderRadius: 7,
            pointerEvents: 'none',
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(160deg, rgba(251,247,236,0.97), rgba(236,217,171,0.93))',
            border: '2px solid var(--color-minghuang)',
            boxShadow: '0 0 20px rgba(245,197,24,0.9), 0 6px 14px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-brush)',
            fontSize: 13,
            color: 'var(--color-card-title)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {hand.find((c) => (c.uid ?? c.id) === dragUid)?.name ?? ''}
        </div>
      )}
    </div>
  );
}
