/**
 * 归墟流光层（T09 · 自 `BattleScreen.tsx` **逐字下沉**）。
 *
 * 【来源】「归墟流光：物理=朱红，术法=月白，飞入底部阴阳炁条」的 `relicFlows.map(...)`，
 * 坐标偏移、尺寸、径向渐变、`boxShadow`、`zIndex:94`、`--dx/--dy` 自定义属性与
 * `relicFlow` 动画（时长取 `RELIC_FLOW_MS`）**逐字保留**。
 *
 * 【为何挂在同屏层而非归墟面板】归墟面板会在化完最后一张的瞬间随 `phase` 切换而卸载，
 * 动画会被硬生生切断 —— 故流光的持有者与渲染位置必须留在战斗屏。
 *
 * 【入参类型】复用 `useBattleFx` 导出的 `RelicFlow`（单一真源），不在此另立副本。
 */
import type { CSSProperties } from 'react';
import { RELIC_FLOW_MS } from './constants';
import type { RelicFlow } from './useBattleFx';

interface RelicFlowsProps {
  /** 飞行中的流光列表（由 `useBattleFx` 持有） */
  flows: RelicFlow[];
}

export function RelicFlows({ flows }: RelicFlowsProps) {
  return (
    <>
      {flows.map((f) => (
        <div
          key={f.id}
          style={
            {
              position: 'absolute',
              left: f.x - 26,
              top: f.y - 26,
              width: 52,
              height: 52,
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 94,
              background: f.yang
                ? 'radial-gradient(circle, rgba(214,236,255,1) 0%, rgba(159,196,221,0.85) 45%, rgba(106,158,196,0) 72%)'
                : 'radial-gradient(circle, rgba(255,190,150,1) 0%, rgba(194,59,34,0.85) 45%, rgba(194,59,34,0) 72%)',
              boxShadow: f.yang ? '0 0 26px rgba(214,236,255,0.95)' : '0 0 26px rgba(216,84,58,0.95)',
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
              animation: `relicFlow ${RELIC_FLOW_MS}ms cubic-bezier(0.35,0,0.2,1) forwards`,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}
