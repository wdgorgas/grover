# PlanningProposal 008 — local learned manager curriculum and training harness

- **proposal_id:** 008
- **source:** Will's direct product instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** learned orchestration, synthetic data, local training, evaluation, resource lifecycle
- **affected_decisions:** Extends PlanningProposals 004 and 007. Introduces P7 as an evaluation-gated experiment; it does not replace the deterministic trust kernel or authorize new external actions.
- **requires_will_decision:** resolved by Will's instruction to create the model and datasets, with a small human review queue and a non-interactive long-running training launch
- **conflicts_with_locked_decisions:** none. The model proposes plans; deterministic policy, permissions, budgets, sign-off triggers, namespace isolation, and execution adapters remain authoritative.
- **resolution:** Create a local, provider-neutral manager curriculum, synthetic stateful dataset, review queue, evaluation suite, and resumable resource-bounded training pipeline. Do not integrate the learned model into live routing until it beats the deterministic baseline and passes safety gates.

## Binding implementation consequences

1. The learned manager is a planner, not a data store or executor. Personal facts, schedules, conversations, project state, tool availability, and permissions remain authoritative in local application storage and are supplied as bounded runtime inputs.
2. One student model learns several short structured tasks: request understanding, context/conversation resolution, retrieval planning, memory operations, tool/worker/tier selection, clarification, worker briefing, supervision, and recovery.
3. Outputs use versioned JSON schemas and stable IDs. GROVER validates every referenced conversation, project, memory scope, tool, path, permission, and side effect before acting.
4. Synthetic examples include realistic GROVER state, not isolated utterances. Near-neighbor counterexamples, missing tools, failures, ambiguity, slang, typos, follow-ups, and adversarial noun overlap are required.
5. Train, validation, test, and human-review cases are separated by scenario family before surface paraphrases are generated. The held-out test set may never be used for training or threshold tuning.
6. Teacher-authored decisions may seed and expand the curriculum. Disagreement, low-confidence, high-consequence, and preference-sensitive cases go to Will's review queue rather than silently becoming gold labels.
7. The default local student is `Qwen/Qwen3-1.7B` under Apache-2.0, trained with 4-bit QLoRA. The base model and hyperparameters remain configuration so the same dataset can be retrained on stronger hardware.
8. The current-device profile must fit the detected 4 GB NVIDIA GPU: short task-specific examples, completion-only loss, gradient checkpointing, micro-batch one, and resumable checkpoints.
9. Resource lifecycle is explicit: generated scratch and package caches are disposable; datasets and reports are compact; at most the best and latest resumable checkpoints are retained; interrupted runs resume; cleanup never deletes the base model, final adapter, reports, or human reviews.
10. The long training command is non-interactive after preflight. It writes progress, resource, checkpoint, and final-evaluation records that can be inspected after the run without keeping a Codex session active.
11. No real `jackson-private`, secret, vault export, or raw user database content enters the synthetic dataset or repository. Real GROVER prompts may be added later only through an explicit sanitized export path.
12. Learned routing begins in offline/shadow evaluation. Promotion requires schema validity, destination accuracy, project-match quality, memory precision/recall, clarification calibration, tool/tier accuracy, recovery quality, latency, and zero authority-boundary violations on the protected suite.

## Acceptance scenarios

- One command preflights disk/GPU/data, resumes an interrupted run, trains locally, evaluates, exports the adapter, prunes old checkpoints, and writes a final report.
- Dataset validation rejects duplicate IDs, invalid schema values, unknown state references, train/test family leakage, accidental secrets, and unsafe gold plans.
- The curriculum distinguishes `code a quant bot` from portfolio advice, `research meeting` from research work, project continuation from duplicate creation, durable memory from ephemeral context, and local schedule lookup from provider delegation.
- A worker failure can lead to retry, fallback, clarification, or safe stop; claimed success without required evidence is not accepted.
- A low-confidence ordinary route may clarify, but destructive, paid, security, privacy, and unavailable-tool cases never bypass deterministic controls.
- Current-device setup reports the actual RTX 3050 Laptop GPU and refuses settings that cannot fit its 4 GB VRAM or available disk.
