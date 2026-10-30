<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Safe Repo Refresh

- **Plan**: context/changes/safe-repo-refresh/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria evidence:
- `npm test` passed, 44/44, including R1–R15, D1–D5 and the installer tests.
- `npm run typecheck:plugin` passed, and the import grep found nothing outside `node:`.
- `npm run validate:plugin` passed.
- The SKILL.md grep found 3 matches for `CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs` and no "read-only preview".
- `npm pack --dry-run` lists the script.
- The `Publish AI Toolkit` release run for v0.2.0 succeeded.
- On critical-path PR #81, the `ai-toolkit` CI job passed.
- critical-path's manifest names 0.2.0, and the script is installed.
- Manual items 3.6 and 3.7 are runtime checks with no artifact in the diff. They are accepted as reported.

Every fix below changes shipped plugin content, so it needs a version bump (0.2.1) and a new release. That is the CLAUDE.md hard rule.

## Findings

### F1 — Branches with no net change are listed for deletion as "squash-merged"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:357-366
- **Detail**: Rule 6 assumes that if merge-tree gives main's tree, the branch was squash-merged. That also holds for any branch whose net diff against its merge-base is empty, for example a branch that adds a file and then removes it, or one that holds only `--allow-empty` commits. This was reproduced in a scratch repo: `wip` (adds feature.txt, then removes it) and `notes` (one empty commit) are both listed under `Delete (2)` as "squash-merged: merging it into main would change nothing", although neither was ever merged. The author confirms based on a false reason, and the intermediate commits are left only in the HEAD reflog. The flaw comes from the plan's rule table, not from the implementation drifting.
- **Fix**: Before rule 6, check whether the branch has any net change: compare `merge-base(main, sha)^{tree}` with `sha^{tree}`. If they are equal, keep the branch with the reason "no net changes against main (never merged)". Add fixture tests for both cases.
  - Strength: The deletion predicate then requires that the branch actually changed something that main now contains, which is what "squash-merged" means. Both cases are easy to build as fixtures.
  - Tradeoff: A branch that really was squash-merged and then reverted on the branch itself would now be kept. That direction is safe.
  - Confidence: HIGH — reproduced on git 2.56; the check is one extra `rev-parse` per branch.
  - Blind spot: Whether the author would rather see these listed as deletable with an honest reason ("no net changes") instead of kept.
- **Decision**: FIXED — net-empty pre-check before rule 6 (repo-refresh.mjs `hasNoNetChange`), test R16, README never-deleted list

### F2 — `plan` honours `merge.autoStash` and can leave conflict markers in the working tree

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:294
- **Detail**: When `main` is checked out, the script runs `git merge --ff-only`. If the author has set `merge.autoStash=true` and their uncommitted edit overlaps an upstream change, `plan` reports "updated". It leaves base.txt as `UU` with conflict markers and the author's edit in `stash@{0}: autostash` (reproduced by the safety sub-agent). `plan` is pre-approved and runs with no prompt. This breaks the plan's "on failure (… would touch dirty files), warn" and the README's "without … touching your working tree". Separately, no test covers a fast-forward on `main` over dirty files.
- **Fix**: Use `git merge --ff-only --no-autostash --quiet <sha>`, add a test (on main, dirty overlapping file → warning, tree unchanged), and reword README.md:143 so it says that when `main` is checked out, the fast-forward does update the working tree.
- **Decision**: FIXED — `--no-autostash` on the ff-only merge, test R17 (verified it fails without the flag), README flow step 1 reworded

### F3 — `main` is fast-forwarded while another worktree is rebasing or bisecting it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:298-305 (the same gap affects rule 2 at :341)
- **Detail**: A worktree that is mid-rebase on `main` shows up as `detached` in `git worktree list --porcelain`, so `worktreeBranches` does not contain `main`. In that state `update-ref` moves `refs/heads/main`, and `git rebase --continue` in that worktree then fails with "cannot lock ref 'refs/heads/main': is at … but expected …" (reproduced). git's own guards (`branch -f`, `fetch main:main`) refuse in the same state. The preconditions check only the current worktree.
- **Fix A ⭐ Recommended**: Read `rebase-merge/head-name`, `rebase-apply/head-name` and `BISECT_START` in each worktree's gitdir, and treat the branch named there as checked out in that worktree, both for the main update and for rule 2.
  - Strength: It fixes the root cause in one place and closes the rule 2 gap that the plan accepted for `delete`, so D3 no longer depends on `branch -D` refusing.
  - Tradeoff: The script now reads git's internal state files, which is a little more code and depends on git internals that are stable but undocumented.
  - Confidence: MED — these file names have been stable for many years; there is no fixture yet.
  - Blind spot: Other in-progress operations that detach HEAD (for example `git am`) would need the same treatment.
