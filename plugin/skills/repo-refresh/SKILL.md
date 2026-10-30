---
name: repo-refresh
description: Refresh the local repository - update main from the remote without switching branches, then clean up local branches whose work is already in main (merged or squash-merged), deleting only after the user confirms the list. Use when the user asks to refresh, tidy or clean up the repo, sync main, or prune merged local branches.
---

# Repo refresh (read-only preview)

This is an early version of the skill. It only reports the state of the local repository. **It deletes nothing, updates nothing and switches no branches.** Branch cleanup arrives when the full skill ships.

Do not run any command that changes the repository: no `git fetch`, `git pull`, `git checkout`, `git switch`, `git branch -d`/`-D`, `git push`, `git stash` changes or `git reset`. Use only the read-only commands below.

## Steps

1. **Current branch.** Run `git branch --show-current` and report it. If the output is empty, report a detached HEAD.
2. **Main branch.** Use `main` if `git rev-parse --verify --quiet refs/heads/main` succeeds; otherwise stop and report that there is no local `main` branch.
3. **Local branches and upstream state.** Run `git for-each-ref --format='%(refname:short)|%(upstream:short)|%(upstream:track)' refs/heads`. For each branch, report its upstream (or "no upstream"), and whether the upstream is gone, ahead, behind or in sync, using the last known remote state (no fetch).
4. **Branches that appear merged into main.** Run `git branch --merged main` and list every branch other than `main` and the current branch. Label this list "appear merged (regular merge only)". Squash-merged branches are not detected yet, so say so.
5. **Summary.** Print three short lists: current branch, branches that appear merged into main, and all other branches. End with: "Nothing was deleted or changed. Branch cleanup is not available in this version of repo-refresh."
