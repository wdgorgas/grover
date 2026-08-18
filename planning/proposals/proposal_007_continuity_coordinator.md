# PlanningProposal 007 — continuity coordinator and low-latency local paths

- **proposal_id:** 007
- **source:** Will's direct product instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** conversation routing, project continuity, latency, memory write policy, model orchestration
- **affected_decisions:** Extends PlanningProposals 002, 004, and 005; advances the v2.1 continuity scope; narrows master prompt §8.3 for high-confidence non-sensitive profile facts.
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **conflicts_with_locked_decisions:** Will explicitly authorized automatic memory for correctly identified durable profile facts. Sensitive health/finance facts remain reviewable unless directly requested, preserving the existing privacy boundary. No security, money, or Jackson boundary changes.
- **resolution:** GROVER becomes the fast, stateful coordinator. It organizes and recalls local state before invoking a provider-neutral worker. Codex and Claude remain execution tools rather than owners of routing, memory, project state, or UI.

## Binding implementation consequences

1. A prompt is assigned to the workspace for the work being performed, not merely a noun mentioned in it. Creating a quantitative investing bot routes to Coding; scheduling a research meeting does not route to Research.
2. When a prompt entered in one conversation clearly belongs elsewhere, GROVER creates or reopens the target conversation before storing the prompt. The source conversation remains unchanged.
3. Continuation language and a distinctive project subject may reopen the best matching existing conversation. The routing decision and reason remain inspectable. An explicit new-conversation request always creates a new conversation.
4. Conversation history is the first project-local cache. A bounded recent-history pack follows a request within that conversation; unrelated conversations and the full vault do not.
5. High-confidence, non-sensitive durable profile facts may be written automatically with provenance. Sensitive health/finance facts remain proposals unless Will directly asks GROVER to remember them. Correct and Forget remain available for every active memory.
6. Local state queries and navigation use deterministic SQLite/rule paths and should return without a model call. Complex production work is delegated only after context, project, policy, memory, and provider selection are resolved.
7. Routing remains provider-neutral and uses abstract workload classes. Current provider/model mappings are configuration, not application-domain logic.
8. A learned local coordinator is considered only after deterministic routing logs and corrections form a versioned evaluation set. It must beat the deterministic baseline on destination, project match, tool/model tier, privacy, latency, and abstention before replacing any rule.
9. The Lifestyle scheduling sub-application, chat-history management controls, and visual memory graph are subsequent consumers of this foundation. Their visual treatment remains deferred to Will's new design direction.
10. A Coding conversation that creates or changes files owns a local project folder. GROVER may create that folder under the configured local projects root or let Will link an existing folder. Coding workers may write only inside that project root and may never use that authority to edit the GROVER application repository.
11. Non-local workloads are classified into abstract fast, balanced, or frontier tiers before provider selection. Model IDs and reasoning effort are configurable per engine; the router records both the abstract choice and concrete mapping.

## Acceptance scenarios

- From a General conversation, `Let's code a game` opens a new Coding conversation and does not add the request to General.
- `Code a quant bot for investing` routes to Coding rather than Finance.
- `Set my schedule for the research meeting` remains General until the Lifestyle scheduler exists; it never routes to Research from the word `research` alone.
- After a `tic tac toe` Coding conversation exists, `reopen tic tac toe` opens that conversation without invoking an external engine.
- `Update tic tac toe` reopens the matching Coding conversation and delegates the requested work there rather than creating a duplicate.
- A generic follow-up inside a project conversation stays in that conversation.
- `My name is Will` is stored automatically with provenance; sensitive incidental health/finance facts still await review.
- The selected worker receives bounded history from only the target conversation plus relevant permitted memory.
- `Let's code tic tac toe` creates or reuses a conversation-owned local project folder, runs the worker with project-scoped write access there, and never grants Coding write access to the GROVER repository.
- Fast, balanced, and frontier examples record their selected tier/model/effort, while local navigation and memory answers record no provider call.
