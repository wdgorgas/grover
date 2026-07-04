# UI STYLE GUIDE (canonical — root copy is a pointer)

> A dark, professional AI command center centered on a living particle-orb
> identity: luminous, technical, organic, state-reactive. Arcane color
> richness and data-art geometry — not a generic Iron Man HUD.

## The one rule
**Restraint everywhere except the orb.** If the chrome competes with the
orb, the chrome is wrong. Professional themes (Obsidian/Slate/Porcelain)
set `--edge-glow: 0` and must contain zero neon bleed.

## Tokens, not hex
Components use semantic variables only (`client/css/tokens.css`): surfaces,
text tiers, accents, state colors, and the orb ramp (`--orb-core/mid/hot/edge`).
Skins swap palettes under the same tokens; the orb recolors itself because
it reads tokens at state change. A hex literal in a component is a bug.

## State colors (§16.1)
idle blue/cyan · think violet · create magenta · frontier gold ·
ok green · warn amber · error red. Orb states: idle, listening, thinking,
memory (motes inward), tools, frontier (gold, denser), approval (amber
pulse), error (destabilized, self-recovers), success (contract-flash).

## Motion
Entrances: rise + stagger (`.reveal`, `--i`). Subtitles typewrite once.
Numbers count up. Nothing blocks input; `prefers-reduced-motion` collapses
all of it. Animations communicate state — decoration is cut.

## Voice & clarity
- Micro-labels: uppercase, letter-spaced, tiny. Numbers: tabular mono.
- Copy is terse and honest. Never claim an action happened when only a
  status changed ("Greenlit — recorded and queued. Nothing executes
  automatically.").
- **Empty states teach.** Every empty view says what belongs there and
  offers the first action (starter prompts on desks, "log your first item"
  on the ledger).
- Placeholders are labeled as placeholders. Dead buttons are forbidden.

## Priority order
1. Usability 2. Clarity 3. Professional polish 4. Technical presence
5. Futuristic animation.
