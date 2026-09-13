# Garv's Implementation Plan — Track A: Identity & Data

Split off from the old `implementation-phases-9-16.md` (now deleted — Haragam's half lives in `implementation-haragam.md`). Phases 1-8 are already built; this covers your assigned slice of Phase 9-16, in order.

**Your order:** `Phase 9 → Phase 10 → Phase 14`.

**Why this order:** Phase 9 is the foundation everything else reads from — nobody's auth-dependent work (yours or Haragam's) can proceed without it, so it's the first thing to build. Phase 10 reuses your own Phase 9 Skill Fingerprint directly. Phase 14 needs Phase 9's identity to key its persistent store.

Matching frontend work for every phase below is listed under your name in `frontend.md` — build both ends of a feature yourself so nothing ships without its UI caller (see Integration Check 6). Heads up: your frontend slice is the heavier one (full OAuth flow + three Phase 14 UI pieces, one of which is a public page that breaks the CLI-only rule) — that's why Phase 12's backend work went to Haragam instead of being split evenly.

---

## Phase 9: The "Identity Layer" — GitHub OAuth & Skill Fingerprint (Days 13-14)

*Goal: Move DevLens from an anonymous, stateless tool to a signed-in platform. Nothing in Phase 10 onward works without this — it's the foundation every later phase reads from.*

**1. GitHub OAuth Integration**
* **The Problem:** Every session today is anonymous. There's no way to remember a user or personalize beyond the one-shot `user_profile` header trick already built in Phase 8.
* **Technical Implementation:**
  * Implement GitHub's OAuth Web Application Flow: `GET /api/v1/auth/github/login` → redirect → `GET /api/v1/auth/github/callback`.
  * Request minimal scopes at first (`read:user`, `public_repo`) — escalate to `repo` write scope only later, and only for Haragam's Maintainer Mode (Phase 15).
  * Issue a short-lived JWT to the frontend; never expose the raw GitHub access token to the browser. Store it server-side, encrypted at rest, tied to the session.

**2. Skill Fingerprint Engine**
* **The Problem:** Phase 8's personalization assumed a self-reported skill dropdown. Self-reported skill is unreliable — students overestimate, seniors underestimate.
* **Technical Implementation:**
  * On first login, `GET /api/v1/user/skill-fingerprint` runs a background job pulling the user's public repos, language breakdown, and commit frequency via the existing GitHub GraphQL client (Phase 1/2).
  * Compute a lightweight vector: language distribution %, average repo complexity (file count, stars), contribution recency.
  * Store this as the user's default `user_profile`, replacing — not duplicating — the header-injection approach from Phase 8. Manual override stays available.

**Critical deliverable:** the `UserProfile`/JWT payload shape you define here is a shared contract — freeze it and sync with Haragam before his Phase 13/15 work consumes it (Integration Check 1).

---

## Phase 10: The "Global Radar" — Cross-GitHub Search & Classification (Days 15-16)

*Goal: Every feature so far only works on one repo the user has already pasted. This lets a user find a repo or issue worth ingesting in the first place — searching all of GitHub, not just what's already loaded.*

**1. Global Repository & Issue Search**
* **The Problem:** A student doesn't start with a repo URL. They start with an interest — "I want to work on computer vision, in Python."
* **Technical Implementation:**
  * New endpoint `GET /api/v1/search/global?q=...` wraps GitHub's REST Search API (`/search/repositories`, `/search/issues`) — distinct from the Hybrid Vector Engine (Phase 3), which only searches repos already ingested.
  * Re-rank raw results by cosine similarity against the user's Skill Fingerprint (your own Phase 9) — reusing the same embedding infrastructure already built for issue-to-code search, just pointed outward instead of inward.

**2. Issue Classification Layer**
* **The Problem:** Raw GitHub search results are unlabeled noise — bugs, feature requests, and docs asks all look identical in a list.
* **Technical Implementation:**
  * For every issue returned, run one cheap OpenRouter (Nemotron-3) classification call: `Bug | Feature | Docs | Security | Good-First-Issue`.
  * Cache the classification per issue ID in DiskStore so repeat searches don't re-classify the same issue twice.
  * Reuse the Beginner Issue Matcher's "already claimed?" check (Phase 6) on every classified issue, so global search carries the same trust signal as single-repo search.
  * **Note:** Haragam's Phase 15 Maintainer Dashboard reuses this classification model for issue auto-triage — keep the classification categories stable once shipped.

