import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useAppStore } from '../../store/useAppStore';
import { createNodeMaterial } from './GraphEffects';
import { Mesh, SphereGeometry, Group } from 'three';
import SpriteText from 'three-spritetext';

export const MolecularGraph = () => {
    const { graphData, blastTarget, selectedFile, setSelectedFile } = useAppStore(state => state);
    const graphRef = useRef<any>(null);
    const [hoverNode, setHoverNode] = useState<string | null>(null);
    const forcesApplied = useRef(false);

    // ── Filter to only connected nodes + pre-spread positions ──
    const spreadGraphData = useMemo(() => {
        if (!graphData) return null;

        const links = graphData.links || [];

        // Collect IDs that appear in at least one edge
        const connectedIds = new Set<string>();
        links.forEach((l: any) => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            connectedIds.add(src);
            connectedIds.add(tgt);
        });

        // Keep only connected nodes
        const filteredNodes = connectedIds.size > 0
            ? graphData.nodes.filter((n: any) => connectedIds.has(n.id))
            : graphData.nodes; // fallback: show all if no edges exist

        // Pre-assign random 3D positions so they don't stack at origin
        const R = 300;
        const nodes = filteredNodes.map((n: any) => {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            return {
                ...n,
                x: R * Math.sin(phi) * Math.cos(theta),
                y: R * Math.sin(phi) * Math.sin(theta),
                z: R * Math.cos(phi),
            };
        });

        // Also filter links to only include those between remaining nodes
        const nodeIdSet = new Set(nodes.map((n: any) => n.id));
        const filteredLinks = links.filter((l: any) => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            return nodeIdSet.has(src) && nodeIdSet.has(tgt);
        });

        forcesApplied.current = false; // reset for new data
        return { nodes, links: filteredLinks };
    }, [graphData]);

    // ── Apply strong repulsion forces after graph mounts ──
    useEffect(() => {
        if (!spreadGraphData || forcesApplied.current) return;
        // Short delay to ensure ForceGraph3D ref is populated
        const timer = setTimeout(() => {
            const fg = graphRef.current;
            if (fg) {
                fg.d3Force('charge').strength(-500);
                fg.d3Force('link').distance(150);
                forcesApplied.current = true;
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [spreadGraphData]);

    // ── Orbit camera around clicked node ──
    useEffect(() => {
        if (!blastTarget) return;
        const data = spreadGraphData;
        if (!data) return;
        const node = data.nodes.find((n: any) => n.id === blastTarget);
        if (!node) return;

        let frameId: number;
        const radius = 60;
        let angle = 0;
        const speed = 0.004;
        const startTime = Date.now() + 1200;

        const orbit = () => {
            const now = Date.now();
            if (now < startTime) {
                frameId = requestAnimationFrame(orbit);
                return;
            }
            angle += speed;
            if (graphRef.current) {
                graphRef.current.cameraPosition(
                    {
                        x: node.x + radius * Math.cos(angle),
                        z: node.z + radius * Math.sin(angle),
                        y: node.y + radius * 0.4 * Math.sin(angle * 0.3),
                    },
                    node,
                    0
                );
            }
            frameId = requestAnimationFrame(orbit);
        };
        orbit();
        return () => cancelAnimationFrame(frameId);
    }, [blastTarget, spreadGraphData]);

    // ── Click handler: zoom + orbit ──
    const handleNodeClick = useCallback((node: any) => {
        setSelectedFile(node.id);
        useAppStore.getState().setBlastTarget(node.id);
        if (graphRef.current) {
            graphRef.current.cameraPosition(
                { x: node.x + 60, y: node.y + 30, z: node.z + 60 },
                node,
                800
            );
        }
    }, [setSelectedFile]);

    const handleNodeHover = useCallback((node: any) => {
        setHoverNode(node ? node.id : null);
    }, []);

    if (!spreadGraphData) return null;

    return (
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
            <ForceGraph3D
                ref={graphRef}
                graphData={spreadGraphData}
                nodeRelSize={8}
                warmupTicks={0}
                linkColor={() => '#ffffff'}
                linkWidth={() => 1.2}
                linkOpacity={0.6}
                cooldownTicks={200}
                backgroundColor="#0F172A"
                enableNodeDrag={false}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                nodeThreeObject={(node: any) => {
                    const isDependency = blastTarget && spreadGraphData.links.some((l: any) =>
                        (l.source.id === blastTarget && l.target.id === node.id) ||
                        (l.target.id === blastTarget && l.source.id === node.id) ||
                        (l.source === blastTarget && l.target === node.id) ||
                        (l.target === blastTarget && l.source === node.id)
                    );

                    const isSelected = selectedFile === node.id || blastTarget === node.id;
                    const isHovered = hoverNode === node.id;
                    const isDimmed = !!blastTarget && blastTarget !== node.id && !isDependency;

                    const { material, scale, emissiveIntensity } = createNodeMaterial(isHovered, isSelected || !!isDependency, isDimmed);

                    const geometry = new SphereGeometry(8 * scale);
                    material.emissive.setHex(0x06B6D4);
                    material.emissiveIntensity = emissiveIntensity;

                    const sphere = new Mesh(geometry, material);

                    // Short filename label
                    const shortName = String(node.id).split('/').pop() || node.id;
                    const label = new SpriteText(shortName);
                    label.color = isDimmed ? '#475569' : '#E2E8F0';
                    label.textHeight = 4;
                    label.backgroundColor = 'rgba(0,0,0,0.6)';
                    label.padding = 2;
                    label.position.y = 14 * scale;

                    const group = new Group();
                    group.add(sphere);
                    group.add(label);

                    return group;
                }}
            />
        </div>
    );
};
