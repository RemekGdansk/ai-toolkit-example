# Safe Repo Refresh — Plan Brief

> Full plan: `context/changes/safe-repo-refresh/plan.md`

## What & Why

Turn the read-only `repo-refresh` preview into the real skill (roadmap S-04: FR-011, US-01, NFR "no unmerged work is ever lost"). Asked to refresh, Claude Code updates `main` from the remote without switching branches. It then lists local branches to delete or keep, each with a reason, and deletes only the branches the author confirms. This is the only slice that can destroy work, so all git logic is a fixture-tested script, not instructions the LLM improvises.

## Starting Point

`plugin/skills/repo-refresh/SKILL.md` only reports branches and cannot detect squash merges. The installer copies everything under `plugin/` into the consumer and already handles upgrades. `critical-path` installs `0.1.0` through a pinned `npx` script, so the toolkit CLI is not available there when the skill runs.

## Desired End State

In `critical-path` at `0.2.0`, `/ai-toolkit-example:repo-refresh`:
- fast-forwards `main` (or warns and carries on);
- shows the delete and keep lists with reasons;
- asks "delete all / choose / cancel";
- deletes only the chosen branches, after re-checking each one.

The author stays on their branch, nothing on the remote changes, and the author's `CLAUDE.md` is untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where logic lives | Zero-dependency `scripts/repo-refresh.mjs` bundled in the skill, run via `${CLAUDE_SKILL_DIR}` | `critical-path` has no toolkit CLI installed, and deletion must not be improvised by the LLM. | Plan |
| "Work is in main" test | `git merge-tree --write-tree main <branch>` equals `main`'s tree | Covers regular and squash merges in one rule; patch-id (`git cherry`) gave a false positive after a revert in a scratch test. | Plan |
| Branch with no commits of its own (tip on `main`'s first-parent history) | Keep, unless its upstream is gone (then it's a fast-forward-merged candidate) | A freshly created work branch is never proposed, while PR branches merged by fast-forward still get cleaned. | Plan |
| Gone upstream | Supporting signal in the reason only | PRD Business Logic: a gone upstream alone keeps the branch. | PRD |
| Stash protection | If no surviving branch holds a stash's base, keep every candidate that holds it | The literal "only branch" reading could orphan a stash when two candidates share its base. | Plan |
| `main` can't fast-forward (diverged, offline, no upstream) | Warn, then classify against local `main` | A staler `main` only shrinks the candidate list, so the result is still safe and works offline. | Plan |
| Confirmation | One question: delete all / choose which / cancel | One click in the usual case, and the author can still spare a branch. | Plan |
| Delete safety | `delete <branch>=<sha>` re-classifies and refuses a branch whose tip moved or that is no longer a candidate | The confirmation boundary holds even if the model passes stale arguments. | Plan |
| Permissions | `allowed-tools` covers `plan` only, so `delete` still shows Claude Code's permission prompt | Deletion gets a second, harness-level gate. | Plan |
| Verification scope | Fixture tests, then release `0.2.0` and run US-01 in `critical-path` | Proves the roadmap outcome through the real delivery path. | Plan |

## Scope

**In scope:**
- `repo-refresh.mjs` with `plan` and `delete`, type-checked with `checkJs`
- Fixture-repo tests R1–R15 and D1–D5
- New `SKILL.md` flow
- Version `0.2.0`, tarball-check entry, README
- Release, `critical-path` repoint PR, US-01 run

**Out of scope:**
- Remote branch deletion or any push
- Default branches other than `main`
- Windows
- Patch-id detection
- Auto-delete without confirmation
- Installer, uninstall (S-05) and general update (S-06) work
- `CLAUDE.md` rules (FR-005)
- Copilot and Codex (FR-009, FR-010)

## Architecture / Approach

```
/ai-toolkit-example:repo-refresh (SKILL.md, thin driver)
  └─ node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs plan     (no permission prompt)
       preconditions → fetch --prune → fast-forward main (update-ref CAS, or merge --ff-only when on main)
       → classify each branch (checked out / worktree / on main's first-parent / ancestor / merge-tree / else)
       → stash pass → Main / Delete / Keep / Warnings + exact delete command
  └─ AskUserQuestion: delete all | choose | cancel
  └─ node …/repo-refresh.mjs delete <branch>=<sha> …             (permission prompt)
       re-classify (no fetch) → git branch -D only if still a candidate at the same tip → Deleted / Refused
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Refresh script: update and classify | `plan` with all rules + R1–R15 fixtures + `checkJs` type check | A rule-order mistake that misclassifies a regular-merged or fresh branch |
| 2. Delete command and skill flow | Re-checked `delete` + D1–D5, new `SKILL.md`, scratch-repo walkthrough | The model passing arguments other than the `plan` output (mitigated by re-checking) |
| 3. Release 0.2.0 and verify in critical-path | Bumped release, tarball check, README, repointed consumer, US-01 run | Upgrade from `0.1.0` blocked by a locally edited installed `SKILL.md` |

**Prerequisites:** S-01 done (it is), git ≥ 2.38 and Node in `critical-path`, the local read-only PAT from S-03, and permission to cut a release.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- TypeScript 7's `checkJs`/JSDoc support may differ from 5.x. If it can't check the script cleanly, fall back to `// @ts-check` with fewer JSDoc annotations rather than dropping the type check.
- Merge-tree treats a squash that was later edited on `main` as "not in main". Such branches are kept for manual cleanup, which is a safe false negative.
- Setting up US-01 in `critical-path` needs a real squash-merged branch. Reuse an existing squash-merged PR branch, or create one through a throwaway PR.

## Success Criteria (Summary)

- In `critical-path`, the merged and squash-merged branches are deleted after confirmation, while unmerged branches, the stash holder and the current branch are kept with clear reasons.
- No test or manual run ever deletes a branch carrying changes not in `main`, and nothing on the remote changes.
- `0.2.0` is published by the release workflow, and `critical-path` installs it through its pinned script.
