# PlanningProposal 003 — local Windows desktop delivery

- **proposal_id:** 003
- **source:** Will's direct instruction on 2026-08-18
- **proposer:** Will
- **status:** accepted
- **area:** runtime shape, deployment, P1 transport, packaging, visual-priority sequencing
- **affected_decisions:** P1 shell and transport; local deployment; visual acceptance sequencing
- **requires_will_decision:** resolved by the direct instruction that created this proposal
- **conflicts_with_locked_decisions:** Replaces the browser-delivered SPA shell and SSE-only transport requirement. It does not weaken the event spine, authoritative projections, evidence policy, privacy boundaries, cost policy, or kill switch.
- **resolution:** Build GROVER as a local Windows desktop application first. Do not deploy it to the server before the local build is functionally complete. Package a no-install portable `.exe` so moving the app is as close to drag-and-drop as practical. Visual redesign is deferred; the current slice provides a deliberately plain, accessible, replaceable functional shell.

## Binding implementation consequences

1. Electron is the Windows application host because this machine has Node but no .NET SDK or Rust toolchain. The UI runs in a native application window and never requires Will to open a browser.
2. The renderer is sandboxed with `contextIsolation: true`, `nodeIntegration: false`, no remote navigation, and a narrow preload API. Local privileged operations remain in the main process.
3. Desktop IPC replaces SSE for the packaged application. Events still have monotonic `seq`, resume/replay semantics, authoritative server-side projections, and idempotent commands. The transport change may not weaken the event model.
4. Runtime data lives under Electron's per-user application-data directory. The packaged application must not write into its installation directory.
5. P1 browser-specific evidence is replaced by automated Electron-window interaction evidence where equivalent. Functional DOM/state assertions and the no-navigation invariant remain required.
6. The old visual mockups are references only. Until the functional vertical slice is usable, work is limited to semantic tokens, accessibility, responsive layout, clear states, and controls that actually work.
7. Server deployment, public exposure, authentication, auto-update, and code signing remain out of scope until the local application is complete and explicitly approved.
