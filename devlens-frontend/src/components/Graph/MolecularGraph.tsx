import { useMemo, useRef, useCallback, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useAppStore } from '../../store/useAppStore';
import { connectedNodes, createNodeMaterial, folderColors } from './GraphEffects';
import { Mesh, Group } from 'three';
import SpriteText from 'three-spritetext';

const idOf = (end: any) => (typeof end === 'object' ? end.id : end);

export const MolecularGraph = () => {
    const { graphData, blastTarget, selectedFile, setSelectedFile } = useAppStore(state => state);
    const graphRef = useRef<any>(null);
    const forcesApplied = useRef(false);

    // ── Filter to only connected nodes + pre-spread positions ──
    const spreadGraphData = useMemo(() => {
        if (!graphData) return null;

        const links = graphData.links || [];
        const filteredNodes = connectedNodes(graphData);

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

        const nodeIdSet = new Set(nodes.map((n: any) => n.id));
        const filteredLinks = links.filter((l: any) => nodeIdSet.has(idOf(l.source)) && nodeIdSet.has(idOf(l.target)));

        forcesApplied.current = false;
        return { nodes, links: filteredLinks };
    }, [graphData]);

    const colors = useMemo(() => folderColors(spreadGraphData?.nodes ?? []), [spreadGraphData]);

    // Neighbours of the blast target, computed once instead of scanning every link per node.
    const blastNeighbours = useMemo(() => {
        const set = new Set<string>();
        if (!blastTarget || !spreadGraphData) return set;
        spreadGraphData.links.forEach((l: any) => {
            const s = idOf(l.source), t = idOf(l.target);
            if (s === blastTarget) set.add(t);
            if (t === blastTarget) set.add(s);
        });
        return set;
    }, [blastTarget, spreadGraphData]);

    // ── Apply strong repulsion forces after graph mounts ──
    useEffect(() => {
        if (!spreadGraphData || forcesApplied.current) return;
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

    // ── Orbit camera around blast target ──
    useEffect(() => {
        if (!blastTarget || !spreadGraphData) return;
        const node = spreadGraphData.nodes.find((n: any) => n.id === blastTarget);
        if (!node) return;

        let frameId: number;
        const radius = 60;
        let angle = 0;
        const speed = 0.004;
        const startTime = Date.now() + 1200;

        const orbit = () => {
            if (Date.now() >= startTime && graphRef.current) {
                angle += speed;
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

    const handleNodeClick = useCallback((node: any) => {
        setSelectedFile(node.id);
        useAppStore.getState().setBlastTarget(node.id);
        graphRef.current?.cameraPosition({ x: node.x + 60, y: node.y + 30, z: node.z + 60 }, node, 800);
    }, [setSelectedFile]);

    // Stable accessor: only rebuilds node objects when colours/selection actually change (not on hover).
    const nodeThreeObject = useCallback((node: any) => {
        const isSelected = selectedFile === node.id || blastTarget === node.id;
        const isDimmed = !!blastTarget && !isSelected && !blastNeighbours.has(node.id);
        const color = colors.colorOf(node.id);
        const { material, geometry, scale } = createNodeMaterial(color, isSelected || blastNeighbours.has(node.id), isDimmed);

        const group = new Group();
        group.add(new Mesh(geometry, material));

        const label = new SpriteText(String(node.id).split('/').pop() || node.id);
        label.color = isDimmed ? '#334155' : '#E2E8F0';
        label.textHeight = 4;
        label.backgroundColor = 'rgba(0,0,0,0.6)';
        label.padding = 2;
        label.position.y = 14 * scale;
        group.add(label);
        return group;
    }, [colors, selectedFile, blastTarget, blastNeighbours]);

    const isBlastLink = useCallback(
        (l: any) => !!blastTarget && (idOf(l.source) === blastTarget || idOf(l.target) === blastTarget),
        [blastTarget]
    );
    const linkColor = useCallback((l: any) => colors.colorOf(idOf(l.source)), [colors]);
    const linkWidth = useCallback((l: any) => (isBlastLink(l) ? 2.2 : 0.8), [isBlastLink]);
    const linkParticles = useCallback((l: any) => (isBlastLink(l) ? 4 : 0), [isBlastLink]);

    if (!spreadGraphData) return null;

    return (
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
            <ForceGraph3D
                ref={graphRef}
                graphData={spreadGraphData}
                nodeRelSize={8}
                warmupTicks={0}
                linkColor={linkColor}
                linkWidth={linkWidth}
                linkOpacity={0.45}
                linkDirectionalParticles={linkParticles}
                linkDirectionalParticleWidth={2.5}
                linkDirectionalParticleSpeed={0.008}
                cooldownTicks={200}
                backgroundColor="#000000"
                enableNodeDrag={false}
                onNodeClick={handleNodeClick}
                nodeThreeObject={nodeThreeObject}
            />
        </div>
    );
};
