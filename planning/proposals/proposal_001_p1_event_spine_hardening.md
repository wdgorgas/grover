# PlanningProposal 001 — P1 event-spine hardening (ChatGPT review)

Imported per master prompt §12. Source: `chatgpt_p1_feedback_source.md` (uploaded by Will, 2026-07-05).

- **proposal_id:** 001
- **source_file:** `planning/proposals/chatgpt_p1_feedback_source.md`
- **proposer:** ChatGPT (adversarial-review track, via Will)
- **status:** accepted (itemized below; no items rejected)
- **area:** P1 event spine — code hardening, process protocol, slice ordering
- **affected_decisions:** none locked; refines DECISIONS.md 2026-07-05 entries
- **requires_will_decision:** no — all items are implementation detail (§14.2) or restate existing spec (§7 pre-call hooks, §11 branch discipline)
- **conflicts_with_locked_decisions:** none
- **summary / resolution by item:**

| # | Item | Disposition |
|---|---|---|
| 1 | Host-only git, made operational | **Accepted.** GIT_SETUP.md gotcha strengthened to cover read-only commands (a sandbox `git status` corrupted the index on 2026-07-05); p1_progress.md already warns. |
| 2 | Idempotency collision: same key + different payload → reject as conflict | **Accepted, implemented** in `events.ts` + tests. Reject-as-conflict chosen, per proposal's own preference. |
| 3 | Budget hard-cap checked pre-append, server-side; near-cap crossing tests | **Accepted as design constraint for the cost-ledger slice.** Consistent with master prompt §7 (deterministic pre-call hook, hard cap blocks); recorded in p1_progress next-steps. No code this slice. |
| 4 | Keep appendEvent the sole public write path; batch helper before object-model needs it; partial-update test | **Accepted.** Rollback test implemented now; batch helper deferred to the object-model slice where the need is concrete. |
| 5 | Reducer placeholder mappings stay isolated; client never bakes them in | **Accepted / already satisfied** (mappings centralized in `reducers.ts`, marked as placeholders, DECISIONS.md prediction to check at P1 exit). Client-side rule noted for the SPA slice. |
| 6 | Object-model closure slice before SSE | **Accepted** as the chosen order: object model → cost ledger → SSE → NoopHarnessEngine → SPA/orb/reload detector. |
| 7 | Verify on Will's Windows host, record Node version | **Accepted.** Host `npm test` is in the handoff commands; p1_progress.md gets the host Node version once Will runs it. |
| 8 | plain_language edge cases + max length | **Accepted, implemented**: missing/empty/whitespace tests + 2000-char cap (derivation in DECISIONS.md). |
- **acceptance_implications:** adds event-spine tests (collision, rollback, length cap) to the P1 suite; cost-slice acceptance must include near-cap crossing + ledger/projection reconciliation tests.
