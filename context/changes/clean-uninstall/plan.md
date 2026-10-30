# Clean Uninstall Implementation Plan

## Overview

Add an explicit `uninstall` command that removes exactly what install recorded in its manifest and nothing else, so a consumer repo returns to its pre-install state. Ship it as 0.3.0 through the existing release path and prove it in `critical-path` by uninstalling the 0.2.1 install there. This is roadmap slice S-05: FR-008 (explicit uninstall removing exactly what the manifest lists) and FR-006 (the manifest as the record).

## Current State Analysis

- The CLI knows one command, `install` (`src/cli.ts:7-37`); any other command exits 2 with the usage.
- The manifest at `.claude/.ai-toolkit-example-manifest.json` already holds what uninstall needs: `files` with SHA-256 hashes and `createdDirs` (`src/manifest.ts:15-20`). `readManifest` returns `undefined` only when the file is absent and throws `ManifestError` for unreadable, invalid or foreign manifests (`src/manifest.ts:37-63`). Validation restricts `files` to `.claude/skills/ai-toolkit-example/` and `createdDirs` to that folder or its ancestors (`src/manifest.ts:91-106,134,149`).
- `install` already performs a partial uninstall during an upgrade: it deletes stale files, then removes created folders deepest-first only when empty (`src/install.ts:120-129`).
- `install` has the guards uninstall needs, all checked before the first write:
  - local edit: the hash matches neither the recorded nor the shipped content, or the path is not a regular file (`src/install.ts:58-72`)
  - symlinked folder above anything it may remove (`src/install.ts:100-105`)
  - the manifest itself must be a regular file (`src/install.ts:94-98`)
  - a consumer-root check on `package.json` (`src/install.ts:26-29`)
- The path and stat helpers are private to `install.ts`: `abs`, `ancestors`, `byDepthAscending`, `isEmptyDir`, `lstatOf`, `statOf`, `missingAsUndefined` (`src/install.ts:193-233`). So is the shipped-hash computation (`src/install.ts:53`).
- Tests run the compiled CLI against temp consumer folders and compare whole-tree hashes (`test/install.test.ts:34-91`). Each test file is self-contained; tests are not type-checked.
- `critical-path` has 0.2.1 installed: 3 files and 5 created folders, all under `.claude/skills/ai-toolkit-example/`. Its `.claude/` and `.claude/skills/` predate the install. Its `ai-toolkit` script pins `npx --yes @remekgdansk/ai-toolkit-example@0.2.1`, and 0.2.1 has no `uninstall`. Its `.claude/` is gitignored, so `git status` cannot show what uninstall did. Its `ai-toolkit` CI job asserts that the manifest version equals the pinned version.

## Desired End State

- `npx ai-toolkit-example uninstall` (or `npm run ai-toolkit -- uninstall`), run from the consumer root, behaves as follows:
  - It removes every file the manifest lists, then the manifest, then every folder in `createdDirs` that is empty by then.
  - It touches nothing else, prints what it did and exits 0.
  - Install followed by uninstall leaves the consumer tree byte-identical to before install.
- Uninstall checks every guard before its first removal. When a guard fails it removes nothing and exits 1:
  - a managed file was edited
  - the manifest is malformed or foreign
  - a symlink sits above a removal target
  - there is no `package.json` in cwd
  - the plugin folder exists without a manifest
- A managed file that is already gone counts as removed, so an interrupted uninstall finishes when re-run.
- With no manifest and no plugin folder, uninstall prints "not installed" and exits 0 (idempotent).
- 0.3.0 is published, and `critical-path`'s script pins it. In `critical-path`, uninstall removed exactly the 0.2.1 install, confirmed by a before/after tree snapshot. The toolkit was then re-installed at 0.3.0 for S-06.

Verify by: `npm test` (new `test/uninstall.test.ts`), the `v0.3.0` release run, the `critical-path` snapshot diff and a green `ai-toolkit` CI job on the `critical-path` repoint PR.

### Key Discoveries:

