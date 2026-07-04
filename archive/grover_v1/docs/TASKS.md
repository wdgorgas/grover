# TASKS (canonical)

Live work belongs in Grover's own ledger/loops (Builder view). This file is
the coarse human-readable snapshot per product-quality pass.

## PQ1 — done (2026-07-01)

- [x] docs/: PRODUCT_AUDIT, QUALITY_RUBRIC, LOOP_ENGINEERING (+canonical
      moves of DECISIONS/TASKS/UI_STYLE_GUIDE)
- [x] Loop primitive: `loops` table + server/loops.mjs (proposed→approved→
      running→verifying→done/killed, all transitions audited)
- [x] Functional Greenlight Build Loop: proposal (scope/steps/risk/effort,
      honest offline skeleton without a key) → human approval → tracked loop.
      Verified end-to-end incl. idempotency and bad-status rejection.
- [x] System state: /api/status; Builder strip (autonomy, spend/cap, active
      loop, queue, next actions); Command Center "System" readout.
- [x] Desk starter prompts (beginner clarity); Builder explainer updated.
- [x] Orb micro-life: irregular rotation drift, heartbeat thump, surface glints.
- [x] `npm run verify` / `verify:server` — 32 checks, all passing.

## PQ1 self-critique (vs docs/QUALITY_RUBRIC.md)

