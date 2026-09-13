# DevLens Implementation Status

This document tracks the delivery of features outlined in the project's strategy documents (`idea.md`, `technical.md`, `implementation.md`, `implementation-haragam.md`, and `implementation-garv.md`). It serves as a master checklist to flag what has been built, what is wired end-to-end, and what remains to be built.

**Last verified against the actual codebase:** 2026-09-13. Earlier versions of this file marked Phase 7, Phase 8, and the entire frontend as "Not Implemented" — that was stale. All three exist and are largely wired together. See §5 for the real remaining gaps.

---

## 1. Core Engines (Infrastructure & Data Layer)

| Feature | Status | Details & Endpoints |
| :--- | :--- | :--- |
| **FastAPI & Async Architecture** | ✅ Implemented | High-concurrency routing, asynchronous subprocess calls. |
| **AI Clients (OpenRouter & AWS)** | ✅ Implemented | `app/services/bedrock_client.py` using Nemotron-3 (OpenRouter) & Titan v2 (AWS Bedrock). |
| **HybridStorageManager** | ✅ Implemented | `app/storage/hybrid_storage.py` handles ephemeral `RAMStore` and persistent ChromaDB `DiskStore`. |
| **Rate Limit Management** | ✅ Implemented | Bypasses REST API via `git clone`, uses `asyncio.Semaphore(50)` for AWS, and `tenacity` for backoff. |
| **Security: Pre-Flight Filtering** | ✅ Implemented | Skips 1MB+ files, excludes `node_modules`/`.git`, handles MIME-types. |
| **Security: XML Sandboxing** | ✅ Implemented | System prompts firmly isolate untrusted repo/issue/terminal data (`<untrusted_repository_data>`, `<untrusted_issue>`, `<untrusted_terminal>`) from LLM instructions. |

---

## 2. Ingestion & Analysis Pipelines

| Feature | Status | Details & Endpoints |
| :--- | :--- | :--- |
| **Dual Ingestion (Shallow Clone)** | ✅ Implemented | `POST /api/v1/repository/ingest` — kicks off Tree-sitter parsing as a background task, pollable via `GET /api/v1/repository/status/{owner}/{repo}`. |
| **GitHub GraphQL Data Fetching**| ✅ Implemented | `GET /api/v1/history/{owner}/{repo}` efficiently fetches 50 recent PRs + issues in one shot. |
| **Language-Agnostic Parsing (Tree-sitter)**| ✅ Implemented | `GET /api/v1/repository/graph/{owner}/{repo}` parses ASTs deterministically, including per-file `extracted_names` (functions/classes/methods). |
| **Hybrid Vector Engine** | ⚠️ Implemented but disconnected | `POST /api/v1/repository/vectorize` chunks by classes/functions, embeds via AWS, stores in ChromaDB — but **nothing calls it automatically**. Ingest never triggers vectorization, so `search` and the Architect's Investigator silently get empty results unless `/vectorize` is called manually. See §5, Hardening Task 1. |

---

## 3. The Core Features

| Feature | Design Target | Implementation Status | Notes |
| :--- | :--- | :--- | :--- |
| **Feature 1: Issue-to-Code Mapping** | Hybrid Dense + Sparse BM25 Search. | ⚠️ Backend done, frontend missing | `POST /api/v1/search` combines Cosine Similarity & Keyword Overlap. **No CLI command calls it** — never exposed to a user. Also blocked by the vectorize gap above. |
| **Feature 2: Repository Visualization**| React Force-Directed Graph UI + AST Backend. | ✅ Implemented | `react-force-graph-3d` molecular graph (`MolecularGraph.tsx`), `blast <file>` orbit animation, `SidePanel.tsx` node details, all wired to `GET /api/v1/repository/graph`. |
| **Feature 3: Architectural Intent** | Analyze PR history via OpenRouter (Nemotron-3) | ✅ Implemented | `POST /api/v1/intent`, wired via `intent <file>` command → `IntentPanel.tsx`. |
| **Feature 4: The Jargon Buster (Indic Bridge)** | Student-friendly technical explanations in multiple languages. | ✅ Implemented | `POST /api/v1/explain` accepts `language` + `user_profile`, wired via `explain <file>` command → `ExplainPanel.tsx`. |
| **Feature 5: Environment Setup Guidance**| Deterministic setup script generation. | ✅ Implemented | `GET /api/v1/setup/{owner}/{repo}`, wired via `setup` command (bash/PowerShell auto-detected by OS). |
| **Feature 6: Beginner Issue Matcher**| Finds open beginner issues and detects if active PRs are linked. | ✅ Implemented | `GET /api/v1/issues/recommend/{owner}/{repo}`, wired via `issues` command. |
| **Feature 7: DevLens Architect**| End-to-End Agentic Contribution Planner (Mission Control & Git Commander). | ✅ Implemented | `app/services/architect_agent.py` (577 lines): mode detection (Exterminator/Builder/Janitor), Investigator (Graph-RAG + Blast Radius), Context Sniper, Tactical Planner, Git Commander, Mission-Update terminal-error loop. `POST /api/v1/chatbot` wired via `architect <issue>` command → `ArchitectPanel.tsx`. Mission state is an **in-memory dict** (`_sessions` in `architect_agent.py`) — lost on server restart; fine for now, revisit when Phase 14's persistent store exists. |
| **Feature 8: Personalization & Feasibility**| Repo Gatekeeper, User Context Engine, and Anti-Gravity Handover | ⚠️ Backend + partial frontend | Gatekeeper (`app/services/gatekeeper.py`, `GET /api/v1/gatekeeper/{owner}/{repo}`) wired via `gatecheck <url>` command. Persona engine (`app/services/persona.py`) injects level/language/goal modifiers into explain/intent/chatbot prompts — **but there's no onboarding UI to set `user_profile`**, so it's always whatever default `useAppStore.ts` ships with. Anti-Gravity command synthesis is folded into the Architect's Git Commander (setup detection + safety warnings), not a separate feature. |

