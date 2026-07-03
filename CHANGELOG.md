# CHANGELOG

## 0.6.0 — 2026-07-03 — Product Quality Pass 3: Builder Workflow

Builder becomes Grover's self-development control center.

- **Improvement Request flow:** describe a change in plain words → Grover
  drafts a work item + structured proposal (goal, scope, plan, risk, files
  touched, verification plan, rollback, cost estimate) → every field
  editable → Approve & queue / Save for later / Reject. Approval creates
  the ledger item and build loop together, through the same path as
  Greenlight — two doors, one loop philosophy. Honest offline skeleton
  without an API key.
- **Loop engine v2:** statuses proposed / approved / ready / running /
  verifying / blocked / done / killed / rejected, enforced by a
  server-side state machine (illegal transitions are 400s, blocking
  requires a reason). New `loop_events` table gives every loop a per-loop
  auditable timeline, shown as History on each loop card.
- **Builder control center:** active loop featured (verification checklist
  while verifying), queued improvements, blocked-with-reasons section,
  recently completed loops with closing summaries, beginner Q&A (what is
  Builder / what can I ask for / what happens after approval / what's safe
  at L1), read-only docs viewer (/api/docs).
- **Verify with mutations:** `GROVER_DATA` env override boots verify on a
  throwaway data dir; the battery grew to 66 checks covering the whole
  lifecycle, both doors, and the failure cases.
- (package.json version synced — 0.5.0 shipped without a bump.)

## 0.5.0 — 2026-07-02 — Command Center v2 design, stage one

Implemented from `GROVER Command Center v2.dc.html` (Claude Design):

- **Orb v3 engine** (faithful port): solid occluding body with volumetric
  interior (1,500 drifting particles + embers + nucleus glow), dot-lattice
  skin, surface mesh (latitude rings + sparse meridians), radial spikes
  where turbulence runs hot, mic-modulated Listening, amber Approval hold,
  Coding state, light-theme compositing, per-skin ramps, spring pointer.
  PQ2 ambient loop states preserved.
- **Atelier skin** — the design's signature palette (teal #7cc7bc, violet
  #9a8cf2, apricot #eeb069; orb ramp #292350→#7a68c9→#d9799d→#f0b46f).
- **Design typography**: Bricolage Grotesque (display) / Hanken Grotesk
  (UI) / Spline Sans Mono via Google Fonts with system fallbacks.
- Deferred to next pass (logged in docs/TASKS.md): the full three-column
  desk-merged stage, drag-queue-to-orb, telemetry footer strip. The
  design's simulated sequences were intentionally NOT ported — Grover's
  UI only shows real state.

## 0.4.0 — 2026-07-01 — Product Quality Pass 2: presence and polish

- **Orb as presence:** while idle, the orb carries the active loop's state —
  Loop queued / running / verifying ambients (label included), fed by
  /api/status polling. Micro-life from PQ1 retained.
- **Interaction polish:** Esc closes modals; visible :focus-visible rings
  everywhere; aria-modal dialogs that focus their first control; browser
  prompt() replaced by an in-app modal for loop summaries/kill reasons.
- **Instructive empty states:** Memory, Costs, Audit, and fresh Desks now
  explain what belongs there, current status, the next action, and (desks)
  an honest "coming later" line. Tables moved into cards.
- **Loop → Workshop ↗** on every loop card jumps to the source item expanded.
- **Visual QA:** docs/VISUAL_QA.md manual checklist; automated screenshots
  rejected on zero-dependency grounds (rationale documented).
- Docs regraded honestly: rubric grades + audit addendum + PQ3 proposal.

## 0.3.0 — 2026-07-01 — Product Quality Pass 1: the loop is real

- **Greenlight Build Loop (functional):** greenlight now generates a build
  proposal (goal, scope, steps, risk + notes, effort, touches) that must be
  approved before anything changes; approval creates a tracked loop
  (proposed→approved→running→verifying→done/killed), every transition
  audited, ledger item closed when its loop completes. Honest offline
  skeleton when no API key. Nothing executes autonomously at L1.
- **Loop engine:** `loops` table + server/loops.mjs; docs/LOOP_ENGINEERING.md
  defines the primitive and the product-quality pass process.
- **System state:** /api/status; Builder header strip (autonomy, spend vs
  cap, active loop, queue, next actions); Command Center System readout.
- **Beginner clarity:** desk starter prompts; instructive loop empty state;
  Builder explainer rewritten around the real flow.
- **Orb micro-life:** irregular rotation drift, heartbeat thump, surface
  glints — idle no longer reads as a loop.
- **Verification:** `npm run verify` (syntax + boot + 32-endpoint read-only
  battery, traversal guard included) and `npm run verify:server`.
- **Docs:** docs/ is now canonical — PRODUCT_AUDIT, QUALITY_RUBRIC,
  LOOP_ENGINEERING, UI_STYLE_GUIDE, DECISIONS, TASKS.

## 0.2.0 — 2026-07-01 — The Revamp

- **Orb v2**: rebuilt on orb.jpg — dense dot-matrix sphere in latitude
  scan-bands, turbulent edge spikes, indigo→violet→magenta→gold heat ramp,
  per-theme orb palettes, spring-damped cursor response (no more snap-back).
- **Design system**: professional typography (display faces, kicker labels),
  view transitions, staggered reveals, typewriter subtitles, count-up stats,
  film grain, SVG nav icons. New themes: Obsidian (quiet luxury), Slate
  (engineering), Porcelain (editorial light). Spider-Verse renamed → Pulse.
  Professional themes set --edge-glow: 0 — the neon look stays only where
  it belongs (Default/Light/Pulse).
- **Ledger UX**: items expand in place — facts, generated implementation
  brief (smart tier, stored), and a per-item Workshop chat with Grover
  (Grover Architect auto-joins grover-dev items). Done/rejected items
  collapse into History. Greenlight semantics made explicit in the UI:
  approval is recorded, nothing auto-executes at autonomy L1.
- **Desks**: domain skills became sidebar workspaces (Research, Business,
  Coding, Lifestyle) with their own accent, thread, and expertise. The
  composer skill dropdown is gone — background operators (Memory Curator,
  Grover Architect, Code Review, Token Efficiency) are auto-applied
  server-side where they belong.
- Migrations: ledger.brief/conversation_id, skills.kind/accent; legacy
  skill renames; all additive, safe on v0.1 databases.

## 0.1.0 — 2026-07-01 — The Kernel

First real Grover. Zero-dependency Node 22 kernel:

- Command Center: streaming chat (SSE), stateful particle orb, telemetry
  panel, conversation history, Chat + Brain Dump modes.
- Model Router: fast/smart/frontier/fable tiers → configurable Claude model
  IDs; internal plumbing pinned to fast tier.
- Cost Governor: real per-call cost from API usage, daily/monthly caps that
  block with an audited override gate, cost dashboard (by model, task, user).
- Memory: namespaced Markdown vault (Obsidian-compatible) + structured
  FTS-searchable memories; per-turn retrieval shown in UI; brain-dump
  extraction with human approval; profile documents injected per user.
- Deferred Action Ledger: generic domain-tagged greenlight schema (§7.9);
  Builder view = grover-dev slice; seeded with the v2 roadmap.
- Skill Registry: six seeded skills, editable, injectable per turn.
- Audit log for every consequential action.
- Theming: Default / Arcane / Spider-Verse / Light over one token system.
- Security: 127.0.0.1 bind, secrets outside git, namespace enforcement,
  path-traversal guards, Cloudflare Tunnel + Access runbook (SECURITY.md).
