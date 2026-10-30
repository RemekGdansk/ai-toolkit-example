<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Safe Repo Refresh Implementation Plan

- **Plan**: context/changes/safe-repo-refresh/plan.md
- **Mode**: Deep
- **Date**: 2026-10-30
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
8/8 paths ✓, 5/5 symbols ✓ (payload walk, test 9, test 16, tarball check, test script), brief↔plan ✓, Progress↔Phase ✓

Verified in the scratch dir (git 2.56, TS 7.0.2):
- checkJs works on a `// @ts-check` .mjs file.
- merge-tree equals main's tree after squash + later commits, after a `--no-ff` merge and after a rebase-merge.
- A `--no-ff` tip is not on first-parent but is an ancestor.
- `fetch --prune` yields `[gone]`.
- `branch -D` refuses a branch used by another worktree.

## Findings

### F1 — ${CLAUDE_SKILL_DIR} in allowed-tools is not documented

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis; Key Discoveries; Phase 2 §3; criterion 2.4
- **Detail**: The docs list the substitution only for skill content, and their bundled-script example uses `Bash(python3 *)`. If the literal rule never matches, `plan` prompts and criterion 2.4 fails.
- **Fix A ⭐ Recommended**: Test the literal rule first in the Phase 2 scratch repo. If `plan` still prompts, fall back to `Bash(node *repo-refresh.mjs plan)`, and correct the docs claim.
  - Strength: Keeps the tightest rule if it works.
  - Tradeoff: One extra scratch-repo check.
  - Confidence: HIGH — 2.4 already needs the scratch repo.
  - Blind spot: The wildcard relies on D5 staying strict.
- **Fix B**: Use the wildcard from the start.
  - Strength: Matches the documented pattern.
  - Tradeoff: Looser than necessary.
  - Confidence: MEDIUM.
  - Blind spot: Still unverified until 2.4 runs.
- **Decision**: FIXED (Fix A)

### F2 — Installer test 1 will fail when the script is added

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (criterion 1.2); Testing Strategy
- **Detail**: `test/install.test.ts:103` deep-equals `manifest.files` to exactly [plugin.json, SKILL.md].
- **Fix**: Add Phase 1 §4, which updates test 1's expected list, and reword the Testing Strategy line.
- **Decision**: FIXED

### F3 — git fetch can hang the skill

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — Updating main
- **Detail**: There are /dev/tty prompts, GUI credential helpers and no network timeout. R4 fails fast and doesn't cover this.
- **Fix**: Run the fetch with `GIT_TERMINAL_PROMPT=0`, `-c credential.interactive=never` and a 60 s spawnSync timeout, treated as a failed fetch. Leave `GIT_SSH_COMMAND` unset.
- **Decision**: FIXED

### F4 — A branch mid-rebase in another worktree is a candidate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Classification rule 2; delete safety
- **Detail**: Porcelain shows `detached` for that worktree. `branch -D` still refuses, but the plan didn't say how `delete` handles that failure.
- **Fix**: Report a failed `branch -D` as Refused with git's message, and add the case to D3.
- **Decision**: FIXED

### F5 — No minimum length for the SHA in branch=sha

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1
- **Detail**: `feat=a` would pass the tip check for any tip starting with "a".
- **Fix**: Accept 7–40 hex characters (otherwise exit 2), print full SHAs in `plan`'s delete line, and extend D5.
- **Decision**: FIXED
