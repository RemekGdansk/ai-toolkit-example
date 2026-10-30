# Local Install into Claude Code Implementation Plan

## Overview

Turn the empty TypeScript scaffold into the packable npm package `@remekgdansk/ai-toolkit-example`. Its `npx ai-toolkit-example install` command copies a repo-refresh skeleton skill into the consumer repo as a Claude Code skills-directory plugin at `.claude/skills/ai-toolkit-example/`. The installer records every file and folder it added in a hashed manifest, gives the same result when re-run, and never overwrites content it doesn't own. This is roadmap slice S-01 (FR-003, FR-004, FR-006, NFR-install-idempotent, US-01). The install source is a locally packed `.tgz`; registry delivery is S-03.

## Current State Analysis

- `package.json` is the unedited `npm init` output: unscoped name, version `1.0.0`, `"type": "commonjs"`, `"main": "index.js"`, no `bin`, no `files`, placeholder `test` script.
- `tsconfig.json` maps `src` → `dist` with `module: nodenext`, `verbatimModuleSyntax: true`, declarations and source maps on, and a leftover `"jsx": "react-jsx"`. `src/` does not exist yet.
- `.gitignore` already ignores `node_modules/` and `dist/`.
- The course templates `.claude/config-templates/m5l4-github-packages-{install,uninstall}.js.template` are a reference only. They are plain CJS, copy into `.claude/skills/<skill>/` (no subfolder), run from `postinstall`, and swallow every error as a warning. All four of these conflict with decisions made here.
- Consumer `critical-path` (`../critical-path`) is local. It runs Node v24.21.0, npm 12.0.2 and Claude Code 2.1.314. It git-ignores `.claude/`, `CLAUDE.md` and `AGENTS.md` and tracks nothing under `.claude/`. It already has 35 skill folders under `.claude/skills/` (34 `10x-*` + `playwright-cli`) and has no `.npmrc`.

## Desired End State

From the `critical-path` root, running `npm i -D <path-to>/remekgdansk-ai-toolkit-example-0.1.0.tgz` and then `npx ai-toolkit-example install` produces:

```text
.claude/
├── .ai-toolkit-example-manifest.json
└── skills/ai-toolkit-example/
    ├── .claude-plugin/plugin.json
    └── skills/repo-refresh/SKILL.md
```

After `/reload-plugins`, Claude Code (launched from the repo root, workspace trusted) lists the plugin `ai-toolkit-example@skills-dir`, and `/ai-toolkit-example:repo-refresh` runs the read-only skeleton. A second `install` exits 0 and leaves every byte unchanged. Nothing outside the manifest is touched. Verify with the Phase 2 test suite and the Phase 3 walkthrough.

### Key Discoveries:

- **Claude Code skills-directory plugin** (code.claude.com docs `plugins/loading.md`, `plugins/manifest-reference.md`, `skills.md`, fetched 2026-10-30): a folder `.claude/skills/<name>/` containing `.claude-plugin/plugin.json` loads as plugin `<name>@skills-dir`, with its skills at `<name>/skills/<skill>/SKILL.md`, invoked as `/<name>:<skill>`. `name` is the only required manifest key and must be kebab-case. `defaultEnabled` is true, so no `settings.json` entry is needed. A project-scope plugin loads only after the workspace trust dialog is accepted and only when Claude Code launches from the repo root. `-p` alone doesn't satisfy trust. Run `/reload-plugins` after install. `claude plugin validate <dir> [--strict]` and `claude plugin list --json` exist in the local CLI. This resolves the roadmap S-01 unknown: the subfolder requirement is achievable as written.
- **npm 12.0.0 breaking change** (npm/cli CHANGELOG): dependency lifecycle scripts are blocked unless the root package's `allowScripts` policy approves them. A `postinstall` would silently not run in `critical-path`, so install is an explicit bin command instead.
- `m5l4-github-packages-install.js.template:54-71` holds the sentinel-block logic. It is not used here because FR-005 (rules in `CLAUDE.md`) is parked.
- `m5l4-github-packages-install.js.template:84-100`: the template manifest carries `installedAt`. A timestamp would break byte-identical idempotency, so this manifest has none.

