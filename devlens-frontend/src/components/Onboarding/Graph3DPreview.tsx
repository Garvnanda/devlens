// Small rotatable 3D dependency graph for the walkthrough: colour = risk tier, drag to rotate,
// click a sphere for a one-line summary. Plain three.js; renders only while mounted.
import { useEffect, useRef, useState } from 'react';
import {
    AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments,
    Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Sprite, SpriteMaterial,
    CanvasTexture, Vector2, Vector3, WebGLRenderer,
} from 'three';

const TIER = {
    target: { color: '#ffffff', label: 'file you change' },
    security: { color: '#E11D48', label: 'security-sensitive' },
    medium: { color: '#D97706', label: 'medium complexity' },
    low: { color: '#16A34A', label: 'low risk' },
} as const;
type Tier = keyof typeof TIER;

const NODES: { id: string; tier: Tier; pos: [number, number, number]; summary: string }[] = [
    { id: 'auth.py', tier: 'target', pos: [0, 0, 0], summary: 'Login, token issue and verification — the file this issue asks you to change.' },
    { id: 'session.py', tier: 'security', pos: [-2.2, 1.1, 0.6], summary: 'Reads tokens auth.py signs. A bad change here logs everyone out.' },
    { id: 'crypto.py', tier: 'security', pos: [1.9, 1.5, -0.9], summary: 'Key derivation used by auth. Review twice.' },
    { id: 'routes.py', tier: 'medium', pos: [2.4, -0.6, 1.2], summary: 'HTTP endpoints that call login(); tests cover most paths.' },
    { id: 'profile.ts', tier: 'medium', pos: [-0.6, -2.1, 1.6], summary: 'Frontend page that expects the login response shape.' },
    { id: 'db.py', tier: 'medium', pos: [-2.7, -1.2, -1.1], summary: 'User lookups. Indirect dependency through session.py.' },
    { id: 'config.py', tier: 'low', pos: [0.4, 2.6, 1.4], summary: 'Settings only. Safe to read, rarely changes.' },
    { id: 'utils.py', tier: 'low', pos: [3.1, 1.0, 2.4], summary: 'String helpers. Isolated.' },
    { id: 'cli.py', tier: 'low', pos: [-3.3, 0.4, 2.2], summary: 'Admin commands. Not on the login path.' },
    { id: 'logging.py', tier: 'low', pos: [1.2, -2.5, -1.9], summary: 'Log formatting. No risk.' },
    { id: 'test_auth.py', tier: 'low', pos: [0.9, 0.3, -2.8], summary: 'The test to run after your change.' },
];
const EDGES: [string, string][] = [
    ['auth.py', 'session.py'], ['auth.py', 'crypto.py'], ['auth.py', 'routes.py'], ['auth.py', 'profile.ts'],
    ['session.py', 'db.py'], ['auth.py', 'config.py'], ['routes.py', 'utils.py'], ['cli.py', 'session.py'],
    ['routes.py', 'logging.py'], ['test_auth.py', 'auth.py'], ['crypto.py', 'config.py'],
];

function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
}

