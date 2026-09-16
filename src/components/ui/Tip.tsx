/**
 * 统一释义组件（Tooltip）
 *
 * 交互约定：
 * - 桌面端：鼠标悬停即显示
 * - 触屏端：长按 420ms 显示（短按不拦截原有点击 / 拖拽行为）
 *
 * 实现要点：用 fixed 定位 + portal 到 body。
 * 因为手牌区、战报区、天时条都有 overflow 裁剪，若用 absolute 定位会被裁掉。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** 长按触发时长（ms）——与手牌拖拽的「轻点预览」互不冲突 */
const LONG_PRESS_MS = 420;
/** 浮层宽度 */
const TIP_WIDTH = 236;

interface TipProps {
  /** 释义文本，可用 \n 换行 */
  text: string;
  children: ReactNode;
  /** 浮层相对锚点的方向，默认向上 */
  placement?: 'top' | 'bottom';
  /** 包裹层样式（默认 inline-flex，可按需覆盖） */
  style?: CSSProperties;
}

export function Tip({ text, children, placement = 'top', style }: TipProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const show = useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({
      x: r.left + r.width / 2,
      y: placement === 'top' ? r.top - 8 : r.bottom + 8,
    });
  }, [placement]);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setAnchor(null);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // 夹到视口内，避免贴边时浮层出界
  const left = anchor
    ? Math.min(Math.max(anchor.x, TIP_WIDTH / 2 + 8), window.innerWidth - TIP_WIDTH / 2 - 8)
    : 0;

  return (
    <>
      <span
        ref={hostRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onPointerDown={(e) => {
          // 阻止冒泡：长按小元素查看释义时，不应同时触发外层的拖拽 / 点击手势
          e.stopPropagation();
          window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(show, LONG_PRESS_MS);
        }}
        onPointerUp={hide}
        onPointerCancel={hide}
        style={{ display: 'inline-flex', ...style }}
      >
        {children}
      </span>

      {anchor &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left,
              top: anchor.y,
              transform: `translate(-50%, ${placement === 'top' ? '-100%' : '0'})`,
              width: TIP_WIDTH,
              zIndex: 9999,
              pointerEvents: 'none',
              background: 'rgba(40,31,20,0.96)',
              color: 'var(--color-xuanzhi-warm)',
              fontSize: 11.5,
              lineHeight: 1.6,
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-miaojin)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ============================== 术语释义文案 ============================== */

/**
 * 【S1 归一】原此处的 `STATUS_TIP`（状态释义长文）已搬入 `src/i18n/locales/zh-CN.ts` 的
 * `tip.status.<id>`，由 `STATUS_TIP_KEY` 显式映射 + `t()` 取值。
 * 下方 `WUXING_TIP`（五行释义长文，量大）按本批范围**不动**，留待下一批（S2）处理。
 */

/** 五行释义 */
export const WUXING_TIP: Record<string, string> = {
  jin: '金 · 主肃杀\n金克木，为兵刃与锋锐之力。',
  mu: '木 · 主生发\n木克土，兼具生机与缠绕。',
  shui: '水 · 主收藏\n水克火，长于控制与持续侵蚀。',
  huo: '火 · 主炎上\n火克金，爆发最高、附带灼烧。',
  tu: '土 · 主承载\n土克水，长于护盾与守御。',
};
