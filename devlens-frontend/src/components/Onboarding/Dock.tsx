// macOS-style magnifying dock (ported from React Bits via DEEPSIGHT).
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue, type SpringOptions } from 'framer-motion';
import { useRef, useState, type ReactNode } from 'react';

export interface DockItemData {
    icon: ReactNode;
    label: string;
    onClick?: () => void;
    active?: boolean;
}

const SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 };

function DockItem({ item, mouseX, distance, magnification, baseItemSize }: {
    item: DockItemData; mouseX: MotionValue<number>; distance: number; magnification: number; baseItemSize: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const mouseDistance = useTransform(mouseX, (val) => {
        const rect = ref.current?.getBoundingClientRect() ?? { x: 0 };
        return val - rect.x - baseItemSize / 2;
    });
    const targetSize = useTransform(mouseDistance, [-distance, 0, distance], [baseItemSize, magnification, baseItemSize]);
    const size = useSpring(targetSize, SPRING);

    return (
        <motion.div
            ref={ref}
            style={{ width: size, height: size }}
            onHoverStart={() => setHovered(true)}
            onHoverEnd={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            onClick={item.onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.onClick?.();
                }
            }}
            tabIndex={0}
            role="button"
            aria-label={item.label}
            className={`relative inline-flex items-center justify-center rounded-xl border cursor-pointer outline-none transition-colors focus-visible:ring-1 focus-visible:ring-white/60 ${
                item.active ? 'sec-bg sec-glow border-transparent text-white' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'
            }`}
        >
            {item.icon}
            <AnimatePresence>
                {hovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 0 }}
                        animate={{ opacity: 1, y: -10 }}
                        exit={{ opacity: 0, y: 0 }}
                        transition={{ duration: 0.2 }}
                        role="tooltip"
                        style={{ x: '-50%' }}
                        className="absolute -top-7 left-1/2 whitespace-pre rounded-md border border-white/10 bg-neutral-900 px-2 py-0.5 text-[11px] text-white/80"
                    >
                        {item.label}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

export function Dock({ items, magnification = 62, distance = 130, panelHeight = 54, baseItemSize = 40 }: {
    items: DockItemData[]; magnification?: number; distance?: number; panelHeight?: number; baseItemSize?: number;
}) {
    const mouseX = useMotionValue(Infinity);

    return (
        <div
            onMouseMove={({ pageX }) => mouseX.set(pageX)}
            onMouseLeave={() => mouseX.set(Infinity)}
            role="toolbar"
            aria-label="Chapters"
            className="flex items-end gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2 pb-2 backdrop-blur-md"
            style={{ height: panelHeight }}
        >
            {items.map((item, i) => (
                <DockItem key={i} item={item} mouseX={mouseX} distance={distance} magnification={magnification} baseItemSize={baseItemSize} />
            ))}
        </div>
    );
}
