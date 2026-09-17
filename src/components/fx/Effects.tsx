/**
 * 视觉特效层
 * 卡帧（Hitstop） → 墨染金箔粒子 → 伤害数字爆裂 → 反弹水墨字 → 奥义融合演出
 * 零图片素材：粒子走 Canvas，数字走 DOM + CSS。
 *
 * 【T09 增强】在原有「墨点 / 金箔」两种粒子的基础上，新增：
 *   - 五行火花（术法 / 奥义，按 `WuXing` 取色，`lighter` 混合）
 *   - 碎石（物理 / AoE，source-over）
 *   - 冲击波环（暴击 / 真实伤害 / 奥义，半径 8→70 缓出）
 *   - 拖尾（高伤，记录前 3 位置，`lighter`）
 *   - `fuseBurst(ev)`：7 形态（physical / support / spell-金木水火土）奥义专属演出
 *     —— 牌面汇聚 → 五行符文绕行 → 爆发冲击波 → 奥义牌名飞入。总时长约 700ms。
 *
 * 【hex 铁律】原 14 处 hex（`WX_COLOR` 5 + 粒子 2 + 物候 7）**一律不动**。
 * 本次新增的**所有**颜色一律走 `readToken()`（`fx/readToken.ts`）→ 新增 hex 为 0，
 * `架构守卫.mjs` 的 `HEX_EXEMPT['src/components/fx/Effects.tsx'].count` 保持 14。
 *
 * 【随机源】本层在 UI 层，**允许** `Math.random()`（特效外观随机）；
 * 引擎 `src/game/engine/**` 仍严禁（确定性走 `state.rngState`）。
 *
 * 【卡帧澄清】引擎**已**按伤害量分级写 `pendingHitstopMs`；`useBattleFx.ts` 的 850ms 是
 * 「特效消费 / 清理定时」常量，**不是**卡帧时长，勿改它去「修卡帧」。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DamageNumber, FusionEvent } from '../../game/types';
import { artUrl } from '../battle/artAssets';
import { readToken } from './readToken';

const WX_COLOR: Record<string, string> = {
  jin: '#d9b45b',
  mu: '#7bb661',
  shui: '#4a90c2',
  huo: '#c23b22',
  tu: '#c8a165',
};

/** 判定一个 `DamageNumber['kind']` 是否为五行（术法 / 奥义按五行取色） */
const WUXING_KINDS = new Set(['jin', 'mu', 'shui', 'huo', 'tu']);

/** 三档降级下的粒子上限（T09：lavish 200→260、standard 66→96、simple 0 = 不出任何新效果） */
const MAX_PARTICLES: Record<string, number> = { lavish: 260, standard: 96, simple: 0 };

type ParticleKind = 'ink' | 'gold' | 'spark' | 'debris' | 'ring' | 'trail';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  /** 重力加速度（缺省 0.16，与原墨点 / 金箔一致） */
  gravity?: number;
  /** 自旋角速度（金箔 / 碎石用） */
  spin?: number;
  /** 冲击波环的目标半径（`kind==='ring'`） */
  ringMax?: number;
  /** 拖尾历史（最近 3 个位置，`kind==='trail'`） */
  trail?: { x: number; y: number }[];
}

export interface FxHandle {
  /** 墨染 + 金箔溅射（按 `kind` 分形分色；缺省时行为与既有完全一致） */
  burst(x: number, y: number, intensity: number, kind?: DamageNumber['kind']): void;
  /** 融合演出（7 形态专属） —— 由 `useBattleFx` 在消费 `pendingFusion` 时调用 */
  fuseBurst(ev: FusionEvent): void;
}

interface FxLayerProps {
  width: number;
  height: number;
  fxLevel: 'lavish' | 'standard' | 'simple';
  weather: string;
}

/** 按融合事件给出主色（全部走 token，零 hex）：术法 → 五行色；物理 → 朱红；功能 → 松花 */
function fusionColor(ev: FusionEvent): string {
  if (ev.wuxing) return readToken(`wx-${ev.wuxing}`);
  if (ev.kind === 'physical') return readToken('zhuhong');
  return readToken('songhua');
}