## What We're NOT Doing

- No `postinstall` or any other install-time lifecycle script, and no `allowScripts` entry in the consumer.
- No rules or sentinel block in the consumer's `CLAUDE.md` (FR-005 parked).
- No `uninstall` command. That is S-05; this change only records what it needs (files with hashes, folders install created).
- No registry config: no `publishConfig`, no `repository` field, no `.npmrc`, no publish workflow (S-02 / S-03).
- No real repo-refresh logic: the skill is a read-only skeleton until S-04 fills in the same file.
- No `--force` override for the conflict or local-edit guards.
- No Copilot or Codex output (FR-009 / FR-010 parked). No Windows support.
- No committed change to `critical-path`. Its `package.json`/lockfile change from installing the `.tgz` is reverted after verification.

## Implementation Approach

A single CLI binary `ai-toolkit-example` (ESM, compiled by `tsc`, zero runtime dependencies) with an `install` subcommand. The files to install live in this repo under `plugin/`, shaped exactly like the skills-directory plugin, and are copied 1:1 to `<root>/.claude/skills/ai-toolkit-example/`. Install is plan-then-apply. It first computes the full set of target writes and removals and checks every guard. Only if all guards pass does it write anything, and the manifest goes last. The previous manifest is the only source of truth for what the toolkit owns.

## Critical Implementation Details

**Module format.** With `verbatimModuleSyntax: true` and `module: nodenext`, a `"type": "commonjs"` package makes `tsc` reject `import` statements in `.ts` files. Switch the package to `"type": "module"`. Locate the bundled `plugin/` folder and `package.json` relative to `import.meta.url`, never `process.cwd()`.

**Order of operations.** All guard checks complete before the first filesystem write. Removals of stale managed files come before writes. The manifest is written last, so a guard failure always leaves the consumer byte-identical. If an I/O error interrupts the apply step, the user sees a non-zero exit. The next run then reports conflicts instead of guessing; the "Open risks" note in the brief accepts this.

**Dot-folder packing.** `plugin/.claude-plugin/plugin.json` sits in a dot-folder. Confirm it appears in `npm pack --dry-run` output (criterion 1.3); without it the installed folder is not a plugin.

## Phase 1: Package skeleton and skill files

### Overview

Make the repo a correctly shaped, packable package with the plugin files and a CLI entry that parses commands. It installs nothing yet.

### Changes Required:

#### 1. Package metadata

**File**: `package.json`

**Intent**: Give the package its real identity, its single bin and an allow-list so only runtime files ship.

**Contract**: `name: "@remekgdansk/ai-toolkit-example"`, `version: "0.1.0"`, a one-line `description`, `license: "MIT"` (matches `LICENSE`), `type: "module"`, no `main`, `bin: { "ai-toolkit-example": "dist/cli.js" }`, `files: ["dist/", "plugin/"]` (npm adds `package.json`, `README.md`, `LICENSE` itself), `engines: { "node": ">=22" }`. Scripts: `build: "tsc"`, `prepack: "npm run build"`, `test: "npm run build && node --test 'test/**/*.test.ts'"`, `validate:plugin: "claude plugin validate plugin --strict"`. devDependencies are unchanged.

#### 2. Compiler config

**File**: `tsconfig.json`

**Intent**: Compile only `src/` and stop emitting artifacts a CLI doesn't need.

**Contract**: add `"include": ["src"]`; remove `jsx`; set `declaration`, `declarationMap` and `sourceMap` to false (or drop them). Leave the strictness options untouched.

#### 3. Plugin files

**Files**: `plugin/.claude-plugin/plugin.json`, `plugin/skills/repo-refresh/SKILL.md`

**Intent**: Ship the exact folder Claude Code loads as `ai-toolkit-example@skills-dir`, with the repo-refresh skill under its final name so S-04 edits this same file.

