/**
 * 全屏闪层（T09 · 自 `BattleScreen.tsx` **逐字下沉**）。
 *
 * 【来源】「受击红闪 `hurt`」与「卡帧金闪 `hitstop`」两块，`key` / 类名 / zIndex / 动画名
 * 逐字保留 —— 抽取只挪动渲染位置，像素与动画触发时机零变化。
 *
 * 【为何 `key` 必须保留】`hurt-flash`（CSS 动画）与 `hitstopFlash`（内联动画）都靠「元素重挂载」
 * 重放：`hurt` 递增时 `key` 变化触发重挂载，动画才会重新从 0 播。下沉后这两个条件渲染仍是
 * 同一层级、同一 `key`，语义完全等价 —— **不得删 `key`**。
 */
interface BattleFlashProps {
  /** 玩家受击计数器（每次掉血 +1；>0 时显示红闪） */
  hurt: number;
  /** 卡帧剩余时长（ms；>0 时显示金闪，值即动画时长） */
  hitstop: number;
}

export function BattleFlash({ hurt, hitstop }: BattleFlashProps) {
  return (
    <>
      {hurt > 0 && <div key={hurt} className="hurt-flash" style={{ position: 'absolute', inset: 0, zIndex: 65 }} />}
      {hitstop > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 70,
            pointerEvents: 'none',
            background: 'radial-gradient(circle at 50% 45%, rgba(245,197,24,0.2), transparent 64%)',
            animation: `hitstopFlash ${hitstop}ms steps(1) 1`,
          }}
        />
      )}
    </>
  );
}
