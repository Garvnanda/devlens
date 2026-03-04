import type { FeatureData } from './FeatureData';

interface FeatureNodeProps {
    feature: FeatureData;
    x: number;
    y: number;
    isHovered: boolean;
    isCore: boolean;
    onHover: (id: string | null) => void;
    absolute?: boolean;
}

export const FeatureNode = ({ feature, x, y, isHovered, isCore, onHover, absolute }: FeatureNodeProps) => {
    const isCategory = feature.parent === 'core' && !isCore;

    const posStyle = absolute
        ? { left: x, top: y, transform: 'translate(-50%, -50%)' }
        : { left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' };

    return (
        <div
            className={`absolute font-mono cursor-pointer shadow-lg transition-all duration-200 whitespace-nowrap
                ${isCore
                    ? 'px-8 py-4 rounded-full bg-slate-900 border-2 border-cyan-500 text-cyan-400 font-bold uppercase shadow-[0_0_30px_rgba(6,182,212,0.3)] text-lg tracking-[0.2em] z-20'
                    : isCategory
                        ? 'px-6 py-3 rounded-lg bg-slate-800/90 border border-cyan-500/50 text-cyan-300 text-base uppercase tracking-[0.15em] z-15'
                        : `px-5 py-2.5 rounded-md border text-base text-slate-200 tracking-wide z-10 ${isHovered ? 'bg-slate-700 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'bg-slate-800/80 border-slate-600 hover:border-slate-400'}`
                }
            `}
            style={posStyle}
            onMouseEnter={() => onHover(feature.id)}
            onMouseLeave={() => onHover(null)}
        >
            {feature.title}
        </div>
    );
};
