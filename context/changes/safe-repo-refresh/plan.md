# Safe Repo Refresh Implementation Plan

## Overview

Replace the read-only `repo-refresh` preview with the real skill (roadmap slice S-04: FR-011, US-01, NFR "no unmerged work is ever lost"). Asked to refresh, Claude Code in `critical-path` updates `main` from the remote without switching branches. It then lists every local branch as "delete" or "keep" with a reason and deletes only the branches the author confirms, each re-checked right before deletion. All git logic lives in a deterministic, fixture-tested script bundled with the skill; the LLM only runs it, shows its output and asks for confirmation. The slice ends by releasing `0.2.0` and running the US-01 scenario in `critical-path`.

## Current State Analysis

- `plugin/skills/repo-refresh/SKILL.md` is the S-01 preview: read-only, reports branches, labels `git branch --merged main` as "appear merged (regular merge only)" and says squash merges are not detected.
- The installer copies every file under `plugin/` into `.claude/skills/ai-toolkit-example/` and records each in the manifest (`src/payload.ts:28-46`, `src/install.ts`). A new file under `plugin/skills/repo-refresh/` ships and installs with no installer change. Upgrading a managed file whose shipped content changed is already handled (`test/install.test.ts:366` "16. an upgrade rewrites a managed file…").
- `critical-path` does not have the toolkit as a dependency: it runs a pinned `npx --yes @remekgdansk/ai-toolkit-example@0.1.0` script (S-03 decision, `context/archive/2026-10-30-install-from-registry/plan-brief.md`). The toolkit CLI is therefore not available there at skill run time, so the refresh logic must travel inside the plugin folder.
- Claude Code substitutes `${CLAUDE_SKILL_DIR}` (the folder holding `SKILL.md`; for plugin skills, the skill's own subfolder) in skill content. The docs do not say it is expanded inside `allowed-tools`: their bundled-script example uses a wildcard rule (`Bash(python3 *)`) with the path only in the body. Skills-directory plugins do pre-approve their own `allowed-tools` (Claude Code skills docs and changelog, checked via Context7 on 2026-10-30).
- Tests use `node:test`, spawn processes against temp folders and clean up with `t.after` (`test/install.test.ts:33-45`). `npm test` = `npm run build && node --test 'test/**/*.test.ts'`. Test 9 requires `plugin.json` version == `package.json` version.
- The release workflow's tarball check lists required packaged paths explicitly (`.github/workflows/publish-ai-toolkit.yml`, "Check tarball contents").
- Local toolchain: git 2.56, Node 24. `git merge-tree --write-tree` needs git ≥ 2.38.

## Desired End State

`/ai-toolkit-example:repo-refresh` in `critical-path` (installed from the registry at `0.2.0`):

1. Runs `node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs plan`, which fast-forwards local `main` from its upstream without changing the checked-out branch or the working tree (or warns and continues against local `main`), then prints a delete list and a keep list, each branch with a reason.
2. Asks once: delete all listed / choose which / cancel.
3. Runs `… repo-refresh.mjs delete <branch>=<sha> …` for exactly the chosen branches; the script re-classifies and deletes a branch only if it is still a candidate at the same tip.
4. Never deletes `main`, the checked-out branch, a branch checked out in another worktree, a branch with changes not in `main`, a branch with no commits of its own (unless fast-forward merged with a gone upstream), or a candidate that is the last surviving holder of a stash's base commit. Never touches the remote except `git fetch --prune`.

Verify with the fixture suite (`npm test`), a scratch-repo walkthrough in Claude Code, and the US-01 run in `critical-path`.

### Key Discoveries:

- In a scratch repo (git 2.56), patch-id matching (`git cherry`) still reported a squash-merged branch as "in main" after `main` reverted the squash; `git merge-tree --write-tree main <branch>` correctly returned a tree different from `main`'s. The merge-tree check is the deletion predicate.
- A branch tip that is an ancestor of `main` covers three different cases: a freshly created branch, a fast-forward-merged branch and a regular-merged branch. Only the first two sit on `main`'s first-parent history; a regular merge's tip sits on a side parent. The rule order below depends on this.
- An `allowed-tools` rule for `plan` only lets the read-only-in-effect `plan` command run without a permission prompt while `delete` still goes through the normal prompt. Whether `${CLAUDE_SKILL_DIR}` expands inside that rule is unverified; Phase 2 tests it first (see Phase 2 §3).

## What We're NOT Doing

- No remote branch deletion and no push of any kind (PRD Non-Goals). `git fetch --prune` only removes stale remote-tracking refs locally.
- No support for a default branch other than `main`, and no remote other than `main`'s configured upstream remote.
- No Windows support (PRD Non-Goals).
- No patch-id (`git cherry`) detection, alone or combined: it produced a false positive after a revert.
- No auto-deletion without confirmation, and no "don't ask again" mode.
- No updating of branches other than `main`, no rebasing, no stash changes.
- No installer, uninstall (S-05) or update-flow (S-06) changes. Phase 3 uses the existing upgrade path once; S-06 still owns proving updates in general.
- No rules in the consumer's `CLAUDE.md` (FR-005, parked).
- No Copilot/Codex variants of the skill (FR-009/FR-010, parked).

## Implementation Approach

One zero-dependency ESM script, `plugin/skills/repo-refresh/scripts/repo-refresh.mjs`, written in plain JavaScript with `// @ts-check` and JSDoc types and type-checked by `tsc` in `npm test`. It shells out to `git` with argument arrays (no shell strings) and exposes two subcommands:

- `plan [--json]`: update `main`, classify, print the report (text by default; `--json` for tests).
- `delete <branch>=<sha>…`: re-classify without updating, delete only branches that are still candidates at the given tip.

`SKILL.md` becomes a thin driver: run `plan`, show the report verbatim, ask, run `delete` with exactly the chosen pairs, show the result. The skill instructs the model not to run any other mutating git command.

Shipping JavaScript (not TypeScript) inside `plugin/` keeps the plugin folder self-contained. It runs on any supported Node in the consumer without a build step, avoids generated files in `plugin/`, and needs no installer change.

## Critical Implementation Details

**Classification order is load-bearing.** Evaluate each local branch other than `main` with the first matching rule:

| # | Condition | Result | Reason text (gist) |
|---|-----------|--------|--------------------|
| 1 | It is the checked-out branch | keep | checked out |
| 2 | It is checked out in another worktree (`git worktree list --porcelain`) | keep | checked out in worktree `<path>` |
| 3 | Its tip is on `main`'s first-parent history (`git rev-list --first-parent main`) and its upstream is gone | candidate | fast-forward merged; upstream gone |
| 4 | Its tip is on `main`'s first-parent history | keep | no commits of its own |
| 5 | Its tip is an ancestor of `main` (`git merge-base --is-ancestor`) | candidate | merged into main |
| 6 | `git merge-tree --write-tree --no-messages <main-sha> <branch>` exits 0 and its first output line equals `main`'s tree | candidate | squash-merged: merging it into main would change nothing |
| 7 | anything else (including merge-tree exit 1 = conflicts) | keep | has changes not in main |

A gone upstream is appended to the reason as a supporting signal for rules 5–6 and as "upstream gone, not enough on its own" for rule 7; it never changes the result on its own. `main` itself is always listed as kept ("main"). Resolve `main`'s commit and tree once per run and use those SHAs for every check.

**Stash pass runs after classification.** For each stash entry, the base is `stash@{n}^1`. If no kept branch (including `main` and the checked-out branch) contains the base, move every candidate that contains it to kept with reason "holds the base of stash@{n}". Use `git for-each-ref --contains <base> refs/heads/`.

**Updating `main` without switching branches.**
- Upstream = `branch.main.remote` + `branch.main.merge`. If there is none, warn "main has no upstream" and skip the update.
- Run `git -c credential.interactive=never fetch --prune <remote>` with `GIT_TERMINAL_PROMPT=0` and a 60 s `spawnSync` timeout, so it can never wait on a prompt or a stalled network. Do not set `GIT_SSH_COMMAND`: it would override the author's `core.sshCommand`. On failure or timeout (offline, auth), warn and skip the update.
- If `main` is checked out here, run `git merge --ff-only <upstream>`. On failure (diverged, or the update would touch dirty files), warn.
- If `main` is checked out in another worktree, warn and skip.
- Otherwise:
  - If local `main` is an ancestor of the upstream, update it with `git update-ref refs/heads/main <new> <old>` (compare-and-swap).
  - If `main` is ahead of the upstream, report that and skip the update.
  - If they have diverged, warn and skip the update.
- In every warn case, classification continues against local `main`. A staler `main` only shrinks the candidate list.

**`delete` safety.** Parse every `<branch>=<sha>` argument first. Then classify once (no fetch, no update). For each requested branch, delete it only if it exists, its tip equals `<sha>`, and it is a candidate in the fresh classification. Delete with `git branch -D <branch>`, because squash-merged branches are not `-d`-able. If `git branch -D` itself fails, report the branch as refused with git's message. This happens, for example, for a branch mid-rebase in another worktree, which `git worktree list --porcelain` reports as `detached`, so rule 2 misses it. Report each refused branch with its reason. Exit 1 if any branch was refused, otherwise 0.

**Preconditions.** Fail with exit 1 and change nothing when:
- git is older than 2.38;
- the current directory is not inside a git work tree;
- there is no local `main`;
- a merge, rebase, cherry-pick or bisect is in progress (`git rev-parse --git-path` checks for `MERGE_HEAD`, `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD`, `BISECT_LOG`).

Usage errors exit 2.

## Phase 1: Refresh script — update and classify

### Overview

Build the `plan` subcommand of the bundled script with the agreed rules, type-check it, and prove every rule against fixture repositories.

### Changes Required:

#### 1. Refresh script (`plan`)

**File**: `plugin/skills/repo-refresh/scripts/repo-refresh.mjs`

**Intent**: Deterministically update `main` and classify every local branch so no squash-detection or deletion logic is left to the LLM.

**Contract**: `node repo-refresh.mjs plan [--json]`, run from anywhere inside the repo. Text output has fixed sections, in order:
- `Main:` — updated `<old>..<new>` / already up to date / not updated: `<reason>`
- `Delete (N):` — `<branch> <short-sha>  <reason>` per line
- `Keep (N):` — `<branch>  <reason>` per line
- `Warnings:` — only when there are any

`--json` prints `{ main: { updated: boolean, from, to, note }, candidates: [{ branch, sha, reason }], kept: [{ branch, sha, reason }], warnings: [string] }`. Exit 0 on success (warnings included), 1 on failed preconditions, 2 on usage errors. Classification, stash pass, main update and preconditions follow "Critical Implementation Details". Classification is a function reused by `delete` in Phase 2. The script invokes `git` via `execFileSync`/`spawnSync` with argument arrays and `LC_ALL=C`.

#### 2. Plugin script type-check

**File**: `tsconfig.plugin.json` (new), `package.json`

**Intent**: Keep the shipped JavaScript under the same strict type checking as `src/`.

**Contract**: `tsconfig.plugin.json` sets `allowJs`, `checkJs`, `noEmit`, `strict`, `module: nodenext`, `types: ["node"]` and includes `plugin/**/*.mjs`. New script `"typecheck:plugin": "tsc -p tsconfig.plugin.json"`. `test` becomes `npm run build && npm run typecheck:plugin && node --test 'test/**/*.test.ts'`.

#### 3. Fixture-repo tests for `plan`

**File**: `test/repo-refresh.test.ts` (new)

**Intent**: Prove each classification rule and the main-update behaviour on real git repositories, including the revert and stash edge cases that motivated the rules.

**Contract**: Each test builds a temp bare "remote" plus a clone, with git isolated from the user's config (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, fixed author/committer env, `init -b main`), removed with `t.after`. Tests spawn `node plugin/skills/repo-refresh/scripts/repo-refresh.mjs plan --json` and assert on the JSON and on the repo state. Named tests:

- R1 off `main`: local `main` is fast-forwarded to the remote; HEAD, the checked-out branch and the working tree (including uncommitted changes) are unchanged.
- R2 on `main` with a clean tree: `main` is fast-forwarded.
- R3 local `main` diverged from the remote: warning, `main` unchanged, classification still runs against local `main`.
- R4 `main` with no upstream, and an unreachable remote: warning each, exit 0.
- R5 regular-merged branch: candidate "merged into main".
- R6 squash-merged branch, with `main` moving on afterwards: candidate "squash-merged".
- R7 squash-merged branch with one extra commit after the squash: kept.
- R8 squash-merged branch whose squash `main` later reverted: kept.
- R9 a branch at a `main` commit:
  - with no upstream: kept "no commits of its own";
  - with an upstream present: kept;
  - fast-forward merged with its upstream gone: candidate.
- R10 an unmerged branch with a gone upstream: kept, and the reason mentions the gone upstream.
- R11 a merged branch that is checked out: kept. A merged branch checked out in another worktree: kept.
- R12 a branch whose merge-tree conflicts with `main`: kept.
- R13 stash rules:
  - a squash-merged candidate that is the only holder of a stash's base: kept;
  - two candidates hold the base and no kept branch does: both kept;
  - the base is reachable from `main`: the candidate stays a candidate.
- R14 `plan` changes no `refs/heads/*` except `main` and leaves the remote's refs unchanged.
- R15 no local `main`, and a rebase in progress: exit 1 with nothing changed. Unknown subcommand: exit 2.

#### 4. Installer test 1 expected file list

**File**: `test/install.test.ts` (test 1, `assert.deepEqual(manifest.files, …)` at line ~103)

**Intent**: Test 1 asserts the exact list of installed files, so the new script must be added to it.

**Contract**: Add `{ path: <TARGET_DIR>/skills/repo-refresh/scripts/repo-refresh.mjs, sha256: sha256(pluginSource("skills/repo-refresh/scripts/repo-refresh.mjs")) }` after the `SKILL_MD` entry. Target paths sort `SKILL.md` before `scripts/`. No installer code changes.

### Success Criteria:

#### Automated Verification:

- Type check of the bundled script passes: `npm run typecheck:plugin`
- Full test suite passes, including R1–R15 and the existing installer tests: `npm test`
- The script has no imports outside `node:` built-ins: `grep -nE "from ['\"]" plugin/skills/repo-refresh/scripts/repo-refresh.mjs | grep -v "from ['\"]node:"` finds nothing

#### Manual Verification:

- `plan` on this repo (on a feature branch) prints readable Main/Delete/Keep sections whose reasons match the real branch history, and leaves the checked-out branch and working tree unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Delete command and skill flow

### Overview

Add the re-checked `delete` subcommand and turn `SKILL.md` into the plan → list → confirm → delete driver.

### Changes Required:

#### 1. Refresh script (`delete`)

**File**: `plugin/skills/repo-refresh/scripts/repo-refresh.mjs`

**Intent**: Make deletion independent of anything the model remembers: a branch is deleted only if it is still a candidate at the tip the author saw.

**Contract**: `node repo-refresh.mjs delete <branch>=<sha> [<branch>=<sha>…]`, where `<sha>` is 7–40 hex characters matched as a prefix of the branch tip. Any other `<sha>` is a usage error (exit 2). Same preconditions as `plan`, with no fetch and no `main` update. Prints `Deleted (N):` and `Refused (N):` (`<branch>  <reason>`) sections. Behaviour and exit codes as in "Critical Implementation Details". The text output of `plan` ends with the exact `delete` command line for all candidates, using full SHAs, so the skill copies arguments instead of composing them.

#### 2. Delete tests

**File**: `test/repo-refresh.test.ts`

**Intent**: Prove the confirmation boundary holds even if the model passes stale or wrong arguments.

**Contract**: Named tests:
- D1 deletes the listed regular-merged and squash-merged candidates; other branches and the remote's refs are unchanged.
- D2 a branch that gained a commit after `plan` (SHA mismatch) is refused and kept. Exit 1.
- D3 `main`, the checked-out branch, an unmerged branch, a stash-protected candidate, a nonexistent branch and a merged branch mid-rebase in another worktree (refused by `git branch -D`) are each refused. Exit 1.
- D4 a mix of valid and refused pairs deletes only the valid ones.
- D5 no arguments, an argument without `=`, or a SHA shorter than 7 or not hex: exit 2 with nothing deleted, even when valid pairs are also given.

#### 3. Skill driver

**File**: `plugin/skills/repo-refresh/SKILL.md`

**Intent**: Replace the preview with the confirmed-deletion flow while keeping the model's role to running the script, showing output and asking.

**Contract**:
- Frontmatter keeps `name: repo-refresh` and the trigger `description` (dropping any "preview" wording), and adds `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs plan)`, so only `plan` runs without a permission prompt.
  - Test this rule first, in the Phase 2 scratch repo, before writing the rest of the flow. If `plan` still prompts, the variable is not expanded in `allowed-tools`. In that case use `Bash(node *repo-refresh.mjs plan)` and record the result here.
  - The fallback wildcard can also match `node <path> delete a=b repo-refresh.mjs plan`. It is harmless only because `delete` parses every argument before acting and exits 2 on an argument without `=` (D5), so D5 must stay strict.
- Body steps:
  1. Run `plan` and show its output verbatim. If there are no candidates, say so and stop.
  2. Ask one native question with options "Delete all listed", "Choose which to delete" and "Cancel".
     - For "choose" with up to 4 candidates, a multi-select of the candidates.
     - For "choose" with more than 4 candidates, ask the author to type the branch names to delete; accept only names from the candidate list.
  3. Run `delete` with exactly the chosen `<branch>=<sha>` pairs from the `plan` output.
  4. Show the `delete` output verbatim, then the summary: still on `<branch>`, and nothing pushed or deleted on the remote.
- Hard rules in the body:
  - Run no other git command that changes the repo (no checkout/switch, pull, push, reset, stash changes, `branch -d/-D`).
  - Never pass a branch that `plan` did not list for deletion.
  - On `plan` exit 1, report the message and stop.

### Success Criteria:

#### Automated Verification:

- Full test suite passes, including D1–D5: `npm test`
- Plugin validates strictly: `npm run validate:plugin`
- `SKILL.md` references the script only through `${CLAUDE_SKILL_DIR}`: `grep -c 'CLAUDE_SKILL_DIR}/scripts/repo-refresh.mjs' plugin/skills/repo-refresh/SKILL.md` ≥ 2, and `grep -n 'read-only preview' plugin/skills/repo-refresh/SKILL.md` finds nothing

#### Manual Verification:

- In a scratch repo with the packed toolkit installed (`npm pack` here, `npm i -D <tgz>` + `npx ai-toolkit-example install` there), Claude Code's `/ai-toolkit-example:repo-refresh` runs `plan` without a permission prompt, shows the lists, and on "Choose which to delete" deletes only the chosen branches
- In the same scratch repo, choosing "Cancel" deletes nothing, and the author stays on their branch throughout

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Release 0.2.0 and verify in critical-path

### Overview

Ship the skill as a new version through the existing release path and prove the roadmap outcome (US-01) in `critical-path`.

### Changes Required:

#### 1. Version bump

**File**: `package.json`, `package-lock.json`, `plugin/.claude-plugin/plugin.json`

**Intent**: Publish only a new version (CLAUDE.md hard rule); keep plugin and package versions equal (test 9).

**Contract**: `npm version 0.2.0 --no-git-tag-version`; `plugin.json` `version: "0.2.0"`.

#### 2. Tarball check

**File**: `.github/workflows/publish-ai-toolkit.yml`

**Intent**: Fail the release if the script is missing from the package, because the skill is useless without it.

**Contract**: Add `package/plugin/skills/repo-refresh/scripts/repo-refresh.mjs` to the "Check tarball contents" entry list.

#### 3. README

**File**: `README.md`

**Intent**: Describe the real skill instead of the preview.

**Contract**:
- Intro sentence: the skill updates `main` and cleans up merged local branches after confirmation.
- "Use in Claude Code": the flow (plan, list with reasons, all/choose/cancel, re-checked delete), what is never deleted, and the requirements (git ≥ 2.38, Node on `PATH`).
- "What gets written" lists the script path.
- Local-tarball examples use `0.2.0`.

#### 4. Release and consumer repoint

**Files**: GitHub Release `v0.2.0` (this repo); `critical-path` `package.json` (`ai-toolkit` script)

**Intent**: Deliver the skill through the registry and run US-01 where it matters.

**Contract**:
1. In this repo: PR, merge, then `gh release create v0.2.0 --target main --generate-notes`.
2. In `critical-path`: change the pinned version in the `ai-toolkit` script from `0.1.0` to `0.2.0` in a PR. Its `ai-toolkit` CI job already asserts that the manifest version equals the pinned version.
3. Locally: run `npm run ai-toolkit -- install` in `critical-path`, which upgrades the existing 0.1.0 install through the manifest.

### Success Criteria:

#### Automated Verification:

- Test suite passes with the bumped versions: `npm test`
- Packed tarball contains the script: `npm pack --dry-run --json` lists `plugin/skills/repo-refresh/scripts/repo-refresh.mjs`
- The release run of `Publish AI Toolkit` for `v0.2.0` succeeds through the publish job: `gh run list --workflow "Publish AI Toolkit" --event release --limit 1`
- `critical-path`'s `ai-toolkit` CI job passes on the repoint PR

#### Manual Verification:

- In `critical-path`, after the local upgrade install, the manifest names version `0.2.0` and `.claude/skills/ai-toolkit-example/skills/repo-refresh/scripts/repo-refresh.mjs` exists
- US-01 in `critical-path`, run from a feature branch, with local branches set up as: one regular- or fast-forward-merged with upstream gone, one squash-merged, one unmerged, one squash-merged holding the only stash base. `/ai-toolkit-example:repo-refresh` updates `main`. It lists the merged and squash-merged branches for deletion, and keeps the unmerged one, the stash holder and the current branch, each with a correct reason.
- After "Delete all listed", only the listed branches are gone, the author is still on the same branch, and `git diff --exit-code -- CLAUDE.md` shows the author's `CLAUDE.md` unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- The classification rules are exercised through the script against real fixture repos (R5–R13) rather than mocked git output. The risk is in git semantics, not in our control flow.

### Integration Tests:

- `plan` main-update paths (R1–R4), side-effect bounds (R14), preconditions (R15).
- `delete` confirmation boundary (D1–D5).
- Installer behaviour is unchanged: the new script is picked up by the payload walk. Only test 1's expected file list gains the script (Phase 1 §4).

### Manual Testing Steps:

1. Phase 1: run `plan` on this repo from a feature branch and read the reasons.
2. Phase 2: scratch repo with the packed toolkit and Claude Code: check the "Choose" path and the "Cancel" path.
3. Phase 3: release `v0.2.0`, repoint `critical-path`, upgrade locally, run the US-01 branch setup and the skill.

## Performance Considerations

One `git rev-list --first-parent main` call per run, then a few git calls per branch (`merge-base`, and `merge-tree` only for branches not already decided). This is fine for the tens of local branches expected. Nothing to optimise.

## Migration Notes

Consumers on `0.1.0` get the new skill by bumping their pinned version and re-running install. The installer's upgrade path rewrites `SKILL.md` and adds the script. It refuses if the author edited the installed `SKILL.md`, as before.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (FR-011, US-01, Non-Functional Requirements, Business Logic)
- Current preview skill: `plugin/skills/repo-refresh/SKILL.md`
- Payload walk: `src/payload.ts:28-46`
- Test harness pattern: `test/install.test.ts:33-45`
- Upgrade path test: `test/install.test.ts:366`
- Release workflow tarball check: `.github/workflows/publish-ai-toolkit.yml`
- Consumer pin decision: `context/archive/2026-10-30-install-from-registry/plan-brief.md`
- Claude Code skill substitutions (`${CLAUDE_SKILL_DIR}`, `allowed-tools`): https://code.claude.com/docs/en/skills

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Refresh script — update and classify

#### Automated

- [x] 1.1 Type check of the bundled script passes — 57e74bf
- [x] 1.2 Full test suite passes, including R1–R15 and the existing installer tests — 57e74bf
- [x] 1.3 The script has no imports outside node: built-ins — 57e74bf

#### Manual

- [x] 1.4 plan on this repo prints readable Main/Delete/Keep sections with correct reasons and leaves branch and working tree unchanged — 57e74bf

### Phase 2: Delete command and skill flow

#### Automated

- [x] 2.1 Full test suite passes, including D1–D5 — 8511285
- [x] 2.2 Plugin validates strictly — 8511285
- [x] 2.3 SKILL.md references the script only through ${CLAUDE_SKILL_DIR} and drops the preview wording — 8511285

#### Manual

- [x] 2.4 Scratch repo: skill runs plan without a prompt, shows the lists, and "Choose" deletes only the chosen branches — 8511285
- [x] 2.5 Scratch repo: "Cancel" deletes nothing and the author stays on their branch — 8511285

### Phase 3: Release 0.2.0 and verify in critical-path

#### Automated

- [x] 3.1 Test suite passes with the bumped versions
- [x] 3.2 Packed tarball contains the script
- [ ] 3.3 Release run for v0.2.0 succeeds through the publish job
- [ ] 3.4 critical-path ai-toolkit CI job passes on the repoint PR

#### Manual

- [ ] 3.5 critical-path manifest names 0.2.0 and the script is installed
- [ ] 3.6 US-01 in critical-path: main updated, merged and squash-merged branches listed, unmerged, stash holder and current branch kept with correct reasons
- [ ] 3.7 After "Delete all listed", only listed branches are gone, the author is on the same branch, and CLAUDE.md is unchanged
