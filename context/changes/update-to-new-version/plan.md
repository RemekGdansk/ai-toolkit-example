# Update to a New Version (S-06) Implementation Plan

## Overview

Make updating the toolkit visible, documented and proven. Install already replaces an older install through the manifest. This change makes install report an update (or downgrade, or no-op) differently from a fresh install. It adds fixture tests that prove a dropped skill is removed with no duplicates. Then it releases 0.4.0 with a real `repo-refresh` skill change and updates `critical-path` from 0.3.0 to 0.4.0. This is roadmap slice S-06 (FR-007, FR-001).

## Current State Analysis

- Install is already an upgrade. It loads the previous manifest and removes managed files the running version no longer ships, together with created folders that are left empty. It rewrites only files whose hash differs and writes the manifest last (`src/install.ts:57-140`).
- The local-edit guard refuses the whole run and writes nothing when a managed file matches neither its recorded hash nor the shipped hash (`src/manifest.ts:105-127`, `src/install.ts:63-98`). The shipped-hash exception lets an interrupted upgrade finish on a re-run (S-01 review F-fix, test 17).
- Upgrade tests exist but are all synthetic: test 6 covers a stale file plus its created folder (`test/install.test.ts:174`), and tests 14–17 cover an edited stale file, a created folder with consumer files, a changed-file upgrade and an interrupted upgrade (`test/install.test.ts:330-398`).
- Every successful run prints the same line, `installed <name>@<version> (<n> files) into <TARGET_DIR>/` (`src/install.ts:150`). An update, a downgrade and a no-op re-run all look like a fresh install.
- A pin to an older version is installed with no signal that the version went backwards.
- README has `## Re-running` and `## Uninstall` sections but no update section. Version examples say `0.3.1`.
- `critical-path` pins `npx --yes @remekgdansk/ai-toolkit-example@0.3.0`, and its manifest records `0.3.0` with 3 files. Its `.claude/` is gitignored, so its CI `ai-toolkit` job always installs fresh. Latest release is `v0.3.1`. Since `v0.3.0` only `plugin/.claude-plugin/plugin.json` changed under `plugin/`.
- The package ships one skill, so a dropped skill can only be shown with a fixture.

## Desired End State

- Install prints one of four result lines:
  - fresh install (no manifest): `installed <name>@<new> (<n> files) into <TARGET_DIR>/`, unchanged from today;
  - no-op (same version, nothing added, changed or removed): `already at <name>@<new>; nothing changed in <TARGET_DIR>/`;
  - anything else: `<verb> <name> <old> -> <new> (<c> changed, <a> added, <r> removed, <u> unchanged) in <TARGET_DIR>/`, where `<verb>` is `updated` (new > old), `downgraded` (new < old), `reinstalled` (same version, files differ) or `replaced` (either version is not plain `x.y.z`).
- Local edits still block an update with nothing written, as decided.
- A downgrade runs and says `downgraded`. This works only when the target version is 0.4.0 or later, because a downgrade runs the older version's installer.
- README documents updating.
- `0.4.0` is published with a small real change to `repo-refresh`'s `SKILL.md`.
- `critical-path` is pinned to `0.4.0`. Its local update printed `updated @remekgdansk/ai-toolkit-example 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged) in .claude/skills/ai-toolkit-example/`. A before/after snapshot shows that only `plugin.json`, `SKILL.md` and the manifest changed. The changed skill shows up in Claude Code.

Verify by: `npm test` (new update-scenario tests), the `v0.4.0` release run, the `critical-path` snapshot diff, a green `ai-toolkit` CI job on the `critical-path` repoint PR, and the Claude Code check.

### Key Discoveries:

- Counts come from comparing the previous manifest with the new payload:
  - `changed`: path in both, recorded hash differs from the new hash;
  - `added`: path only in the payload;
  - `removed`: `staleFiles`;
  - `unchanged`: path in both, same hash.

  They do not come from `needsWrite`. So an interrupted upgrade, where the file already holds the new content, still counts as `changed`, matching the version transition being reported (`src/install.ts:57-60`, `:100-104`).
- Test 9 requires `plugin.json` version = `package.json` version (`test/install.test.ts:230`). The 0.4.0 bump must touch `package.json`, `package-lock.json` and `plugin/.claude-plugin/plugin.json`.
- The release workflow's tarball check lists every `dist/` module by name (`.github/workflows/publish-ai-toolkit.yml:59-74`). Any new `src/` module must be added there.
- S-05 recorded its `critical-path` proof as `reviews/critical-path-snapshot-diff.md`. S-06 follows the same pattern.

## What We're NOT Doing

