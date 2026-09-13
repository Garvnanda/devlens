// The home page: a six-chapter walkthrough stepped with Previous / Next / Skip, ending in the
// terminal. Layout follows DEEPSIGHT's Onboarding (header rail, chapter, sticky footer dock).
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { BorderGlow } from '../components/Onboarding/BorderGlow';
import { Carousel, type CarouselItem } from '../components/Onboarding/Carousel';
import { Dock } from '../components/Onboarding/Dock';
import { DotField } from '../components/Onboarding/DotField';
import { Graph3DPreview } from '../components/Onboarding/Graph3DPreview';
import { PALETTE } from '../components/ClickSpark';
import { StateMachine } from '../core/StateMachine';
import { useAppStore } from '../store/useAppStore';

// ── icons (inline, 16px, stroke) ──────────────────────────────────────────
const Icon = ({ d }: { d: ReactNode }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
    compass: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>} />,
    flag: <Icon d={<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>} />,
    download: <Icon d={<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>} />,
    graph: <Icon d={<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M8 7l8 .5M7 8l4 8M17 9l-4 7" /></>} />,
    list: <Icon d={<><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>} />,
    terminal: <Icon d={<><path d="m5 8 4 4-4 4" /><path d="M12 17h7" /></>} />,
    history: <Icon d={<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>} />,
    language: <Icon d={<><path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-3 7-7 8" /><path d="m13 21 4-9 4 9M14.5 18h5" /></>} />,
    shield: <Icon d={<><path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z" /></>} />,
    arrowL: <Icon d={<path d="M19 12H5m6-6-6 6 6 6" />} />,
    arrowR: <Icon d={<path d="M5 12h14m-6-6 6 6-6 6" />} />,
    github: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>,
};

// ── content ───────────────────────────────────────────────────────────────
const TAGLINES: CarouselItem[] = [
    { id: 1, color: '#0F9B8E', icon: I.compass, title: 'Where to start, and why', description: 'Paste a repo. DevLens maps every file and import so you see the shape of the codebase before reading a line.' },
    { id: 2, color: '#7C3AED', icon: I.history, title: 'The why behind the code', description: 'Architectural intent pulled from years of merged pull requests — the decisions nobody wrote in the README.' },
    { id: 3, color: '#EA580C', icon: I.language, title: 'Jargon, in your language', description: 'Dense code explained with plain analogies, in English, Hindi or Hinglish, pitched at your level.' },
    { id: 4, color: '#2563EB', icon: I.list, title: 'Issue to pull request', description: 'Pick an issue. Get the files to touch, what might break, and the exact git commands to run.' },
];

const DIFFERENTIATORS = [
    { n: '01', title: 'A graph that cannot hallucinate', body: 'Dependencies come from Tree-sitter ASTs, not a language model. The map is deterministic — AI is only used to reason on top of it.' },
    { n: '02', title: 'Institutional memory', body: 'One GraphQL call pulls the last fifty merged PRs and their issues, so explanations cite real history instead of guessing intent.' },
    { n: '03', title: 'A gatekeeper before you invest', body: 'Dead repos, crowded issue queues and dependency hell are flagged before you spend an evening cloning.' },
    { n: '04', title: 'An agent that plans the mission', body: 'The Architect reads the issue, finds the blast radius in the graph, and reacts to the errors your terminal prints back.' },
];

interface Chapter {
    key: string;
    color: string;
    icon: ReactNode;
    kicker: string;
    title: string;
    body?: string;
    wide?: boolean;
    render: () => ReactNode;
}

const CHAPTERS: Chapter[] = [
    {
        key: 'welcome',
        color: '#0F9B8E',
        icon: I.compass,
        kicker: 'DevLens · AI navigator for open source',
        title: 'From a GitHub link to your first pull request.',
        body: 'Most of contributing is understanding where to start. DevLens reads the code, the history and the issues, then walks you in. Six screens, then you are at the terminal.',
        render: () => (
            <div className="flex justify-center lg:justify-end">
                <Carousel items={TAGLINES} baseWidth={380} />
            </div>
        ),
    },
    {
        key: 'different',
        color: '#7C3AED',
        icon: I.flag,
        kicker: 'Why this one',
        title: 'What makes it different',
        body: 'Structure is computed, not generated. The model only explains what the parser already proved.',
        wide: true,
        render: () => (
            <div className="grid gap-4 sm:grid-cols-2">
                {DIFFERENTIATORS.map((d) => (
                    <BorderGlow key={d.n} className="p-5">
                        <div className="font-mono text-xs font-semibold sec-text">{d.n}</div>
                        <div className="mt-1 text-base font-semibold text-white">{d.title}</div>
                        <p className="mt-1.5 text-sm leading-relaxed text-white/50">{d.body}</p>
                    </BorderGlow>
                ))}
            </div>
        ),
    },
    {
        key: 'ingest',
        color: '#EA580C',
        icon: I.download,
        kicker: 'Stage 01 · Ingest',
        title: 'Clone, filter, parse',
        body: 'A shallow clone skips the API rate limit. Lockfiles, bundles and anything over 1 MB are dropped before parsing, then every file becomes an AST.',
        render: () => (
            <div className="panel-marks rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 flex items-center justify-between">
                    <span className="label-micro">Terminal</span>
                    <span className="label-micro">schematic</span>
                </div>
                <pre className="overflow-x-auto font-mono text-[12.5px] leading-6 text-white/70">
                    <span style={{ color: PALETTE[2] }}>$</span> <span className="text-white">ingest https://github.com/pallets/flask</span>{'\n'}
                    <span className="text-white/40">›</span> cloning --depth 1{'\n'}
                    <span className="text-white/40">›</span> skipped 14 files (size / lockfile){'\n'}
                    <span className="text-white/40">›</span> parsing ASTs with tree-sitter{'\n'}
                    <span className="text-white/40">›</span> resolving imports into edges{'\n'}
                    <span style={{ color: PALETTE[5] }}>✓ graph ready</span>
                </pre>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Fact label="Files" value="83" color={PALETTE[0]} />
                    <Fact label="Edges" value="214" color={PALETTE[1]} />
                    <Fact label="Symbols" value="1,027" color={PALETTE[2]} />
                    <Fact label="Time" value="4.2 s" color={PALETTE[3]} />
                </div>
            </div>
        ),
    },
    {
        key: 'map',
        color: '#2563EB',
        icon: I.graph,
        kicker: 'Stage 02 · Map',
        title: 'See what a change touches',
        body: 'Every file is a node, every import an edge. Point at one with blast and everything that depends on it lights up — before you write a line.',
        render: () => <Graph3DPreview />,
    },
    {
        key: 'mission',
        color: '#16A34A',
        icon: I.list,
        kicker: 'Stage 03 · Architect',
        title: 'An issue becomes a plan',
        body: 'The Architect classifies the work, trims the code to the functions that matter, and hands back ordered steps plus the commands to run them. Paste an error back and it adjusts.',
        render: () => (
            <div className="panel-marks rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center justify-between">
                    <span className="label-micro">Mission · issue #42</span>
                    <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider sec-border sec-text sec-soft">bug fix</span>
                </div>
                <ol className="space-y-3 text-sm">
                    {[
                        ['Reproduce', 'pytest tests/test_auth.py'],
                        ['Locate', 'AuthService.login() in src/services/auth.py'],
                        ['Fix', 'handle the expired-token branch'],
                        ['Verify', 'npm run lint && pytest'],
                    ].map(([step, detail], n) => (
                        <li key={step} className="flex gap-3">
                            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] ${n === 0 ? 'sec-bg border-transparent text-white' : 'border-white/25 text-white/50'}`}>{n + 1}</span>
                            <span>
                                <span className="font-medium text-white">{step}</span>
                                <span className="ml-2 font-mono text-[12px] text-white/45">{detail}</span>
                            </span>
                        </li>
                    ))}
                </ol>
                <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-[12px] leading-5 text-white/70">
                    git checkout -b fix/issue-42-login{'\n'}pip install -r requirements.txt
                </pre>
            </div>
        ),
    },
    {
        key: 'ready',
        color: '#DB2777',
        icon: I.terminal,
        kicker: 'Ready',
        title: 'Everything runs from one terminal.',
        body: 'No menus. Type a command, watch the map respond. Sign in to keep your progress and get a skill fingerprint that tunes the explanations to you.',
        render: () => <ReadyPanel />,
    },
];

// ── scene ─────────────────────────────────────────────────────────────────
export const OnboardingScene = () => {
    const [i, setI] = useState(0);
    const last = i === CHAPTERS.length - 1;

    const finish = useCallback(() => {
        StateMachine.transition('landing');
    }, []);
    const next = useCallback(() => (last ? finish() : setI((n) => n + 1)), [last, finish]);
    const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const { showAuthModal, showOnboardingModal } = useAppStore.getState();
            if (showAuthModal || showOnboardingModal) return;
            if (e.key === 'ArrowRight') next();
            else if (e.key === 'ArrowLeft') prev();
            else if (e.key === 'Escape') finish();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [next, prev, finish]);

    const ch = CHAPTERS[i];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-10 flex flex-col overflow-y-auto text-white"
            style={{ ['--section' as string]: ch.color }}
        >
            <div className="pointer-events-none fixed inset-0 grid-field" aria-hidden />
            <div className="pointer-events-none fixed inset-0 opacity-70" aria-hidden>
                <DotField dotSpacing={26} dotRadius={1.3} gradientFrom="rgba(124,58,237,0.45)" gradientTo="rgba(234,88,12,0.35)" glowColor="rgba(124,58,237,0.18)" />
            </div>
            {/* soft section-coloured wash behind the chapter */}
            <div
                className="pointer-events-none fixed inset-0 transition-[background] duration-700"
                style={{ background: `radial-gradient(60% 50% at 70% 45%, ${ch.color}22, transparent 70%)` }}
                aria-hidden
            />
            <div className="pointer-events-none fixed inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${ch.color}, transparent)` }} aria-hidden />

            {/* header rail */}
            <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-6 pt-6">
                <span className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span className="size-5 rounded-md" style={{ background: "linear-gradient(135deg,#7C3AED,#EA580C)" }} />DevLens</span>
                <span className="label-micro">Walkthrough</span>
                <div className="tick-rule hidden flex-1 sm:block" aria-hidden />
                <span className="font-mono text-xs text-white/45">
                    {String(i + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}
                </span>
                <GhostButton onClick={finish}>Skip</GhostButton>
            </div>

            {/* chapter */}
            <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-10">
                <motion.div
                    key={ch.key}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, ease: 'easeOut' }}
                    className="w-full"
                >
                    {ch.wide ? (
                        <>
                            <Head ch={ch} />
                            <div className="mt-8">{ch.render()}</div>
                        </>
                    ) : (
                        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
                            <Head ch={ch} />
                            <div>{ch.render()}</div>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* footer rail — sticky so Next stays reachable */}
            <div className="sticky bottom-0 z-20 border-t border-white/10 bg-black/80 backdrop-blur-md">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
                    <GhostButton onClick={prev} disabled={i === 0}>
                        {I.arrowL} Previous
                    </GhostButton>

                    <div className="hidden sm:block">
                        <Dock items={CHAPTERS.map((c, n) => ({ icon: c.icon, label: c.title, onClick: () => setI(n), active: n === i }))} />
                    </div>
                    <div className="flex items-center gap-2 sm:hidden">
                        {CHAPTERS.map((c, n) => (
                            <button
                                key={c.key}
                                aria-label={c.title}
                                onClick={() => setI(n)}
                                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-6 sec-bg' : 'w-1.5 bg-white/25'}`}
                            />
                        ))}
                    </div>

                    <motion.button
                        onClick={next}
                        whileTap={{ scale: 0.97 }}
                        className="sec-bg sec-glow inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-semibold text-white transition-[filter,background-color] duration-500 hover:brightness-110 cursor-pointer"
                    >
                        {last ? 'Open the terminal' : 'Next'} {I.arrowR}
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};

// ── bits ──────────────────────────────────────────────────────────────────
function Head({ ch }: { ch: Chapter }) {
    return (
        <div>
            <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-lg border sec-border sec-soft sec-text">{ch.icon}</span>
                <span className="label-micro !text-[color:var(--section)]">{ch.kicker}</span>
            </div>
            <h1 className="sec-heading mt-4 text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{ch.title}</h1>
            {ch.body && <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-white/55">{ch.body}</p>}
        </div>
    );
}

function GhostButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
            {children}
        </button>
    );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-black/40 p-2.5">
            <div className="label-micro">{label}</div>
            <div className="mt-1 font-mono text-sm font-semibold text-white" style={{ color }}>{value}</div>
        </div>
    );
}

function ReadyPanel() {
    const { isAuthenticated, githubUser, setShowAuthModal } = useAppStore();
    const commands = [
        ['ingest <url>', 'clone & map a repo'],
        ['gatecheck <url>', 'is it worth it?'],
        ['blast <file>', 'what it breaks'],
        ['explain <file>', 'jargon, simplified'],
        ['issues', 'good first issues'],
        ['architect <n>', 'plan a fix'],
    ];
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="panel-marks rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="label-micro mb-3">Commands</div>
                <div className="space-y-2">
                    {commands.map(([cmd, what], n) => (
                        <div key={cmd} className="flex items-baseline justify-between gap-3 border-b border-dashed border-white/10 pb-2 last:border-0">
                            <code className="font-mono text-[12.5px]" style={{ color: PALETTE[n % PALETTE.length] }}>{cmd}</code>
                            <span className="text-xs text-white/45">{what}</span>
                        </div>
                    ))}
                </div>
            </div>
            <BorderGlow className="p-5">
                <div className="label-micro">Account</div>
                {isAuthenticated && githubUser ? (
                    <div className="mt-4 flex items-center gap-3">
                        {githubUser.avatarUrl && <img src={githubUser.avatarUrl} alt="" className="size-10 rounded-full border border-white/10" />}
                        <div>
                            <div className="text-base font-semibold">{githubUser.login}</div>
                            <div className="text-xs text-white/45">Signed in · progress is saved</div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mt-3 text-base font-semibold">Guest session</div>
                        <p className="mt-1.5 text-sm leading-relaxed text-white/50">
                            Everything works without an account. Sign in to remember repos, resume missions and personalise explanations.
                        </p>
                        <button
                            onClick={() => setShowAuthModal(true)}
                            className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.1] cursor-pointer"
                        >
                            {I.github} Sign in with GitHub
                        </button>
                    </>
                )}
            </BorderGlow>
        </div>
    );
}
