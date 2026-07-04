# Git setup and workflow

The repo is `https://github.com/wdgorgas/grover.git`. v1 was already pushed there; the restructure below turns it into the v2 planning workspace while keeping all v1 history.

## One-time restructure (Will, on Windows, in Command Prompt)

v1's `.git` currently sits inside `archive\grover_v1\`. Moving it to the folder root makes this whole folder the repo, with v1's history intact and the origin already configured.

```bat
cd "C:\Grover v2"
move "archive\grover_v1\.git" ".git"
git add -A
git status
```

**Stop and check `git status` output:** nothing under `archive/grover_v1/data/`, no `vault/`, no `secrets.json` may appear. If clean:

```bat
git commit -m "v2 planning workspace: archive v1, add planning docs and handoff cycle"
git push origin master
```

Optional cleanup (old v1 work branches on GitHub):

```bat
git push origin --delete loop/product-quality-pass-2 loop/product-quality-pass-3 loop/product-quality-pass-4
```

Then add Jackson as a collaborator on GitHub (repo → Settings → Collaborators).

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
4. Push promptly — an unpushed session is invisible to the other person and invites collisions.

## Collision rules

- The main iteration thread (`chatgpt_handoffs/iter_NN_*.md`) has **one owner at a time** — see `PLANNING_BOARD.md`. Don't add a new `iter_NN` file unless the board says the thread is yours.
- Jackson's parallel outputs are named `jackson_NN_<topic>.md` inside `chatgpt_handoffs/` — separate namespace, no number conflicts possible.
- If both of you edited the same file and `git pull` reports a conflict, don't fight it manually — have your Claude instance resolve the merge and sanity-check the result.

## Known gotcha

Git commands must run on the **host machine** (Windows), not from inside a Claude sandbox mount — the mount corrupts git lock files. Claude prepares files; you run git. (Claude instances: tell your human exactly which commands to run rather than running git yourself through the mount.)