- No change to the local-edit policy: no backup files, no `--force` flag, no partial update. The refusal stays all-or-nothing.
- No downgrade refusal and no extra downgrade guard.
- No real two-release proof of a dropped skill. Removal is proven by fixture tests only, and `critical-path` shows changed content and a clean manifest.
- No per-file list in the output, only counts.
- No change to uninstall, the manifest format or the publish workflow logic.
- No automatic update or update check (PRD Non-Goals). No Dependabot tracking of the pinned script.
- No change to `repo-refresh`'s script, hard rules or `allowed-tools`.

## Implementation Approach

Keep the update path as is and add only reporting on top of it, computed from data install already holds (`previous`, `payload`, `staleFiles`). Prove the roadmap outcome first with fixture tests that build a complete "previous version" state. Then ship the change, together with a real skill edit, as 0.4.0 and update the real consumer from 0.3.0.

## Critical Implementation Details

- **Downgrade wording only exists from 0.4.0 on.** Re-pinning `critical-path` to `0.3.1` runs the 0.3.1 installer, which prints the old `installed …` line. The README must say so and must not promise `downgraded` for targets older than 0.4.0. The downgrade itself still works, because the manifest format is unchanged.

## Phase 1: Update report and update-scenario tests

### Overview

Install tells a fresh install, an update, a downgrade, a re-install and a no-op apart, with versions and file counts. Fixture tests prove that a full update removes a dropped skill, leaves no duplicates and still refuses on local edits.

### Changes Required:

#### 1. Install result line

**File**: `src/install.ts`

**Intent**: Replace the single success line with the four result forms, so the author can see from the output that an update replaced the old version and left nothing stale.

**Contract**:
- Computed during planning, after the guards pass, from `previous.files` (path → recorded hash), the planned files (path → new hash) and `staleFiles`. These counts are `changed`, `added`, `removed` and `unchanged` as defined in Key Discoveries.
- Result line, chosen in this order:
  1. `previous === undefined`: `installed <name>@<new> (<n> files) into <TARGET_DIR>/` (unchanged wording).
  2. `previous.version === new` and `changed + added + removed === 0`: `already at <name>@<new>; nothing changed in <TARGET_DIR>/`.
  3. otherwise: `<verb> <name> <old> -> <new> (<c> changed, <a> added, <r> removed, <u> unchanged) in <TARGET_DIR>/`.
- Verb: if both versions match `^\d+\.\d+\.\d+$`, compare major, minor and patch numerically: higher is `updated`, lower is `downgraded`, equal is `reinstalled`. If either does not match: `reinstalled` when the strings are equal, else `replaced`.
- All lines carry the existing `ai-toolkit-example:` prefix. The skill invoke lines are printed for every success. The `next: run /reload-plugins …` line is printed for every success except the no-op.
- Logic stays in `src/install.ts` (a small pure helper is fine). If a new module is added instead, add its `dist/` file to the tarball check in `.github/workflows/publish-ai-toolkit.yml`.

#### 2. Update-scenario tests

**File**: `test/install.test.ts`

**Intent**: Prove FR-007 against a complete previous-version state, and pin the new output so the README stays accurate.

**Contract** (new tests continue the numbering after 18; they reuse the existing helpers `makeConsumer`, `run`, `readManifest`, `hashTree`, `writeAt`, `sha256`):
- 19. Full update from an older version. Start from a fresh install, then rewrite the manifest and tree to simulate version `0.0.1`:
  - an extra skill `skills/old-skill/` with `SKILL.md` and `scripts/old.mjs`, listed in `files` and `createdDirs`;
  - `SKILL.md` holding old content with its old hash;
  - `repo-refresh.mjs` absent from both disk and manifest.

  Install exits 0 and stdout contains `updated @remekgdansk/ai-toolkit-example 0.0.1 -> <current> (1 changed, 1 added, 2 removed, 1 unchanged)`. `old-skill/` is gone entirely, the file list under `TARGET_DIR` equals the shipped payload exactly (no duplicates or leftovers), the manifest lists exactly the payload with version `<current>`, and consumer files outside `TARGET_DIR` are byte-identical.