Pass: §7 Greenlight loop (full), §6 Builder, §9 maintainability, §2 mostly.
Partial: §1 (Costs/Audit tables still plain; some empty states remain bare),
§3 (micro-life added; state *transitions* could ease more dramatically),
§8 (keyboard: Esc doesn't close modals yet; focus states default).
Not re-verified visually — sandbox cannot render the client; needs a human
pass or future screenshot tooling.

## PQ2 — done (2026-07-01)

- [x] Esc closes modals; :focus-visible rings; aria-modal; in-app promptModal
      replaces browser prompt() for loop summaries.
- [x] Costs/Audit/Memory tables in cards; designed empty states for Memory,
      Costs, Audit, and fresh Desks (purpose, status, starters, honest "later").
- [x] Loop → Workshop ↗ link expands the source item.
- [x] Orb ambient presence: idle carries the active loop's status
      (queued / running / verifying) via /api/status polling.
- [x] docs/VISUAL_QA.md — manual visual checklist (automated screenshots
      rejected on zero-dep grounds; rationale documented there).
- [x] Rubric regraded post-PQ2; audit addendum written.

## Design v2 — stage two (from GROVER Command Center v2.dc.html)

- [ ] Merge desks into the Command stage: sidebar desk switch swaps title/
      typed sub/meta/context in place; orb never remounts; desk-tinted halo.
- [ ] Context panel v2: ACTIVE TASK, QUEUE (approved loops, expandable
      steps, RUN NOW → loop running), MODEL / EST COST, TOOLS ALLOWED,
      MEMORY bar, NS/UPTIME row.
- [ ] Telemetry footer strip: tok in/out, latency, session cost, orb state
      preview chips (wired to real /api/costs + last turn, not simulated).
- [ ] Drag queue card onto the orb to start the loop (RELEASE TO START ring).
- [ ] Approval interrupt banner keyed to budget gates + future privileged
      actions (design's amber APPROVE/DENY bar).

## PQ3 — done (2026-07-03): Builder Workflow Pass

Rescoped from the original PQ3 list: Builder became the priority — turning
it from a display surface into Grover's self-development control center.

- [x] Loop engine v2: statuses proposed/approved/ready/running/verifying/
      blocked/done/killed/rejected; `LOOP_TRANSITIONS` state machine enforced
      server-side; blocking requires a reason (cleared on unblock).
- [x] `loop_events` table — per-loop auditable history (actor, from→to,
      note); History timeline on every loop card, lazily loaded.
- [x] Proposals extended: verification plan, rollback plan, cost-estimate
      placeholder, files touched (both doors, incl. offline skeletons).
- [x] Improvement Request flow: free text → drafted item + structured
      proposal → user edits any field → Approve & queue / Save for later
      (pending item w/ proposal as brief) / Reject (audited). Approval
      creates ledger item + loop through the same path as Greenlight.
- [x] Builder control center: active loop featured (verification checklist
      while verifying), queued improvements, blocked-with-reasons section,
      recently completed with summaries, beginner Q&A (what is Builder /
      what can I ask / what happens after approval / what's safe at L1),
      linked docs viewer (/api/docs, read-only).
- [x] Verify mutation mode: GROVER_DATA throwaway data dir; 66-check
      battery covers both doors, illegal transitions, blocking, events,
      idempotency. All passing.

## PQ4 — done (2026-07-03): Execution pass (v0.7)

- [x] Loop runner v0 (server/runner.mjs): agentic tool-use loop
      (read_file / write_file / list_dir / run_verify), repo-confined,
      writes to data//vault//.git//secrets denied, 20-iteration cap,
      budget gate before every model call (task_type 'runner'), every
      tool action in loop_events (event 'exec'), abort via
      POST /api/loops/:id/stop. No key → blocked honestly.
- [x] Execution evidence: files + byte deltas + line diffs (~200 lines)
      + final verify output as JSON in loops.execution_evidence;
      verify pass + ≥1 file changed → 'verifying', else 'blocked' with
      the real reason.
- [x] Evidence-gated done: 'done' rejected without execution_evidence or
      manual_evidence (human attestation, stored as evidence).
- [x] Policy split (AGENT_POLICY.md rewritten): Path 1 direct requests →
      POST /api/execute (SSE), item approved + loop running immediately
      at effective L2; Path 2 (propose → pending_greenlight → approve)
      reserved for Grover-initiated work. Builder's typed-request flow
      rerouted to /api/execute.
- [x] Ledger 'dismissed' status (never executed, distinct from done);
      "⏸" relabeled to Defer; ■ Stop button on running loops.
- [x] UI: expanded item cards show evidence (files, collapsible diff,
      verify tail) + ▶ Execute streaming live runner progress; ledger and
      loop cards draggable onto Command Center / workshop chat as the
      subject of conversation.
- [x] Verify battery extended: direct execute (no key → blocked), done
      gate both ways, dismissed, stop endpoint. All passing.

## PQ4 leftovers → PQ5 candidates

- [ ] Runner git integration: auto-commit per verified run so rollback is
      one command (today rollback = evidence diff + manual revert).
- [ ] Maker/checker: a reviewer agent distinct from the runner (Agent
      Team Manager) — today the checker is the human at 'verifying'.
- [ ] Runner progress reconnect: if the SSE stream drops, the run
      continues server-side but the UI can only see loop_events; add a
      live re-attach endpoint.
- [ ] Improvement-request seam for Grover-initiated detection (Path 2 has
      endpoints but nothing files pending_greenlight items automatically
      yet).
- [ ] Step-level progress: check off individual plan steps on a loop;
      today progress is only visible at status granularity.
- [ ] Proposal editing for the Greenlight door (Improvement Requests are
      editable; greenlit items are approve/decline only).
- [ ] Cost reconciliation: compare a loop's cost_estimate against actual
      model_calls attributed to it.
- [ ] Orb state-transition flourishes (brief scatter/refocus on change).
- [ ] First-run guided moment ("request → approve → loop" in 3 steps).
- [ ] Full keyboard navigation of ledger cards + loop actions.
- [ ] messages retention decision (log in DECISIONS once made).
- [ ] Consider screenshot CI once the Ubuntu deployment exists.
- [ ] Improvement-request seam in chat: "Grover, log this as an
      improvement" from any desk conversation.

## Standing (from v0.1/0.2)

- [ ] `git init` + first commit (must run on Will's machine)
- [ ] Add Jackson's email for Cloudflare Access mapping
- [ ] Deploy behind Cloudflare Tunnel + Access (SECURITY.md)
- [ ] Verify model IDs in Settings against docs.claude.com
