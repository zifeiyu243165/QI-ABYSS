/**
 * 视觉特效层
 * 卡帧（Hitstop） → 墨染金箔粒子 → 伤害数字爆裂 → 反弹水墨字
 * 零图片素材：粒子走 Canvas，数字走 DOM + CSS。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { DamageNumber } from '../../game/types';
import { artUrl } from '../battle/artAssets';

const WX_COLOR: Record<string, string> = {
  jin: '#d9b45b',
  mu: '#7bb661',
  shui: '#4a90c2',
  huo: '#c23b22',
  tu: '#c8a165',
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'ink' | 'gold';
}

export interface FxHandle {
  /** 墨染 + 金箔溅射 */
  burst(x: number, y: number, intensity: number): void;
}

interface FxLayerProps {
  width: number;
  height: number;
  fxLevel: 'lavish' | 'standard' | 'simple';
  weather: string;
}

export const FxLayer = forwardRef<FxHandle, FxLayerProps>(function FxLayer(
  { width, height, fxLevel, weather },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const weatherItems = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  const maxParticles = fxLevel === 'lavish' ? 200 : fxLevel === 'standard' ? 66 : 0;

  useImperativeHandle(ref, () => ({
    burst(x, y, intensity) {
      if (fxLevel === 'simple') return;
      const scale = fxLevel === 'lavish' ? 1 : 0.34;
      const count = Math.floor(Math.min(40, 10 + intensity * 6) * scale);
      for (let i = 0; i < count; i++) {
        if (particles.current.length >= maxParticles) break;
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
        });
      }
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

      // 墨染金箔
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.16; // 重力
        p.vx *= 0.98;
        p.life += 1;
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
        } else {
          // 墨点：不规则圆
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.42), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  return (
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
  );
});

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
