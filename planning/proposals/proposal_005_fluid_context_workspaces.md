# PlanningProposal 005 — fluid context workspaces

- **proposal_id:** 005
- **source:** Will's direct UX instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** information architecture, routing, conversations, keyboard behavior, engine onboarding
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **resolution:** GROVER uses a single Home entry point and automatically files each new request into a persistent context workspace and conversation. Intent remains internal routing state rather than a user-facing navigation choice.

## Binding implementation consequences

1. Home combines command intake with current/recent activity. Submitting from Home never redirects to a generic Activity page.
2. Coding, Research, Finance, Health, Business, and GROVER workspaces are persistent primary navigation destinations. A new Home request is classified and opened as a conversation in the matching workspace; ordinary conversation may remain in General/Home.
3. Conversations and their messages persist locally and are directly reopenable from their workspace.
4. Command and Activity are not separate top-level pages. Home, Memory, and Settings are compact utility controls at the bottom of the context sidebar.
5. The intent selector is removed. Agent Auto/Codex/Claude remains available as an optional per-request override.
6. Enter submits a prompt; Shift+Enter inserts a newline.
7. Engine errors must distinguish unavailable executables from authentication problems. Settings provides explicit sign-in actions for installed providers.
8. Initial context routing is deterministic and inspectable. GROVER stores routing examples and user feedback before any learned router is considered.
