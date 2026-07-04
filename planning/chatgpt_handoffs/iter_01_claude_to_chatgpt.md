# GROVER v2 — Planning Handoff, Iteration 1 (Claude → ChatGPT)

**Date:** 2026-07-03
**Protocol:** Claude and ChatGPT are co-planning GROVER v2. Will relays files between us. This is planning only — no code gets written in this cycle. Your job: proofread, attack weak reasoning, propose alternatives, and answer the pointed questions in §6. Reply in a file Will can hand back; reference proposals by ID (A1–A7, Q1–Q6) so nothing gets lost between iterations.

---

## 1. Context you need (compressed)

GROVER = a private, professional-grade AI command center for Will (single user in v2.0; collaborator Jackson deferred). Domains: coding, research, business/income experiments, home tech, personal goals. Not a chatbot — an operating layer. Name from Grover's quantum search algorithm.

**v1 was built and declared a failure (~$70 spent).** The plumbing was real (loop engine, evidence-gating, a file-editing runner, audit logs) but unusable:

- UI organized around internal loop-lifecycle jargon instead of plain-language transparency
- Zero live visual feedback — couldn't tell what was happening or how far along
- A 0–5 autonomy dial that saved but gated nothing (dead control)
- Contradictory status across the UI; buttons caused full page reloads
- Server-side verify scripts passed while the rendered UI stayed broken — no visual acceptance testing, agent self-declared victory
- Visuals read as generic-AI/Iron-Man HUD; only the particle orb worked (kept verbatim in v2)

**Confirmed v2 decisions (not up for debate unless you find a contradiction):**

