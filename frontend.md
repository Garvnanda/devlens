DevLens Frontend Architecture — Cinematic CLI Operating System (Vite Edition)
0. CORE PHILOSOPHY

DevLens frontend is:

CLI-first

Cinematic

Developer-operating-system inspired

Zero traditional navigation

It is NOT:

A dashboard

A SaaS panel

A router-driven website

A sidebar-based UI

1. ABSOLUTE RULES (NON-NEGOTIABLE)

CLI is the only primary interaction layer.

No navigation menus.

No React Router.

No traditional navbar.

No page reload transitions.

No light mode.

Every state change must be animated.

Minimum animation duration: 300ms.

Tailwind only for styling.

Zustand only for global state.

No Redux.

All backend calls must go through apiClient.ts.

No component may directly call fetch/axios.

2. PROJECT INITIALIZATION
2.1 Create Project
npm create vite@latest devlens-frontend -- --template react-ts
cd devlens-frontend
npm install
2.2 Install Dependencies
npm install tailwindcss postcss autoprefixer
npm install zustand
npm install framer-motion
npm install react-force-graph-3d
npm install three
npm install xterm
npm install lottie-react
npm install prismjs
npm install howler
npm install tsparticles
3. FOLDER STRUCTURE (STRICT)
src/
│
├── core/
│   ├── CommandRegistry.ts
│   ├── CommandParser.ts
│   ├── AnimationTimings.ts
│   ├── StateMachine.ts
│   ├── apiClient.ts
│
├── store/
│   ├── useAppStore.ts
│
├── mock/
│   ├── gatekeeper.json
│   ├── chatbot.json
│
├── components/
│   ├── CLI/
│   │   ├── Terminal.tsx
│   │
│   ├── Graph/
│   │   ├── MolecularGraph.tsx
│   │   ├── GraphEffects.ts
│   │
│   ├── Panels/
│   │   ├── CodeViewer.tsx
│   │   ├── IntentPanel.tsx
│   │   ├── ArchitectPanel.tsx
│   │
│   ├── Avatar/
│   │   ├── AIHologram.tsx
│   │
│   ├── Tree/
│   │   ├── FeatureTree.tsx
│
├── scenes/
│   ├── LandingScene.tsx
│   ├── CockpitScene.tsx
│
├── App.tsx
└── main.tsx

No additional folders without documentation update.

4. RENDERING HIERARCHY (STRICT Z-INDEX)
Layer	z-index
CLI Caret	100
Floating Panels (Intent, Architect)	80
AI Hologram	70
Feature Tree	60
Code Viewer	50
Graph Canvas	10
Background Particles	0

No additional stacking contexts allowed.

5. GLOBAL DESIGN TOKENS

Background: #0F172A
Primary Accent: #06B6D4
Secondary Accent: #6366F1
Text Primary: #E2E8F0

Glass Panel:
bg-white/5 backdrop-blur-lg border border-white/10

No alternative color systems allowed.

6. GLOBAL ANIMATION CONFIG

File: core/AnimationTimings.ts

export const ANIMATION = {
  FAST: 0.2,
  NORMAL: 0.4,
  SLOW: 0.6,
  CINEMATIC: 1.2,
  EASE: [0.16, 1, 0.3, 1]
};

All animations must use this.

No hardcoded durations.

7. GLOBAL STATE (ZUSTAND)
type AppMode =
  | "landing"
  | "ingesting"
  | "cockpit"
  | "focus"
  | "architect";

interface AppStore {
  mode: AppMode;
  repoUrl: string | null;
  graphData: any | null;
  selectedFile: string | null;
  cliHistory: string[];
  missionState: {
    active: boolean;
    issueNumber: number | null;
    steps: string[];
  };
  userProfile: {
    level: "student" | "junior" | "senior";
    language: "english" | "hindi" | "hinglish";
    goal: "learning" | "contributing";
  };
}

No duplication in local component state.

8. STATE MACHINE (MANDATORY)

Allowed transitions:

landing → ingesting

ingesting → cockpit

cockpit → focus

cockpit → architect

architect → cockpit

focus → cockpit

Illegal transitions must be blocked.

9. CLI ENGINE SPEC
Terminal Behavior

Font: monospace

Size: 14px

Background: transparent

