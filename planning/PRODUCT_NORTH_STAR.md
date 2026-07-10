# GROVER product north star — the place Will chooses to think and act

**Status:** product interpretation and design guidance, not a replacement for the binding master prompt. Proposed phase/spec implications are isolated in `planning/proposals/proposal_002_daily_driver_contract.md`.

## The human promise

GROVER should become the place Will opens when he wants to understand something, make something, decide something, remember something, or improve the system that helps him do all four.

The goal is not to collect AI features behind a dashboard. The goal is continuity: one trusted environment that knows the current projects, remembers the relevant parts of Will's history and preferences, can use the right tools for the job, and can be reshaped through ordinary conversation.

The emotional standard is simple: opening GROVER should feel like returning to a capable workspace that already understands where things were left—not briefing a new contractor, hunting through six apps, or supervising a machine that constantly demands attention.

## What “one hub” means

One hub does **not** mean one giant undifferentiated chat or one dashboard crowded with modules. It means:

- **One front door.** Will can state a goal naturally without first choosing Research, Coding, Quant, Lifestyle, or Builder.
- **Many bounded workspaces.** Projects and life domains retain their own context, tools, permissions, artifacts, and privacy boundaries.
- **One continuity layer.** Relevant memory, decisions, active work, and prior artifacts can follow the request when permitted.
- **One trustworthy action model.** Ask, plan, act, build, remember, and schedule are visibly distinct commitments even when they begin from the same composer.
- **One return path.** Background work comes back to a calm inbox/timeline with results, evidence, cost, and the next useful choice.

## Daily-use principles

### 1. Conversation first; internal machinery second

The default surface should start with Will's intent and current work. Events, engines, runs, managers, and evidence exist to create trust, but should use progressive disclosure: a clear human summary first, expandable technical detail second.

Transparency must not become surveillance of the machine. “Working on the settings page; checking it in the browser” is useful. A firehose of reducer events is not.

### 2. The system must distinguish kinds of intent

A single request may be:

- **Ask** — explain, compare, brainstorm, or advise.
- **Work** — research, analyze, write, code, organize, or produce an artifact.
- **Act** — change an external or local state through a tool.
- **Build** — change GROVER itself.
- **Remember** — deliberately add, correct, or remove durable context.

Will should not have to learn command syntax, but GROVER must make the commitment legible before crossing consequential boundaries. Not every conversation should silently become a FeatureRequest or memory write.

### 3. GROVER should reduce orchestration labor

The user should not become the project manager for a swarm of agents. GROVER owns routing, context assembly, retries, verification, and handoffs. It interrupts Will only for a real decision, a named safety boundary, a taste judgment, or a genuinely ambiguous goal.

### 4. Memory must feel helpful, inspectable, and merciful

Useful memory is not maximum retention. It is remembering the right thing at the right time and making it easy to answer:

- What do you know about me or this project?
- Why did you use that information here?
- Is this current or superseded?
- Can I correct or forget it?
- Can this conversation be temporary?

Project continuity should mature before broad life surveillance. Quiet/temporary sessions and a memory-review inbox belong in the long-term product contract even if their implementation is phased.

### 5. Moldability needs a safe user experience

“Change yourself” is the defining differentiator, but it cannot feel like editing a live airplane engine. A self-change should normally provide:

- the interpreted outcome in plain language;
- a visible plan when the change is nontrivial;
- a branch/checkpoint;
- a preview or concrete evidence;
- a clear undo/recovery path;
- a receipt explaining what changed and what it cost.

For small reversible changes, this can remain nearly instantaneous. The safety machinery should increase with consequence, not create ceremony for everything.

### 6. Calm beats impressive

Daily software earns affection by being predictable, quick, and quiet. The orb can carry personality and life. The rest of the interface should prioritize:

- immediate acknowledgment;
- readable hierarchy;
- keyboard-first operation;
- responsive layouts;
- low visual noise;
- graceful empty and offline/not-configured states;
- no dead controls or speculative modules;
- no requirement to watch long-running work.

## Assessment of the current v2.0 scope

The current P0 architecture is strong and should not be reverted wholesale. Event-derived state, evidence-gated completion, engine isolation, cost hooks, namespace boundaries, and the minimal memory core are exactly the foundations a self-modifying personal system needs.

However, the current P0–P5 plan describes a **trustworthy self-building kernel**, not yet the everyday hub in this document. At P5, GROVER may be able to modify itself and remember project facts while still giving Will little reason to open it for ordinary research, coding, planning, or life decisions.

That is acceptable only if v2.0 is named and judged as the kernel milestone—not mistaken for the full daily-driver product.

## Recommended product sequence

1. **v2.0 — Trust kernel:** current Builder + minimal memory + hardening, with the front door designed so non-Builder intents do not become dead ends.
2. **v2.1 — Continuity:** broader but controlled personal/project memory, temporary sessions, memory review, and a usable conversation/workspace history.
3. **v2.2 — First daily domain:** choose the domain Will uses most often (likely research/coding) and make it excellent end to end before adding several shallow modules.
4. **v2.x — Domain expansion:** add quant, lifestyle, business, and home capabilities through the same workspace/action/memory contracts.

The order after v2.0 should be driven by actual weekly use and friction logs, not by the symmetry of the planned domain list.

## Daily-driver evidence

Beyond technical acceptance tests, each product increment should answer:

- Did Will choose GROVER instead of the existing tool for a real task?
- How much briefing or routing did he have to do?
- Did it remember the right context without overreaching?
- Could he leave and return without losing the thread?
- Did the result arrive with enough trust and too little ceremony?
- What made him avoid using it the next time?

Those observations should become product evidence and future regression scenarios. They should not replace mechanical correctness evidence.