export const FxLayer = forwardRef<FxHandle, FxLayerProps>(function FxLayer(
  { width, height, fxLevel, weather },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const weatherItems = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  /** 融合演出用到的定时器（卸载时统一清理，避免定时器泄漏） */
  const timers = useRef<number[]>([]);
  /** 奥义牌名飞入覆盖层的当前场次（`key` 用于重复触发时重放动画） */
  const announceSeq = useRef(0);
  const [announce, setAnnounce] = useState<{ key: number; name: string; color: string } | null>(null);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    burst(x, y, intensity, kind) {
      const cap = MAX_PARTICLES[fxLevel] ?? 0;
      if (cap === 0) return;
      const scale = fxLevel === 'lavish' ? 1 : 0.34;
      const crit = intensity >= 3;
      const count = Math.floor(Math.min(40, 10 + intensity * 6) * scale);

      /** ① 原有「墨点 / 金箔」（参数与颜色逐字保留；仅补 `gravity` 默认值） */
      for (let i = 0; i < count; i++) {
        if (particles.current.length >= cap) break;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 3.4;
        const isGold = Math.random() > 0.45;
        particles.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.1,
          life: 0,
          maxLife: 26 + Math.random() * 22,
          size: isGold ? 1.6 + Math.random() * 2.4 : 3 + Math.random() * 6,
          color: isGold ? '#f5c518' : '#1a1f2b',
          kind: isGold ? 'gold' : 'ink',
          gravity: 0.16,
        });
      }

      /** ② 五行火花（术法 / 奥义）：初速 3–6、重力 0.05、寿命 14–26、lighter */
      if (kind && WUXING_KINDS.has(kind)) {
        const color = readToken(`wx-${kind}`);
        const sparks = Math.floor(Math.min(24, 8 + intensity * 4) * scale);
        for (let i = 0; i < sparks; i++) {
          if (particles.current.length >= cap) break;
          const angle = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 3;
          particles.current.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.1,
            life: 0,
            maxLife: 14 + Math.random() * 12,
            size: 1.4 + Math.random() * 2.2,
            color,
            kind: 'spark',
            gravity: 0.05,
          });
        }
      }

      /** ③ 碎石（物理 / AoE）：初速 2–5、重力 0.3、寿命 20–40、source-over */
      if (kind === 'physical') {
        const debris = Math.floor(Math.min(14, 5 + intensity * 3) * scale);
        for (let i = 0; i < debris; i++) {
          if (particles.current.length >= cap) break;
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 3;
          particles.current.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.4,
            life: 0,
            maxLife: 20 + Math.random() * 20,
            size: 1.6 + Math.random() * 2.8,
            color: readToken('card-text-sub'),
            kind: 'debris',
            gravity: 0.3,
            spin: (Math.random() - 0.5) * 0.5,
          });
        }
      }

      /** ④ 冲击波环（暴击 / 真实伤害）：半径 8→70 缓出、寿命 22 帧、lighter */
      if ((crit || kind === 'true') && particles.current.length < cap) {
        particles.current.push({
          x,
          y,
          vx: 0,
          vy: 0,
          life: 0,
          maxLife: 22,
          size: 8,
          color: readToken('minghuang'),
          kind: 'ring',
          gravity: 0,
          ringMax: 70,
        });
      }

      /** ⑤ 拖尾（高伤，仅 lavish）：记录前 3 位置、lighter */
      if (fxLevel === 'lavish' && intensity >= 2.5) {
        for (let i = 0; i < 3; i++) {
          if (particles.current.length >= cap) break;
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 2;
          particles.current.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2,
            life: 0,
            maxLife: 24,
            size: 2.6,
            color: readToken('mibai'),
            kind: 'trail',
            gravity: 0.1,
            trail: [],
          });
        }
      }
    },

    fuseBurst(ev) {
      const cap = MAX_PARTICLES[fxLevel] ?? 0;
      if (cap === 0) return; // simple 档：奥义专属演出不出
      const cx = width / 2;
      const cy = height * 0.46;
      const mainColor = fusionColor(ev);
      const lavish = fxLevel === 'lavish';

      /** ① 牌面汇聚（0–120ms）：粒子自四周向中心收拢 */
      const gather = (lavish ? 20 : 12) + 6;
      for (let i = 0; i < gather; i++) {
        if (particles.current.length >= cap) break;
        const a = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 50;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        particles.current.push({
          x: px,
          y: py,
          // 向心速度：约 9 帧内抵达中心 → 与「120ms 汇聚」节拍一致
          vx: (cx - px) * 0.16,
          vy: (cy - py) * 0.16,
          life: 0,
          maxLife: 9,
          size: 2 + Math.random() * 2,
          color: mainColor,
          kind: 'spark',
          gravity: 0,
        });
      }

      /** ② 五行符文绕行（120–300ms）：切向速度 → 环绕中心旋转 */
      const runes = (lavish ? 14 : 8) + 5;
      for (let i = 0; i < runes; i++) {
        if (particles.current.length >= cap) break;
        const a = Math.random() * Math.PI * 2;
        const r = 62 + Math.random() * 14;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        particles.current.push({
          x: px,
          y: py,
          vx: -Math.sin(a) * r * 0.12,
          vy: Math.cos(a) * r * 0.12,
          life: 0,
          maxLife: 12,
          size: 2.4 + Math.random() * 1.6,
          color: mainColor,
          kind: 'spark',
          gravity: 0,
        });
      }

      /** ③ 爆发冲击波（≈300ms）+ 奥义牌名飞入（短时覆盖层 ~400ms） */
      const burstId = window.setTimeout(() => {
        if (particles.current.length < cap) {
          particles.current.push({
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: 0,
            maxLife: 24,
            size: 10,
            color: mainColor,
            kind: 'ring',
            gravity: 0,
            ringMax: 120,
          });
        }
        const out = (lavish ? 26 : 14) + 6;
        for (let i = 0; i < out; i++) {
          if (particles.current.length >= cap) break;
          const a = Math.random() * Math.PI * 2;
          const speed = 3 + Math.random() * 4;
          particles.current.push({
            x: cx,
            y: cy,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 0,
            maxLife: 20 + Math.random() * 12,
            size: 1.4 + Math.random() * 2,
            color: mainColor,
            kind: 'spark',
            gravity: 0.05,
          });
        }
        const key = ++announceSeq.current;
        setAnnounce({ key, name: ev.name, color: mainColor });
        const hideId = window.setTimeout(
          () => setAnnounce((cur) => (cur?.key === key ? null : cur)),
          400,
        );
        timers.current.push(hideId);
      }, 300);
      timers.current.push(burstId);
    },
  }));

  // 物候粒子持续生成
  useEffect(() => {
    if (fxLevel === 'simple' || weather === 'none') {
      weatherItems.current = [];
      return;
    }
    const spawn = () => {
      if (weatherItems.current.length > (fxLevel === 'lavish' ? 46 : 18)) return;
      const glyphs: Record<string, { color: string; size: number; vy: number; drift: number }> = {
        petal: { color: '#e8a0b4', size: 4, vy: 0.5, drift: 0.5 },
        ear: { color: '#c8a165', size: 4, vy: 0.7, drift: 0.3 },
        snow: { color: '#d6ecff', size: 3.4, vy: 0.55, drift: 0.4 },
        rain: { color: '#4a90c2', size: 2.2, vy: 3.4, drift: 0.05 },
        leaf: { color: '#7bb661', size: 5, vy: 0.6, drift: 0.6 },
        fire: { color: '#ca6924', size: 3, vy: -0.5, drift: 0.3 },
        frost: { color: '#d6ecff', size: 2.6, vy: 0.3, drift: 0.25 },
      };
      const g = glyphs[weather] ?? glyphs['petal']!;
      weatherItems.current.push({
        x: Math.random() * width,
        y: -12,
        vx: (Math.random() - 0.5) * g.drift,
        vy: g.vy + Math.random() * 0.35,
        life: 0,
        maxLife: 4000,
        size: g.size + Math.random() * 2,
        color: g.color,
        kind: 'ink',
      });
    };
    const timer = window.setInterval(spawn, fxLevel === 'lavish' ? 420 : 900);
    return () => window.clearInterval(timer);
  }, [weather, fxLevel, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      // 物候（先画，在底层）
      for (let i = weatherItems.current.length - 1; i >= 0; i--) {
        const p = weatherItems.current[i]!;
        p.x += p.vx + Math.sin(p.life * 0.02) * 0.3;
        p.y += p.vy;
        p.life += 1;
        if (p.y > height + 14 || p.life > p.maxLife) {
          weatherItems.current.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 0.62, p.life * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }

      // 粒子（墨点 / 金箔 / 五行火花 / 碎石 / 冲击波环 / 拖尾）
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity ?? 0.16; // 重力（按粒子类型分档）
        p.vx *= 0.98;
        p.life += 1;
        if (p.kind === 'trail') {
          if (!p.trail) p.trail = [];
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 3) p.trail.shift();
        }
        if (p.life > p.maxLife) {
          particles.current.splice(i, 1);
          continue;
        }
        const t = p.life / p.maxLife;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = p.color;
        if (p.kind === 'gold') {
          // 金箔碎片：菱形反光
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 0.24);
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          ctx.restore();
        } else if (p.kind === 'spark') {
          // 五行火花：加亮混合的圆点
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        } else if (p.kind === 'debris') {
          // 碎石：旋转的小方片
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * (p.spin ?? 0.2));
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          ctx.restore();
        } else if (p.kind === 'ring') {
          // 冲击波环：半径 8→ringMax 的缓出扩张
          const r = p.size + (p.ringMax ?? 70) * (1 - Math.pow(1 - t, 3));
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * (1 - t) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else if (p.kind === 'trail') {
          // 拖尾：沿最近 3 个历史位置画渐隐的加亮点
          const tr = p.trail ?? [];
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < tr.length; k++) {
            const w = (k + 1) / (tr.length + 1);
            ctx.globalAlpha = (1 - t) * w;
            ctx.beginPath();
            ctx.arc(tr[k]!.x, tr[k]!.y, p.size * w, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
        } else {
          // 墨点：不规则圆
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.42), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          width,
          height,
          zIndex: 40,
        }}
      />
      {/* 奥义牌名飞入（短时覆盖层）：由 fuseBurst 触发，cardFly 动画飞升淡出 */}
      {announce && (
        <FusionAnnounce key={announce.key} name={announce.name} color={announce.color} />
      )}
    </>
  );
});

