/**
 * 战斗背景层（T09 · 自 `BattleScreen.tsx` **逐字下沉**）。
 *
 * 【来源】`BattleScreen.tsx` 的「战斗背景 + 明暗罩」两块，样式、滤镜、透明度、`cloud-drift`
 * 类名与明暗罩渐变**逐字保留** —— 抽取只挪动渲染位置（同一父容器、同一 zIndex），像素零变化。
 *
 * 【为何独立成组件】纯展示、零 props、零状态；留在编排壳里只是挤占可读性（§T09 line 目标）。
 *
 * 【素材铁律】背景名经 `artAssets.BG` + `artUrl()` 拼装，本文件不出现裸素材文件名。
 */
import { artUrl, BG } from './artAssets';

/**
 * 战斗背景：只挂 `bg_战场.png` + 一层明暗罩。
 *
 * 【历史缺陷 · 勿回退】此前写成 `url(bg_主界面.png), url(bg_战场.png)` —— CSS 多背景中
 * **第一个在最上层**，不透明的主界面图把战场图整个盖住，所以战斗中根本看不到战场背景。
 */
export function BattleBackdrop() {
  return (
    <>
      <div
        className="cloud-drift"
        style={{
          position: 'absolute',
          inset: '-4%',
          backgroundImage: `url(${artUrl(BG.battlefield)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'saturate(0.9) brightness(0.98)',
          opacity: 0.96,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
      {/* 明暗罩：上方压暗提高敌人区文字对比，下方提亮让手牌区透气 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(28,20,12,0.44) 0%, rgba(60,42,24,0.18) 30%, rgba(247,242,228,0.08) 62%, rgba(251,247,236,0.32) 100%)',
        }}
      />
    </>
  );
}