- 20. A same-version re-run prints `already at @remekgdansk/ai-toolkit-example@<current>; nothing changed`, does not print `/reload-plugins`, and leaves `hashTree` unchanged.
- 21. Downgrade: manifest version `99.0.0` → exit 0, stdout contains `downgraded @remekgdansk/ai-toolkit-example 99.0.0 -> <current>`, and the manifest version is `<current>`.
- 22. Update with a local edit: manifest version `0.0.1` and the `SKILL.md` recorded hash set to an old content hash, while the file on disk holds a third, user-edited content. Install exits 1, stderr lists `SKILL.md` and `revert`, stdout has no `updated` line, the edit is preserved and `hashTree` is unchanged.
- 23. A non-semver manifest version (`local-build`) gives `replaced … local-build -> <current>`.
- Test 6 also asserts `reinstalled … (0 changed, 0 added, 1 removed, 3 unchanged)`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including new tests 19–23 and the extended test 6
- Each new test fails when its behaviour is broken (break-check: for example, skip stale removal, or swap the verb comparison) and passes again when restored
- `npm pack` tarball still contains every `dist/` module the CLI loads (workflow tarball check passes on the PR)

#### Manual Verification:

- Against a scratch consumer, install from a local tarball of the current build over an existing install and read the result line. It is accurate and reads naturally.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Release 0.4.0 and update critical-path

### Overview

Ship the update report with a real `repo-refresh` skill change as `0.4.0`, document updating, and prove the roadmap outcome in `critical-path`: 0.3.0 → 0.4.0 delivers the changed skill, with nothing stale or duplicated.

### Changes Required:

#### 1. Skill change

**File**: `plugin/skills/repo-refresh/SKILL.md`

**Intent**: Make a small, genuinely useful change that shows up in Claude Code after the update, so "get the changed skill" is shown through behaviour, not metadata.

**Contract**: Edit only the `description` frontmatter or the guidance prose. For example, add trigger phrases such as "delete merged branches" or "after my PR was merged", so Claude matches more refresh requests. `name`, `allowed-tools`, `## Hard rules` and the script stay unchanged. Agree the exact wording with the author before the release.

#### 2. Version bump

**Files**: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json`

**Intent**: Publish as a new version (registry rejects reuse) and keep test 9's version equality.

**Contract**: `0.3.1` → `0.4.0` in all three, via `npm version 0.4.0 --no-git-tag-version` plus the `plugin.json` edit.

#### 3. README

**File**: `README.md`

**Intent**: Make updating usable from the README alone.

**Contract**:
- New `## Updating` section between `## Re-running` and `## Uninstall`. It covers:
  - bump the version in the `ai-toolkit` script, then run `npm run ai-toolkit -- install` (with a local build: install the newer tarball, then `npx ai-toolkit-example install`);
  - the result lines (`updated`, `already at`, `downgraded`, `reinstalled`, `replaced`) with an example of the counts line;
  - files and skills the new version no longer ships are removed, together with folders install created that become empty;
  - a locally edited installed file stops the update with nothing written: move the edit out, re-run (same message and remedy as the Re-running table);
  - rollback is re-pinning an older version. It works, but `downgraded` is printed only when the target version is 0.4.0 or later;
  - after updating, run `/reload-plugins` in Claude Code; in CI, the job picks up the new pin on its next run.
- `## Re-running`: the same-version re-run prints `already at …; nothing changed`.
- Version examples move from `0.3.1` to `0.4.0`.

#### 4. Release

**Intent**: Publish `0.4.0` through the existing workflow (FR-001).

**Contract**: PR with Phase 1 + Phase 2 changes is merged once green. `gh release create v0.4.0 --target main --generate-notes`. The `Publish AI Toolkit` release run is green and `npm view @remekgdansk/ai-toolkit-example versions` lists `0.4.0`.

#### 5. critical-path update and proof

**Repo**: `RemekGdansk/critical-path` (local clone `../critical-path`)

**Intent**: Prove S-06's outcome on the real consumer.

**Contract**:
- Before: snapshot every file path and hash under `critical-path`, excluding `.git/` and `node_modules/`; the manifest records `0.3.0`.
- On a branch, change the `ai-toolkit` script pin `0.3.0` → `0.4.0`, then run `npm run ai-toolkit -- install` locally.
- Expected stdout: `updated @remekgdansk/ai-toolkit-example 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged) in .claude/skills/ai-toolkit-example/`.
- After: snapshot again. The diff contains only `package.json` (pin), `.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json`, `.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md` and `.claude/.ai-toolkit-example-manifest.json`. The manifest version is `0.4.0` with exactly 3 files.
- A second install prints `already at …@0.4.0; nothing changed`.
- Local-edit check: append a line to the installed `SKILL.md` and run install. It exits 1 with nothing written. Revert the edit, and install prints `already at`.
- Open the repoint PR. The `ai-toolkit` CI job is green, then merge.
- Record the before/after diff, the outputs and the CI run link in `context/changes/update-to-new-version/reviews/critical-path-update-diff.md`.

#### 6. Roadmap unknown

