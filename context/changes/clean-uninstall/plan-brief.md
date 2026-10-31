# Clean Uninstall — Plan Brief

> Full plan: `context/changes/clean-uninstall/plan.md`

## What & Why

Add an explicit `uninstall` command that removes exactly what install recorded in its manifest and nothing else, so a consumer repo returns to its pre-install state (roadmap S-05, FR-008/FR-006). npm never runs uninstall lifecycle scripts, and the toolkit is delivered through a pinned `npx` script, so without this command a removed toolkit leaves its plugin folder behind.

## Starting Point

Install already writes a validated manifest (files with SHA-256 hashes plus the folders it created) and contains the guards uninstall needs: edited-file detection, symlink refusal and all guards checked before the first write. It also already removes stale files and empty created folders during upgrades. `critical-path` runs 0.2.1, which has no `uninstall`, and its `.claude/` is gitignored.

## Desired End State

`npm run ai-toolkit -- uninstall` from the consumer root removes the manifest's files, the manifest and the now-empty folders install created, and reports any folder it kept because it holds consumer files. Install followed by uninstall leaves the tree byte-identical. Anything unsafe stops it before the first removal. 0.3.0 is published, and in `critical-path` it removed exactly the 0.2.1 install before 0.3.0 was re-installed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Locally edited managed file | Exit 1, remove nothing, list the files; no `--force` | Same all-guards-first rule as install; deleting consumer work stays the user's explicit act. |
| Managed file already missing | Treat as removed, silently | The desired end state anyway, and it makes an interrupted uninstall resumable. |
| No manifest | Exit 0 "not installed"; exit 1 if the plugin folder exists without one | Idempotent second run, while an orphaned folder is surfaced instead of hidden. |
| Scope | Release 0.3.0 and verify in `critical-path` | Proves the roadmap outcome, including a 0.3.0 uninstaller removing a 0.2.1 manifest. |
| Source of truth | Manifest only, not the running payload | The installed version may differ from the uninstaller's version. |
| "Edited" definition | Shared with install (recorded or shipped hash = unedited) | An interrupted upgrade must not block uninstall; one definition prevents drift. |
| Removal order | Files → created folders → manifest → `.claude` if created and empty | Manifest survives every failure point that a re-run would need it for. |
| Consumer's `ai-toolkit` script and `.npmrc` | Never touched; README lists them as manual follow-ups | The author wrote them, not install (CLAUDE.md hard rule). |

## Scope

**In scope:**
- `uninstall` command with install-grade guards and CLI wiring
- shared helper module extracted from `install.ts`
- `test/uninstall.test.ts` (U1–U15)
- README Uninstall section
- version 0.3.0, release, `critical-path` repoint and verification

**Out of scope:**
- `--force` and `--dry-run`
- editing consumer `package.json`, `.npmrc` or CI
- `CLAUDE.md` sentinel blocks (FR-005 parked)
- manifest format changes
- an uninstall step in `critical-path` CI
- update flow (S-06)

## Architecture / Approach

`src/uninstall.ts` mirrors install: plan → guards (consumer root, manifest validity, edited files, symlinks/non-regular paths) → apply → report. Path/stat helpers, the shipped-hash computation and the "edited" check move into shared modules used by both commands. Install's 18 existing tests prove the move changed nothing. Tests run the compiled CLI in temp consumer folders and compare whole-tree hashes. In `critical-path`, a before/after file-tree snapshot replaces `git status`, because `.claude/` is gitignored.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Uninstall command | `uninstall` with guards, shared helpers, U1–U15 | Helper move subtly changes install behaviour; caught by install tests 1–18 |
| 2. Release 0.3.0 and verify in critical-path | README, 0.3.0 release, real uninstall of 0.2.1 proven by snapshot diff, re-install | Snapshot misses a path; diff must list exactly 3 files, manifest, 5 folders |

**Prerequisites:** S-01 done (manifest); registry token for local `npx`; GitHub Release rights.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Assumes `critical-path` still holds the unmodified 0.2.1 install when Phase 2 runs; an edited file there would correctly block uninstall and need resolving first.
- The `kept` report relies on created folders being recorded; a folder that existed before install is never in `createdDirs` and is never removed.

## Success Criteria (Summary)

- Install then uninstall leaves a consumer tree byte-identical to before install (automated).
- In `critical-path`, uninstall removed exactly the toolkit's 3 files, manifest and 5 folders, and nothing else.
- Nothing the consumer edited or added is ever removed; unsafe states stop uninstall before the first removal.