---

## Phase 14: The "Memory & Motivation" Layer (Days 25-27)

*Goal: Every session today is stateless — close the tab, lose all context. This is the strongest argument against "just use a chatbot instead of DevLens," so it earns its own phase.*

**1. Persistent Contribution Memory**
* **The Problem:** A user who explored a repo yesterday starts from zero today.
* **Technical Implementation:**
  * A lightweight persistent store (Postgres, or DynamoDB to stay AWS-native), keyed on the GitHub identity from your Phase 9.
  * Tracks repos explored, issues attempted, mission plans in progress (Phase 7's Architect), and Skill Fingerprint drift over time.
  * `GET /api/v1/memory/dashboard` returns "pick up where you left off" state to the frontend on login.
  * **Decision point:** the Architect's mission state (`architect_agent.py`'s `_sessions` in-memory dict) is a natural candidate to migrate here — decide explicitly with Haragam whether this store absorbs it or leaves it separate (Integration Check 4).

**2. Open-Source Contest & Opportunity Radar**
* **The Problem:** Programs like Hacktoberfest, GSoC, LFX Mentorship, and MLH Fellowships are exactly the resume-building opportunities DevLens's target users want — but scattered across different sites with different deadlines.
* **Technical Implementation:**
  * Maintain a periodically-refreshed dataset of active programs (deadlines, eligibility, focus areas) via a scheduled job — not real-time, doesn't need to be.
  * `GET /api/v1/contests/recommend` matches this dataset against the user's Skill Fingerprint (Phase 9) using the same cosine-similarity approach as your own Phase 10 Global Search.
  * Add lightweight gamification on top — streaks for weekly usage, badges for issues resolved through the platform — cheap to build, reuses the memory store from this same phase.

**3. Contribution Portfolio Page**
* **The Problem:** Students need provable, shareable evidence of open-source work for resumes and internship applications.
* **Technical Implementation:**
  * A public profile page, `GET /api/v1/user/{username}/portfolio`, listing verified contributions made through DevLens — repo, issue fixed, date, verified via the GitHub PR link.

---

## Integration Checks (shared with Haragam — same list in `implementation-haragam.md`)

Run these at the stated checkpoint, not just at the end.

1. **Freeze the `UserProfile`/session contract before either of you builds on it.** You define it in Phase 9 (JWT payload shape, Skill Fingerprint fields). Haragam's Phase 13 (auth-gated) and Phase 15 (maintainer identity) consume it as-is — no independent reinterpretation. 15-minute sync, not a doc round-trip.
2. **Your Phase 9 must not break anonymous flows.** `ingest`, `chatbot`, `gatekeeper`, `explain`, `intent` all work today with zero auth. After Phase 9 merges, smoke-test the full anonymous path end-to-end before assuming auth is additive.
3. **Haragam's Phase 11 scanner must stay usable pre-login.** It's meant to run during the Gatekeeper flow, before a user signs in. Confirm your auth middleware doesn't accidentally gate it.
4. **Mission-state storage decision.** `architect_agent.py`'s `_sessions` is an in-memory dict today (Phase 7). Your Phase 14 persistent store is the natural place for it to eventually live — decide explicitly whether it absorbs mission state or leaves it separate; don't let two stores silently diverge.
5. **Two separate OAuth credentials.** Your Phase 9 user OAuth and Haragam's Phase 15 GitHub App install are different app registrations with different secrets — never share a client ID.
6. **No endpoint ships without its frontend caller in the same PR.** This is the exact gap Phase 7/8 fell into (`/search`, persona onboarding) — check `frontend.md`'s per-phase item list before calling a backend phase "done."
7. **Haragam's Phase 16 must call into Phase 5's parser, not reimplement it.** One `setup_generator.py` import, checked in review — not your check to make, but know it's there if you touch that code.