- Uninstall is manifest-driven, not payload-driven. The real run is a 0.3.0 uninstaller removing a manifest written by 0.2.1 whose `plugin.json` hash differs from what 0.3.0 ships (`critical-path/.claude/.ai-toolkit-example-manifest.json`).
- "Edited" must keep install's definition (`src/install.ts:67`): recorded hash or the running version's shipped hash both count as unedited. Otherwise an interrupted upgrade (new content written, manifest still old) would block uninstall.
- The manifest sits inside `.claude/`, which install records in `createdDirs` when it created it (fresh-repo test 1). The folder cannot be removed before the manifest.
- The consumer's `ai-toolkit` script and `.npmrc` were written by the author following the README, not by install. Removing them is a README step, never something uninstall does (CLAUDE.md hard rule: never overwrite what the consumer wrote).

## What We're NOT Doing

- No `--force` flag or any path that deletes a locally edited managed file. The user moves or deletes it themselves.
- No `--dry-run` or confirmation prompt; uninstall stays non-interactive like install.
- No edits to the consumer's `package.json`, `.npmrc`, CI workflow or secrets; the README lists them as manual follow-ups.
- No sentinel-block removal from `CLAUDE.md`: install writes no text blocks yet (FR-005 parked).
- No manifest format change.
- No uninstall step in `critical-path`'s CI job.
- No update-flow changes (S-06).
- No change to install's behaviour beyond moving shared helpers.

## Implementation Approach

Mirror install's structure: plan → guards → apply → report. Collect every guard failure first and print them together, as install does. Move the path/stat helpers, the "edited" check and the shipped-hash computation into shared modules so install and uninstall cannot drift on what "edited" or "safe to remove" means. Install's existing tests prove the move changed nothing. Then release through the existing tag-driven workflow and verify where the roadmap outcome is defined, in `critical-path`.

## Critical Implementation Details

**Removal order.** Remove in this order:

1. Managed files.
2. Created folders that are not ancestors of the manifest, deepest first and only when empty.
3. The manifest.
4. Any remaining created folders (in practice `.claude`, when install created it), only when empty.

This puts the manifest's deletion after everything except its own parent. Any failure before that point leaves a manifest that a re-run uses to finish, because missing files and folders are skipped.

**Version in output.** Uninstall reports the manifest's `version` (what was installed), not the running package's version. The two differ in the 0.2.1 → 0.3.0 case.

## Phase 1: Uninstall command

### Overview

Add `uninstall` to the CLI with install-grade guards, sharing install's helpers, and cover every decided behaviour with tests that run the compiled CLI.

### Changes Required:

#### 1. Shared filesystem helpers

**File**: `src/fs-utils.ts` (new), `src/install.ts`

**Intent**: Move the path/stat helpers out of `install.ts` so uninstall uses identical path resolution, symlink detection and empty-folder checks.

**Contract**: Export `abs`, `ancestors`, `byDepthAscending`, `isEmptyDir`, `lstatOf`, `statOf` with their current signatures and semantics (`src/install.ts:193-233`). `install.ts` imports them. Behaviour is unchanged, and install tests 1–18 pass untouched.

#### 2. Shared "edited" check and shipped hashes

**File**: `src/payload.ts`, `src/manifest.ts` (or `src/fs-utils.ts`), `src/install.ts`

**Intent**: One definition of "a managed file the consumer changed" for both commands.

**Contract**:
- A function returns the shipped SHA-256 per target path for the running package; this is today's `src/install.ts:53`.
- A function takes the root, the manifest's files and the shipped hashes, and returns:
  - the edited paths: the path exists and either is not a regular file or its hash matches neither the recorded nor the shipped hash
  - the current hashes of the unedited existing files
- Missing paths are neither. Install uses it in place of `src/install.ts:58-72`.

#### 3. Uninstall command

**File**: `src/uninstall.ts` (new)

**Intent**: Remove exactly what the manifest lists, after checking every guard before the first removal.

**Contract**: `export function uninstall(): number`, resolving paths against `process.cwd()`. The steps, in order:

1. **Consumer root:** no `package.json` in cwd → exit 1 with the same message install uses (`no package.json in <root>; run from the consumer repo root`).
2. **Manifest:** `readManifest(root, pkg.name)`.
   - `ManifestError` → exit 1 with its message plus `nothing was removed. Restore <MANIFEST_PATH> to the file install wrote, or delete it together with <TARGET_DIR>/.`
   - Absent and `TARGET_DIR` absent → print `not installed in <root>; nothing removed`, exit 0.
   - Absent and `TARGET_DIR` present (any kind of entry) → exit 1 with `<TARGET_DIR>/ exists but <MANIFEST_PATH> does not; it is not managed by ai-toolkit-example, so nothing was removed. Delete it yourself if it is a leftover install.`
3. **Guards**, all collected before any removal; on any failure print `uninstall stopped; nothing was removed.` followed by every group:
   - Edited files (shared check) → list them, then `-> move these files out of <TARGET_DIR>/ (or delete them), then re-run uninstall.`
   - Unsafe paths: the manifest is not a regular file, or an ancestor of any manifest file, created folder or the manifest is a symlink → list them, then `-> these paths are symlinks or not regular files; removing through them could delete files outside the repo. Replace or remove them, then re-run uninstall.`
4. **Apply**, in the order from Critical Implementation Details. Files: `rmSync` without `force` on the paths that exist; already-missing ones are skipped. Folders: `rmdirSync` only when `isEmptyDir`. Any thrown error → exit 1 with `uninstall failed while removing files: <message>` and `re-run uninstall; anything already removed is skipped.`
5. **Report**, exit 0:
   - `uninstalled <pkg>@<manifest version> (<n> files removed) from <TARGET_DIR>/`
   - one `kept <dir>/: it holds files ai-toolkit-example did not install` per created folder left non-empty
   - `next: run /reload-plugins in Claude Code (or restart it). If you no longer need the toolkit, remove the ai-toolkit script from package.json and the @remekgdansk line from .npmrc.`

All lines use the `ai-toolkit-example:` prefix, on stderr for errors and stdout otherwise, as in install.

#### 4. CLI wiring

**File**: `src/cli.ts`

**Intent**: Expose the command with the same argument strictness as `install`.

**Contract**:
- USAGE gains `uninstall  Remove everything install added, using its manifest`.
- `uninstall` with any extra argument exits 2 with the usage, so `uninstall --help` removes nothing.
- `uninstall` with no arguments returns `uninstall()`.

#### 5. Tests

**File**: `test/uninstall.test.ts` (new)

**Intent**: Prove each decided behaviour against the compiled CLI in temp consumer folders, self-contained like the existing test files.