export function Graph3DPreview() {
    const wrapRef = useRef<HTMLDivElement>(null);
    const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const [picked, setPicked] = useState<number>(0);

    useEffect(() => {
        const wrap = wrapRef.current!;
        const renderer = new WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        wrap.prepend(renderer.domElement);
        renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab';

        const scene = new Scene();
        const camera = new PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, 8.2);
        const world = new Group();
        scene.add(world);

        const glow = glowTexture();
        const meshes: Mesh[] = [];
        const byId = new Map(NODES.map((n, i) => [n.id, i]));
        NODES.forEach((n, i) => {
            const color = new Color(TIER[n.tier].color);
            const mesh = new Mesh(new SphereGeometry(n.tier === 'target' ? 0.34 : 0.22, 24, 24), new MeshBasicMaterial({ color }));
            mesh.position.set(...n.pos);
            mesh.userData.index = i;
            const halo = new Sprite(new SpriteMaterial({ map: glow, color, blending: AdditiveBlending, depthWrite: false, opacity: 0.9 }));
            halo.scale.setScalar(n.tier === 'target' ? 2.2 : 1.3);
            mesh.add(halo);
            world.add(mesh);
            meshes.push(mesh);
        });

        const positions: number[] = [];
        const colors: number[] = [];
        EDGES.forEach(([a, b]) => {
            const na = NODES[byId.get(a)!];
            const nb = NODES[byId.get(b)!];
            positions.push(...na.pos, ...nb.pos);
            const ca = new Color(TIER[na.tier].color);
            const cb = new Color(TIER[nb.tier].color);
            colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        });
        const lineGeo = new BufferGeometry();
        lineGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
        lineGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
        world.add(new LineSegments(lineGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })));

        const resize = () => {
            const { width, height } = wrap.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / Math.max(height, 1);
            camera.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(wrap);
        resize();

        // drag to rotate, gentle auto-rotate when idle
        let dragging = false;
        let moved = false;
        let lastX = 0, lastY = 0, velY = 0.004, velX = 0;
        const onDown = (e: PointerEvent) => {
            dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
            renderer.domElement.style.cursor = 'grabbing';
        };
        const onMove = (e: PointerEvent) => {
            if (!dragging) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
            velY = dx * 0.005; velX = dy * 0.005;
            lastX = e.clientX; lastY = e.clientY;
        };
        const raycaster = new Raycaster();
        const onUp = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            renderer.domElement.style.cursor = 'grab';
            if (moved) return;
            const r = renderer.domElement.getBoundingClientRect();
            raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
            const hit = raycaster.intersectObjects(meshes, false)[0];
            if (hit) setPicked(hit.object.userData.index);
        };
        renderer.domElement.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);

        const v = new Vector3();
        let raf = 0;
        const tick = () => {
            if (!dragging) {
                velY += (0.004 - velY) * 0.02;
                velX *= 0.95;
            }
            world.rotation.y += velY;
            world.rotation.x = Math.max(-0.8, Math.min(0.8, world.rotation.x + velX));
            renderer.render(scene, camera);

            const r = renderer.domElement.getBoundingClientRect();
            meshes.forEach((m, i) => {
                const el = labelRefs.current[i];
                if (!el) return;
                m.getWorldPosition(v).project(camera);
                el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height + 18}px)`;
                el.style.opacity = String(Math.max(0.25, Math.min(1, 1.2 - v.z)));
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            renderer.domElement.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            scene.traverse((o) => {
                const obj = o as Mesh;
                obj.geometry?.dispose();
                const mat = obj.material as { dispose?: () => void } | undefined;
                mat?.dispose?.();
            });
            glow.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    const node = NODES[picked];

    return (
        <div className="panel-marks rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="label-micro">$ blast auth.py · drag to rotate</span>
                <span className="label-micro">click a sphere</span>
            </div>
            <div ref={wrapRef} className="relative h-[300px] overflow-hidden rounded-lg">
                <div className="pointer-events-none absolute inset-0">
                    {NODES.map((n, i) => (
                        <span
                            key={n.id}
                            ref={(el) => { labelRefs.current[i] = el; }}
                            className={`absolute left-0 top-0 whitespace-nowrap rounded px-1.5 font-mono text-[10px] ${i === picked ? 'bg-white/15 text-white' : 'text-white/75'}`}
                        >
                            {n.id}
                        </span>
                    ))}
                </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(TIER) as Tier[]).map((t) => (
                    <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/60">
                        <span className="size-2 rounded-full" style={{ background: TIER[t].color, boxShadow: `0 0 8px ${TIER[t].color}` }} />
                        {TIER[t].label}
                    </span>
                ))}
            </div>
            <p className="mt-3 min-h-[20px] text-sm text-white/65">
                <span className="font-mono font-medium" style={{ color: TIER[node.tier].color }}>{node.id}</span>
                <span className="ml-2">{node.summary}</span>
            </p>
        </div>
    );
}
