<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Local Install into Claude Code

- **Plan**: context/changes/local-install-claude-code/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run on 2026-10-30:
- Phases 1–2: build, `validate:plugin`, `npm pack --dry-run` contents, CLI exit codes and `npm test` (10/10) all pass.
- Phase 3: critical-path `git status` is clean, the installed files match their manifest hashes, and `claude plugin list --json` shows `ai-toolkit-example@skills-dir` with project scope. Re-installing there was not repeated, to keep its `package.json` clean; it was shown working during implementation.

Drift review: every item matches the plan and all "What We're NOT Doing" guardrails hold. The only additions are defensive: a needed folder that exists as a non-folder is treated as a conflict, and files whose bytes are already identical are not rewritten.

## Findings

### F1 — Manifest paths are only limited to `.claude/`, not the plugin folder

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/manifest.ts:91 (isManagedPath), used at src/install.ts:105-113
- **Detail**:
  - `files[].path` and `createdDirs` are accepted anywhere under `.claude/`. Install deletes any listed file that is absent from the payload and still has its recorded hash, and runs `rmdir` on any listed empty folder.
  - Reviewer repro: adding `{path: ".claude/settings.json", sha256: <its hash>}` to the manifest makes install delete `.claude/settings.json`.
  - With `.claude/link` symlinked outside the repo, a listed `.claude/link/victim.txt` and an empty folder outside the root are deleted too. The comment at manifest.ts:90 claims the manifest "can never point the installer outside it", which is false.
  - Downgraded from the reviewer's CRITICAL: exploiting it needs write access to the consumer's `.claude/`, which already gives control of Claude Code settings and hooks. It still breaks the "touch only what install added" rule, and S-05 uninstall will trust the same manifest.
  - Manifest path validation has no tests.
- **Fix**:
  - Restrict `files[].path` to the `.claude/skills/ai-toolkit-example/` prefix.
  - Restrict `createdDirs` to that folder, its subfolders, or its ancestors `.claude` and `.claude/skills`.
  - Before any `rm` or `rmdir`, refuse a path that has a symlink anywhere below the root.
  - Add a test-8-style case rejecting `.claude/settings.json`, `.claude/other/x` and `../x` in the manifest.
- **Decision**: FIXED — manifest paths limited to the plugin folder (createdDirs may also be .claude, .claude/skills); a symlinked folder above a stale file or created folder is reported as a conflict; tests 11 and 12 added and break-checked

### F2 — Install writes through a symlinked `.claude/skills` or manifest

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/install.ts:83-88 (statOf follows symlinks), src/install.ts:116-126, src/manifest.ts:39, 74-75
- **Detail**:
  - If `.claude/skills` is a symlink to a shared folder, install exits 0 and writes the plugin into the shared folder outside the repo. The manifest records those folders as created by install, so later stale removals (and S-05 uninstall) would delete through the link, affecting every repo sharing it.
  - A dangling-symlink manifest makes install create a file outside the root.
  - Both cases were reproduced by the reviewer.
- **Fix A ⭐ Recommended**: Use `lstat` for the needed-folder and manifest checks, and treat a symlinked folder or manifest as an unmanaged conflict with a "move or replace the symlink" remedy.
  - Strength: Keeps every write inside the consumer root, which is what README.md "What gets written" promises. It reuses the existing conflict-reporting path.
  - Tradeoff: Users who deliberately share `.claude/skills` across repos via a symlink cannot install until they change that setup.
  - Confidence: HIGH — it is a one-function change and the guard already handles non-folder conflicts.
  - Blind spot: How common symlinked skills folders are among intended consumers. critical-path does not use one.
- **Fix B**: Allow a symlinked folder only when its realpath stays inside `realpath(root)`; reject it otherwise.
  - Strength: Supports in-repo symlink layouts while still blocking escapes.
  - Tradeoff: More code and more cases to test, for a layout no known consumer uses.
  - Confidence: MED — realpath comparison has edge cases (case-insensitive macOS volumes).
  - Blind spot: None significant beyond test coverage.
- **Decision**: FIXED (Fix A) — needed-folder guard uses lstat, so a symlinked .claude or .claude/skills is a conflict; a manifest that is not a regular file is a conflict; test 13 added and break-checked

### F3 — Tests miss the safety-critical paths

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: test/install.test.ts
- **Detail**:
  - Scenarios 1–10 match the plan and their "nothing written" checks hash the whole folder. But nothing tests:
    - manifest path bounds (F1);
    - symlinked folders (F2);
    - an edited stale file blocking the run;
    - a created folder holding consumer files surviving;
    - an upgrade where an existing managed file gets new content.
  - Test 5 checks only two files, not the whole tree.
  - `tsconfig.json` includes only `src`, so `test/*.ts` is never type-checked.
- **Fix**: Add cases for the bounds, the symlinked folder, the edited stale file, the consumer-content folder and the changed-file upgrade, alongside the F1/F2 fixes. Switch test 5 to a whole-tree hash.
- **Decision**: FIXED — tests 11–13 (bounds, symlinks, via F1/F2) and 14–16 (edited stale file, created folder with consumer files, changed-file upgrade) added and break-checked; test 5 now hashes the whole folder. Type-checking test/ left out (would need a second tsconfig).

### F4 — After a failed write, the re-run tells the user to revert edits they never made

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/install.ts:56-69, 131-134; README.md (Re-running table)
- **Detail**:
  - The plan accepts that an interrupted apply leaves a state the next run reports instead of repairing.
  - During an upgrade, though, files already written carry the new hash. The re-run then reports them as "changed after install … revert your edits", and the user cannot revert because the old content is gone.
  - Reproduced by the reviewer with a forced EACCES.
- **Fix**: In the local-edit guard, also accept a managed file whose hash equals the new payload hash. A half-applied upgrade then completes on re-run.
- **Decision**: FIXED — local-edit guard also accepts the new shipped hash, so a half-applied upgrade completes on re-run; test 17 added and break-checked. A crash during the very first install (folder, no manifest) is still reported as a conflict.

### F5 — Unexpected errors print a raw stack trace without the CLI prefix

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/install.ts:59-84, src/payload.ts:40, 60, src/cli.ts
- **Detail**: The plan says all messages are prefixed `ai-toolkit-example:`. I/O errors in the guard phase (for example, a `chmod 000` installed file) escape as an uncaught `node:fs` stack trace with exit 1. Nothing is written, so this is safe.
- **Fix**: Wrap the plan phase in one try/catch that prints a prefixed message plus "nothing was written", exit 1.
- **Decision**: FIXED (differently) — cli.ts catches unexpected errors and prints a prefixed one-line message, exit 1, instead of wrapping the guard phase; test 18 added and break-checked.

### F6 — `install` ignores extra arguments, so `install --help` installs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/cli.ts:23-25
- **Detail**: `ai-toolkit-example install --help` (or `install --dry-run`) performs a real install and exits 0.
- **Fix**: Reject extra arguments after `install` with usage on stderr and exit 2.
- **Decision**: FIXED — any argument after `install` exits 2 with usage; test 10 extended and break-checked; README re-running note updated.

### F7 — Packed tarball is not git-ignored

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .gitignore
- **Detail**: `npm pack` leaves `remekgdansk-ai-toolkit-example-0.1.0.tgz` untracked in the repo root, where a broad `git add` would commit it.
- **Fix**: Add `*.tgz` to `.gitignore`.
- **Decision**: FIXED — `*.tgz` added to .gitignore.
