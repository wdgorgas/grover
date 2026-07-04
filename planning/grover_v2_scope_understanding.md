# GROVER v2 — Current Understanding of Project Scope

**Purpose of this document:** not a rebuild plan yet, not a prompt for Fable. This is a checkpoint — my current understanding of what GROVER is supposed to be, pulled from the original master prompt plus everything corrected in v1's build. You read it, correct whatever's wrong, and that becomes the real basis for the v2 master prompt. Where I'm genuinely unsure or inferring rather than recalling something you said, I've flagged it.

---

## 1. What GROVER is, in one paragraph

A private, professional-grade AI command center — not a chatbot, an operating layer — that helps you manage coding/self-building, research, business/income experiments, home tech, and personal goals. It should feel like a serious tool you'd use daily, not a toy or a generic AI wrapper. The name comes from Grover's quantum search algorithm; the acronym (General of Resource Optimization and Varying Expertise Requests) is a JARVIS-style flourish, not the point.

---

## 2. What actually went wrong in v1 (this is why v2's priorities are what they are)

- **Loops became the identity instead of a technique.** The original spec had a section literally titled "Grover Should Be a Loop-Building System." Fable took that as architecture, not a suggestion, and built the entire Builder tab around loop-lifecycle states (proposed/approved/ready/running/verifying) as the primary UI. You never wanted that — you wanted Grover to *optionally* use a structured process internally when it judges that's the best way to build something, invisibly, with zero ceremony surfaced to you.
- **No visual, live transparency.** You could not tell what was actually happening, where, or how far along it was. Status badges and buttons contradicted each other (a "running" task also showing a naive "Done" button elsewhere).
- **Verification/approval friction on things you directly asked for.** You explicitly said a direct prompt from you should count as instant approval — full stop — and that only Grover's own self-initiated ideas should ever need a greenlight from you. This got tangled up in the loop-first architecture above.
- **Controls that did nothing.** The autonomy dial (0–5) could be set and saved but had zero effect on behavior anywhere — a control that looks functional but isn't is worse than no control.
- **No acceptance-testing discipline.** Fable had a text-based verify script (checks server logic/syntax) but no way to confirm UI behavior actually worked, and no instruction to stop and ask you to test before declaring something done. Bugs that only show up in the rendered page kept shipping.
- **Net effect:** real engineering existed underneath (a working loop engine, evidence-gating, an actual runner that edits files and runs tests, audit logs) — but none of it added up to something that felt functional, professional, or trustworthy to use. Competent plumbing, wrong house.

**The throughline for v2:** be extremely explicit about what's core identity vs. optional implementation detail, make "can Will see what's happening right now, in plain language" a non-negotiable, and never let an agent self-declare a UI feature done without either visual verification or your confirmation.

---

## 3. Non-negotiable v2 priorities, in order

1. **Builder works, visibly, end to end — nothing else matters until this is true and you've personally confirmed it.** You type a request → something real happens to the app → you can see it happening in plain language, live, front and center → you can see the result. This is the whole v1 promise that never actually landed.
2. Everything else (Research Desk, Income Lab, Inspiration Inbox, Health, Morning Briefing, Media/Home, Voice/Hardware) stays exactly what it was in v1: real modules on the roadmap, but explicitly *not v2.0 scope*. Design the module system so they slot in later; don't build them now.

---

## 4. Core philosophy — trimmed to what's actually load-bearing

Ethics-heavy framing isn't the point, and re-reading §4 as it stood, a lot of it wasn't either. This compresses to one governing sentence plus four practical rules that follow from it.

- **Best possible app, no corners cut.** That's the standard — not "responsible AI," not "safe by design," just: is this the best version of this thing that could exist. Everything below serves that, not a separate ethics layer bolted on top.
- **Your direct prompt is the approval.** Anything you type and ask for — code changes, UI changes, feature builds — executes immediately. No confirmation dialog, no pending state, no narrated verification step.
- **Grover's own self-initiated ideas always need your greenlight.** No exceptions, no auto-approval, regardless of how "low-risk" the system judges something. Now formalized as part of the managerial hierarchy's sign-off model (§6), not a standalone rule.
- **Money is the one real carve-out.** Spending real money isn't reversible the way a code change is, so financial actions always route through sign-off (§6) regardless of who initiated them.
- **Honesty over hardcoded gates.** If a setting exists, it must actually do something and be reported accurately everywhere — never silently clamped or hardcoded around. This was the single biggest v1 failure (the dead autonomy dial) and it's a standing rule for every control in v2.

