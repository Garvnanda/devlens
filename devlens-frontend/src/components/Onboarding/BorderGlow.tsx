// Pointer-tracking edge glow on a card (ported from React Bits via DEEPSIGHT), monochrome.
import { useCallback, useRef, type ReactNode } from 'react';

export function BorderGlow({ children, className = '' }: { children: ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);

    const onMove = useCallback((e: React.PointerEvent) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - r.left - r.width / 2;
        const dy = e.clientY - r.top - r.height / 2;
        const kx = dx !== 0 ? r.width / 2 / Math.abs(dx) : Infinity;
        const ky = dy !== 0 ? r.height / 2 / Math.abs(dy) : Infinity;
        const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
        let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (deg < 0) deg += 360;
        el.style.setProperty('--edge-proximity', (edge * 100).toFixed(3));
        el.style.setProperty('--cursor-angle', `${deg.toFixed(3)}deg`);
    }, []);

    return (
        <div ref={ref} onPointerMove={onMove} className={`ob-glow-card ${className}`}>
            <span className="ob-edge-light" />
            <div className="relative z-[1] flex flex-col">{children}</div>
        </div>
    );
}
