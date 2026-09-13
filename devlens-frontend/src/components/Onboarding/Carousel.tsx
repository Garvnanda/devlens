// Draggable 3D card carousel with autoplay (ported from React Bits via DEEPSIGHT).
// Track is animated imperatively so the loop wrap can jump without a spring back.
import { animate, motion, useMotionValue, useTransform, type MotionValue, type PanInfo } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface CarouselItem {
    id: number;
    title: string;
    description: string;
    icon?: ReactNode;
    color?: string;
}

const GAP = 16;
const VELOCITY_THRESHOLD = 500;
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

function Card({ item, index, itemWidth, trackItemOffset, x }: {
    item: CarouselItem; index: number; itemWidth: number; trackItemOffset: number; x: MotionValue<number>;
}) {
    const range = [-(index + 1) * trackItemOffset, -index * trackItemOffset, -(index - 1) * trackItemOffset];
    const rotateY = useTransform(x, range, [90, 0, -90]);
    const opacity = useTransform(x, range, [0, 1, 0]);
    return (
        <motion.div className="ob-carousel-item" style={{ width: itemWidth, rotateY, opacity, backfaceVisibility: 'hidden', ['--item' as string]: item.color }}>
            {item.icon && <span className="ob-carousel-icon">{item.icon}</span>}
            <div className="text-[15px] font-semibold text-white">{item.title}</div>
            <p className="text-[13px] leading-relaxed text-white/50">{item.description}</p>
        </motion.div>
    );
}

export function Carousel({ items, baseWidth = 380, autoplayDelay = 3800 }: { items: CarouselItem[]; baseWidth?: number; autoplayDelay?: number }) {
    const itemWidth = baseWidth - 32;
    const trackItemOffset = itemWidth + GAP;
    const looped = useMemo(() => (items.length ? [items[items.length - 1], ...items, items[0]] : items), [items]);
    const lastIndex = looped.length - 1;

    const [pos, setPos] = useState({ i: 1, instant: true });
    const x = useMotionValue(-trackItemOffset);
    const [hovered, setHovered] = useState(false);
    const dragging = useRef(false);

    useEffect(() => {
        const target = -(pos.i * trackItemOffset);
        if (pos.instant) {
            x.jump(target);
            return;
        }
        const controls = animate(x, target, {
            ...SPRING,
            onComplete: () => {
                if (pos.i === lastIndex) setPos({ i: 1, instant: true });
                else if (pos.i === 0) setPos({ i: items.length, instant: true });
            },
        });
        return () => controls.stop();
    }, [pos, trackItemOffset, lastIndex, items.length, x]);

    useEffect(() => {
        if (looped.length <= 1 || hovered) return;
        const t = setInterval(() => {
            if (!dragging.current) setPos((p) => ({ i: Math.min(p.i + 1, lastIndex), instant: false }));
        }, autoplayDelay);
        return () => clearInterval(t);
    }, [autoplayDelay, hovered, looped.length, lastIndex]);

    const onDragEnd = (_: unknown, info: PanInfo) => {
        dragging.current = false;
        const dir = info.offset.x < 0 || info.velocity.x < -VELOCITY_THRESHOLD ? 1
            : info.offset.x > 0 || info.velocity.x > VELOCITY_THRESHOLD ? -1 : 0;
        if (dir === 0) {
            void animate(x, -(pos.i * trackItemOffset), SPRING);
            return;
        }
        setPos({ i: Math.max(0, Math.min(pos.i + dir, lastIndex)), instant: false });
    };

    const active = (pos.i - 1 + items.length) % items.length;

    return (
        <div className="ob-carousel" style={{ width: baseWidth }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <motion.div
                className="flex"
                drag="x"
                dragMomentum={false}
                style={{ width: itemWidth, gap: GAP, perspective: 1000, x }}
                onDragStart={() => { dragging.current = true; }}
                onDragEnd={onDragEnd}
            >
                {looped.map((item, index) => (
                    <Card key={`${item.id}-${index}`} item={item} index={index} itemWidth={itemWidth} trackItemOffset={trackItemOffset} x={x} />
                ))}
            </motion.div>
            <div className="mt-3.5 flex justify-center gap-2">
                {items.map((_, i) => (
                    <button
                        key={i}
                        type="button"
                        aria-label={`Go to slide ${i + 1}`}
                        onClick={() => setPos({ i: i + 1, instant: false })}
                        className={`h-[7px] rounded-full transition-all duration-150 cursor-pointer ${active === i ? 'w-[18px] sec-bg' : 'w-[7px] bg-white/20'}`}
                    />
                ))}
            </div>
        </div>
    );
}
