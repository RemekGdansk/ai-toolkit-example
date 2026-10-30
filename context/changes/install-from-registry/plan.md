# Install from Registry Implementation Plan

## Overview

Install the CI-published `@remekgdansk/ai-toolkit-example` from GitHub Packages into `RemekGdansk/critical-path` with one command, both on the author's machine and in `critical-path`'s CI, and use its skill from Claude Code there. Committed config in `critical-path` only points the `@remekgdansk` scope at the registry; the read-only tokens live in the author's `~/.npmrc` and in a CI secret. This is roadmap slice S-03 (north star): FR-003, FR-004, US-01, and the PRD's "no tokens in committed files" guardrail.

## Current State Analysis

- **Toolkit is published.** S-02 published `0.1.0` to GitHub Packages through `.github/workflows/publish-ai-toolkit.yml`; the package is linked to this repo and was set public by hand (`context/archive/2026-10-30-publish-on-release/plan-brief.md`).
- **The installer is location-independent.** `install()` works on `process.cwd()` and requires a `package.json` there (`src/install.ts:24-29`); the payload and version come from the package's own folder (`src/payload.ts:12-13`, `src/payload.ts:51`). It therefore runs the same from `node_modules` or from an npx cache entry.
- **The package has exactly one `bin`** (`ai-toolkit-example` → `dist/cli.js`, `package.json:15-17`), so `npx <package>@<version> install` runs it without naming the bin.
- **The README documents only the tarball flow** (`README.md:7-31`) and calls the installer as `npx ai-toolkit-example install` (`README.md:25`, `README.md:51`).
- **`critical-path` ignores `.claude/` and `CLAUDE.md` in git** (`critical-path/.gitignore:1-6`). Installed skill files are never committed, so a CI install is a proof that install works on a clean machine, not something its build consumes.
- **`critical-path` carries a leftover S-01 install** from a local tarball: `.claude/.ai-toolkit-example-manifest.json` at version `0.1.0` with two files and four created folders. The toolkit is not in its `package.json`, and the npx cache has no copy of it.
- **Every `npm ci` in `critical-path` would need registry auth if the toolkit were a dependency.** That covers the `ci` job (`critical-path/.github/workflows/ci.yml:24`), Dependabot (its PRs only receive Dependabot secrets and its updater would need a `registries:` entry, `critical-path/.github/dependabot.yml`), and Cloudflare Workers Builds, which installs dependencies itself before running the build command (`critical-path/context/deployment/deploy-plan.md:135`).
- **`critical-path` protections:** required checks on `main` are `ci` and `Workers Builds: critical-path`; the only Actions secret is `ROADMAP_SYNC_TOKEN`; `dependabot-auto-merge.yml` identifies Dependabot PRs by `github.event.pull_request.user.login == 'dependabot[bot]'`.
- **No tracked file in `critical-path`** contains `_authToken`, `_auth=`, `ghp_`, `github_pat_` or `npm.pkg.github.com` today.
- **GitHub Packages auth (GitHub docs, via Context7):** installing even a public npm package needs a token; GitHub Packages only accepts a classic PAT; `read:packages` is the install scope. Dependabot reads private registries only through a `registries:` entry backed by a Dependabot secret.

## Desired End State

- `critical-path` has a committed `.npmrc` whose only content is `@remekgdansk:registry=https://npm.pkg.github.com`, and a `package.json` script `ai-toolkit` that runs `npx --yes @remekgdansk/ai-toolkit-example@0.1.0`. `npm run ai-toolkit -- install` is the one install command, locally and in CI. The toolkit is not in `dependencies`, `devDependencies` or `package-lock.json`.
- Locally, a classic PAT with only `read:packages`, stored in the author's user-level `~/.npmrc` by `npm login`, installs the toolkit into a clean `critical-path`; `/ai-toolkit-example:repo-refresh` runs in Claude Code there.
- `critical-path`'s `ci.yml` has a separate, non-required `ai-toolkit` job that installs with a second classic PAT in the `GH_PKG_TOKEN` Actions secret. It is skipped for Dependabot and fork PRs, fails visibly when the secret is missing, fails when committed files carry a registry token, and checks that a second install changes nothing.
- `ci` and `Workers Builds: critical-path` stay green: neither needs a token, and Cloudflare deploys keep working.
- The toolkit README documents the registry install path as the primary install, and keeps the tarball flow for local development.