**Contract**: `plugin.json` has `name: "ai-toolkit-example"` (must equal the folder name the installer creates), `version` equal to `package.json`'s version, plus `description` and `author`, so `--strict` passes. `SKILL.md` frontmatter has `name: repo-refresh` and a `description` worded from FR-011 / Business Logic (update main from the remote, clean up local branches whose work is already in main, with confirmation). The body is read-only for now: it reports the current branch, local branches with upstream state, and which appear merged into main, and it states plainly that it deletes nothing until the full skill ships.

#### 4. CLI entry

**File**: `src/cli.ts`

**Intent**: The bin entry point: parse the subcommand, route it, own exit codes and output.

**Contract**: starts with `#!/usr/bin/env node` (tsc keeps it). `ai-toolkit-example install` routes to the installer (stubbed to "not implemented", exit 1, in this phase). `--help` / no args prints usage and exits 0. An unknown command prints usage to stderr and exits 2. All messages are prefixed `ai-toolkit-example:`.

### Success Criteria:

#### Automated Verification:

- Build succeeds and emits an executable entry: `npm run build` exits 0 and `dist/cli.js` starts with `#!/usr/bin/env node`
- Plugin files validate strictly: `npm run validate:plugin` exits 0
- Package contents are exactly the runtime set: `npm pack --dry-run` lists `dist/cli.js` (+ other `dist/*.js`), `plugin/.claude-plugin/plugin.json`, `plugin/skills/repo-refresh/SKILL.md`, `package.json`, `LICENSE`, and no `src/`, `test/`, `context/` or `.claude/` paths
- CLI routing works: `node dist/cli.js --help` exits 0; `node dist/cli.js bogus` exits 2

#### Manual Verification:

- The `SKILL.md` description reads as the intended repo-refresh trigger, and its body clearly deletes nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Installer, manifest and guards

### Overview

Implement `install` with the check-before-write guards and the hashed manifest, covered by a `node --test` suite that runs the compiled CLI against temp-folder consumers.

### Changes Required:

#### 1. Plugin file listing

**File**: `src/payload.ts`

**Intent**: Enumerate every file under the bundled `plugin/` folder and map each to its target path in the consumer.

**Contract**: returns `{ sourcePath, targetPath }` pairs, where `targetPath` is POSIX-relative to the consumer root under `.claude/skills/ai-toolkit-example/`, sorted. The plugin root is resolved from `import.meta.url`.

#### 2. Manifest

**File**: `src/manifest.ts`

**Intent**: Read, validate, hash and write the install manifest, which is the only record of what the toolkit owns (FR-006) and the input S-05 uninstall will use.

**Contract**: path `<root>/.claude/.ai-toolkit-example-manifest.json`. Shape:

```json
{
  "package": "@remekgdansk/ai-toolkit-example",
  "version": "0.1.0",
  "files": [{ "path": ".claude/skills/ai-toolkit-example/.claude-plugin/plugin.json", "sha256": "<hex>" }],
  "createdDirs": [".claude/skills/ai-toolkit-example", ".claude/skills/ai-toolkit-example/.claude-plugin"]
}
```

`files` holds the installed file contents' sha256 values, sorted by path. `createdDirs` lists the folders install created because they did not exist, carried forward across re-installs, and sorted. It includes `.claude` and `.claude/skills` when install created them. The manifest does not list itself and has no timestamp. It is written as 2-space JSON plus a trailing newline. An unreadable or invalid file, or one whose `package` differs, is a hard error rather than "no manifest".

#### 3. Installer

**File**: `src/install.ts` (wired from `src/cli.ts`)

**Intent**: Plan the install, check every guard, then apply it, so re-running gives the same result and nothing the consumer wrote is overwritten.

