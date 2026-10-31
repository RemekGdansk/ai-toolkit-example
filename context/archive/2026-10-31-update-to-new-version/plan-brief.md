# Update to a New Version (S-06) — Plan Brief

> Full plan: `context/changes/update-to-new-version/plan.md`

## What & Why

Roadmap slice S-06 (FR-007, FR-001): the author bumps the toolkit version, publishes it, updates `critical-path` and gets the changed skill, with the old content replaced, dropped skills removed and nothing duplicated. It is the last slice of milestone M-1, and the PRD lists "bump, publish, update delivers the changed skill" as a primary success criterion.

## Starting Point

Install already acts as an upgrade. Through the manifest it removes files the new version no longer ships, rewrites only changed files and refuses with nothing written if an installed file was edited (`src/install.ts:57-140`). The tests cover this only with synthetic fixtures. On success install always prints `installed X@Y (n files)`, so an update looks like a fresh install. `critical-path` pins and has installed `0.3.0`; the latest release is `0.3.1`.

## Desired End State

Install reports `updated <name> 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged) in .claude/skills/ai-toolkit-example/` on an update. It reports `already at …; nothing changed` on a no-op re-run and `downgraded …` when going back. Fixture tests prove that a dropped skill is removed with no leftovers or duplicates. `0.4.0` is published with a small real `repo-refresh` skill change, `critical-path` is updated to it with a snapshot diff showing only the expected files changed, and the new skill wording shows up in Claude Code.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Locally edited installed file on update | Keep refusing, nothing written; README explains the remedy | No new code path, consistent with uninstall, and never overwrites consumer content (PRD guardrail). |
| Downgrade (pin older than the manifest) | Allowed, reported as `downgraded` | Rollback stays a re-pin; note that the wording appears only for targets ≥ 0.4.0, since the older version's installer runs. |
| Update output | One line with old → new version and changed/added/removed/unchanged counts; `already at` for a no-op | Shows the update landed and nothing stale stayed, without noisy per-file lists. |
| Count basis | Previous manifest hash vs new payload hash, not "file needed a write" | An interrupted upgrade still reports the real version transition. |
| Proof of a dropped skill | Fixture test only; `critical-path` proves changed content | One release, no throwaway skill, and the proof runs on every CI build. |
| Release content | One release, `0.4.0`, with a small real `SKILL.md` edit (wording agreed before release) | Shows a behaviour change in Claude Code instead of metadata only. |

## Scope

**In scope:**
- Result lines in `src/install.ts` (installed / already at / updated / downgraded / reinstalled / replaced)
- Tests 19–23 plus an extended test 6: full update with a dropped skill, no-op, downgrade, edit refusal during an update, non-semver version
- `repo-refresh` `SKILL.md` wording change, bump to `0.4.0`, README `## Updating`
- Release `v0.4.0`, update `critical-path` 0.3.0 → 0.4.0 with snapshot diff and CI, close the roadmap's local-edit unknown

**Out of scope:**
- Backup files, `--force` or partial updates on local edits
- Refusing downgrades
- A real two-release proof of a dropped skill
- Uninstall, manifest format or publish-workflow changes; automatic updates

## Architecture / Approach

No new commands or modules. After the guards pass, install already holds the previous manifest, the planned payload and the stale file list. Comparing them gives the four counts. A strict `x.y.z` numeric comparison picks the verb, with `replaced` as the fallback for non-semver versions. Everything else in the update path stays as it is.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Update report and update-scenario tests | Result lines plus fixture proof of dropped-skill removal, no duplicates, no-op, downgrade and edit refusal | Counts disagree with what was actually written (for example after an interrupted upgrade) |
| 2. Release 0.4.0 and update critical-path | Published 0.4.0, README `## Updating`, `critical-path` updated with snapshot diff, CI and Claude Code check | Claude Code doesn't pick up the new skill wording without a reload; the downgrade caveat is misdocumented |

**Prerequisites:** S-03 done (it is); `GH_PKG_TOKEN` in `critical-path` still valid; local `npm login` token for GitHub Packages.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- The exact `SKILL.md` wording is decided at implementation time and must leave `allowed-tools` and the hard rules untouched.
- Downgrades to versions before 0.4.0 print the old `installed …` line. They still work, because the manifest format is unchanged.

## Success Criteria (Summary)

- In `critical-path`, bumping the pin to `0.4.0` and running install prints `updated … 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged)`, and only the expected files change.
- Claude Code in `critical-path` shows the changed skill after `/reload-plugins`.
- Tests prove that a skill dropped in a newer version is removed with no leftovers or duplicates, and that a local edit blocks the update with nothing written.