**Contract**: Named tests:
- U1. In a repo with no `.claude/`, install then uninstall exits 0, and `hashTree` equals the pre-install hash, so `.claude/` itself is gone.
- U2. Pre-existing `.claude/settings.json` and `.claude/skills/other-skill/SKILL.md` are byte-identical after uninstall, and `.claude/skills` stays (it was not created by install).
- U3. A second uninstall exits 0, prints `not installed`, and the tree is unchanged.
- U4. A plugin folder with no manifest exits 1, and the tree is unchanged.
- U5. An edited managed file exits 1, lists the path, and the tree is unchanged (edit preserved).
- U6. A managed file deleted beforehand: exit 0, and the rest is removed, so the tree equals the pre-install hash.
- U7. A consumer file inside a created folder: the file stays, its folder stays and is reported as `kept`, every managed file and the manifest are gone, and exit 0.
- U8. A malformed manifest and a foreign-package manifest each exit 1 and remove nothing.
- U9. A symlinked `.claude/skills` (pointing outside the repo) or a symlinked manifest exits 1, and nothing outside the repo is removed.
- U10. Cross-version: a manifest whose version and hashes describe older content, with files holding that content, is fully removed (exit 0; output names the manifest's version).
- U11. Interrupted upgrade: the file holds the shipped content but the manifest records an older hash. The file is removed, not reported as edited.
- U12. Resume: some managed files and their emptied created folders are already gone, as an interrupted uninstall leaves them, but the manifest is still present. A re-run exits 0 and reaches the pre-install hash.
- U13. No `package.json` exits 1 and removes nothing.
- U14. `uninstall extra` exits 2; `--help` output lists `uninstall`.
- U15. Install → uninstall → install succeeds, and the second install's manifest equals the first's.

### Success Criteria:

#### Automated Verification:

- Build, plugin typecheck and the whole suite pass, including install tests 1–18 unchanged: `npm test`
- `test/uninstall.test.ts` contains U1–U15 and all pass: `node --test test/uninstall.test.ts` after `npm run build`
- `src/install.ts` no longer defines its own path/stat helpers: `grep -nE '^function (abs|ancestors|lstatOf|statOf|isEmptyDir)' src/install.ts` finds nothing

#### Manual Verification:

- In a scratch repo with a local `npm pack` tarball, `npx ai-toolkit-example install` then `npx ai-toolkit-example uninstall` prints the success, `kept` (if any) and `next:` lines as specified and leaves no `.claude/skills/ai-toolkit-example/` or manifest behind

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Release 0.3.0 and verify in critical-path

### Overview

Document uninstall, publish it as a new version, and prove the roadmap outcome in `critical-path`: the 0.2.1 install is removed with nothing else touched, then 0.3.0 is re-installed so S-06 starts from a working install.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Make uninstall usable from the README alone, including the version-pin catch and the manual follow-ups install never owned.

**Contract**:
- New `## Uninstall` section after `## Re-running`. It covers:
  - the command `npm run ai-toolkit -- uninstall` (local-tarball: `npx ai-toolkit-example uninstall`), run from the repo root
  - the pinned version must be 0.3.0 or later; an install made by an older version is uninstalled by bumping the pin first
  - what is removed (the manifest's files, the manifest, the empty folders install created) and what stays (anything else, including created folders holding your files, reported as `kept`)
  - an exit-1 table: no `package.json`, edited files, symlinks or non-regular paths, malformed or foreign manifest, plugin folder without a manifest, `uninstall failed while removing files`
  - `not installed` exits 0
  - manual follow-ups: run `/reload-plugins`, remove the `ai-toolkit` script, the `.npmrc` scope line, the CI job and the `GH_PKG_TOKEN` secret if the toolkit is no longer wanted
- Version examples move from `0.2.1` to `0.3.0`.
- The usage sentence about unknown commands mentions `uninstall`.

#### 2. Version bump

**File**: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json`

**Intent**: Publish only a new version (CLAUDE.md hard rule); a new command is a minor bump. Plugin and package versions stay equal (install test 9).

**Contract**: `npm version 0.3.0 --no-git-tag-version`; `plugin.json` `version: "0.3.0"`.

#### 3. Release

**File**: GitHub Release `v0.3.0` (this repo)

**Intent**: Deliver uninstall through the registry, the only way `critical-path` gets it.

**Contract**: PR, merge once checks are green, then `gh release create v0.3.0 --target main --generate-notes`.

#### 4. Verify in critical-path

**File**: `critical-path/package.json` (`ai-toolkit` script); `critical-path/.claude/` (gitignored, local only)

**Intent**: Prove "back exactly as it was before install" on the real consumer. Because `.claude/` is gitignored, a tree snapshot replaces `git status`.

**Contract**:
1. On a `critical-path` branch, change the pin from `0.2.1` to `0.3.0`.
2. Take snapshot A: every path under the repo, excluding `.git/` and `node_modules/`, with a SHA-256 per file. For example: `find . \( -path ./.git -o -path ./node_modules \) -prune -o -print | sort`, plus `shasum -a 256` for files.
3. Run `npm run ai-toolkit -- uninstall` and take snapshot B.
4. `diff A B` must show exactly these removed and nothing else:
   - the 3 manifest files
   - the manifest
   - the 5 created folders
5. Run `npm run ai-toolkit -- install` (0.3.0), commit the pin change, open the PR. Its `ai-toolkit` CI job checks that the manifest version equals the pin.

### Success Criteria:

#### Automated Verification:

- Test suite passes with the bumped versions: `npm test`
- Versions agree: `node -p "require('./package.json').version"` and `plugin/.claude-plugin/plugin.json` both give `0.3.0`
- The release run of `Publish AI Toolkit` for `v0.3.0` succeeds through the publish job: `gh run list --workflow "Publish AI Toolkit" --event release --limit 1`
- `critical-path`'s `ai-toolkit` CI job passes on the repoint PR

#### Manual Verification:

- In `critical-path`, `diff` of snapshots A and B lists exactly the 3 files, the manifest and the 5 created folders as removed, with no other line
- In `critical-path`, other `.claude/` content (10x skills, `playwright-cli`, settings, `.10x-cli-manifest.json`) is still present and Claude Code no longer lists `ai-toolkit-example@skills-dir` after `/reload-plugins`
- After the re-install, `/ai-toolkit-example:repo-refresh` is available again and the manifest names version `0.3.0`
- The README Uninstall section alone is enough to run the uninstall in `critical-path` without consulting this plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None separate. Behaviour is tested through the compiled CLI, as for install, because the contract is exit code + output + filesystem state.

### Integration Tests:

- U1–U15 in `test/uninstall.test.ts` (Phase 1). The tree-hash equality tests (U1, U6, U12) are the "exact inverse of install" guardrail from the roadmap risk.
- Install tests 1–18 stay green after the helper move.

### Manual Testing Steps:

1. Scratch repo with a local tarball: install, uninstall, inspect output (Phase 1).
2. `critical-path`: snapshot, uninstall the 0.2.1 install with 0.3.0, snapshot, diff (Phase 2).
3. `critical-path`: re-install 0.3.0 and run the skill (Phase 2).

## Performance Considerations

None: a handful of files and folders.

## Migration Notes

Installs made by 0.1.x/0.2.x are uninstalled by 0.3.0 unchanged, because the manifest format is the same and uninstall reads only the manifest (U10). Consumers must bump their pinned version before running uninstall; the README says so.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md` (FR-006, FR-008)
- Install guards to mirror: `src/install.ts:23-169`
- Manifest validation: `src/manifest.ts:37-159`
- Prior release-and-verify phase: `context/archive/2026-10-30-safe-repo-refresh/plan.md` (Phase 3)
- `critical-path` setup (gitignored `.claude/`, pinned npx script, CI job): `context/archive/2026-10-30-install-from-registry/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Uninstall command

#### Automated

- [x] 1.1 Build, plugin typecheck and the whole suite pass, including install tests 1–18 unchanged: `npm test`
- [x] 1.2 `test/uninstall.test.ts` contains U1–U15 and all pass
- [x] 1.3 `src/install.ts` no longer defines its own path/stat helpers

#### Manual

- [x] 1.4 Scratch-repo install then uninstall prints the specified lines and leaves no plugin folder or manifest

### Phase 2: Release 0.3.0 and verify in critical-path

#### Automated

- [ ] 2.1 Test suite passes with the bumped versions: `npm test`
- [ ] 2.2 `package.json` and `plugin.json` both give `0.3.0`
- [ ] 2.3 The `Publish AI Toolkit` release run for `v0.3.0` succeeds through the publish job
- [ ] 2.4 `critical-path`'s `ai-toolkit` CI job passes on the repoint PR

#### Manual

- [ ] 2.5 `critical-path` snapshot diff lists exactly the 3 files, the manifest and the 5 created folders as removed
- [ ] 2.6 Other `.claude/` content in `critical-path` is intact and the plugin is gone after `/reload-plugins`
- [ ] 2.7 After re-install, `/ai-toolkit-example:repo-refresh` is available and the manifest names `0.3.0`
- [ ] 2.8 The README Uninstall section alone is enough to run the uninstall in `critical-path`