**File**: `context/foundation/roadmap.md`

**Intent**: Close the S-06 open unknown with the decision taken here.

**Contract**: The S-06 `Unknowns` bullet "What happens to an installed file the user edited locally…" is marked resolved: an update refuses with nothing written; move the edit out and re-run. Status fields are left to the lifecycle skills.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with versions at `0.4.0` (test 9 included)
- The PR's `Publish AI Toolkit` check run is green
- The `v0.4.0` release run is green, and `npm view @remekgdansk/ai-toolkit-example versions` includes `0.4.0`
- The `critical-path` repoint PR's `ai-toolkit` CI job is green with the `0.4.0` pin

#### Manual Verification:

- In `critical-path`, the local update prints `updated @remekgdansk/ai-toolkit-example 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged)`
- The `critical-path` snapshot diff shows only the pin, `plugin.json`, `SKILL.md` and the manifest changed; the manifest is `0.4.0` with 3 files
- A second install in `critical-path` prints `already at …@0.4.0; nothing changed`
- An edited installed `SKILL.md` in `critical-path` blocks the update with nothing written; after reverting, install prints `already at`
- In Claude Code from `critical-path`, after `/reload-plugins`, the skill shows the new wording and `/ai-toolkit-example:repo-refresh` still runs `plan`
- README `## Updating` reads correctly on its own, including the downgrade caveat
- `reviews/critical-path-update-diff.md` records the diff, outputs and CI link

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- CLI-level tests in `test/install.test.ts` (tests 19–23 and the extended test 6) cover every result line and the four counts.
- Edge cases: interrupted upgrade counted as `changed` (test 17 keeps passing), non-semver versions, same version with differing files, dropped skill with a nested folder.

### Integration Tests:

- The release workflow runs `npm test` and the tarball check on the PR and on the `v0.4.0` release.
- The `critical-path` CI job installs `0.4.0` fresh from the registry.

### Manual Testing Steps:

1. Scratch consumer: install the current build over an existing install and read the line.
2. `critical-path`: snapshot, re-pin, update, snapshot, diff.
3. `critical-path`: re-run (no-op), edit-and-refuse, revert.
4. Claude Code in `critical-path`: `/reload-plugins`, check the new skill wording, run the skill's `plan`.

## Performance Considerations

None. The counts are computed from data install already holds.

## Migration Notes

Consumers on 0.3.x update by bumping the pin. The manifest format is unchanged, so 0.4.0 reads manifests from every earlier version, and uninstall from 0.3.0+ reads the 0.4.0 manifest.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd.md` (FR-007, FR-001, Guardrails)
- Install upgrade path: `src/install.ts:57-140`; edit guard: `src/manifest.ts:105-127`
- Existing upgrade tests: `test/install.test.ts:174`, `:330-398`
- S-05 proof pattern: `context/archive/2026-10-30-clean-uninstall/reviews/critical-path-snapshot-diff.md`
- S-03 pinned-script model: `context/archive/2026-10-30-install-from-registry/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Update report and update-scenario tests

#### Automated

- [x] 1.1 `npm test` passes, including new tests 19–23 and the extended test 6 — 107700e
- [x] 1.2 Each new test fails when its behaviour is broken and passes again when restored — 107700e
- [x] 1.3 `npm pack` tarball still contains every `dist/` module the CLI loads — 107700e

#### Manual

- [x] 1.4 Scratch-consumer update from a local tarball prints an accurate, natural result line — 107700e

### Phase 2: Release 0.4.0 and update critical-path

#### Automated

- [x] 2.1 `npm test` passes with versions at `0.4.0`
- [ ] 2.2 The PR's `Publish AI Toolkit` check run is green
- [ ] 2.3 The `v0.4.0` release run is green and the registry lists `0.4.0`
- [ ] 2.4 The `critical-path` repoint PR's `ai-toolkit` CI job is green with the `0.4.0` pin

#### Manual

- [ ] 2.5 `critical-path` local update prints `updated … 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged)`
- [ ] 2.6 `critical-path` snapshot diff shows only the pin, `plugin.json`, `SKILL.md` and the manifest changed
- [ ] 2.7 A second install in `critical-path` prints `already at …@0.4.0; nothing changed`
- [ ] 2.8 An edited installed `SKILL.md` in `critical-path` blocks the update; after reverting, install prints `already at`
- [ ] 2.9 Claude Code in `critical-path` shows the new skill wording and the skill still runs `plan`
- [ ] 2.10 README `## Updating` reads correctly on its own, including the downgrade caveat
- [ ] 2.11 `reviews/critical-path-update-diff.md` records the diff, outputs and CI link
