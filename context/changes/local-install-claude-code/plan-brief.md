# Local Install into Claude Code — Plan Brief

> Full plan: `context/changes/local-install-claude-code/plan.md`

## What & Why

Make `@remekgdansk/ai-toolkit-example` a packable npm package whose `npx ai-toolkit-example install` puts the toolkit's skill into `critical-path` inside a toolkit-named folder that Claude Code loads. This is roadmap slice S-01. It is the least familiar mechanism, and the S-03, S-04 and S-05 slices all build on its manifest.

## Starting Point

The repo is an empty `tsc` scaffold: a stock `package.json` (unscoped, `1.0.0`, CommonJS, no `bin` or `files`) and no `src/`. The course templates in `.claude/config-templates/` show a `postinstall`-based, error-swallowing installer that copies straight into `.claude/skills/<skill>/`. `critical-path` (npm 12, Claude Code 2.1.314) git-ignores `.claude/` and already has 35 skills there.

## Desired End State

From the `critical-path` root, `npm i -D <tgz>` and then `npx ai-toolkit-example install` creates `.claude/skills/ai-toolkit-example/` (a skills-directory plugin) and `.claude/.ai-toolkit-example-manifest.json`. After `/reload-plugins`, `/ai-toolkit-example:repo-refresh` runs a read-only skeleton. A re-run changes no bytes, and nothing outside the manifest is ever touched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Toolkit subfolder | Skills-directory plugin: `.claude/skills/ai-toolkit-example/{.claude-plugin/plugin.json, skills/repo-refresh/SKILL.md}` | Claude Code documents this layout as plugin `ai-toolkit-example@skills-dir`, enabled by default, so FR-004 holds without editing `settings.json`. | Plan (docs research) |
| Install trigger | Explicit `npx ai-toolkit-example install`; no `postinstall` | npm 12 blocks dependency install scripts unless the consumer approves them; an explicit command fails loudly and mirrors the explicit uninstall in FR-008. | Plan |
| Skill shipped in S-01 | `repo-refresh` skeleton with its final name and description and a read-only body | The name users see is final from day one, and S-04 fills in the same file. | Plan |
| Unmanaged path at a target | Abort before writing, name the paths, exit 1 | Enforces "never overwrite what the consumer wrote" with no partial state. | Plan + CLAUDE.md hard rule |
| Re-install | Manifest-driven replace with a per-file sha256; abort if a managed file was edited locally | Re-runs give the same result, stale files are dropped, and a local edit counts as consumer content; this also answers S-06's open question early. | Plan |
| Manifest | `.claude/.ai-toolkit-example-manifest.json`: package, version, files with sha256, folders install created; no timestamp | Gives S-05 an exact inverse (including folders install created), and keeps re-runs byte-identical. | Plan |
| Module format | `"type": "module"`, ESM output from `tsc` | With `verbatimModuleSyntax` + `nodenext`, a CommonJS package rejects `import` syntax. | Plan |
| Verification | `node --test` fixture suite (10 scenarios) + `claude plugin validate --strict` + critical-path walkthrough | No new dependencies, every decided edge case is covered, and later slices reuse the harness. | Plan |

## Scope

**In scope:**
- package.json identity, bin, files, scripts; tsconfig tidy-up
- `plugin/` folder (manifest + repo-refresh skeleton)
- `install` command with guards and hashed manifest
- `node --test` suite; short README with local install steps
- End-to-end check in `critical-path` (consumer change reverted)

**Out of scope:**
- `postinstall` or `allowScripts`; rules in `CLAUDE.md` (FR-005)
- `uninstall` (S-05); registry, `publishConfig`, `.npmrc`, CI (S-02/S-03)
- Real repo-refresh logic (S-04); `--force`; Copilot or Codex; Windows

## Architecture / Approach

The `ai-toolkit-example` CLI (`src/cli.ts`) routes `install` to `src/install.ts`. That module lists the bundled `plugin/` files (`src/payload.ts`), loads the previous manifest (`src/manifest.ts`), and checks every guard (local edit, unmanaged conflict, root, manifest validity) before any write. Then it removes stale managed files, writes the targets, and writes the manifest last.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Package skeleton and skill files | Packable package, strict-valid plugin folder, CLI routing | Dot-folder `plugin/.claude-plugin/` missing from the tarball |
| 2. Installer, manifest and guards | `install` with check-before-write guards; 10-scenario test suite | Guard logic letting a write through before a failure |
| 3. End-to-end check in critical-path | Skill usable from Claude Code in the real consumer; README | Workspace trust or launch directory hiding the plugin |

**Prerequisites:** Node ≥22 (dev: 24), the `claude` CLI on PATH for `validate:plugin`, a local `../critical-path` checkout with workspace trust accepted.
**Estimated effort:** ~2–3 hours across 3 phases (most of it in Phase 2).

## Open Risks & Assumptions

- If an I/O error interrupts the apply step, files can be written without a manifest; the next run then reports a conflict and the folder must be removed by hand. This is accepted for v1.
- `claude plugin list --json` behavior before trust is accepted is unverified; the check assumes `critical-path` is already trusted.
- The local-edit guard has no `--force`, so an intentional edit to an installed file blocks re-install until it is reverted.

## Success Criteria (Summary)

- `npx ai-toolkit-example install` in `critical-path` makes `/ai-toolkit-example:repo-refresh` usable from Claude Code, in a toolkit-named folder.
- Running install twice leaves `critical-path` byte-identical to running it once, and the existing 35 skills are untouched.
- Every install-time conflict or local edit stops the install with a named path and leaves the consumer unchanged.
