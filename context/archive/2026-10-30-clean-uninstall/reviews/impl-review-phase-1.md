<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clean Uninstall

- **Plan**: context/changes/clean-uninstall/plan.md
- **Scope**: Full plan (completed phases only; Phase 2 is in progress)
- **Reviewed phases**: 1
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

Phase 2's staged README and version bump (Changes 1–2) were also checked against the plan. They match. The only README issue is F3. Phase 2 is not counted as reviewed because its release and critical-path steps (2.3–2.8) are still pending.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Success criteria run during review:

- `npm test`: 69/69 pass.
- U1–U15: all present and passing.
- `grep -nE '^function (abs|ancestors|lstatOf|statOf|isEmptyDir)' src/install.ts`: finds nothing.
- `test/install.test.ts`: unchanged against `main`.
- Manual check 1.4 is marked done; it is a scratch-repo check that leaves no trace in the diff.

## Findings

### F1 — No uninstall test for manifest paths outside the plugin folder

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/uninstall.test.ts:204
- **Detail**: Consider a manifest that lists a consumer file such as `.claude/settings.json` with its real SHA-256. The edit check passes for that file. Only `readManifest` path validation (`src/manifest.ts:175,190`) stops uninstall from deleting it. `test/install.test.ts:273` covers this validation for install. No uninstall test does, so a regression that skipped or loosened validation on the uninstall path would go unnoticed. That is the single safeguard against deleting consumer files.
- **Fix**: Add a U8 case: the manifest lists `.claude/settings.json` with its real hash, plus a `createdDirs` entry `.claude/other`. Assert exit 1, `unsafe or malformed path`, and an unchanged tree.
- **Decision**: FIXED: added U8b (consumer file with matching hash, foreign created folder) to `test/uninstall.test.ts`. Break-check: with path validation removed, U8b went red.

### F2 — Keeping the plugin folder leaves a state both commands refuse

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.ts:115, src/uninstall.ts:45
- **Detail**: Reproduced in a scratch repo. With a consumer file in `.claude/skills/ai-toolkit-example/`, uninstall exits 0, reports `kept .claude/skills/ai-toolkit-example/` and deletes the manifest. Then:
  - Re-running uninstall exits 1 and says "Delete it yourself if it is a leftover install". That advises deleting the folder uninstall just kept because it holds the user's own files.
  - `install` refuses the folder as unmanaged.

  No data is lost, but the user is not told how to get out of this state.
- **Fix A ⭐ Recommended**: When the kept folder is `TARGET_DIR`, extend its `kept` line, for example `... did not install; move them out before installing again`.
  - Strength: The user sees the hint at the moment the state is created. It is one conditional in the report loop, and U7 can assert it.
  - Tradeoff: The `kept` wording no longer matches the plan contract exactly, so the plan and README need a one-line addendum.
  - Confidence: HIGH — the report loop already handles each kept folder separately.
  - Blind spot: None significant.
- **Fix B**: Reword the no-manifest message (`src/uninstall.ts:45`) to "move out anything you want to keep, then delete it".
  - Strength: It also covers a leftover folder from any other cause.
  - Tradeoff: The guidance arrives only on the second run. U4 and the README row need updating.
  - Confidence: MED — it helps only users who re-run uninstall.
  - Blind spot: Users who go straight to `install` get install's message instead.
- **Decision**: FIXED (Fix A): the kept line for the plugin folder adds `; move them out before installing again`; U7 asserts it; README updated. The plan contract deviation is recorded in follow-ups/review-fixes.md.

### F3 — README says the manifest is removed last

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:228 (staged, Phase 2)
- **Detail**: When install created `.claude`, that folder is removed after the manifest (`src/uninstall.ts:94-102`, matching the plan's removal order). "Removed last" is therefore inaccurate.
- **Fix**: Change "because the manifest is removed last" to "because the manifest is removed after every managed file".
- **Decision**: FIXED: README now says "removed after every managed file".

### F4 — The symlinked-manifest case in U9 asserts less than the folder case

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/uninstall.test.ts:258
- **Detail**: The symlinked-manifest case checks only that stderr contains the manifest path. It does not check for the `symlinks or not regular files` remedy line, as the `.claude/skills` case does, and it does not check that the symlink is still in place. Files outside the repo are still verified untouched.
- **Fix**: Assert the remedy line, and that `lstat` of the manifest is still a symlink after the run.
- **Decision**: FIXED: the symlinked-manifest case in U9 now also asserts the remedy line and that the symlink is still in place.

### F5 — A created folder that is a symlink is reported as "kept"

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.ts:111
- **Detail**: The `kept` list includes every created folder that still exists. A `createdDirs` leaf replaced by a symlink is reported as "it holds files ai-toolkit-example did not install". The target is untouched; only the message is wrong. It is reachable only with a tampered manifest, or a leaf folder with no managed files under it.
- **Fix**: Filter `kept` to entries where `lstatOf(...)?.isDirectory()`, or accept as is.
- **Decision**: FIXED: `kept` now lists only created paths that are still real folders (`isDirectory()` on lstat).

### F6 — Output helpers and manifest path duplicated across modules

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/cli.ts:6, src/install.ts:9, src/uninstall.ts:8, src/manifest.ts:30
- **Detail**: `PREFIX` is defined three times and `printError` twice. `manifestFilePath` duplicates `abs(root, MANIFEST_PATH)`, which `uninstall.ts` uses directly. The duplication of `PREFIX` and `printError` predates this branch.
- **Fix**: Leave as is, or move `PREFIX` and `printError` into a small shared module in a later change.
- **Decision**: SKIPPED: the duplication is older than this branch and out of scope.

### F7 — A path could be swapped between the checks and the removal

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.ts:62-102
- **Detail**: If `.claude/skills` were replaced by a symlink between the symlink check and `rmSync`, removals would go through it. This needs a concurrent writer in the repo, and install has the same window.
- **Fix**: Accept for a local CLI; no change.
- **Decision**: ACCEPTED: a local CLI; install has the same window between its checks and its writes.