- **Fix B**: Update `main` with `git fetch <remote> <merge>:refs/heads/main` (a non-forced refspec), keeping the existing ancestry checks.
  - Strength: It reuses git's own "branch in use" and fast-forward guards and needs no state-file parsing.
  - Tradeoff: It is a second network call, or it needs a reorder so this replaces the plain fetch. It also does not fix rule 2.
  - Confidence: MED — the refusal was observed, but it needs a test against git 2.38.
  - Blind spot: Whether git's in-use check covers bisect.
- **Decision**: FIXED via Fix A — `readRepo` treats the branch in `rebase-merge|rebase-apply/head-name` or `BISECT_START` of any worktree as checked out (main update + rule 2); test R18; D3 now expects the mid-rebase branch kept (the `git branch -D failed` refusal path is no longer exercised by a test); bisect has no fixture

### F4 — `fetch --prune` in `plan` can delete local branches under a mirror-style refspec

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:273
- **Detail**: If the remote has a fetch refspec whose destination is under `refs/heads/` (for example `+refs/heads/*:refs/heads/*`) or has `remote.<r>.mirror` set, `fetch --prune` deletes local branches that are not on the remote. A branch with a unique, unpushed commit disappeared during a no-prompt `plan` run (reproduced). This config is unusual, but it is the only path where `plan` destroys work without any confirmation.
- **Fix**: Before fetching, read `git config --get-all remote.<r>.fetch` and `remote.<r>.mirror`. If any destination is under `refs/heads/` or mirror is set, skip the fetch with a warning. Add a fixture test.
- **Decision**: FIXED — `fetchesIntoLocalBranches` skips the fetch with a warning when a refspec destination can include refs/heads/; test R19 (both refspec shapes, verified failing without the fix). `remote.<r>.mirror` not checked: it only affects push, and a fetch mirror is caught by its `+refs/*:refs/*` refspec

### F5 — `delete` passes branch names to `git branch -D` without `--` or a compare-and-swap

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:494
- **Detail**: A branch named `-r` or `-f` reaches git as an option. It fails safe today: "branch name required" is reported as refused. Also, `branch -D` deletes whatever tip the branch has at that moment, so there is a short window between the re-check and the deletion where a moved tip would be lost. The plan specified `-D`.
- **Fix**: Use `["branch", "-D", "--", branch]`. Optionally re-read the tip immediately before each deletion.
- **Decision**: FIXED — `branch -D -- <branch>` (test D6, verified failing without `--`) and a tip re-read right before each deletion (refused as "tip moved during delete"; inherently racy, so no test)

### F6 — Preconditions miss a revert or sequencer in progress

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/scripts/repo-refresh.mjs:198-204
- **Detail**: With `REVERT_HEAD` present, `plan` exits 0 and runs normally (reproduced). A revert belongs to the same class as the cherry-pick case the plan refuses.
- **Fix**: Add `REVERT_HEAD` and `sequencer` to the marker list, and extend R15.
- **Decision**: FIXED — REVERT_HEAD and sequencer markers, R15 "a revert in progress" subtest, README precondition sentence

### F7 — SKILL.md step 4: an extra prompt and a misleading exit-code rule

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: plugin/skills/repo-refresh/SKILL.md:54
- **Detail**: Step 4 has two problems.
  - It tells the model to run `git branch --show-current`. That command is not pre-approved, so it adds a permission prompt at the end of the flow.
  - It says "Exit 1 means at least one branch was refused", but `delete` also exits 1 when a precondition fails. In that case there is no `Deleted`/`Refused` output to copy, only stderr.
- **Fix**: Take the current branch from the `checked out` line of the `plan` output, and say that if the output has no `Deleted (N):` section, the model should report the error message and stop.
- **Decision**: FIXED — step 4 takes the current branch from plan's `checked out` Keep entry and reports the error when delete prints no `Deleted (N):` section

### F8 — Plan not updated with recorded outcomes and deviations

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/safe-repo-refresh/plan.md:32, :217
- **Detail**: Three deviations exist only in commit messages, not in the plan.
  - `${CLAUDE_SKILL_DIR}` was verified to expand in `allowed-tools`, but plan.md:32 still says "unverified".
  - SKILL.md copies the report into a fenced block and into the question text, leaving out `Delete command:`, instead of "show its output verbatim". The reason is that tool output is collapsed. This deviation is justified but not recorded.
  - Installer test 6 also gained the script entry; the plan names only test 1. This is justified.
- **Fix**: Add a short "Implementation notes" addendum to plan.md recording all three.
- **Decision**: FIXED — plan.md Key Discoveries line updated; "Implementation Notes" addendum records the three deviations and every review fix
