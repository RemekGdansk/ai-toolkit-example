<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Clean Uninstall

- **Plan**: context/changes/clean-uninstall/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 8 observations

Phase 1 was reviewed in depth earlier (`impl-review-phase-1.md`), and F1–F5 of that review were fixed in #10. This review covers Phase 2 (README, version bump, release, critical-path verification), the review-fix code, and how the two phases interact. It does not repeat the earlier findings.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run during the review:

- `npm test`: 70/70.
- U1–U15: present and passing.
- No path/stat helpers in `src/install.ts`.
- `package.json` and `plugin.json` both at 0.3.0.
- `v0.3.0` release run 41186513284: `check` and `publish` green; the tag resolves to `95fd58c`.
- critical-path#84: `ai-toolkit` job green. The PR is merged, which goes beyond the plan, which only asked to open it.
- Manual checks 2.5–2.8 were confirmed by the author.

Other notes:

- Every message the README quotes matches the source exactly.
- The "What We're NOT Doing" list is respected across both phases.
- The review fixes changed no Phase 1 test's intent.
- The roadmap still shows S-05 as `in-progress`. `/10x-archive` flips it to `done`, as in S-04.

## Findings

### F1 — The invalid-manifest remedy says to delete the plugin folder without warning about the user's files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.ts:32, README.md:225
- **Detail**: When the manifest is unreadable, invalid or foreign, uninstall says "Restore ... or delete it together with `.claude/skills/ai-toolkit-example/`", and the README row repeats it. The normal path never removes edited files and keeps folders with consumer files (U5, U7). This manual fallback drops both protections without a word, so following it can delete an edited `SKILL.md` or the user's notes.
- **Fix**: Change the uninstall message and its README row to "... or move out any files you changed or added there, then delete it together with `.claude/skills/ai-toolkit-example/`". Install's own row (README.md:180) stays as is, because the plan rules out install changes.
- **Decision**: FIXED: the uninstall message now says to move out changed or added files before deleting; the README row is updated to match.

### F2 — A plugin folder that became a file is neither removed nor reported

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/uninstall.ts:111
- **Detail**: Reproduced in a scratch repo. If `.claude/skills/ai-toolkit-example` is replaced by a regular file, uninstall exits 0 with `(0 files removed)`, prints no `kept` line, and deletes the manifest. Install then refuses the path. Before the `isDirectory()` filter (review fix F5), the path was reported with the re-install hint.
- **Fix**: For created paths that still exist but are no longer folders, print `left <path>: it is no longer a folder; remove it before installing again`. Keep the `isDirectory()` filter for the `kept` wording.
- **Decision**: FIXED: created paths that still exist but are no longer folders are reported as `left <dir>: it is no longer a folder; remove it before installing again`; U7b covers it; README updated.

### F3 — The evidence for 2.5 exists only in a temporary scratchpad

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/clean-uninstall/plan.md (Progress 2.5)
- **Detail**: Snapshots A, B and C of `critical-path` are in this session's scratchpad. That folder is temporary and outside the repo, so a later reader has only the checkbox. The A/B diff is 9 lines of paths and hashes, with nothing sensitive.
- **Fix**: Save `diff snapshot-A snapshot-B` (and A/C) as `context/changes/clean-uninstall/reviews/critical-path-snapshot-diff.md` in the close-out PR.
- **Decision**: FIXED: diffs saved as `reviews/critical-path-snapshot-diff.md`.

### F4 — Phase 1 Progress rows point to a commit that exists only on a branch

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/clean-uninstall/plan.md (Progress 1.1–1.4)
- **Detail**: Rows 1.1–1.4 carry `887f0a8`. That commit is reachable only from `clean-uninstall`, not `main`, because #10 was squash-merged as `95fd58c`. Deleting the remote branch would leave the SHAs dangling. The S-04 archive repointed branch SHAs to the squash commit (`context/archive/2026-10-30-safe-repo-refresh/reviews/archive-sha-repoint.md`).
- **Fix**: Repoint 1.1–1.4 to `95fd58c`, now in the close-out PR or at `/10x-archive`.
- **Decision**: FIXED: rows 1.1–1.4 now carry `95fd58c`.

### F5 — Review-fix deviations are recorded only in follow-ups

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/clean-uninstall/follow-ups/review-fixes.md
- **Detail**: Two review fixes changed the plan's Phase 1 Report contract (plan.md:122):
  - the plugin-folder `kept` hint (F2 of the earlier review);
  - `kept` listing only real folders (F5 of the earlier review).

  Both are recorded in `follow-ups/review-fixes.md`, which is where this workflow puts deviations; plan.md was not amended. The second one is recorded only tersely.
- **Fix**: Accept. Optionally expand the second entry to say that a created path which is no longer a folder is not reported (see F2).
- **Decision**: ACCEPTED: deviations stay in `follow-ups/review-fixes.md`, now updated with this review's F1, F2 and F4.

### F6 — The Uninstall section doesn't mention npm failing before uninstall runs

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: README.md:194-237
- **Detail**: `npm run ai-toolkit -- uninstall` goes through `npx` and needs the registry token, just like install. E401, ETARGET and E404 are documented only under `## Re-running` (README.md:186-192).
- **Fix**: Add one line: "npm can fail before uninstall runs (see the npm table under Re-running); then nothing is removed."
- **Decision**: FIXED: the README Uninstall section points to the npm table under Re-running.

### F7 — Deleting the CI secret doesn't revoke the token

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: README.md:236
- **Detail**: `gh secret delete GH_PKG_TOKEN` removes the secret from the repo, but the classic PAT stays valid until it expires.
- **Fix**: Add "and revoke the token on GitHub (Settings → Developer settings → Personal access tokens) unless something else uses it".
- **Decision**: FIXED: README says deleting the secret does not invalidate the token, and to revoke it unless something else uses it.

### F8 — The release workflow's tarball check doesn't cover the new modules

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/publish-ai-toolkit.yml:63-67
- **Detail**: The "Check tarball contents" step requires only `dist/cli.js` and the plugin files. `cli.js` imports `uninstall.js` and `fs-utils.js` statically, so a tarball missing either would break every command and still publish. Today's tarball contains both (checked with `npm pack --dry-run --json`).
- **Fix**: Add `package/dist/uninstall.js` and `package/dist/fs-utils.js` to the required entries.
- **Decision**: FIXED: the tarball check now requires all six `dist/` modules `cli.js` loads (`cli`, `install`, `uninstall`, `fs-utils`, `manifest`, `payload`), not only the two new ones.

### F9 — No test for `uninstall failed while removing files`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/uninstall.test.ts, src/uninstall.ts:103-107
- **Detail**: Install's I/O-error path has a test (install test 18); uninstall's removal-error branch has none, though the README documents it. A manual check passed: with `chmod 555` on `scripts/`, uninstall exits 1 and keeps the manifest; after restoring permissions, a re-run exits 0 and leaves an empty tree.
- **Fix**: Add U16: make a created folder read-only, assert exit 1, the message, and that the manifest remains; restore permissions and re-run to reach the pre-install hash. Skip it when running as root.
- **Decision**: FIXED: added U16 (read-only `scripts/` → exit 1, message, manifest kept; after restoring permissions a re-run reaches the pre-install hash). Break-check: U16 went red when the message was changed.
