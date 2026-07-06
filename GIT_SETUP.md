# Git workflow

The repo is `https://github.com/wdgorgas/grover.git`. One repo, one `master` branch, full history from v1 through v2 planning.

**History note (2026-07-03):** the "Archive Grover v1 and initialize Grover v2 workspace" commit initially landed on a leftover v1 branch (`loop/product-quality-pass-5`) because that's where v1's HEAD was parked; it was merged into master and the repo was reorganized into the version-based layout (`planning/`, `design/`, `archive/`) right after. The old `loop/*` branches are dead — delete on sight.

## Daily workflow (Will and Jackson, identical)

1. **Before any planning session:** `git pull` — always start from the latest state.
2. Work (your Claude instance reads/writes files in this folder).
3. **After the session:**
   ```bat
   git add -A
   git status
   git commit -m "planning: <one line on what changed>"
   git push
   ```
4. **Check `git status` before every commit:** nothing under `archive/grover_v1/data/`, no `vault/`, no `secrets.json` may ever appear staged.
5. Push promptly — an unpushed session is invisible to the other person and invites collisions.

## Branch hygiene

- **Docs-only changes** (board updates, handoffs, planning files) go straight on `master`.
- **Build/code slices** get a branch per slice — `git checkout -b phase-pX-short-description` — merged to `master` only after verification, per `CLAUDE.md`.
- **Always check `git branch` before committing.** (A leftover v1 branch once swallowed a whole evening's commit.)
- Cleanup of dead v1 branches, if they still exist:
  ```bat
  git branch -D loop/product-quality-pass-2 loop/product-quality-pass-3 loop/product-quality-pass-4 loop/product-quality-pass-5
  git push origin --delete loop/product-quality-pass-2 loop/product-quality-pass-3 loop/product-quality-pass-4
  ```
  (Ignore "not found" errors — it means they're already gone.)

## Collision rules

- The main iteration thread (`planning/chatgpt_handoffs/iter_NN_*.md`) has **one owner at a time** — see `planning/PLANNING_BOARD.md`. Don't add a new `iter_NN` file unless the board says the thread is yours.
- Jackson's parallel outputs are named `jackson_NN_<topic>.md` in the same folder — separate namespace, no number conflicts possible.
- If both of you edited the same file and `git pull` reports a conflict, don't fight it manually — have your Claude instance resolve the merge and sanity-check the result.

## Known gotcha

Git commands must run on the **host machine** (Windows), not from inside a Claude sandbox mount — the mount corrupts git lock files. Claude prepares files; you run git. (Claude instances: tell your human exactly which commands to run rather than running git yourself through the mount.)

**This includes "read-only" git commands.** On 2026-07-05 a sandbox `git status` left a stale `.git/index.lock` and a confused index (fix: `del .git\index.lock` then `git reset` on the host). The mount can also serve **stale or truncated file contents** to the sandbox after writes. Operational protocol, host side, before every commit of Claude-prepared work:

1. `git status` — confirm only the expected files changed.
2. `git diff` / review — confirm files are complete (no mid-line truncation at the end).
3. Run the verification the handoff names (usually `cd app && npm test`) — this is the authoritative check; sandbox test runs are advisory only.