---

## 4. Frontend Application

| Component | Status | Details |
| :--- | :--- | :--- |
| **React/Tailwind SPA (`devlens-frontend/`)** | ✅ Implemented (core) | Vite + React 19 + Tailwind + Zustand + framer-motion + react-force-graph-3d, matching `frontend.md`'s stack. CLI-first, no router, per spec. |
| — Terminal / CLI engine | ✅ | `components/CLI/Terminal.tsx`, `CommandRegistry.ts`, `CommandParser.ts`, `StateMachine.ts`. Commands: `help, clear, home, map, gatecheck, setup, issues, history, ingest, blast, focus, intent, explain, architect`. |
| — Molecular Graph | ✅ | `components/Graph/MolecularGraph.tsx`, `GraphEffects.ts`, `SidePanel.tsx`. |
| — Feature Tree / Explorer | ✅ (adapted) | `FeatureExplorerScene.tsx` + `FeatureTree2D.tsx` + `FeatureNode.tsx` — a 2D radial explorer, not the exact "orbit-radius radial layout" in `frontend.md` §Phase 5, but functionally equivalent. |
| — Panels (Intent/Explain/Architect/CodeViewer) | ✅ | All four exist and are wired to their endpoints. |
| — Landing Scene | ⚠️ Deviation from spec | `frontend.md` names a dedicated `LandingScene.tsx`; the actual app uses the fullscreen terminal (`mode: 'landing'`) directly with no separate scene file. Functionally fine, just a doc/code naming mismatch — not worth reconciling unless `frontend.md`'s file-structure rule is enforced strictly. |
| — Onboarding / Persona calibration modal | ❌ Missing | No UI sets `user_profile` (level/language/goal) — see Feature 8 above. |
| — Search UI | ❌ Missing | No `search <query>` command or results panel for Feature 1. |
| — AI Hologram (`AIHologram.tsx`) | ❌ Not found | `frontend.md` §Phase 4 spec'd this; no such component exists yet (`hologram.png` asset exists, unused). |
| — Sound layer (howler) | ⚠️ Unverified | `howler` is installed but no usage found in a src-wide search beyond the dependency — likely not wired yet. |
| **Streamlit Tester Dashboard** | ✅ Implemented | `backend/tester/app.py` — engineering debug tool, not the product UI. |

---

## 5. 🚩 Flagged Remaining Work (To-Do)

### Immediate — Phase 7/8 Hardening (do before Phase 9)
These are small, concrete bugs in already-"complete" phases, not new features:

1. **Auto-trigger vectorization on ingest.** `_run_parser_and_store` in `app/routers/repository.py` builds the graph but never calls `vectorize_repository`. Chain it in the same background task so `search` and the Architect's Investigator actually have data to query. *(Backend, small.)*
2. **Expose Feature 1 (`/search`) in the frontend.** Add a `search <query>` CLI command + a results panel (or reuse `SidePanel.tsx`). *(Frontend, small — see `frontend.md`.)*
3. **Build the persona onboarding modal.** One-time calibration UI (level/language/goal) per `frontend.md` §7, wiring into `useAppStore.userProfile`. *(Frontend, small-medium.)*

### Phase 9 onward
Everything else — GitHub OAuth, Skill Fingerprint, Global Search, Security Scanning, the shipped-but-needs-polish 3D map, Impact Simulator, Memory/Motivation layer, Maintainer Mode, Test Generation — is tracked phase-by-phase, split by owner: `implementation-garv.md` (Phase 9, 10, 14) and `implementation-haragam.md` (Phase 11, 16, 13, 15 + Phase 12's summary/churn work). Both carry the same shared integration-checks list.

### Lower priority / infra debt
4. **Context Window Degradation (Map-Reduce):** PR-history summarization still just trims context instead of true map-reduce if it exceeds ~15k tokens ("Lost in the Middle" mitigation). Phase 12 Feature 3 (Instant Summaries) will need this properly.
5. **No pytest suite.** Only ad-hoc scripts (`test_ts.py`, `test_parser_full.py`, `tester/test_embed.py`) — no `pytest`/CI-runnable test directory. Worth a lightweight suite before Phase 9 auth code lands (auth bugs are expensive to catch manually).
6. **Advanced Tree-Sitter Grammars:** Works well for Python; JS/TS/Go grammar compilation may need extra setup steps depending on deployment target.
7. **Mission state persistence:** `architect_agent.py`'s `_sessions` dict is in-memory only — a server restart loses every active mission. Fine until Phase 14's persistent store exists; flag it as a known limitation, not a bug to fix now.
