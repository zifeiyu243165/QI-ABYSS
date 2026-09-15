/**
 * 极轻量音效层。
 *
 * 项目此前**完全没有音频代码与音频资源**，所以这里的设计目标是「**缺文件绝不报错**」：
 * - 音频文件不存在 → 静默无声
 * - 浏览器未解锁自动播放 → 静默吞掉 promise rejection
 * - 环境无 Audio（SSR / 测试）→ 直接返回
 *
 * 也就是说：把音频丢进 `public/audio/` 即刻生效，不放也不影响任何可玩性。
 * 需要的文件清单与音色建议见 `public/audio/音效清单.md`。
 *
 * 注意：本模块**只能被 UI 调用**，绝不能进 engine —— 引擎必须保持纯函数与确定性。
 */

const SFX_BASE = `${import.meta.env.BASE_URL}audio/`;

/** 音效清单：键名 → 文件（文件名用中文，遵循全项目命名约定） */
export const SFX_FILES = {
  /** 归墟：把牌拖入太极旋涡 —— 清脆的玉磬敲击 / 竹简卷起 */
  relicDrop: '归墟_玉磬.mp3',
  /** 弃牌化炁 —— 气流涌动的「呼」声 */
  qiFlow: '化炁_气流.mp3',
  /** 大量归墟、金莲绽放 —— 清脆的「锃」 */
  lotus: '莲花_锃.mp3',
} as const;

export type SfxName = keyof typeof SFX_FILES;

let enabled = true;
/** 每个音效一个模板元素；播放时克隆，避免重叠播放互相打断 */
const templates = new Map<SfxName, HTMLAudioElement | null>();
const broken = new Set<SfxName>();

export function setSfxEnabled(value: boolean): void {
  enabled = value;
}

export function isSfxEnabled(): boolean {
  return enabled;
}

export function playSfx(name: SfxName, volume = 0.55): void {
  if (!enabled) return;
  if (typeof Audio === 'undefined') return;
  if (broken.has(name)) return;

  try {
    let tpl = templates.get(name);
    if (tpl === undefined) {
      tpl = new Audio(`${SFX_BASE}${SFX_FILES[name]}`);
      tpl.preload = 'auto';
      // 文件缺失 / 解码失败：标记为坏，后续直接跳过，不反复尝试
      tpl.addEventListener('error', () => broken.add(name));
      templates.set(name, tpl);
    }
    if (!tpl) return;

    const node = tpl.cloneNode(true) as HTMLAudioElement;
    node.volume = Math.max(0, Math.min(1, volume));
    // play() 在被浏览器自动播放策略拦截时会 reject —— 必须吞掉，否则控制台报错
    void node.play().catch(() => undefined);
  } catch {
    /* 任何异常都静默：音效永远不能影响玩法 */
  }
}
