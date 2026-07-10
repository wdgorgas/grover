# GROVER development process — bounded maker/checker loops

**Status:** operational playbook subordinate to the binding master prompt and the repo-root agent contracts.

## Principle

Use loops where GROVER has a clear state, a bounded goal, and an objective way to know whether the next iteration improved the result. Do not loop merely because two frontier models can talk to each other.

The preferred pattern is an independent maker/checker loop coordinated through repository artifacts:

```text
Human/product intent
→ scoped slice + acceptance checks
→ Maker implements
→ deterministic verification runs
→ Checker reviews diff + evidence with fresh context
→ Maker repairs accepted findings
→ verification reruns
→ merge or escalate
```

Claude and GPT may fill Maker or Checker roles, but the process must not depend on a particular temporary model pairing. Role separation and evidence matter more than model branding.

## Required state for every loop

Before the first model call, the slice records:

- goal and non-goals;
- current phase and branch/worktree;
- files/systems in scope;
- acceptance checks and required evidence;
- budget and time limit;
- maximum repair cycles;
- escalation conditions;
- current status and next owner.

The repo—not private chat context—is the handoff surface.

## Roles

### Product owner

Will decides scope, taste, privacy, security boundaries, meaningful cost changes, and ambiguous tradeoffs. He should not be asked to arbitrate routine implementation details or relay messages between models.

### Maker

Implements the smallest slice that can satisfy the acceptance checks. It may not weaken checks, silently change scope, or treat its own prose as evidence.

### Verifier

Runs deterministic tests, browser checks, state/database assertions, security rules, and evidence capture. Verification should be automated where the outcome is mechanical.

### Checker

Starts with fresh context and reviews the goal, binding requirements, diff, and evidence. It searches for contradictions, user-facing failure modes, scope creep, weak tests, and unsafe assumptions. It produces itemized findings with severity and a disposition—not a parallel implementation.

## Stopping rules

Default maximum: one maker pass, one checker pass, and up to two repair cycles.

Stop and escalate when:

- the same acceptance check fails twice for materially the same reason;
- two repair cycles produce no measurable progress;
- checker findings require a scope/security/cost/taste decision;
- the slice reaches its budget or time cap;
- required evidence cannot be produced;
- the models disagree about a binding requirement;
- the branch has drifted beyond the declared files/non-goals.

No agent may respond to a failing loop by editing the acceptance criteria to make itself pass.

## Where autonomous loops fit

Good candidates:

- unit/integration test repair;
- type/lint failures;
- projection/replay invariants;
- bounded API contracts;
- browser flows with stable assertions;
- dependency/security scans with clear remediation limits;
- repetitive migration or refactor batches with golden tests.

Human-gated candidates:

- visual taste and motion;
- product scope or information architecture;
- memory-policy changes;
- security/tool-permission changes;
- destructive migrations;
- open-ended “make it better” work;
- any task whose success oracle is mostly another model's opinion.

## Phase execution

### Before coding

1. Update the build board with the active slice and owner.
2. Write or identify acceptance checks first.
3. Create the branch/worktree.
4. Run the current baseline.

### During coding

1. Emit plain-language progress.
2. Keep the diff within the slice.
3. Checkpoint after a coherent, green increment.
4. Record new low-level decisions and predictions.

### Before merge

1. Run the complete slice verification on the authoritative host.
2. Run independent checker review against the actual diff and evidence.
3. Resolve or explicitly disposition every material finding.
4. Rerun affected verification.
5. Update progress and board truth.
6. Merge without rewriting history.

## Product feedback loop

Technical loops can prove correctness; they cannot prove GROVER deserves daily use. After each user-visible vertical slice:

1. Will uses it for a real task rather than a staged demo.
2. Record friction: briefing, routing, waiting, confusion, interruption, trust, and return-to-task cost.
3. Convert recurring friction into acceptance checks or a product proposal.
4. Prefer the next slice that removes the largest real friction over the next architecturally symmetrical module.

This is the loop that protects GROVER from becoming another technically impressive system Will does not want to open.
