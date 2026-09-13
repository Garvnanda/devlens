## Phase 9: The "Identity Layer" — GitHub OAuth & Skill Fingerprint (Days 13-14)

*Goal: Move DevLens from an anonymous, stateless tool to a signed-in platform. Nothing in Phase 10 onward works without this — it's the foundation every later phase reads from.*

**1. GitHub OAuth Integration**
* **The Problem:** Every session today is anonymous. There's no way to remember a user or personalize beyond the one-shot `user_profile` header trick planned in Phase 8.
* **Technical Implementation:**
  * Implement GitHub's OAuth Web Application Flow: `GET /api/v1/auth/github/login` → redirect → `GET /api/v1/auth/github/callback`.
  * Request minimal scopes at first (`read:user`, `public_repo`) — escalate to `repo` write scope only later, and only for Maintainer Mode (Phase 15).
  * Issue a short-lived JWT to the frontend; never expose the raw GitHub access token to the browser. Store it server-side, encrypted at rest, tied to the session.

**2. Skill Fingerprint Engine**
* **The Problem:** Phase 8's personalization assumed a self-reported skill dropdown. Self-reported skill is unreliable — students overestimate, seniors underestimate.
* **Technical Implementation:**
  * On first login, `GET /api/v1/user/skill-fingerprint` runs a background job pulling the user's public repos, language breakdown, and commit frequency via the existing GitHub GraphQL client (Phase 1/2).
  * Compute a lightweight vector: language distribution %, average repo complexity (file count, stars), contribution recency.
  * Store this as the user's default `user_profile`, replacing — not duplicating — the header-injection approach from Phase 8. Manual override stays available.

---

## Phase 10: The "Global Radar" — Cross-GitHub Search & Classification (Days 15-16)

*Goal: Every feature so far only works on one repo the user has already pasted. This lets a user find a repo or issue worth ingesting in the first place — searching all of GitHub, not just what's already loaded.*

**1. Global Repository & Issue Search**
* **The Problem:** A student doesn't start with a repo URL. They start with an interest — "I want to work on computer vision, in Python."
* **Technical Implementation:**
  * New endpoint `GET /api/v1/search/global?q=...` wraps GitHub's REST Search API (`/search/repositories`, `/search/issues`) — distinct from the Hybrid Vector Engine (Phase 3), which only searches repos already ingested.
  * Re-rank raw results by cosine similarity against the user's Skill Fingerprint (Phase 9) — reusing the same embedding infrastructure already built for issue-to-code search, just pointed outward instead of inward.

**2. Issue Classification Layer**
* **The Problem:** Raw GitHub search results are unlabeled noise — bugs, feature requests, and docs asks all look identical in a list.
* **Technical Implementation:**
  * For every issue returned, run one cheap OpenRouter (Nemotron-3) classification call: `Bug | Feature | Docs | Security | Good-First-Issue`.
  * Cache the classification per issue ID in DiskStore so repeat searches don't re-classify the same issue twice.
  * Reuse the Beginner Issue Matcher's "already claimed?" check (Phase 6) on every classified issue, so global search carries the same trust signal as single-repo search.

---

## Phase 11: The "Trust Layer" — Security Scanning (Days 17-18)

*Goal: Nothing today tells a contributor whether a repo is safe to build locally. This adds deterministic, non-hallucinated security signal — a strong differentiator against any LLM-only competitor.*