/* ============================== 奥义牌名飞入 ============================== */

/**
 * 奥义牌名飞入覆盖层（T09）。
 *
 * 【为何内置在 `FxLayer`】`fuseBurst` 是 `FxLayer` 的 imperative 方法，触发源就在本组件内，
 * 因此覆盖层直接由 `FxLayer` 自渲（无需 `App.tsx` / `BattleScreen.tsx` 额外接线）。
 * `zIndex 86` 高于卡帧(70) / 反弹字(80)、低于开场(90)，不与既有层秩序打架。
 * 时长由 `fuseBurst` 的定时器控制（~400ms）；动画复用全局 `cardFly`（不新增 keyframes）。
 */
function FusionAnnounce({ name, color }: { name: string; color: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 86,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-brush)',
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: 4,
          whiteSpace: 'nowrap',
          color,
          textShadow:
            '0 0 22px rgba(255,255,255,0.55), 3px 4px 0 rgba(26,31,43,0.9), 0 0 44px rgba(0,0,0,0.6)',
          animation: 'cardFly 400ms cubic-bezier(0.16, 0.9, 0.3, 1) forwards',
        }}
      >
        {name}
      </div>
    </div>
  );
}

/* ============================== 伤害数字 ============================== */

/**
 * 伤害数字层。
 *
 * @param numbers  本帧要飘的数字
 * @param backdrop 可选：飘字底素材文件名（定尺寸装饰底，如 `UI.dmgBackdrop`）。
 *   【缺省 `undefined` → 行为与既有完全一致】：DOM 里只有原来的数字节点，不注入任何叠加节点。
 *   传入时按「基底 + 叠加层」兄弟结构铺在数字**之下**（数字自带 `textShadow`，底板纯装饰；
 *   素材缺失时本层渲染为空，数字观感不变）—— 底座随数字实际尺寸缩放，故用 `inset: 0` + `100% 100%`。
 */