Verify by: a green `ai-toolkit` job on the merged `critical-path` PR and on the following `main` push; a local clean-slate install whose npx cache entry resolves from `npm.pkg.github.com`; a 401 when the committed config is used without the user config.

### Key Discoveries:

- The installer needs no code change for npx: it reads the consumer root from `process.cwd()` (`src/install.ts:24`), and `npm run` runs scripts from the package root.
- Version pinning moves from the lockfile to the `ai-toolkit` script. S-05 (uninstall) becomes `npm run ai-toolkit -- uninstall`; S-06 (update) becomes a bump of the version in that one line.
- `actions/setup-node` with `registry-url` + `scope` writes a runner-temp user config whose auth line reads `NODE_AUTH_TOKEN`, so the job sets `NODE_AUTH_TOKEN` from `GH_PKG_TOKEN` and the repo needs no token line (same mechanism as the publish job, `.github/workflows/publish-ai-toolkit.yml:97-107`).
- `critical-path` pins actions to full SHAs with the tag in a comment (`critical-path/.github/workflows/ci.yml:16-20`); the new job reuses the same pinned `checkout` and `setup-node` SHAs.

## What We're NOT Doing

- Adding the toolkit to `dependencies`/`devDependencies` or the lockfile of `critical-path` (decided: pinned npx script).
- Giving Cloudflare Workers Builds or Dependabot any registry token, or adding a `registries:` entry to `dependabot.yml`.
- Storing the PAT as a Dependabot secret; running the `ai-toolkit` job on Dependabot or fork PRs.
- Making `ai-toolkit` a required status check on `main`.
- Using `GITHUB_TOKEN` with package-level "Manage Actions access" instead of a PAT (the PRD settles a read-only install token in CI secrets).
- Any `${VAR}` token reference in a committed `.npmrc`, or a token in a project-level `.npmrc`.
- Uninstall (S-05), update to a new version (S-06), the repo-refresh skill's real behaviour (S-04), rules in `CLAUDE.md` (FR-005).
- Code changes to the installer or the publish workflow; a new toolkit version.
- A token-hygiene check in the toolkit repo itself.

## Implementation Approach

Work in `critical-path` first and prove the path by hand before automating it: create the tokens, add the two committed config lines, wipe the leftover S-01 install (toolkit-owned, gitignored files listed in its own manifest), install from the registry and use the skill. Then add the CI job on the same branch, prove its failure path for a committed token, and merge through a PR so both required checks confirm nothing else broke. Document the verified path in the toolkit README last, using the messages actually observed.

The two PATs are separate (local and CI) so revoking one leaves the other working, which matches the PRD's revocation model. Both are classic, `read:packages` only, with an expiry.

## Critical Implementation Details

- **Token-hygiene patterns must not match themselves.** The check lives in the tracked `ci.yml`. Write the patterns so their literal text cannot match (for example `_auth(Token)?=` and `ghp_[A-Za-z0-9]{36}`: the literal text has `(` or `[` where the pattern needs `=` or an alphanumeric), and prove the check is green on the clean branch before trusting a red result.
- **Order of local steps matters.** Remove the leftover S-01 files before the first registry install; otherwise install is a byte-identical no-op and proves nothing about the registry.
- **Never echo a token.** Create the CI secret with `gh secret set GH_PKG_TOKEN --repo RemekGdansk/critical-path` reading from the prompt, not from a command-line argument or shell history.

## Phase 1: Registry access and consumer config

### Overview

Create both tokens, commit the scope-only `.npmrc` and the pinned `ai-toolkit` script on a `critical-path` branch, and prove a clean-slate local install from GitHub Packages that Claude Code can use.