Auto-scroll enabled

Enter executes

Up arrow = history back

Down arrow = history forward

Unknown Command Response
Command not recognized. Type 'help'.

Color: #EF4444

No silent failures.

10. PHASED IMPLEMENTATION
🔹 PHASE 1 — CLI + Ingestion
Commands

help

ingest <url>

clear

Ingestion Animation Sequence

mode → ingesting

Terminal expands fullscreen (600ms)

Stream logs

On success:

setGraphData

mode → cockpit

Terminal docks bottom (height 120px, 600ms)

Backend Linked

✅ POST /api/v1/repository/ingest
✅ POST /api/v1/repository/vectorize

Backend Pending

❌ GET /api/v1/gatekeeper

🔹 PHASE 2 — Molecular Graph
Base Graph Config
<ForceGraph3D
  graphData={graphData}
  nodeRelSize={6}
  linkWidth={l => l.weight * 0.4}
  linkOpacity={0.3}
  cooldownTicks={100}
  backgroundColor="#0F172A"
  enableNodeDrag={false}
/>
Physics

On load:

charge: -120
link distance: 60

After 4s:

charge: 0
freeze simulation
Node Material

MeshBasicMaterial
emissive: #06B6D4
emissiveIntensity: 0.6
opacity: 0.9

Hover:

scale 1.2

emissiveIntensity 1.5

Selected:

scale 1.5

emissiveIntensity 2

Camera Focus
cameraPosition({ x: node.x * 1.4, y: node.y * 1.4, z: 200 }, node, 1200)

No instant jumps allowed.

blast <file>

Steps:

Dim all nodes to 0.1

Highlight selected

Compute dependencies

Orbit radius 40

Orbit speed 0.02/frame

Stop after 5s

Backend Linked:
✅ GET /api/v1/repository/graph/{owner}/{repo}

🔹 PHASE 3 — Focus + Intent + Explain
Layout

Graph: 70%
CodeViewer: 30%
CLI Dock: 120px fixed

Intent Panel

Width: 400px
Slide from right (400ms)

Backend Linked:
✅ POST /api/v1/intent
✅ POST /api/v1/explain

Backend Pending:
❌ user_profile injection

Mock locally until implemented.

🔹 PHASE 4 — AI Hologram

Position:
bottom: 40px
right: 40px
width: 220px

Float animation:

y: [0, -8, 0]
duration: 4s
repeat: Infinity

pointer-events: none

🔹 PHASE 5 — Feature Tree

Radial layout
Radius: 200px
Hover scale: 1.3
Debounce: 200ms

Click → execute command internally

Backend Linked:
None

🔹 PHASE 6 — Architect Mode

Command:
architect <issue>

Right panel opens
Checklist steps
Git commands
Terminal feedback field

Backend Pending:
❌ POST /api/v1/chatbot

Fallback to mock/chatbot.json

🔹 PHASE 7 — Gatekeeper

Command:
gatecheck <repo>

Show warnings:

Red = inactive

Yellow = competitive

Orange = expert

Backend Pending:
❌ GET /api/v1/gatekeeper

Fallback to mock.

11. SOUND LAYER (OPTIONAL)

Using howler:

Event	Sound
Command enter	soft click
Graph load	subtle hum
Node select	pulse
Error	glitch

Volume ≤ 0.15
Must include mute toggle.

12. ERROR HANDLING RULES

On API call:

Print:
Executing...

If error:

Print red message

Do NOT crash graph

Do NOT reset mode

Timeout > 8s:
Operation taking longer than expected...

13. CLEANUP RULES

On unmount:

Dispose Three.js renderer

Cancel requestAnimationFrame

Clear intervals

Remove event listeners

No memory leaks allowed.

14. PERFORMANCE CONSTRAINTS

Target: 60fps
Max nodes: 3000
Freeze physics after stabilization
No continuous animation loops

15. FORBIDDEN PATTERNS

❌ No sidebar
❌ No router
❌ No static UI jumps
❌ No inconsistent animation curves
❌ No white backgrounds
❌ No modals for errors

16. FINAL DEMO FLOW REQUIREMENT

Must demonstrate:

ingest → cinematic logs
map → graph formation
blast <file>
focus <file>
intent <file>
architect 42
setup

All transitions super super smooth.