The "AI as exoskeleton, not replacement" / novelty-labeling framing from v1 still has real value, but it's a Research Desk *technique*, not a headline philosophy — moved to §8.

---

## 5. UI/UX identity

- **Live build transparency is the single most important UI requirement**, specifically for Builder: what's being built, where, how it's progressing — plain language, live, unmissable. Test: someone who's never seen the app and doesn't know what a "loop" is should understand what's happening at a glance.
- **Visual direction, corrected after v1 shipped looking "Iron-Man-y, very AI, too early-2010s-futuristic, no humanness":** the defining success criteria for v2's look are artistry, modern/freshness, animation, and smoothness — not "command center" or "HUD." Benchmark against best-in-class *consumer/creative* products (think Linear, Arc, Things, Raycast — smooth, human, considered) rather than sci-fi dashboards or generic AI-tool chrome.
  - **Explicit reject list:** glowing circuit-board textures, HUD reticles/scan-lines, generic dark-SaaS-dashboard layouts, anything that reads as "template a model would generate for an AI product."
  - **Keep exactly as-is:** the living, stateful particle-orb as Grover's "face" — you specifically liked the colors, sizing, and state-driven animation (idle/reasoning/creative/high-attention/success/error). It doesn't need a redesign; the rest of the app needs to earn the right to sit next to it.
  - *Arcane*/*Spider-Verse* inspiration (color richness, particle/data-art geometry) is fair game for the orb and accent language specifically — not a license to make the whole UI comic-styled or busy.
- **Minimalist base, so the artistic elements pop.** Restraint everywhere except the orb and its state changes — a busy interface makes the orb just more clutter; a quiet one makes it read as alive and deliberate.
- **Theme should be customizable from day one** as a token system (semantic CSS variables, not hardcoded colors) — light mode, dark mode, multiple named palettes swappable without touching component code.
- **One task, one authoritative status.** If something has an associated tracked process, its status/actions must never be shown two different, possibly-contradictory ways in two different places.
- **No dead controls.** Every visible button must do something, or it shouldn't exist.
- **Conversational self-improvement.** You should be able to talk through a desired change with Grover directly — it restates/plans if genuinely ambiguous, otherwise just builds it, and reports back like a real exchange, not a changelog line.
- **A generalized "Deferred Action Ledger"** (your "Doctor app" idea, generalized): one schema for anything noticed-but-not-yet-actioned, domain-tagged (grover-dev / home-tech / health / business / research / personal-goal), with fields for status, greenlighter, cost/effort estimate, and — critically — no "done" without attached evidence of what was actually executed, and a separate "dismiss" action that doesn't lie about completion. The health domain here is explicitly a pattern-tracking journal, never a diagnostic tool.
- **Draggable, expandable task widgets**, including in the Command Center itself (not buried in a sub-tab): a waiting task should be a real draggable object you can pull into the chat to workshop, not just a line of text.
- **Conversational responsiveness is a first-class requirement**, separate from task latency: streaming responses, an immediate visible acknowledgment the moment something takes real work, no dead pauses in back-and-forth conversation — even if the real task takes a while in the background.

---

## 6. Governance model — managerial hierarchy replaces the autonomy dial

The 6-level autonomy dial is dead. It was ChatGPT's compromise, not something you asked for, and the real rule is simpler: **default is full autonomy — Grover just does it. A short, named list of "important enough" things requires your sign-off.** No numeric scale, nothing to "set" globally. This is now one of the core identities of the project, per your `Grover Nqj.pdf` sketch.

**What the diagram says (my read of it, purple = pipeline flow, orange = peer relationships):**

Grover Input flows into a **Context/App Manager** — a top-level dispatcher that reads the request and routes it. It fans out to six domain managers, drawn as peers: **Research, Coding, Grover Builder, Lifestyle, Quant, and Business** (Quant and Business shown with a tight bidirectional link, suggesting Quant is a close collaborator of/specialist inside Business rather than fully independent). All six domains have orange peer-relationship links to each other — meaning a request can span domains and the managers can reference each other directly rather than only reporting up. All six feed down into a **Memory Manager**, which also arcs back up to inform the Context/App Manager's future routing (memory shapes dispatch, not just recall). Memory Manager splits into **Project-Specific Cache** and **Long-Term Memory**, linked bidirectionally (promotion/demotion between them). Cache feeds into **Processing**, which has a bidirectional relationship with a **Cost Manager** sitting alongside it (pre-check the budget, post-log the actual spend). Processing produces **Grover Output**.

**How this replaces autonomy levels:** each domain manager owns full authority to act inside its own lane by default — that's "just do it." Sign-off is not a level, it's a short, explicit list of triggers that escalate to you regardless of which manager is involved: real money above the existing carve-out, anything irreversible/destructive, anything touching Jackson's private space, and any self-initiated (not directly prompted) change to Grover itself. Everything else — Grover deciding on its own how to research something, how to structure code, how to draft a business experiment — just happens, and you see it happen live (§5) rather than being asked to approve it first.

**Diagram questions — resolved:**

- **Grover Builder's position:** confirmed elevated, not a sixth equal peer. One real nuance you added: Builder is architecturally privileged now because it's the current priority, but the *expectation* is that once Grover is actually built out, Builder gets used sparingly — it's not meant to be a permanently high-traffic manager, just the most important one during the build phase. Worth carrying this into the master prompt explicitly: Builder's centrality is a *current-phase* property, not a permanent structural ranking, so the architecture shouldn't hardcode "Builder is special forever" — just "Builder has elevated authority/priority for now."
- **Coding vs. Grover Builder:** confirmed separate — Builder is specifically for developing Grover itself; Coding is for your personal projects, and is linked to Research/Business/Quant (you write code *for* those domains' work).
- **Quant↔Business:** confirmed separate managers, deliberately linked because they can collaborate — not a strict sub-specialty relationship. Keeping Quant's own rigor checklist (§8) and sign-off triggers as its own thing, distinct from general Business decisions, still stands.
- **No separate reviewer node:** confirmed intentional — you assumed every domain manager reviews its own work rather than routing through a distinct checker. Carrying forward as: each domain manager does its own internal maker/checker pass (build, then self-verify) before anything reaches Memory Manager/Processing — no separate human-facing review gate, no separate reviewer agent.
- **Memory Manager → Context/App Manager feedback:** confirmed — informs future routing/context, not override authority.

This section's job in the eventual master prompt is to describe this hierarchy as the actual runtime architecture (each "manager" is a real orchestration role, not just a UI label) — not just a governance metaphor.

**Security (unchanged from v1, still holds):** Cloudflare Access as the front gate rather than a custom login system, secret vault, audit logs, sandboxed automation, prompt-injection defense (external content is data, never authority), kill switch. Threat model: a compromised Grover could expose API keys, repo access, files, browser sessions, automation privileges — narrow tool permissions by default, no public registration, no direct origin exposure. Global budget in the low hundreds of dollars to start; you're comfortable losing all of it, but Grover still needs budget caps, spend logs, and a kill switch regardless (this is what the Cost Manager ↔ Processing relationship in the diagram operationalizes).

---

## 7. Users, memory, and personalization

- Shared by you and Jackson, both admin-level initially. Memory is namespaced: your-private / Jackson's-private / shared-business / shared-grover-dev / shared-home-tech, with clear ownership metadata (owner, category, confidence, sensitivity, importance, source).

**Open architecture question you raised — how does Jackson actually get a distinct login if the app is just a file you send him:**

This is a real fork, not a detail, because it depends on where Grover physically runs:

1. **Server-hosted (what the original spec assumed):** Grover runs continuously on your own machine/home server, exposed via Cloudflare Tunnel + Cloudflare Access. You and Jackson each authenticate with your own Cloudflare Access identity (your own emails), and the app resolves "who is this" from that identity header — both of you hit the same running instance and the same shared memory. This is the only option that actually delivers the shared-business/shared-grover-dev memory the spec wants, but it means v2 has to actually get deployed to a server, not just run locally on your PC via Cowork/Node — that hasn't happened yet.
2. **Local multi-profile, one machine:** v1's code already had a basic version of this (a `users` table, a "switch user" control) — but it only works if you and Jackson are both using the *same physical machine*. Doesn't match "I send Jackson the file" at all.
3. **Two independent local installs:** each of you runs your own copy on your own machine, fully separate databases. Simplest to stand up, no server needed — but there's no shared memory, no single source of truth, and you'd need to build real sync between two SQLite databases to fix that, which is its own project.

**My recommendation:** defer Jackson's access entirely for v2.0. Ship single-user (you) first, keep the memory-namespacing schema from day one so it's a config change rather than a rearchitecture later, and only take on real server deployment + Cloudflare Access once the single-user app has actually proven itself — consistent with the "Builder works first, everything else waits" priority in §3. Flag if you want it sooner; it's a real infra decision either way, not something I can silently assume.
- **A living "Will Profile"** — not a one-time onboarding form. Structured, human-readable, editable files (research philosophy, communication style, lifestyle preferences, business risk tolerance, quant standards) seeded from what's already explicit in the spec, grown through conversation (you approve/edit what Grover proposes to remember), expanding as new modules come online.
- Layered memory system: raw logs, structured facts, semantic/retrieval index, episodic history, project world-models, and an active context builder deciding what's relevant per prompt. Obsidian-compatible Markdown vault as the human-readable surface so the knowledge survives even if Grover breaks.
- Don't over-invest in memory tooling (Mem0/Letta/Graphiti/Qdrant/etc.) until Postgres + pgvector + the Markdown vault demonstrably falls short of something Grover actually needs — evaluate when there's a real problem, not proactively.

---

## 8. Module roadmap (design for, don't build yet, except Builder)

- **Research Desk** — literature search/synthesis, contradiction mapping, STORM-style multi-perspective research mode, novelty skepticism, preserving your independent research taste.
- **Income Lab** — business experiment tracking, an upper-management agent council (strategist/skeptic/legal/finance/execution/alignment), converting viral claims into testable experiments rather than trusting them. **Quant work specifically needs real rigor**: walk-forward/purged cross-validation only, mandatory paper-trading before autonomy escalation, live-vs-backtest divergence as an automatic kill trigger, position-sizing caps (e.g., never above half-Kelly), preferring an ensemble of small understood edges over one complex model, and a written kill condition decided before anything goes live — because backtested performance is an upper bound, never an expectation.
- **Inspiration Inbox** — ingesting external ideas/claims (posts, papers, repos) and converting them into experiments/features/rejections rather than chasing hype.
- **Health/Wellness, Morning Briefing, Media/Home tech** — future modules, structured state rather than pure chat memory.
- **Voice/Hardware layer** — explicitly deferred, and explicitly *not* routed through Siri by default. Preference order when it's eventually built: dedicated hardware with its own wake-word chip (necklace/watch) > a physical non-Siri trigger (e.g. an Action Button that just launches the app, no assistant parsing) > Siri/Shortcuts as an absolute last resort you'd have to explicitly ask for. Desktop/PC is the primary interface until then.

---

## 9. Model/provider strategy

- Claude (Fable/Opus tier) is the default for the most capable work; Sonnet/Haiku for the day-to-day middle and cheap tiers.
- Explicitly not locked to one vendor: OpenAI as a credible fallback, Kimi/DeepSeek-class providers as a candidate ultra-cheap high-volume tier, local/self-hosted models once there's GPU headroom, all evaluated empirically rather than assumed.
- The router should define abstract capability tiers (cheap/mid/frontier) mapped to a swappable provider — never hardcoded to one vendor's model names.

---

## 10. Cost governor

- Goal is minimizing cost per accepted useful outcome, not raw token minimization.
- Route by task type: deterministic code → cheap model → mid-tier → frontier → human review, escalating only when needed.
- Output classes matter (silent/label-only/compact JSON/brief summary/full response/artifact) — internal agent chatter should be compact, not full prose.
- Real current pricing (Claude, as the default/reference — re-benchmark others as they're added): Haiku ≈ $1/$5 per MTok in/out, Sonnet 5 ≈ $2/$10 (intro, rising later in 2026), Opus 4.8 ≈ $5/$25, Fable-tier ≈ $10/$50. Cache reads at ~0.1x input price; batch API ~50% off for non-interactive work.

---

## 11. Development process rules (new, and probably the most important addition for v2)

- **Definition of done for anything UI-facing:** a passing automated/server-side check is not sufficient — it cannot see the rendered page. Either verify visually, or stop and tell you exactly what to click and what you should see, and wait for your confirmation before moving on.
- **True SPA — zero page reloads, anywhere, ever.** This is a hard constraint, not a preference. Every state change (task status, verify result, settings change) updates in place.
- **Actions are computed from real state, never assumed.** A "Verify" or "Done" action must not render as clickable unless the underlying process has actually finished — this was a direct v1 bug (a task labeled "running" still showed a working Verify button, and clicking it reloaded the page). Status and available actions come from one source of truth per task, never two places that can disagree.
- **Background/automated processes get a different, more restricted action set than foreground/user-initiated tasks.** Not the same buttons on every card regardless of what kind of task it is — the UI should visually and functionally distinguish "you asked for this" from "Grover is doing this on its own in the background."
- **No self-declared victory, but evidence-gating should be invisible, not manual busywork.** An agent should not decide a feature is finished without real evidence (diff, output, test result, screenshot) attached automatically as part of doing the work — but you should not have to manually check off or "click done" on every routine build step. Reserve your actual manual sign-off for the "important enough" tier defined in §6, not for babysitting normal progress.
- **User-claimed completion is not evidence.** v1 accepted self-reported/user-provided "yes it's done" as ground truth more often than not. Grover should trust its own verification, not a claim it can't check.
- **Scope discipline per session.** Don't context-switch across unrelated modules in one build pass — Builder until it demonstrably works is the whole job right now.
- **Architecture decisions get derived, not copied.** Where v2's master prompt needs real pipeline detail (memory pipeline, deployment specifics, quant pipeline, cost governor internals), each choice should be reasoned from first principles with a clear, simply-explained rationale for why it's the best available option — not carried forward from v1's doc just because it was already written down.

---

## 12a. Decisions locked in the planning cycle (2026-07-03, iterations 1–3)

- **Sign-off triggers are now FIVE:** the original four plus **security-boundary changes** (auth/Cloudflare, secret vault, tool-permission expansion, sandbox/allowlist expansion, public exposure, write-privileged integrations, prompt-injection policy, kill-switch/audit behavior). Will delegated the call; explicit fifth trigger chosen over folding into "destructive." §6's "four" is superseded by this entry.
- **Budget guards:** $25 soft / $50 hard per development phase; hard stop requires Will's explicit continue.
- **Memory:** v2.0 = minimal Builder/project memory core only. Broad personal-life memory is the flagship v2.1 feature, built first once Will confirms v2.0. v2.0 schema must not block v2.1 (namespaces/provenance/vault format accommodate life domains from day one).
- **Builder engine:** Claude Agent SDK behind a replaceable `ExecutionEngine` adapter; GROVER owns task status, cost ledger, sign-off, memory writes, FeatureRequest lifecycle, UI state. Engine-swap acceptance test required.
- **Builder object model:** `FeatureRequest → BuildRun → AcceptanceCheck → EvidenceAsset → GitCommit/MemoryUpdateProposal`, SQLite-authoritative; agent-facing feature JSON is a generated projection (only evidence-linked `passes` flips accepted back).
- **Team:** Jackson joins planning now with an identical Claude+ChatGPT workflow, coordinated via the git repo (see `PLANNING_BOARD.md`); his GROVER login remains post-v2.0.

## 12. Open questions — RESOLVED 2026-07-03

- **v2.0 definition of done = Builder + memory core.** Not Builder alone: the layered memory system (§7) must also be working, since every future module depends on it. Both must be true and personally confirmed by Will.
- **Multi-user/Jackson: deferred past v2.0.** Ship single-user; keep memory-namespacing schema from day one so it's a config change later.
- **Sign-off triggers: complete as-is.** The four (real money, irreversible/destructive, Jackson's private space, self-initiated Grover changes) are final. Everything else is full autonomy.
- **v1 carryover:** orb implementation ports verbatim (Will's call). Claude's delegated call on the rest: security model (Cloudflare Access, secret vault, prompt-injection stance, kill switch) carries forward as-is — the threat model hasn't changed and re-deriving it adds risk, not quality; memory schema gets re-derived from first principles since memory core is now v2.0 scope (v1's namespace/ownership fields are candidate input, not law).

---

## 13. Reference: candidate techniques (external research, non-binding)

You had Grok compile a broad list of AI-assistant engineering techniques — prompting patterns, loop engineering, memory vaults, subagent orchestration, cost/effort tiering, domain-specific patterns. Explicitly not law, per your note — logged here as a toolbox to draw from once the master prompt gets written, not a spec change.

- **Already decided, just framed differently:** loop engineering is §4's "optional internal technique, never the UI"; the memory vault is §7's layered memory + Obsidian-compatible Markdown; cost/effort tiering is §9–10's capability tiers and output classes; maker/checker is now confirmed (§6) as self-review living inside each domain manager, not a separate top-level gate.
- **Worth evaluating once Builder is real, not now:** git worktrees for parallel safe branches when Grover is working on more than one thing at once; a formal reusable-skill/playbook pattern per domain (so a domain manager isn't re-deriving "how to fetch research sources" or "how to run a backtest" from scratch each time); periodic memory consolidation passes that prune/merge/promote rather than only ever appending; explicit effort-level calibration per call (cheap/fast for routine work, high effort reserved for genuinely hard problems) as the concrete mechanism behind the cost governor.
- **Domain-specific, feeds §8:** multi-agent debate (bull/bear-style) as a candidate technique specifically for Quant/Business calls, where internal disagreement is a better signal than one confident answer; explore → implement → verify as the internal shape of Coding/Builder work (already implied by existing rules, not new).
- **Explicitly not adopting:** theatrical "identity shift" role-play framing ("act as a world-class relentless optimizer"). Cute, but it cuts against the plain-spoken "best app, no corners cut, no ethics theater" tone already set in §4.
