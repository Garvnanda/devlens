// Burst of coloured sparks on every click. One fixed canvas; the rAF loop only runs while sparks are alive.
import { useEffect, useRef } from 'react';

export const PALETTE = ['#0F9B8E', '#7C3AED', '#EA580C', '#2563EB', '#E11D48', '#16A34A', '#D97706', '#DB2777'];

interface Spark { x: number; y: number; angle: number; color: string; start: number }

const COUNT = 10;
const DURATION = 480;
const RADIUS = 26;
const LENGTH = 11;

export function ClickSpark() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        const sparks: Spark[] = [];
        let raf = 0;
        let burst = 0;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const draw = (now: number) => {
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i];
                const t = (now - s.start) / DURATION;
                if (t >= 1) {
                    sparks.splice(i, 1);
                    continue;
                }
                const ease = 1 - (1 - t) * (1 - t);
                const dist = ease * RADIUS;
                const len = LENGTH * (1 - ease);
                const cos = Math.cos(s.angle);
                const sin = Math.sin(s.angle);
                ctx.strokeStyle = s.color;
                ctx.globalAlpha = 1 - t;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(s.x + dist * cos, s.y + dist * sin);
                ctx.lineTo(s.x + (dist + len) * cos, s.y + (dist + len) * sin);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            raf = sparks.length ? requestAnimationFrame(draw) : 0;
        };

        const onDown = (e: PointerEvent) => {
            const now = performance.now();
            burst++;
            for (let i = 0; i < COUNT; i++) {
                sparks.push({
                    x: e.clientX,
                    y: e.clientY,
                    angle: (i / COUNT) * Math.PI * 2 + burst * 0.3,
                    color: PALETTE[(i + burst) % PALETTE.length],
                    start: now,
                });
            }
            if (!raf) raf = requestAnimationFrame(draw);
        };

        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('pointerdown', onDown, { passive: true });
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointerdown', onDown);
        };
    }, []);

    return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[300] h-full w-full" aria-hidden />;
}
