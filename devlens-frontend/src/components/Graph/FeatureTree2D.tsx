import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { FEATURES } from './FeatureData';
import type { FeatureData } from './FeatureData';
import { FeatureNode } from './FeatureNode';
import { FeatureExplanationCard } from './FeatureExplanationCard';
import { AnimatePresence } from 'framer-motion';

/**
 * Fixed coordinate layout in a 1200×800 design space.
 * The entire tree is then CSS-scaled to fit the real viewport.
 * This guarantees no overlaps & always fills the screen.
 */

function computeTreeLayout(_features: FeatureData[]): Map<string, { x: number; y: number }> {
    const pos = new Map<string, { x: number; y: number }>();

    // All coordinates relative to design space center
    pos.set('core', { x: 0, y: 0 });

    // Categories — pulled further out for more breathing room
    pos.set('cat-analysis', { x: 0, y: -260 });
    pos.set('cat-ai', { x: 460, y: 0 });
    pos.set('cat-viz', { x: 0, y: 260 });
    pos.set('cat-workflow', { x: -460, y: 0 });

    // Code Analysis children (top) — wider horizontal spread
    pos.set('repo-ingestion', { x: -380, y: -420 });
    pos.set('ast-parsing', { x: -160, y: -460 });
    pos.set('dependency-graph', { x: 60, y: -460 });
    pos.set('vectorization', { x: 260, y: -420 });
    pos.set('hybrid-search', { x: 400, y: -360 });

    // AI Intelligence children (right)
    pos.set('jargon-buster', { x: 640, y: -210 });
    pos.set('architectural-intent', { x: 680, y: -50 });
    pos.set('architect-ai', { x: 660, y: 130 });
    pos.set('chatbot', { x: 590, y: 290 });

    // Visualization children (bottom)
    pos.set('molecular-map', { x: -280, y: 430 });
    pos.set('feature-explorer', { x: -90, y: 470 });
    pos.set('code-viewer', { x: 100, y: 470 });
    pos.set('side-panel', { x: 290, y: 420 });

    // Developer Workflow children (left)
    pos.set('cli-engine', { x: -620, y: -200 });
    pos.set('gatekeeper', { x: -660, y: -50 });
    pos.set('pr-history', { x: -660, y: 100 });
    pos.set('issue-matcher', { x: -620, y: 240 });
    pos.set('setup-generator', { x: -540, y: 360 });

    return pos;
}

export const FeatureTree2D = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    const positions = useMemo(() => computeTreeLayout(FEATURES), []);

    // Compute all used positions to find actual bounding box
    const allPos = useMemo(() => {
        return FEATURES.map(f => positions.get(f.id)).filter(Boolean) as { x: number; y: number }[];
    }, [positions]);

    const bounds = useMemo(() => {
        const xs = allPos.map(p => p.x);
        const ys = allPos.map(p => p.y);
        return {
            minX: Math.min(...xs) - 80,
            maxX: Math.max(...xs) + 80,
            minY: Math.min(...ys) - 50,
            maxY: Math.max(...ys) + 50,
        };
    }, [allPos]);

    useEffect(() => {
        const update = () => {
            if (!containerRef.current) return;
            const { width, height } = containerRef.current.getBoundingClientRect();
            const treeW = bounds.maxX - bounds.minX;
            const treeH = bounds.maxY - bounds.minY;
            const s = Math.min(
                (width * 0.93) / treeW,
                (height * 0.88) / treeH,
                1.2  // don't upscale beyond 1.2x on huge monitors
            );
            setScale(s);
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [bounds]);

    const activeFeature = hoveredNode && hoveredNode !== 'core'
        ? FEATURES.find(f => f.id === hoveredNode)
        : undefined;

    const edges = useMemo(() =>
        FEATURES.filter(f => f.parent !== null).map(f => ({
            from: f.parent!,
            to: f.id,
        })),
        []);

    const handleHover = useCallback((id: string | null) => setHoveredNode(id), []);

    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;

    return (
        <div ref={containerRef} className="relative w-full h-full flex items-center justify-center pointer-events-auto select-none overflow-hidden">

            {/* Scaled inner container */}
            <div
                style={{
                    width: treeW,
                    height: treeH,
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                    position: 'relative',
                    flexShrink: 0,
                }}
            >
                {/* SVG edges drawn in the design space */}
                <svg
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, overflow: 'visible' }}
                >
                    {edges.map(edge => {
                        const from = positions.get(edge.from);
                        const to = positions.get(edge.to);
                        if (!from || !to) return null;
                        // Offset from top-left of bounding box
                        const fx = from.x - bounds.minX;
                        const fy = from.y - bounds.minY;
                        const tx = to.x - bounds.minX;
                        const ty = to.y - bounds.minY;
                        return (
                            <line
                                key={`${edge.from}-${edge.to}`}
                                x1={fx} y1={fy}
                                x2={tx} y2={ty}
                                stroke="#334155"
                                strokeWidth="1.5"
                                strokeDasharray="4 3"
                            />
                        );
                    })}
                </svg>

                {/* Nodes */}
                {FEATURES.map((feature) => {
                    const p = positions.get(feature.id);
                    if (!p) return null;
                    return (
                        <FeatureNode
                            key={feature.id}
                            feature={feature}
                            // Use offset-from-bounding-box coords
                            x={p.x - bounds.minX}
                            y={p.y - bounds.minY}
                            isHovered={hoveredNode === feature.id}
                            onHover={handleHover}
                            isCore={feature.id === 'core'}
                            absolute
                        />
                    );
                })}
            </div>

            {/* Explanation card rendered OUTSIDE the scaled div, in screen space */}
            <AnimatePresence>
                {activeFeature && (() => {
                    const p = positions.get(activeFeature.id);
                    if (!p) return null;
                    // Map design coords → screen coords
                    const screenX = (p.x - bounds.minX - treeW / 2) * scale;
                    const screenY = (p.y - bounds.minY - treeH / 2) * scale;
                    return (
                        <FeatureExplanationCard
                            key={activeFeature.id}
                            feature={activeFeature}
                            x={screenX}
                            y={screenY}
                        />
                    );
                })()}
            </AnimatePresence>
        </div>
    );
};