### Changes Required:

#### 1. Tokens and secret (author, outside both repos)

**File**: none (GitHub settings, `~/.npmrc`, `critical-path` Actions secrets)

**Intent**: Give the author's machine and `critical-path`'s CI their own read-only install credential, kept outside every committed file.

**Contract**: Two classic PATs, scope `read:packages` only, each with an expiry. Local: `npm login --scope=@remekgdansk --auth-type=legacy --registry=https://npm.pkg.github.com` (username `RemekGdansk`, password = local PAT) writes the auth line to the user-level `~/.npmrc`. CI: the second PAT is stored as the Actions secret `GH_PKG_TOKEN` in `RemekGdansk/critical-path`. Both expiry dates are recorded (no token values) in this change's `change.md` Notes and in `critical-path/context/deployment/deploy-plan.md`, so the CI PAT's expiry is a known date rather than a surprise red `ai-toolkit` job.

#### 2. Remove the leftover S-01 install

**File**: `critical-path/.claude/skills/ai-toolkit-example/`, `critical-path/.claude/.ai-toolkit-example-manifest.json`

**Intent**: Start from a repo with no toolkit files, so the registry install writes everything itself.

**Contract**: Delete only the two files, four folders and manifest that the existing manifest lists. Other `.claude/` content (10x skills, `playwright-cli`, settings, `.10x-cli-manifest.json`) stays untouched. These paths are gitignored, so `git status` does not change.

#### 3. Scope-only registry config

**File**: `critical-path/.npmrc` (new)

**Intent**: Point the `@remekgdansk` scope at GitHub Packages, and nothing else.

**Contract**: Exactly one line, `@remekgdansk:registry=https://npm.pkg.github.com`, plus a trailing newline. No auth line, no `${VAR}` reference. `critical-path`'s own name is `@remekgdansk/critical-path`, but it is `private: true` and has no `@remekgdansk` dependencies, so `npm ci` behaviour is unchanged.

#### 4. Pinned install script

**File**: `critical-path/package.json`

**Intent**: Make `npm run ai-toolkit -- install` the one install command, with the toolkit version visible in a single committed line.

**Contract**: `scripts["ai-toolkit"] = "npx --yes @remekgdansk/ai-toolkit-example@0.1.0"`. Nothing added to `dependencies`/`devDependencies`. `package-lock.json` is unchanged.

### Success Criteria:

#### Automated Verification:

- The local token reads the registry: `npm view @remekgdansk/ai-toolkit-example@0.1.0 version` run in `critical-path` prints `0.1.0`
- The committed config alone carries no credentials: `npm view @remekgdansk/ai-toolkit-example version --userconfig /dev/null` run in `critical-path` fails with `E401`, and the observed message is recorded for the README
- `critical-path/.npmrc` is exactly the scope line: `printf '@remekgdansk:registry=https://npm.pkg.github.com\n' | cmp - .npmrc`
- `package-lock.json` is unchanged and the toolkit is in no dependency field: `git diff --exit-code package-lock.json` and `node -e` check on `package.json`
- Clean-slate install succeeds: `npm run ai-toolkit -- install` exits 0 and prints `installed @remekgdansk/ai-toolkit-example@0.1.0 (2 files)`
- The installed copy came from GitHub Packages: the npx cache entry's `package-lock.json` under `~/.npm/_npx/` has a `resolved` URL on `npm.pkg.github.com`
- Install is idempotent: a second `npm run ai-toolkit -- install` exits 0 and the manifest and both skill files have the same SHA-256 as after the first run
- No tracked file carries a token: `git grep -nE '_auth(Token)?=|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}'` in `critical-path` finds nothing
- `critical-path` still installs without any registry token: `npm ci --userconfig /dev/null` succeeds

#### Manual Verification:

