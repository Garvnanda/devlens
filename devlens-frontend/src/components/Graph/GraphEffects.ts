import { MeshLambertMaterial, SphereGeometry } from 'three';

import { PALETTE } from '../ClickSpark';

const OTHER_COLOR = '#64748B';

const idOf = (end: any) => (typeof end === 'object' ? end.id : end);

/** Nodes that take part in at least one import edge — the ones the 3D map actually shows. */
export function connectedNodes(graph: { nodes: any[]; links?: any[] } | null): any[] {
    if (!graph) return [];
    const ids = new Set<string>();
    (graph.links ?? []).forEach((l) => {
        ids.add(idOf(l.source));
        ids.add(idOf(l.target));
    });
    return ids.size ? graph.nodes.filter((n) => ids.has(n.id)) : graph.nodes;
}

/**
 * Colour nodes by folder, biggest groups first; the long tail shares one neutral colour.
 * Folder depth is picked per repo: "backend/" vs "web/" alone would paint most graphs one colour,
 * so go deeper (backend/services, backend/routes…) until there are enough groups to tell apart.
 */
export function folderColors(nodes: { id: string }[]): { colorOf: (id: string) => string; legend: { folder: string; color: string; count: number }[] } {
    const dirs = (id: string) => id.split('/').slice(0, -1);
    const keyAt = (id: string, depth: number) => dirs(id).slice(0, depth).join('/') || '(root)';
    let depth = 1;
    for (let d = 1; d <= 4; d++) {
        depth = d;
        if (new Set(nodes.map((n) => keyAt(n.id, d))).size >= 4) break;
    }
    const folderOf = (id: string) => keyAt(id, depth);
    const counts = new Map<string, number>();
    nodes.forEach((n) => counts.set(folderOf(n.id), (counts.get(folderOf(n.id)) ?? 0) + 1));
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const colors = new Map(ranked.slice(0, PALETTE.length).map(([folder], i) => [folder, PALETTE[i]]));
    const legend = ranked.slice(0, PALETTE.length).map(([folder, count]) => ({ folder, color: colors.get(folder)!, count }));
    const rest = ranked.slice(PALETTE.length).reduce((sum, [, c]) => sum + c, 0);
    if (rest) legend.push({ folder: 'other', color: OTHER_COLOR, count: rest });
    return { colorOf: (id) => colors.get(folderOf(id)) ?? OTHER_COLOR, legend };
}

// One geometry per size, shared by every node — building a new sphere per node per render stalls the frame.
const GEOMETRY = {
    normal: new SphereGeometry(8, 16, 16),
    selected: new SphereGeometry(12, 20, 20),
};

export const createNodeMaterial = (color: string, isSelected: boolean, isDimmed: boolean) => {
    const material = new MeshLambertMaterial({
        color,
        emissive: color,
        emissiveIntensity: isSelected ? 1.2 : isDimmed ? 0.05 : 0.45,
        transparent: true,
        opacity: isDimmed ? 0.12 : 0.95,
    });
    return { material, geometry: isSelected ? GEOMETRY.selected : GEOMETRY.normal, scale: isSelected ? 1.5 : 1 };
};