**1. Dependency Vulnerability Scanner**
* **The Problem:** A student clones a repo and runs `pip install` or `npm install` with zero idea whether any dependency has a known CVE.
* **Technical Implementation:**
  * New endpoint `GET /api/v1/security/scan/{owner}/{repo}`.
  * Reuse the config parser already built for the Environment Setup Generator (Phase 5) to read `requirements.txt` / `package.json` / `go.mod`.
  * Cross-reference every dependency + version against the **OSV.dev API** (Google's free, open Open Source Vulnerabilities database — no key required, no cost).
  * Deterministic matching only — no LLM in this path, same principle as the AST engine.

**2. Secret & Credential Leak Scanner**
* **The Problem:** Some repos accidentally commit API keys, which becomes a landmine for anyone who clones and runs the code with those exposed keys.
* **Technical Implementation:**
  * During the existing Pre-Flight Filtering pass (Phase 1), run a lightweight regex + entropy check for common secret patterns (AWS keys, private key headers, high-entropy strings).
  * Purely local — no external calls, keeps it fast and free.
  * Surface findings as an additional flag in the Gatekeeper verdict (Phase 8): `⚠️ Possible exposed secret in config/aws.json`.

---

## Phase 12: The "Living Map" — Ship the Frontend, 3D Map v2, Instant Summaries (Days 19-22)

*Goal: This is the actual biggest gap in DevLens today. `implemented.md` confirms the React frontend and force-directed graph UI from `idea.md` were never built. The graph endpoint has returned valid JSON since Phase 2 — no human has ever seen it rendered. This phase is not polish, it's the first time DevLens becomes visible.*

**1. Ship the React Frontend (Blocking Priority)**
* **The Problem:** `GET /api/v1/repository/graph/{owner}/{repo}` works and returns correct node/edge data. No UI consumes it. The Streamlit Tester is a debug tool, not the product.
* **Technical Implementation:**
  * Stand up the React + Tailwind SPA from `idea.md`, wired to the existing FastAPI endpoints — zero new backend work, this is pure frontend debt repayment.
  * Integrate `react-force-graph-3d` against the existing graph endpoint as the literal first working screen.

**2. 3D Map v2 — Semantic Clustering & Health Overlay**
* **The Problem:** A plain dependency graph shows connections but not meaning — two files can be conceptually related without a direct import between them.
* **Technical Implementation:**
  * Use the embeddings already generated by the Hybrid Vector Engine (Phase 3) to position semantically similar files closer together in 3D space, even absent a direct edge.
  * Color nodes by a "churn score" — how often a file appears across the last 50 merged PRs, from the GraphQL history already fetched in Phase 2 — visually surfacing historically fragile files.

**3. Instant File & Repo Summaries**
* **The Problem:** Architectural Intent (Phase 3) explains *why* code exists — there's no fast, cheap "what does this file do" for a first-glance orientation.
* **Technical Implementation:**
  * New endpoint `GET /api/v1/summary/{owner}/{repo}/file?path=...` — one cached LLM call per file, generated once at ingestion and stored in DiskStore, never regenerated on repeat visits.
  * A parallel `GET /api/v1/summary/{owner}/{repo}` builds a repo-level TL;DR via map-reduce over file summaries — this also resolves the "Lost in the Middle" fix already flagged as pending work in `implemented.md`.

---

## Phase 13: The "What-If" Engine — Impact Simulation (Days 23-24)

*Goal: The Blast Radius concept planned for Phase 7 (DevLens Architect) told a user what depends on a file. This makes it a standalone, signed-in feature usable before a user even starts a mission.*

**1. Change Impact Simulator**
* **The Problem:** A contributor wants to know, before writing a line, "if I touch this file, what breaks?" — today that's buried inside the still-unbuilt Architect chatbot.
* **Technical Implementation:**
  * New endpoint `POST /api/v1/impact/simulate` — requires GitHub sign-in (Phase 9), takes a file path as input.
  * Combines three sources already computed elsewhere: the AST dependency graph (Phase 2), historical PR churn on that file (Phase 2's GraphQL history), and test coverage detected during Environment Setup scanning (Phase 5), if present.
  * Returns a Low / Medium / High risk score plus the concrete list of affected files and existing tests to re-run. No code execution — pure static analysis, deterministic by design.

---

## Phase 14: The "Memory & Motivation" Layer (Days 25-27)

*Goal: Every session today is stateless — close the tab, lose all context. This is the strongest argument against "just use a chatbot instead of DevLens," so it earns its own phase.*

**1. Persistent Contribution Memory**
* **The Problem:** A user who explored a repo yesterday starts from zero today.
* **Technical Implementation:**
  * A lightweight persistent store (Postgres, or DynamoDB to stay AWS-native), keyed on the GitHub identity from Phase 9.
  * Tracks repos explored, issues attempted, mission plans in progress (once Phase 7 ships), and Skill Fingerprint drift over time.
  * `GET /api/v1/memory/dashboard` returns "pick up where you left off" state to the frontend on login.

**2. Open-Source Contest & Opportunity Radar**
* **The Problem:** Programs like Hacktoberfest, GSoC, LFX Mentorship, and MLH Fellowships are exactly the resume-building opportunities DevLens's target users want — but scattered across different sites with different deadlines.
* **Technical Implementation:**
  * Maintain a periodically-refreshed dataset of active programs (deadlines, eligibility, focus areas) via a scheduled job — not real-time, doesn't need to be.
  * `GET /api/v1/contests/recommend` matches this dataset against the user's Skill Fingerprint (Phase 9) using the same cosine-similarity approach as Global Search (Phase 10).
  * Add lightweight gamification on top — streaks for weekly usage, badges for issues resolved through the platform — cheap to build, reuses the memory store from this same phase.

**3. Contribution Portfolio Page**
* **The Problem:** Students need provable, shareable evidence of open-source work for resumes and internship applications.
* **Technical Implementation:**
  * A public profile page, `GET /api/v1/user/{username}/portfolio`, listing verified contributions made through DevLens — repo, issue fixed, date, verified via the GitHub PR link.

---

## Phase 15: The "Other Side of the Table" — Maintainer Mode (Days 28-30)

*Goal: Every phase before this serves the contributor. This flips DevLens into a two-sided platform by serving the maintainer — also the strongest enterprise upsell story.*

**1. Maintainer Dashboard & Triage**
* **The Problem:** Maintainers spend enormous time on low-quality issue reports and unreviewed PRs.
* **Technical Implementation:**
  * Requires elevating from plain OAuth (Phase 9) to a proper **GitHub App installation**, with fine-grained, minimal permissions (`issues:write`, `pull_requests:write`) scoped only to repos the maintainer explicitly installs it on. Judges will ask about this scope directly — be ready to name it.
  * Incoming issues are auto-triaged using the Issue Classification model from Phase 10, plus a duplicate-detection pass (embedding similarity against existing open issues in that repo).
  * Incoming PRs get an AI-generated review comment: diff summary, an automatic Blast Radius warning (Phase 13's simulator, run on the PR's changed files), and a CONTRIBUTING.md compliance check.

**2. One-Click PR Actions**
* **The Problem:** Maintainers shouldn't have to leave DevLens to act on what it just told them.
* **Technical Implementation:**
  * `POST /api/v1/maintainer/pr/{pr_id}/review` calls GitHub's native PR Review API (`APPROVE`, `REQUEST_CHANGES`, `COMMENT`) directly from the dashboard.
  * Every write action is logged against the maintainer's identity for auditability — no silent automated merges without an explicit human click.

---

## Phase 16: The "Safety Net" — Auto-Generated Test Cases (Days 31-32)

*Goal: Closes the loop opened by the Tactical Planner (Phase 7) and the PR review (Phase 15) — a fix without a test is an incomplete fix, on both sides of the table.*

**1. Test Generation on Contributor Fix**
* **The Problem:** A beginner fixes a bug but doesn't know how to prove it's fixed, or forgets to test it at all.
* **Technical Implementation:**
  * Once a user's fix is ready (post Tactical Planner, Phase 7), `POST /api/v1/tests/generate` reads the modified function plus its diff.
  * Finds sibling test files already in the repo to detect the testing framework and style conventions — reuses the same config-detection logic already built for the Environment Setup Generator (Phase 5).
  * Generates a test file scoped to the changed function only, not the whole repo — keeps token usage low and output focused.

**2. Test Suggestion on Maintainer Review**
* **The Problem:** From the other side of the table (Phase 15), a maintainer often receives a PR with zero test coverage.
* **Technical Implementation:**
  * Reuses the exact same generator from this phase — the Maintainer Dashboard flags "No tests detected for this diff" and offers the generated file as a one-click suggestion comment on the PR.
  * One feature, two entry points. No duplicated logic, no redundant model calls.

---

## Suggested Build Order (Given What's Actually Built Today)

`implemented.md` confirms Phases 1–6 are backend-complete, but Phase 7, Phase 8, and the entire frontend are not built. That changes the honest priority order:

| Priority | Item | Why |
|---|---|---|
| 0 — blocking | Ship the React frontend (Phase 12, Feature 1) | Nothing else is demoable without it — the graph endpoint has never been seen by a human |
| 1 | Phase 9 — OAuth + Skill Fingerprint | Every later phase reads from a real signed-in identity |
| 2 | Phase 7 + 8 (already planned, still pending) | Needed before Phase 13/14 can reference mission state or personalization |
| 3 | Phase 11 — Security Scanning | Cheap, free API, high differentiation, zero dependency on anything else |
| 4 | Phase 10 — Global Search | High demo impact, reuses existing embedding infra directly |
| 5 | Phase 16 — Test Generation | Reuses Phase 5 infra almost entirely, cheap to add |
| 6 | Phase 13 — Impact Simulator | Builds directly on Phase 2 + Phase 7 |
| 7 | Phase 14 — Memory + Contest Radar | High delight, needs Phase 9 identity to exist first |
| 8 | Phase 15 — Maintainer Mode | Most complex — needs a GitHub App, not just OAuth. Treat as a roadmap slide if time runs short |
| — | Phase 12, Features 2 & 3 — 3D Map v2 + Summaries | Polish beyond the base frontend ship — do last |