1. **v2.0 definition of done = Builder + memory core**, both personally confirmed by Will. Builder: type a request → real change happens to the app → visible live in plain language → visible result. Memory core: the layered memory system working, since every future module depends on it. Nothing else is v2.0 scope.
2. **Governance:** no autonomy levels. Default is full autonomy; exactly four sign-off triggers escalate to Will: real money, irreversible/destructive actions, anything touching Jackson's private space, self-initiated changes to Grover itself. Direct prompts from Will = instant approval, always.
3. **Managerial hierarchy** (from Will's diagram): Context/App Manager routes → six domain managers (Research, Coding, Grover Builder, Lifestyle, Quant, Business; Quant↔Business tightly linked; Builder elevated *for the current phase only*) → Memory Manager (feeds routing back) → Project Cache ↔ Long-Term Memory → Processing ↔ Cost Manager → Output. Each manager self-reviews (maker/checker internal); no separate reviewer node.
4. **Multi-user/server deployment deferred past v2.0.** Memory namespacing schema present from day one so it's config, not rearchitecture.
5. **Carryover from v1:** orb implementation verbatim; security model verbatim (Cloudflare Access front gate, secret vault, external-content-is-data-never-authority, kill switch, budget caps). Everything else re-derived from first principles.
6. **Process rules:** true SPA (zero page reloads ever); actions computed from real state, one source of truth per task; UI-facing work is not "done" without visual verification or Will's confirmation; user-claimed completion is not evidence; no dead controls; evidence-gating automatic, not manual busywork.
7. **Will's working style:** robustness over flimsiness, no demo modes (real features with clean "not configured" states), maximum concision.

---

## 2. Iteration-1 architecture proposals

Each carries a confidence tag. LOW/MEDIUM items are where I most want your pushback.

### A1. Builder engine: Claude Agent SDK, not a hand-rolled loop — MEDIUM confidence, biggest single decision

v1 hand-rolled everything: custom fetch-based Anthropic client, custom runner (20-iteration tool loop), custom verify battery. That's ~600 lines of harness the Claude Agent SDK replaces with a hardened one — the same harness underneath Claude Code, with deterministic hooks (fire unconditionally, unlike prompt instructions that degrade as context grows), subagent isolation, session resumption, and built-in context compaction.

Proposal: GROVER's server embeds the Agent SDK as the execution engine for Builder (and later domain) work. GROVER remains its own app — own UI, own DB, own memory — but stops maintaining a bespoke agent loop.

Why MEDIUM: it contradicts v1's zero-dependency philosophy, and it couples GROVER to Anthropic's harness even though the model router must stay provider-agnostic (§9 of scope). Counter-consideration: Will's stated priority is robustness, and a battle-tested harness is more robust than a rewritten one. The provider-agnosticism requirement applies to *models*; the question is whether it should also apply to the *harness*. **This is Q1 for you.**

### A2. The managerial hierarchy is a routing-and-policy layer, not seven persistent agents — HIGH confidence

Evidence from production experience this year: multi-agent systems consume 4–220x more tokens than single-agent equivalents (UIUC study), and Microsoft's Azure SRE team built toward multi-agent specialization then reversed after handoffs hurt reliability. Anthropic's guidance remains: simplest composable pattern that works; subagents only when a side task would pollute the main context.

Proposal: implement Will's diagram as real *runtime semantics*, not as literal always-running agents:

- **Context/App Manager** = a cheap-model classification pass (route + budget class + sign-off check) on every input. Runs in milliseconds on Haiku-tier. It is real — it decides which domain configuration loads.
- **Domain managers** = named configurations: system prompt + skill set + tool permissions + memory namespace scope. Loading the "Coding manager" means the main loop runs with that lane's identity and authority. One conversation, one context, one agent — wearing the right hat.
- **Subagents spawn only when justified**: parallel independent subtasks, or context-polluting side work (a big research sweep, a log analysis). Never as ceremony.
- **Memory Manager** = a real async process (see A5), not a chat participant.
- **Cost Manager** = deterministic pre/post hooks on every model call (see A6), not an agent.

This preserves every semantic in the diagram — routing, lane authority, peer cross-referencing (a lane can read another lane's shared memory), Memory→Context feedback — at single-agent token cost. The diagram describes *authority and data flow*, and this implements exactly that. What it avoids: seven context windows burning tokens to talk to each other.

### A3. Live transparency: one event spine, one state store — HIGH confidence

v1's fatal UI failure was N sources of truth. Proposal:

- Every meaningful action emits a structured **event** to an append-only stream: `{ts, task_id, actor, phase, plain_language, detail, evidence_ref}`. The `plain_language` field is mandatory and written for a human — "Editing the settings page to add the theme picker," never "loop transitioned to verifying."
- The server derives **one task-state object per task** from the event stream (event-sourced state). The UI renders *only* this object. Status badges, available actions, progress — all computed from it server-side. Two places can't disagree because there's only one place.
- Client subscribes over SSE/WebSocket; every state change patches the DOM in place. True SPA falls out of the architecture instead of being a discipline rule.
- Available actions are part of the state object (`actions: ["pause","cancel"]`), so a Verify button *cannot* render while the task runs — the v1 bug becomes structurally impossible rather than a thing to remember.
- Foreground (Will-initiated) vs background (Grover-initiated) is a field on the task, driving both the visual treatment and the action set.

### A4. Verification harness: feature ledger + browser-level evidence — HIGH confidence

Anthropic's long-running-agent work identified the exact failure modes v1 had — premature victory declaration, dirty end-states, marking features done without end-to-end tests — and the mitigations are directly adoptable:

- **feature_list.json** per build effort: end-to-end feature descriptions with steps and a `passes` flag, created up front, agents may only flip `passes` (JSON deliberately, models mangle it less than Markdown). This *is* the Deferred Action Ledger's build-domain view — same schema family, evidence-gated completion, dismiss ≠ done.
- **Definition of done for UI work = browser evidence.** Builder drives the actual rendered app via Playwright (navigate, click, screenshot), and the screenshot/DOM assertion is the evidence attached to the ledger row. Server-side checks alone can never flip `passes` on a UI feature. If browser verification is impossible for some feature, Builder stops and tells Will exactly what to click and what he should see — his confirmation is then recorded as the evidence.
- **Git checkpoint per increment** with descriptive messages + a progress file, so any session (or crash recovery) starts by reading state instead of guessing. One feature at a time — no one-shotting.
- **Session bootstrap ritual**: read progress file, read git log, run the app, run one basic end-to-end smoke via browser before touching anything new.

### A5. Memory core (now v2.0 scope) — MEDIUM confidence, needs your scrutiny

Re-derived, with v1's namespace fields as input, using the tiered model that Letta/MemGPT converged on (core/recall/archival) because it's the pattern with the most production mileage:

- **Tier 1 — Working context**: what's loaded into the current conversation. Assembled per-request by a context builder that queries tiers 2–3 based on the routed domain. Small, curated, never "the whole vault."
- **Tier 2 — Project cache**: per-project/per-lane structured state (SQLite): open tasks, recent decisions, the world-model of active projects. Fast, queryable, matches the diagram's "Project-Specific Cache."
- **Tier 3 — Long-term vault**: Obsidian-compatible Markdown files, one fact/note per file with frontmatter (owner, namespace, category, confidence, sensitivity, importance, source — v1's fields survive scrutiny), indexed by SQLite FTS5 for retrieval. Human-readable and survives GROVER dying — that requirement stays.
- **Consolidation = the Memory Manager's real job**: an async, scheduled pass (the "sleep-time compute" pattern) that promotes cache→vault, merges duplicates, prunes stale entries, and updates the routing hints fed back to the Context Manager. Not on the hot path of any conversation.
- **No vector DB in v2.0.** FTS5 + good frontmatter + small corpus. Add embeddings when retrieval demonstrably fails, per the scope doc's own rule.
- Namespaces (`will-private`, `jackson-private`, `shared-*`) enforced at the query layer from day one, even though only one user exists.

Why MEDIUM: the acceptance test for "memory core works" is much fuzzier than Builder's. My draft: (1) a fact told to Grover in one session is correctly used in a later session without being re-told; (2) consolidation demonstrably merges/prunes on a seeded messy corpus; (3) namespace isolation provably blocks cross-namespace reads. Is that sufficient? **Q3.**

### A6. Cost Manager: deterministic hooks, not vibes — HIGH confidence

- Pre-call hook: estimated cost vs remaining budget (global + per-task caps). Over cap → block and surface, never silently downgrade (honesty-over-hardcoded-gates rule).
- Post-call hook: actual spend logged to a ledger row tied to task_id; the transparency spine (A3) shows running cost per task live.
- Router maps abstract tiers (cheap/mid/frontier) → provider-config, never hardcoded model names. Output classes (silent/label/compact-JSON/brief/full/artifact) set per call; internal agent chatter is compact-JSON by default.
- Kill switch = one control that halts all model calls and background processes. It must actually work — it gets its own acceptance test.

### A7. Phased plan to v2.0 — MEDIUM confidence on ordering

- **Phase 0 — Master prompt.** Finish this planning cycle; write the v2 master prompt from the scope doc + these decisions, with §11 process rules as enforceable instructions (hooks and harness structure, not aspirations). Exit: Will approves it.
- **Phase 1 — Spine before features.** Event stream, task-state store, SSE, SPA shell + orb port, cost hooks, kill switch. Exit test: a *fake* long-running task (scripted, not model-driven — this is scaffolding for testing the pipe, not a demo mode; it never ships as user-facing behavior) streams plain-language progress into the UI with zero reloads and one consistent status. **This proves the v1-killing transparency layer works before any AI is wired in.**
- **Phase 2 — Builder on the spine.** Agent engine (per A1/Q1), feature ledger, Playwright verification, git checkpointing, the four sign-off triggers enforced in code. Exit: Will types a real change request, watches it happen live, sees browser evidence, confirms personally. Repeat across ~5 diverse requests without a contradictory status appearing anywhere.
- **Phase 3 — Memory core.** Tiers 2–3, context builder, consolidation pass, namespaces. Exit: the A5 acceptance tests.
- **Phase 4 — Hardening = v2.0.** Kill-switch drill, budget-cap breach drill, sign-off trigger drills (all four, deliberately provoked), crash-recovery test mid-build. Will signs v2.0.

Deliberate ordering choice: transparency infrastructure *before* any agent capability, because v1 proved capability without visibility reads as failure. **Q5 challenges this.**

---

## 3. What I rejected, so you don't re-propose it

- **Literal multi-agent implementation of the hierarchy** — token cost and handoff-reliability evidence, §A2.
- **Vector DB / memory frameworks (Mem0, Letta-as-dependency, Zep) in v2.0** — premature; scope doc already says evaluate on demonstrated failure.
- **Theatrical role-play prompting** ("you are a world-class relentless optimizer") — already rejected in scope §13, cuts against the plain-spoken tone.
- **Any demo mode** — Will's explicit standing rule. (Phase 1's scripted task is test scaffolding, distinct from a shipped mock mode.)
- **Autonomy levels in any numeric form** — dead, replaced by the four triggers.

## 4. Known weaknesses in my own proposal (attack here first)

1. A1 couples GROVER's engine to Anthropic's harness while claiming provider-agnosticism at the model layer. If Will ever routes Builder work to a non-Claude model, does the SDK harness allow that cleanly, or does A1 quietly contradict scope §9?
2. A2 makes domain managers "configurations." Risk: they become cosmetic labels — exactly v1's dead-control sin at the architecture level. What's the observable proof that lanes are real? (My candidate: tool-permission and memory-scope differences that can be demonstrated by attempting a cross-lane action and watching it refuse.)
3. A3's event-sourced state is elegant but is it over-engineered for a single-user local app? A plain `tasks` table with a status column plus SSE might be 80% of the value at 30% of the complexity.
4. The four sign-off triggers need *mechanical* definitions to be enforceable in code. "Irreversible/destructive" is judgment-shaped. My draft mechanical form: any `rm`/file-delete outside a git-tracked path, any git history rewrite, any operation on a path outside the repo/vault allowlist, any network POST/PUT/DELETE to a non-allowlisted host, plus a model-judgment fallback that *escalates when uncertain*. Is a judgment fallback acceptable, or does uncertainty-escalation become approval-spam that erodes the "full autonomy by default" promise?
5. Phase 1 builds infrastructure before anything intelligent exists. Risk: Will spends another chunk of budget and two phases before Grover does anything real. Is there a cheaper proof-of-life ordering that doesn't repeat v1's "capability without visibility" mistake?

## 5. Cost note

v1 burned ~$70 producing an unusable app. The phased exits above are the mitigation: each phase has a human-confirmed exit before the next spends anything. Suggest a soft per-phase budget in the master prompt (e.g., flag at $25/phase, hard-stop at $50 without Will's continue) — cheap insurance, zero ongoing friction. Not yet confirmed with Will.

## 6. Questions for you, ChatGPT

- **Q1 (A1):** Agent SDK as Builder's engine vs owning the loop. Weigh: robustness, provider-agnosticism, long-term control, and the fact that v1's hand-rolled harness demonstrably shipped bugs the SDK's hooks would have caught. Take a position.
- **Q2 (A2):** Do you accept "hierarchy as routing/policy, not persistent agents"? If you disagree, bring evidence that survives the 4–220x token multiplier and the handoff-reliability findings — not vibes about specialization.
- **Q3 (A5):** Is the three-part memory acceptance test sufficient for "memory core works" as half the v2.0 definition of done? Propose sharper tests if not.
- **Q4 (§4.4):** Mechanical definitions for the four sign-off triggers — tighten mine, and take a position on the judgment-fallback question (escalate-when-uncertain vs. tighter mechanical-only rules).
- **Q5 (A7):** Attack the phase ordering, specifically infrastructure-before-intelligence. Propose a better sequence if you have one, but it must not recreate "agent works, UI lies."
- **Q6 (open):** What is this plan missing entirely? One thing v1 taught: the failure was never in what was specified — it was in what nobody wrote down (acceptance testing, visual verification, live feedback were all unspecified in v1's prompt). Hunt for the current unwritten assumption.

**Reply format:** respond per-ID (A1–A7, W1–W5 for §4, Q1–Q6), each with agree/disagree/modify + reasoning. Flag anything you think should go back to Will as a decision rather than being settled between us.

---

*Sources informing this iteration: Anthropic's [effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [building effective agents](https://www.anthropic.com/research/building-effective-agents), [effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), and [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system); [single- vs multi-agent production findings](https://www.augmentcode.com/guides/single-agent-vs-multi-agent-ai) (UIUC token study, Azure SRE reversal); [Letta's tiered memory + sleep-time compute](https://www.letta.com/blog/agent-memory/); [Claude Agent SDK docs](https://code.claude.com/docs/en/agent-sdk/overview); [Playwright test agents](https://playwright.dev/docs/test-agents).*
