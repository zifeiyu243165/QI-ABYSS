/**
 * 通用素材叠加层（T02 · battle/ 基建）—— **降级铁律的载体**。
 *
 * 调用方**必须先画好基底 CSS 层**（渐变 + 描金边 + 圆角），本组件只在其上再贴一层图。
 * 图缺失 / 404 / 尚未生成时，本层渲染为空 → 基底原样可见：
 *   不白屏、不报错、无 FOUC、无布局跳动。
 *
 * 【为什么不用 onError】CSS 的 background-image / border-image 加载失败**不会**触发
 * onError（只有 <img> 会）。用 <img> 就要为 29 张图各挂 error 态 + useState，徒增状态与竞态。
 *
 * 【T02 只建立、不引用】本组件暂无人使用，以保证 battle/ 基建落地时界面像素级零变化。
 */
import type { CSSProperties } from 'react';
import { artUrl, nineSlice } from './artAssets';

/** 素材叠加层属性 */
export interface ArtLayerProps {
  /** 素材文件名（取自 `artAssets.UI` / `WUXING_SEAL` 等） */
  fileName: string;
  /** 'slice' = 九宫格拉伸（面板/条/按钮）；'fit' = 原尺寸（印章/图标/占位槽） */
  mode: 'slice' | 'fit';
  /** `mode==='slice'` 时必填：九宫格切片表条目（取自 `SLICE`） */
  slice?: { slice: string; width: string };
  /** `mode==='fit'` 时的定尺寸 */
  fit?: { w: number; h: number };
  /** 追加 / 覆盖的内联样式 */
  style?: CSSProperties;
  /** 叠放层级，默认 1（在内容层之上、文字之下由调用方决定） */
  zIndex?: number;
}

/**
 * 素材叠加层。`mode='slice'` 走九宫格，`mode='fit'` 走原尺寸背景图。
 * 始终 `backgroundColor: transparent`（铁律：图像层绝不设不透明底色）。
 */
export function ArtLayer({ fileName, mode, slice, fit, style, zIndex = 1 }: ArtLayerProps) {
  const base: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundColor: 'transparent', // ★ 铁律：图像层绝不设不透明底色
    zIndex,
    ...style,
  };
  if (mode === 'slice') {
    return <div aria-hidden style={{ ...base, ...nineSlice(fileName, slice!) }} />;
  }
  return (
    <div
      aria-hidden
      style={{
        ...base,
        inset: 'auto',
        width: fit?.w,
        height: fit?.h,
        backgroundImage: `url(${artUrl(fileName)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
      }}
    />
  );
}