**Contract**:
- **Root:** `process.cwd()`. If it has no `package.json`, exit 1 with "run from the consumer repo root".
- **Guard: local edit.** A file listed in the previous manifest that exists but no longer matches its recorded sha256 fails the install. A listed file that is missing is not an error.
- **Guard: unmanaged conflict.** A target path that is not in the previous manifest but already exists (file or folder) fails the install. So does an existing `.claude/skills/ai-toolkit-example/` when there is no manifest.
- **On any guard failure:** print every offending path grouped by reason, with the remedy (revert the edit, or move or delete the path), write nothing, and exit 1.
- **Apply:** remove files from the previous manifest that are absent from the new file list, then remove now-empty folders listed in `createdDirs`, deepest first. Create the missing folders, recording the new ones. Write all target files. Write the manifest last.
- **Output:** on success, print the version, the file count, the invocation `/ai-toolkit-example:repo-refresh`, and a reminder to run `/reload-plugins` (or restart Claude Code from the repo root) and to accept workspace trust. Exit 0.

#### 4. Test suite

**File**: `test/install.test.ts`

**Intent**: Prove each decided behavior black-box. Each test gets its own `mkdtemp` consumer with a `package.json` and runs `node <repo>/dist/cli.js install` with that folder as `cwd`. S-04 and S-05 reuse this harness.

**Contract**: one test per scenario:
1. Fresh install into a repo with no `.claude/` → exit 0; three paths exist; the manifest lists two files with correct hashes; `createdDirs` includes `.claude` and `.claude/skills`.
2. A pre-existing `.claude/skills/other/SKILL.md` and `CLAUDE.md` are byte-identical after install.
3. A second run → exit 0, and the hash of the whole fixture folder is unchanged.
4. A pre-existing `.claude/skills/ai-toolkit-example/` with no manifest → exit 1, the conflicting path is named, and the fixture hash is unchanged.
5. An edited installed `SKILL.md`, then re-run → exit 1, the edit is preserved, and the manifest is unchanged.
6. A manifest listing an extra managed file (correct hash) that the current files no longer include → re-run removes it and its now-empty created folder.
7. No `package.json` in `cwd` → exit 1, and nothing is written.
8. A manifest that is malformed or names a foreign `package` → exit 1, and nothing is written.
9. `plugin/.claude-plugin/plugin.json` `version` equals `package.json` `version`.
10. An unknown subcommand → exit 2.

### Success Criteria:

#### Automated Verification:

- Type check and build are clean: `npm run build` exits 0
- All installer scenarios pass: `npm test` exits 0 with tests 1–10 above reported as passing

#### Manual Verification:

- Conflict and local-edit error messages, triggered in a scratch folder, name every offending path and say what to do next

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-end check in critical-path

### Overview

Prove the slice outcome in the real consumer and document the local install path.

### Changes Required:

#### 1. README

**File**: `README.md` (new)

**Intent**: A short, accurate install note for the local `.tgz` path, which S-03 later extends with the registry path.

**Contract**: sections: what the package is; Install (`npm pack` here, `npm i -D <tgz>` in the consumer, `npx ai-toolkit-example install` from the consumer root); Use in Claude Code (accept workspace trust, launch from the repo root, `/reload-plugins`, `/ai-toolkit-example:repo-refresh`); What gets written (the three paths); Re-running (exit-1 cases and remedies).

#### 2. Consumer walkthrough (no committed change)

**Repo**: `../critical-path`

**Intent**: Run the slice outcome exactly as the user will, then restore the consumer.

**Contract**: record hashes of `.claude/skills/*` before install. Run `npm i -D ../ai-toolkit-example/remekgdansk-ai-toolkit-example-0.1.0.tgz`, then `npx ai-toolkit-example install` twice, then check Claude Code. Finally `git checkout package.json package-lock.json` and `npm install` to restore `node_modules`. The installed `.claude/` files are git-ignored there and may stay for S-04 work.

### Success Criteria:

#### Automated Verification:

- Tarball is produced: `npm pack` in this repo creates `remekgdansk-ai-toolkit-example-0.1.0.tgz`
- Install in critical-path succeeds: `npx ai-toolkit-example install` exits 0 and creates `.claude/skills/ai-toolkit-example/` and `.claude/.ai-toolkit-example-manifest.json`
- Re-install is a no-op: a second `npx ai-toolkit-example install` exits 0 and `shasum` of the manifest and both installed files is identical before and after
- Existing consumer skills are untouched: hashes of the 35 pre-existing `.claude/skills/*` folders match the pre-install record
- Claude Code sees the plugin: `claude plugin list --json` run from the critical-path root includes id `ai-toolkit-example@skills-dir` with project scope

#### Manual Verification:

- In Claude Code launched from the critical-path root, `/reload-plugins` then `/ai-toolkit-example:repo-refresh` runs the skeleton, reports branches and deletes nothing
- critical-path's `package.json` and `package-lock.json` are reverted, and `git status` there is clean
- Following README.md literally reproduces the install

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None separate. The installer is tested black-box through the compiled CLI, which is what consumers run.

### Integration Tests:

- `test/install.test.ts` scenarios 1–10 (Phase 2): fresh install, consumer files untouched, byte-identical re-run, unmanaged conflict, local edit, stale removal, missing root, bad manifest, version consistency, usage error.
- `claude plugin validate plugin --strict` for plugin structure (needs the `claude` CLI; run locally, not part of `npm test`).

### Manual Testing Steps:

1. In `critical-path`, record `.claude/skills/*` hashes, install the `.tgz`, then run `npx ai-toolkit-example install`.
2. Launch `claude` from the `critical-path` root, run `/reload-plugins`, then `/ai-toolkit-example:repo-refresh`; confirm it reports branches and deletes nothing.
3. Edit the installed `SKILL.md`, re-run install, and confirm exit 1 with the path named. Revert the edit and re-run to confirm exit 0.
4. Revert `critical-path`'s `package.json`/lockfile and confirm `git status` is clean.

## Performance Considerations

None. A few small files are copied once per run.

## Migration Notes

None. No consumer has an earlier version installed.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-003, FR-004, FR-006, NFR install idempotent, US-01)
- Tech stack: `context/foundation/tech-stack.md`
- Reference installer: `.claude/config-templates/m5l4-github-packages-install.js.template:14-100`
- Reference spec: `.claude/prompts/m5l4-github-packages-spec-pack.md:80-90`
- Claude Code docs: https://code.claude.com/docs/en/plugins/loading.md, https://code.claude.com/docs/en/plugins/manifest-reference.md, https://code.claude.com/docs/en/skills.md
- npm 12 install-script policy: npm/cli `CHANGELOG.md` 12.0.0 breaking changes

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Package skeleton and skill files

#### Automated

- [x] 1.1 Build succeeds and emits an executable entry — 25154b7
- [x] 1.2 Plugin files validate strictly — 25154b7
- [x] 1.3 Package contents are exactly the runtime set — 25154b7
- [x] 1.4 CLI routing works — 25154b7

#### Manual

- [x] 1.5 The SKILL.md description reads as the intended repo-refresh trigger, and its body clearly deletes nothing — 25154b7

### Phase 2: Installer, manifest and guards

#### Automated

- [x] 2.1 Type check and build are clean — fdf17eb
- [x] 2.2 All installer scenarios pass — fdf17eb

#### Manual

- [x] 2.3 Conflict and local-edit error messages name every offending path and say what to do next — fdf17eb

### Phase 3: End-to-end check in critical-path

#### Automated

- [x] 3.1 Tarball is produced
- [x] 3.2 Install in critical-path succeeds
- [x] 3.3 Re-install is a no-op
- [x] 3.4 Existing consumer skills are untouched
- [x] 3.5 Claude Code sees the plugin

#### Manual

- [x] 3.6 In Claude Code, /reload-plugins then /ai-toolkit-example:repo-refresh runs the skeleton and deletes nothing
- [x] 3.7 critical-path's package.json and package-lock.json are reverted, and git status there is clean
- [x] 3.8 Following README.md literally reproduces the install
