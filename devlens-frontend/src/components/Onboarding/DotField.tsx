// Interactive dot grid with cursor bulge + glow (ported from React Bits via DEEPSIGHT).
import { memo, useEffect, useRef } from 'react';

const TWO_PI = Math.PI * 2;

interface Props {
    dotRadius?: number;
    dotSpacing?: number;
    cursorRadius?: number;
    bulgeStrength?: number;
    glowRadius?: number;
    gradientFrom?: string;
    gradientTo?: string;
    glowColor?: string;
}

interface Dot { ax: number; ay: number; sx: number; sy: number }

export const DotField = memo(function DotField({
    dotRadius = 1.4,
    dotSpacing = 16,
    cursorRadius = 420,
    bulgeStrength = 58,
    glowRadius = 150,
    gradientFrom = 'rgba(255,255,255,0.22)',
    gradientTo = 'rgba(255,255,255,0.06)',
    glowColor = 'rgba(255,255,255,0.10)',
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glowRef = useRef<SVGCircleElement>(null);
    const dotsRef = useRef<Dot[]>([]);
    const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 });
    const sizeRef = useRef({ w: 0, h: 0, ox: 0, oy: 0 });
    const engagement = useRef(0);
    const glowOpacity = useRef(0);
    const glowId = useRef(`df-${Math.random().toString(36).slice(2, 8)}`);

    useEffect(() => {
        const canvas = canvasRef.current;
        const glow = glowRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true })!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let resizeTimer: ReturnType<typeof setTimeout>;

        const build = (w: number, h: number) => {
            const step = dotRadius + dotSpacing;
            const cols = Math.floor(w / step);
            const rows = Math.floor(h / step);
            const padX = (w % step) / 2;
            const padY = (h % step) / 2;
            const dots: Dot[] = new Array(rows * cols);
            let i = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const ax = padX + c * step + step / 2;
                    const ay = padY + r * step + step / 2;
                    dots[i++] = { ax, ay, sx: ax, sy: ay };
                }
            }
            dotsRef.current = dots;
        };

        const doResize = () => {
            const rect = canvas.parentElement!.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            sizeRef.current = { w: rect.width, h: rect.height, ox: rect.left, oy: rect.top };
            build(rect.width, rect.height);
        };
        const resize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(doResize, 100);
        };
        const onMove = (e: MouseEvent) => {
            mouseRef.current.x = e.clientX - sizeRef.current.ox;
            mouseRef.current.y = e.clientY - sizeRef.current.oy;
        };
        const speedInt = setInterval(() => {
            const m = mouseRef.current;
            const d = Math.hypot(m.prevX - m.x, m.prevY - m.y);
            m.speed += (d - m.speed) * 0.5;
            if (m.speed < 0.001) m.speed = 0;
            m.prevX = m.x;
            m.prevY = m.y;
        }, 20);

        let raf = 0;
        const tick = () => {
            const dots = dotsRef.current;
            const m = mouseRef.current;
            const { w, h } = sizeRef.current;
            const targetEng = Math.min(m.speed / 5, 1);
            engagement.current += (targetEng - engagement.current) * 0.06;
            if (engagement.current < 0.001) engagement.current = 0;
            const eng = engagement.current;
            glowOpacity.current += (eng - glowOpacity.current) * 0.08;
            if (glow) {
                glow.setAttribute('cx', String(m.x));
                glow.setAttribute('cy', String(m.y));
                glow.style.opacity = String(glowOpacity.current);
            }
            ctx.clearRect(0, 0, w, h);
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, gradientFrom);
            grad.addColorStop(1, gradientTo);
            ctx.fillStyle = grad;
            const crSq = cursorRadius * cursorRadius;
            const rad = dotRadius / 2;
            ctx.beginPath();
            for (let i = 0; i < dots.length; i++) {
                const d = dots[i];
                const dx = m.x - d.ax;
                const dy = m.y - d.ay;
                const distSq = dx * dx + dy * dy;
                if (distSq < crSq && eng > 0.01) {
                    const dist = Math.sqrt(distSq);
                    const t = 1 - dist / cursorRadius;
                    const push = t * t * bulgeStrength * eng;
                    const angle = Math.atan2(dy, dx);
                    d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
                    d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
                } else {
                    d.sx += (d.ax - d.sx) * 0.1;
                    d.sy += (d.ay - d.sy) * 0.1;
                }
                ctx.moveTo(d.sx + rad, d.sy);
                ctx.arc(d.sx, d.sy, rad, 0, TWO_PI);
            }
            ctx.fill();
            raf = requestAnimationFrame(tick);
        };

        doResize();
        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', onMove, { passive: true });
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            clearInterval(speedInt);
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMove);
        };
    }, [dotRadius, dotSpacing, cursorRadius, bulgeStrength, gradientFrom, gradientTo]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <defs>
                    <radialGradient id={glowId.current}>
                        <stop offset="0%" stopColor={glowColor} />
                        <stop offset="100%" stopColor="transparent" />
                    </radialGradient>
                </defs>
                <circle ref={glowRef} cx="-9999" cy="-9999" r={glowRadius} fill={`url(#${glowId.current})`} style={{ opacity: 0 }} />
            </svg>
        </div>
    );
});