- Both PATs are classic, have only `read:packages`, and have an expiry, recorded in `change.md` Notes and `critical-path`'s `deploy-plan.md`; `GH_PKG_TOKEN` appears in `gh secret list --repo RemekGdansk/critical-path`
- Claude Code launched from the `critical-path` root, after `/reload-plugins` and accepting workspace trust, lists `ai-toolkit-example@skills-dir` and runs `/ai-toolkit-example:repo-refresh`
- `.claude/` content outside `.claude/skills/ai-toolkit-example/` and the manifest is unchanged after the wipe and the install

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: critical-path CI install job

### Overview

Add a separate `ai-toolkit` job to `critical-path`'s `ci.yml` that installs the toolkit from the registry with `GH_PKG_TOKEN`, then merge the branch through a PR with both required checks green.

### Changes Required:

#### 1. `ai-toolkit` job

**File**: `critical-path/.github/workflows/ci.yml`

**Intent**: Prove on every non-bot PR and every `main` push that a clean machine installs the pinned toolkit from the registry with the CI secret, and that committed files never carry a registry token. Keep it apart from the required `ci` job so Dependabot auto-merge and deploy gates are unaffected.

**Contract**: A new job `ai-toolkit` in the existing workflow (same triggers), with:
- `permissions: contents: read`.
- Job-level `if`: runs on `push`; on `pull_request` only when `github.event.pull_request.user.login != 'dependabot[bot]'` and the head repo is `github.repository`.
- Steps, in order:
  1. `actions/checkout` at the SHA `ci.yml` already pins, with `persist-credentials: false`.
  2. `actions/setup-node` at the pinned SHA, with `node-version-file: .nvmrc`, `registry-url: https://npm.pkg.github.com` and `scope: '@remekgdansk'`. No npm cache and no `npm ci`.
  3. **Token hygiene**: fail with `::error::` unless `.npmrc` is exactly the scope line and `git grep` finds no `_auth(Token)?=`, `ghp_…` or `github_pat_…` in tracked files.
  4. **Secret present**: fail with `::error::GH_PKG_TOKEN is not set …` naming the remedy (add a `read:packages` classic PAT as an Actions secret) when the secret is empty.
  5. **Install**: `npm run ai-toolkit -- install` with `NODE_AUTH_TOKEN: ${{ secrets.GH_PKG_TOKEN }}`.
  6. **Assert**: the manifest names `@remekgdansk/ai-toolkit-example` at the version pinned in the `ai-toolkit` script (parsed from `package.json`), and `.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md` exists.
  7. **Idempotence**: a second install exits 0, and the hashes of the manifest and installed files are unchanged.
- Secrets reach steps only through `env:`, never interpolated into `run:` scripts.

#### 2. Pull request and merge

**File**: none (`critical-path` PR)

**Intent**: Land Phase 1's config and the job through the protected `main`, which requires a PR with linear history.

**Contract**: One PR from the Phase 1 branch, squash-merged once `ci`, `Workers Builds: critical-path` and `ai-toolkit` are green.

### Success Criteria:

#### Automated Verification:

- Every `uses:` is SHA-pinned: `grep -nE 'uses: .*@[0-9a-f]{40} #' .github/workflows/ci.yml` covers every `uses:` line (that the workflow parses is proven by the PR run below)
- The secret is read only through `env:`: every line of `grep -n 'secrets\.GH_PKG_TOKEN' .github/workflows/ci.yml` is an `env:` value; the name may still appear as text in the "Secret present" message
- The hygiene step passes on the clean branch: the `ai-toolkit` job's "Token hygiene" step is green on the PR's first run
- The PR's `ai-toolkit` job is green and its log shows `installed @remekgdansk/ai-toolkit-example@0.1.0 (2 files)` followed by an unchanged second install
- `ci` and `Workers Builds: critical-path` are green on the PR
- After the squash merge, the `push: main` run of `ai-toolkit` is green and Workers Builds deploys `main` successfully

#### Manual Verification:

- A throwaway commit on the PR branch that appends `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` to `.npmrc` turns `ai-toolkit` red in "Token hygiene" with the `::error::` message, and is reverted before merge (the squash leaves it out of `main`)
- The "Secret present" step's message and the job-level `if` are read in the diff; if a Dependabot PR is open, a re-run shows `ai-toolkit` skipped, otherwise this is recorded as not yet observed
- `gh pr view` on the merged PR shows a single squash commit on `main` with no token in its diff
- Dependabot still reads the npm ecosystem with the committed `.npmrc`: after the merge, "Check for updates" on the npm entry (Insights → Dependency graph → Dependabot) finishes without a registry or authentication error; if it cannot be triggered, this is recorded as not yet observed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Toolkit README for the registry path

### Overview

Rewrite the toolkit README so the registry install is the primary path, written from what Phases 1–2 actually observed, and keep the tarball flow for local development.

### Changes Required:

#### 1. Install documentation

**File**: `README.md`

**Intent**: Let a reader set up a consumer repo for the registry install without reading this plan, and know what to do when auth fails.

**Contract**:
- `## Install` becomes the registry path, in this order:
  1. A classic PAT with only `read:packages`.
  2. `npm login --scope=@remekgdansk --auth-type=legacy --registry=https://npm.pkg.github.com`, so the token stays in the user-level `~/.npmrc`.
  3. A committed scope-only `.npmrc` (never a token line).
  4. The pinned `ai-toolkit` script.
  5. `npm run ai-toolkit -- install`.
- One sentence says why it is a script and not a dev dependency: every `npm ci` would then need the token, including deploy builds and Dependabot.
- A new `## Install in CI` section covers the `GH_PKG_TOKEN` secret, `setup-node` with `registry-url` and `scope`, `NODE_AUTH_TOKEN` from the secret, and skipping Dependabot and fork PRs, which don't receive Actions secrets. It also covers rotation before the PAT expires: create a new PAT, then run `gh secret set GH_PKG_TOKEN --repo <owner>/<repo>`, which reads the value from the prompt.
- The tarball steps move under `## Install from a local build` for development.
- `## Re-running` and the install-command references use `npm run ai-toolkit -- install`.
- The failure table gains rows for the observed `E401` (token missing, wrong scope, expired or revoked: re-run `npm login` or replace the secret) and for a version not found.
- `## Use in Claude Code`, `## What gets written` and `## Releasing` keep their content.

### Success Criteria:

#### Automated Verification:

- Toolkit checks still pass: `npm test` in this repo
- The README names the registry command and the scope line: `grep -n 'npm run ai-toolkit -- install' README.md` and `grep -n '@remekgdansk:registry=https://npm.pkg.github.com' README.md` both match
- The README shows no literal token: `grep -nE 'ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}' README.md` finds nothing

#### Manual Verification:

- Following only the README, the consumer steps match what was done in `critical-path` (same commands, same scope line, same secret name)
- The `E401` row quotes the message observed in Phase 1

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None added: the installer is unchanged, and its existing `test/install.test.ts` already covers idempotent re-runs and guard failures.

### Integration Tests:

- The `ai-toolkit` CI job is the integration test: a fresh runner, the registry, the CI secret, two installs, and asserted results.

### Manual Testing Steps:

1. In `critical-path`, remove the leftover S-01 toolkit files listed in its manifest and confirm `git status` is unchanged.
2. Run `npm run ai-toolkit -- install` twice, then confirm the npx cache resolved from `npm.pkg.github.com`.
3. Launch Claude Code from the `critical-path` root, run `/reload-plugins`, then `/ai-toolkit-example:repo-refresh`.
4. On the PR, push the throwaway token commit, watch "Token hygiene" fail, and revert it.
5. After merge, confirm the Workers Builds deploy of `main` is green.

## Performance Considerations

The `ai-toolkit` job skips `npm ci` and browser installs. It only downloads the toolkit tarball, so it adds well under a minute to a PR, in parallel with `ci`.

## Migration Notes