export function DamageNumberLayer({ numbers, backdrop }: { numbers: DamageNumber[]; backdrop?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      {numbers.map((n) => {
        const color =
          n.kind === 'heal'
            ? 'var(--color-songhua)'
            : n.kind === 'true'
              ? 'var(--color-gaosu)'
              : WX_COLOR[n.kind] ?? 'var(--color-gaosu)';
        const label = (
          <>
            {n.kind === 'heal' ? '+' : ''}
            {n.amount}
            {n.crit && <span style={{ color: 'var(--color-minghuang)', fontSize: 20 }}> 暴击</span>}
          </>
        );
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              transform: 'translate(-50%, 0)',
              animation: 'numberPop 900ms cubic-bezier(0.16, 0.9, 0.3, 1) forwards',
              fontFamily: 'var(--font-brush)',
              fontSize: n.crit ? 40 : 26,
              fontWeight: 700,
              color,
              textShadow: '0 2px 0 rgba(26,31,43,0.9), 0 0 12px rgba(0,0,0,0.55)',
              whiteSpace: 'nowrap',
            }}
          >
            {backdrop ? (
              <>
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    backgroundColor: 'transparent',
                    backgroundImage: `url(${artUrl(backdrop)})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '100% 100%',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
              </>
            ) : (
              label
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================== 卡帧 ============================== */

export function HitstopOverlay({ ms, active }: { ms: number; active: boolean }) {
  if (!active) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 70,
        pointerEvents: 'none',
        background: 'radial-gradient(circle at 50% 45%, rgba(245,197,24,0.16), transparent 62%)',
        animation: `hitstopFlash ${ms}ms steps(1) 1`,
      }}
    />
  );
}

/* ============================== 反弹水墨字 ============================== */

export function ParryGlyph({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-brush)',
          fontSize: 92,
          fontWeight: 900,
          color: 'var(--color-minghuang)',
          textShadow:
            '0 0 26px rgba(245,197,24,0.85), 4px 5px 0 rgba(26,31,43,0.92), 0 0 60px rgba(245,197,24,0.5)',
          animation: 'parryGlyph 1100ms ease-out forwards',
          letterSpacing: 8,
        }}
      >
        反弹
      </div>
    </div>
  );
}
