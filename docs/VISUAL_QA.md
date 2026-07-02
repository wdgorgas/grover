# VISUAL QA — manual checklist (~2 minutes)

Automated screenshots were considered and rejected for now: Playwright/
puppeteer would be Grover's first runtime dependency plus a ~300MB browser
download, violating docs/DECISIONS.md #2 for a local-only app with one or
two users. If that trade ever flips (e.g. CI on the Ubuntu box), revisit.
Until then, run this after every UI change — top to bottom, any theme first,
then once in Obsidian and once in Porcelain.

## Command Center
- [ ] Orb breathes irregularly; occasional glints; heartbeat thump visible
      within ~10s. Cursor tilt is smooth; leaving the orb settles gently.
- [ ] Type → orb "Listening"; send → "Thinking" (violet) → answer streams →
      "Done" flash → returns to Idle *or* "Loop running/queued/verifying"
      if a loop is active (System panel matches).
- [ ] System panel shows active loop + next actions; telemetry updates
      after a turn (model, tier, cost, latency, today).

## Builder
- [ ] System strip: autonomy, today/cap, active loop, queue — numbers real.
- [ ] Greenlight a pending item → proposal modal (scope/plan/risk/effort/
      autonomy notice; offline banner if no key) → approve → loop appears;
      toast is honest about nothing auto-executing.
- [ ] Loop card: Start → Verify → Done asks for a one-line summary via an
      in-app modal (never a browser prompt). Kill asks why. Workshop ↗
      expands the source item.
- [ ] Done/rejected items live under collapsed History.

## Desks (open each once)
- [ ] Welcome card: purpose, status badges, honest "coming later" line,
      3 starter prompts that fill the composer on click.

## Everywhere
- [ ] Esc closes any modal; Tab shows a visible focus ring on every control.
- [ ] Empty states (Memory, Costs, Audit, fresh Desk) explain + offer an action.
- [ ] Theme switch (Settings): orb ramp, nav accents, send button recolor
      live. Obsidian/Slate/Porcelain show zero neon glow.
- [ ] Narrow the window below ~980px: side panels collapse, nothing overflows.
- [ ] Subtitles typewrite once; stats count up; reduced-motion OS setting
      disables both.