`critical-path`'s leftover S-01 tarball install is replaced, not migrated. Its files are toolkit-owned, gitignored and byte-identical to `0.1.0`, so removing them and reinstalling from the registry loses nothing.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-003, FR-004, US-01, Access Control, Guardrails)
- Prior slices: `context/archive/2026-10-30-local-install-claude-code/plan.md`, `context/archive/2026-10-30-publish-on-release/plan.md`
- Installer: `src/install.ts:24`, `src/payload.ts:12`
- Publish job auth pattern: `.github/workflows/publish-ai-toolkit.yml:97`
- Consumer template: `.claude/config-templates/m5l4-github-packages-consumer.npmrc.template`; consumer CI note: `.claude/prompts/m5l4-github-packages-spec-cicd.md:102`
- `critical-path`: `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/dependabot-auto-merge.yml`, `.github/dependabot.yml`, `context/deployment/deploy-plan.md:135`
- GitHub docs: "Working with the npm registry", "About permissions for GitHub Packages", "Configuring access to private registries for Dependabot"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Registry access and consumer config

#### Automated

- [x] 1.1 The local token reads the registry: `npm view @remekgdansk/ai-toolkit-example@0.1.0 version` prints `0.1.0` — dda9d35
- [x] 1.2 The committed config alone carries no credentials: `npm view … --userconfig /dev/null` fails with `E401`, message recorded — dda9d35
- [x] 1.3 `critical-path/.npmrc` is exactly the scope line — dda9d35
- [x] 1.4 `package-lock.json` is unchanged and the toolkit is in no dependency field — dda9d35
- [x] 1.5 Clean-slate install succeeds: `npm run ai-toolkit -- install` exits 0 and prints `installed @remekgdansk/ai-toolkit-example@0.1.0 (2 files)` — dda9d35
- [x] 1.6 The installed copy came from GitHub Packages (npx cache `resolved` on `npm.pkg.github.com`) — dda9d35
- [x] 1.7 Install is idempotent: second run exits 0 with unchanged hashes — dda9d35
- [x] 1.8 No tracked file in `critical-path` carries a token — dda9d35
- [x] 1.9 `critical-path` still installs without any registry token: `npm ci --userconfig /dev/null` succeeds — dda9d35

#### Manual

- [x] 1.10 Both PATs are classic, `read:packages` only, with a recorded expiry; `GH_PKG_TOKEN` is listed in `critical-path` secrets — dda9d35
- [x] 1.11 Claude Code in `critical-path` lists `ai-toolkit-example@skills-dir` and runs `/ai-toolkit-example:repo-refresh` — dda9d35
- [x] 1.12 `.claude/` content outside the toolkit folder and manifest is unchanged after wipe and install — dda9d35

### Phase 2: critical-path CI install job

#### Automated

- [x] 2.1 Every `uses:` is SHA-pinned
- [x] 2.2 The secret is read only through `env:`
- [x] 2.3 The hygiene step passes on the clean branch
- [x] 2.4 The PR's `ai-toolkit` job is green with install and unchanged second install in its log
- [x] 2.5 `ci` and `Workers Builds: critical-path` are green on the PR
- [x] 2.6 After the squash merge, `ai-toolkit` on `main` is green and Workers Builds deploys `main`

#### Manual

- [x] 2.7 A throwaway token commit turns "Token hygiene" red and is reverted before merge
- [x] 2.8 "Secret present" message and job-level `if` reviewed; Dependabot skip observed or recorded as not yet observed
- [x] 2.9 The merged squash commit on `main` has no token in its diff
- [x] 2.10 Dependabot's npm update job runs without a registry error after the merge, or is recorded as not yet observed

### Phase 3: Toolkit README for the registry path

#### Automated

- [ ] 3.1 Toolkit checks still pass: `npm test`
- [ ] 3.2 The README names the registry command and the scope line
- [ ] 3.3 The README shows no literal token

#### Manual

- [ ] 3.4 Following only the README matches what was done in `critical-path`
- [ ] 3.5 The `E401` row quotes the message observed in Phase 1
