---
name: repo-refresh
description: Refresh the local repository - update main from the remote without switching branches, then clean up local branches whose work is already in main (merged or squash-merged), deleting only after the user confirms the list. Use when the user asks to refresh, tidy or clean up the repo, sync main, or prune merged local branches.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs plan)
---

# Repo refresh

All git logic lives in the bundled script. Your job is to run it, show its output, ask the author, and run it again with their choice. Do not work out on your own which branches are merged.

## Hard rules

- Run no other git command that changes the repository: no `git checkout`/`git switch`, `git pull`, `git push`, `git reset`, `git stash` changes or `git branch -d`/`-D`. Only the script fetches, updates `main` and deletes branches.
- Never pass a branch to `delete` that `plan` did not list under `Delete (N):`, and always pass it with the SHA from the `plan` output.
- If `plan` exits 1, report its message and stop. Do not try to fix the repository state yourself.

## Steps

1. **Plan.** Run, from the repository:

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs plan
   ```

   The author does not see command output, so a summary is not enough. In your reply, copy the `Main:`, `Delete (N):`, `Keep (N):` and (if present) `Warnings:` sections into a fenced code block, unchanged, before asking anything. Leave out the `Delete command:` section. If `Delete (0):` lists no branches, say there is nothing to delete and stop.

2. **Ask once.** Do not say that you are deleting, or about to delete, anything until the author has answered. Ask the author one native question (multiple choice). The question dialog is the one place the author always sees in full, so its question text must hold the report, copied from the `plan` output:
   - the `Main:` line;
   - every branch under `Delete (N):` with its reason;
   - every branch under `Keep (N):` with its reason;
   - any `Warnings:` lines.

   Use exactly these options:
   - "Delete all listed"
   - "Choose which to delete"
   - "Cancel"

   On "Cancel", say that nothing was deleted and stop.

   On "Choose which to delete":
   - With up to 4 candidates, ask one multi-select question whose options are the candidate branch names, each with its reason from the `plan` output as the description.
   - With more than 4 candidates, ask the author to type the branch names to delete. Accept only names from the `Delete (N):` list. If they type any other name, say which names are not candidates and ask again.

   If nothing was chosen, say that nothing was deleted and stop.

3. **Delete.** The last line of the `plan` output, under `Delete command:`, holds one `<branch>=<sha>` pair per candidate. Run:

   ```bash
   node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs delete <pairs>
   ```

   where `<pairs>` is exactly the chosen pairs copied from that line, unchanged (keep any quoting). For "Delete all listed", that is every pair on the line. Do not compose or shorten a pair yourself. The script re-checks every branch and refuses any that is no longer a candidate at the same tip.

4. **Report.** If the `delete` output has no `Deleted (N):` section, the script stopped before deleting anything: report its error message and stop. Otherwise copy the `delete` output (`Deleted (N):` and `Refused (N):`) into your reply as a fenced code block, unchanged. A refused branch makes the script exit 1; that is a normal result, not an error to work around. Then end with a short summary: the author is still on `<branch>` (the branch listed as `checked out` under `Keep (N):` in the `plan` output, or a detached HEAD if there is none), and nothing was pushed or deleted on the remote.
