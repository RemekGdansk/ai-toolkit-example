# Publish on Version Release Implementation Plan

## Overview

Add a GitHub Actions workflow that publishes `@remekgdansk/ai-toolkit-example` to GitHub Packages when the author publishes a GitHub Release whose tag matches the `package.json` version. Pull requests and pushes to `main` only run checks. Publishing a version that already exists fails the run through the registry's own rejection. This is roadmap slice S-02 (FR-001, FR-002), and S-03 depends on it to install a CI-published version into `critical-path`.

## Current State Analysis

- `package.json` already has the scoped name `@remekgdansk/ai-toolkit-example`, version `0.1.0`, `bin` → `dist/cli.js`, `files: ["dist/", "plugin/"]` and `prepack: npm run build`. It has no `publishConfig` and no `repository` field.
- `dist/` is git-ignored (`.gitignore`), so the published tarball only contains the CLI if `tsc` runs before packing. Packing with scripts disabled from a fresh checkout would ship a package whose `bin` is missing.
- `package-lock.json` is stale at the root (`"name": "ai-toolkit-example"`, `"version": "1.0.0"`). `npm ci` still accepts it (verified in a scratch copy), but the root identity should match `package.json`.
- There is no `.github/` directory and no CI of any kind. The repo is public, has no tags, no releases and no branch protection. Its default workflow permissions are read-only.
- The course template `.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template` (git-ignored, reference only) does not fit this repo:
  - It triggers on push to `main` and skips a version that is already published. FR-002 settled the opposite: the registry's rejection is the visible failure, and no pre-check is wanted.
  - It validates `skills/`, `rules/`, `install.js` and `uninstall.js`, none of which exist here (the layout is `plugin/` + `src/` → `dist/`).
  - It publishes with `--ignore-scripts` straight from a checkout, which would skip `prepack` and leave `dist/` out.
- `validate:plugin` (`claude plugin validate plugin --strict`) needs the `claude` CLI, which is not on GitHub-hosted runners. It stays a local check.
- GitHub docs (via Context7, `/github/docs`):
  - The `repository` field links an npm package to a repo. A linked package published from Actions inherits the repo's access permissions, but **not its visibility**: a newly published package is private.
  - Making a package public cannot be undone.

## Desired End State

- `.github/workflows/publish-ai-toolkit.yml` runs a `check` job on every pull request to `main`, every push to `main` and every published release:
  - On a release, the job first fails visibly unless the release tag equals `v<package.json version>` and the release is not marked as a pre-release.
  - It then runs `npm ci`, `npm test` and `npm pack`, and asserts that the tarball contains `dist/cli.js` and the plugin files.
  - On a release, it uploads the tarball as an artifact.
- A `publish` job runs only for releases, only after `check` passes. It is the only job with `packages: write`. It publishes the exact tarball `check` built, with no checkout and no `npm ci`.
- A release that reuses a published version fails in the publish step with the registry's `E409` rejection, and the run is red.
- `@remekgdansk/ai-toolkit-example@0.1.0` exists in GitHub Packages, is linked to `RemekGdansk/ai-toolkit-example`, and is public.
- The README explains how to cut a release and what each failure means.

Verify by: a PR where `check` is green and `publish` is skipped; release `v0.1.0` publishes; re-running that release's workflow fails with `E409`; a pre-release and a mismatched tag each fail in `check` with their own message, and nothing is published for either.

### Key Discoveries:

- `package.json:15` — `"prepack": "npm run build"`: building happens on pack, so `npm pack` in the read-only `check` job produces a complete tarball. The write-token job can then use `--ignore-scripts` safely.
- `package.json:10-13` — `files` allow-list is `dist/` and `plugin/`. The S-01 plan flagged the dot-folder `plugin/.claude-plugin/` as a tarball risk, so the contents check asserts it explicitly.
- `package.json:16` — `npm test` already runs `npm run build && node --test 'test/**/*.test.ts'`. No new test tooling is needed.
- `package-lock.json:2-3` — stale root name/version.
- Pinned action SHAs (verified against each repo's tag ref on 2026-10-30):
  - `actions/checkout` v7.0.1 → `3d3c42e5aac5ba805825da76410c181273ba90b1`
  - `actions/setup-node` v7.1.0 → `949feb2413d6458794dcd2491c4babbbce0c15c1`
  - `actions/upload-artifact` v7.0.2 → `cf430e030ddbb5b0abf93d22962f4752f3646cd9`
  - `actions/download-artifact` v8.0.2 → `9000827ccba6bdab643e8b6fd33ac0654aef8333`
- PRD Access Control: publish only through the workflow-scoped credential, with no personal publish tokens. `GITHUB_TOKEN` with job-level `packages: write` satisfies this.

## What We're NOT Doing

- No duplicate-version pre-check (`npm view`) and no "skip if published" logic. FR-002 relies on the registry's rejection.
- No publishing on push to `main`, and no automatic version bumping or release creation. The author bumps the version and cuts the release by hand.
- No pre-release channel or `next` dist-tag. A release marked as a pre-release fails the guard.
- No `claude plugin validate` in CI. It stays the local `npm run validate:plugin`.
- No `master` branch support; this repo only has `main`.
- No npm provenance or signing (GitHub Packages does not support npm provenance).
- No consumer-side `.npmrc`, install tokens or `critical-path` changes (S-03).
- No `actionlint`/`zizmor` dependency. Workflow validity is proven by GitHub running it.

## Implementation Approach

There is one workflow file with two jobs, linked by an artifact:
- `check` holds only a read-only token. It validates the release tag (on releases), builds and tests, packs, and verifies the tarball.
- `publish` holds `packages: write`. It downloads that tarball and runs `npm publish <tarball> --ignore-scripts`.

This way the registry receives exactly the bytes that passed the checks, and no dependency install or build code runs where the write token exists. The tag guard runs first in `check`, so a mislabelled release fails in seconds and `publish` never starts.

## Critical Implementation Details

- **Template injection:** pass `github.event.release.tag_name` and `github.event.release.prerelease` to the guard step through `env:` and read them as shell variables. Never interpolate `${{ … }}` directly inside the `run:` script, because a tag name is user-controlled input.
- **`--ignore-scripts` only on the tarball:** it is safe in `publish` because the tarball already contains `dist/`. Do not add `--ignore-scripts` to `npm pack` in `check`, or `prepack` will not build.
- **Job permissions replace the top-level ones:** declare `contents: read` at the workflow top level. Grant `publish` only what it needs (`packages: write`). Downloading an artifact from the same run needs no extra permission, and `publish` does not check out the repo.

## Phase 1: Publish metadata and workflow

### Overview

Make the package publishable to GitHub Packages and add the check-and-publish workflow. Prove it locally and in a pull request where `check` passes and `publish` is skipped.

### Changes Required:

#### 1. Package metadata

**File**: `package.json`

**Intent**: Point publishing at GitHub Packages and link the package to this repo, so it inherits the repo's access permissions on first publish.

**Contract**:
- `"publishConfig": { "registry": "https://npm.pkg.github.com" }`
- `"repository": { "type": "git", "url": "git+https://github.com/RemekGdansk/ai-toolkit-example.git" }`
- Name, version, `bin`, `files` and scripts stay unchanged.

#### 2. Lockfile root identity

**File**: `package-lock.json`

**Intent**: Bring the lockfile's root `name`/`version` in line with `package.json` so the identity CI installs from is consistent.

**Contract**: Regenerate with `npm install --package-lock-only`. The only expected diff is the root `name` → `@remekgdansk/ai-toolkit-example` and `version` → `0.1.0` (top level and `packages[""]`), with no dependency version changes. If dependency entries change, revert and update only the root fields.

#### 3. Check-and-publish workflow

**File**: `.github/workflows/publish-ai-toolkit.yml` (new)

**Intent**: Run checks on PRs, pushes to `main` and releases. Publish the checked tarball only for a correctly tagged, non-pre-release GitHub Release.

**Contract**:
- `name: Publish AI Toolkit`. Triggers: `pull_request` (branches `main`), `push` (branches `main`), `release` (`types: [published]`). Top-level `permissions: contents: read`.
- Every `uses:` is pinned to the full commit SHA listed in Key Discoveries, followed by `# vX.Y.Z`. Node version is `24`.
- **Job `check`** (`ubuntu-latest`), steps in this order:
  1. `actions/checkout` with `persist-credentials: false`.
  2. `actions/setup-node` with `node-version: 24`.
  3. **Release guard** (`if: github.event_name == 'release'`), with `TAG` and `PRERELEASE` set from the release payload via `env:`:
     - If `PRERELEASE` is `true`, emit `::error::` saying pre-releases are not published and exit 1.
     - If `TAG` is not `v` + `package.json` version, emit `::error::` naming both values and saying to bump `package.json` or fix the tag, and exit 1.
  4. `npm ci`.
  5. `npm test`.
  6. `npm pack`. Its output is one `remekgdansk-ai-toolkit-example-<version>.tgz` in the workspace.
  7. **Tarball contents check:** `tar -tzf` on the tarball must list `package/dist/cli.js`, `package/plugin/.claude-plugin/plugin.json` and `package/plugin/skills/repo-refresh/SKILL.md`. Each missing entry gets an `::error::` and the step exits 1.
  8. `actions/upload-artifact` (`if: github.event_name == 'release'`): name `package-tarball`, path `*.tgz`, `if-no-files-found: error`, `overwrite: true` (so a re-run of the same release, used in Phase 2 to prove FR-002, can upload again), short retention (e.g. 7 days).
- **Job `publish`** (`ubuntu-latest`):
  - `needs: check`, `if: github.event_name == 'release'`, `permissions: packages: write`.
  - Steps:
    1. `actions/download-artifact` (name `package-tarball`).
    2. `actions/setup-node` with `node-version: 24`, `registry-url: https://npm.pkg.github.com`, `scope: '@remekgdansk'`.
    3. `npm publish ./*.tgz --ignore-scripts` with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  - No `continue-on-error`. A duplicate version must turn the run red.

#### 4. Release instructions

**File**: `README.md`

**Intent**: Document how the author cuts a release and what each CI failure means, so FR-001's "bump and cut a release" is a written procedure.

**Contract**: Add a `## Releasing` section after `## Re-running`, covering:
- Bump the version on a branch with `npm version <x.y.z> --no-git-tag-version` (updates `package.json` and the lockfile), open a PR and merge it.
- Cut the release with `gh release create v<x.y.z> --target main --generate-notes`, not marked as a pre-release.
- The package is published to GitHub Packages as `@remekgdansk/ai-toolkit-example`.
- A short failure table:
  - Tag/version mismatch → delete the release and its tag, then fix the version or the tag.
  - Pre-release → delete it and cut a normal release.
  - `E409`/"Cannot publish over existing version" → the version already exists: bump, merge, cut a new release.
- How to delete a bad release: `gh release delete <tag> --cleanup-tag --yes`.

Leave the existing local-tarball install steps unchanged; S-03 rewrites install for the registry.

### Success Criteria:

#### Automated Verification:

- Tests and build pass: `npm test`
- Lockfile is in sync and installs cleanly: `npm ci` exits 0, and `node -p "require('./package-lock.json').name"` prints `@remekgdansk/ai-toolkit-example`
- Package metadata points at GitHub Packages: `node -p "require('./package.json').publishConfig.registry"` prints `https://npm.pkg.github.com`, and `node -p "require('./package.json').repository.url"` contains `RemekGdansk/ai-toolkit-example`
- Packed tarball contains the CLI and the plugin files: `npm pack --dry-run --json` lists `dist/cli.js`, `plugin/.claude-plugin/plugin.json` and `plugin/skills/repo-refresh/SKILL.md`
- Every action in the workflow is pinned to a full SHA: `grep -E '^\s*-?\s*uses:' .github/workflows/publish-ai-toolkit.yml | grep -vE '@[0-9a-f]{40} # v[0-9]'` prints nothing
- The workflow never interpolates release payload into a script: `grep -n 'github.event.release' .github/workflows/publish-ai-toolkit.yml` only shows matches in `env:` or `if:` lines
- Plugin still validates locally: `npm run validate:plugin`

#### Manual Verification:

- In a PR from this branch, the `Publish AI Toolkit` workflow runs, `check` is green and `publish` shows as skipped
- The `check` log shows the release guard step skipped and the tarball contents check passing
- After merging, the push to `main` runs `check` green with `publish` skipped

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Opening the PR and merging it are user-approved steps.

---

## Phase 2: First release and failure paths

### Overview

Exercise the workflow on real releases: prove the guard rejects a pre-release, publish `v0.1.0`, make the package public, and show that a duplicate version and a mismatched tag each fail visibly.

### Changes Required:

#### 1. Release runs (no code changes)

**File**: none (GitHub Releases, Actions runs and package settings)

**Intent**: Prove FR-001 and FR-002 end to end on `main` after Phase 1 is merged, in an order that never leaves a wrong version in the registry.

**Contract**, in order:
1. **Pre-release guard:** `gh release create v0.1.0 --target main --prerelease --title "guard test" --notes "guard test"`.
   - Expect: `check` fails on the release guard with the pre-release message, and `publish` does not run.
   - Then: `gh release delete v0.1.0 --cleanup-tag --yes`.
2. **First publish:** `gh release create v0.1.0 --target main --generate-notes`.
   - Expect: `check` and `publish` both green.
3. **Package settings:** open the package page under the author's profile → Packages → `ai-toolkit-example`.
   - Confirm it is linked to `RemekGdansk/ai-toolkit-example` and shows version `0.1.0`.
   - In Package settings → Danger Zone → Change visibility, set it to **Public**. This is irreversible, and the PRD requires a public package.
4. **Duplicate version (FR-002):** re-run all jobs of the `v0.1.0` release run (`gh run rerun <run-id>`).
   - Expect: `check` green, then `publish` red with an `E409`/"Cannot publish over existing version" error.
5. **Mismatched tag:** `gh release create v0.1.1 --target main --title "guard test" --notes "guard test"` while `package.json` is still `0.1.0`.
   - Expect: `check` fails on the release guard, naming `v0.1.1` and `0.1.0`, and `publish` does not run.
   - Then: `gh release delete v0.1.1 --cleanup-tag --yes`.

Optional, for listing versions from the CLI: `gh auth refresh -h github.com -s read:packages`, then `gh api /users/RemekGdansk/packages/npm/ai-toolkit-example/versions --jq '.[].name'`.

### Success Criteria:

#### Manual Verification:

- A pre-release tagged `v0.1.0` fails `check` with the pre-release message, `publish` does not run, and the release and tag are deleted afterwards
- Release `v0.1.0` runs `check` and `publish` green
- GitHub Packages shows `@remekgdansk/ai-toolkit-example` version `0.1.0`, linked to `RemekGdansk/ai-toolkit-example`, with visibility set to Public
- Re-running the `v0.1.0` release workflow fails visibly in `publish` with the registry's `E409` duplicate-version error
- A release tagged `v0.1.1` with `package.json` at `0.1.0` fails `check` with the mismatch message, `publish` does not run, and the release and tag are deleted afterwards
- Only release `v0.1.0` and tag `v0.1.0` remain in the repo

**Implementation Note**: Every step in this phase creates or changes something visible on GitHub (releases, tags, a package, irreversible public visibility). Confirm with the human before each one.

---

## Testing Strategy

### Unit Tests:

- No new unit tests. The existing `node --test` suite (`test/install.test.ts`) runs unchanged inside `check` via `npm test`.

### Integration Tests:

- The workflow itself is the integration test. Phase 1 proves the PR/push paths, and Phase 2 proves the release, pre-release, duplicate and mismatch paths on real GitHub infrastructure.

### Manual Testing Steps:

1. Open a PR from `publish-on-release`. `check` is green and `publish` is skipped.
2. Merge. The push to `main` runs `check` green.
3. Create a pre-release `v0.1.0`. The guard fails. Delete it.
4. Create release `v0.1.0`. The package is published. Make it public.
5. Re-run the `v0.1.0` run. `publish` fails with `E409`.
6. Create release `v0.1.1` (no bump). The guard fails. Delete it.

## Performance Considerations

None of note. `check` runs `npm ci` with two devDependencies and a sub-second test suite.

## Migration Notes

None. Nothing has been published yet, and `0.1.0` is the first registry version. The package's public visibility cannot be undone. That is the intended end state from the PRD.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- Requirements: `context/foundation/prd.md` (FR-001, FR-002, Access Control)
- Stack decision: `context/foundation/tech-stack.md` (GitHub Packages, GitHub Actions, publish on version release)
- Course spec and template (reference only, adapted): `.claude/prompts/m5l4-github-packages-spec-cicd.md`, `.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template`
- Prior slice: `context/archive/2026-10-30-local-install-claude-code/plan.md`
- GitHub docs: "Publishing Node.js packages" and "Configuring a package's access control and visibility" (`/github/docs` via Context7)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Publish metadata and workflow

#### Automated

- [x] 1.1 Tests and build pass: `npm test`
- [x] 1.2 Lockfile is in sync and installs cleanly
- [x] 1.3 Package metadata points at GitHub Packages
- [x] 1.4 Packed tarball contains the CLI and the plugin files
- [x] 1.5 Every action in the workflow is pinned to a full SHA
- [x] 1.6 The workflow never interpolates release payload into a script
- [x] 1.7 Plugin still validates locally: `npm run validate:plugin`

#### Manual

- [ ] 1.8 PR run: `check` green, `publish` skipped
- [ ] 1.9 `check` log shows guard skipped and tarball contents check passing
- [ ] 1.10 Push to `main` runs `check` green with `publish` skipped

### Phase 2: First release and failure paths

#### Manual

- [ ] 2.1 Pre-release `v0.1.0` fails the guard and is deleted
- [ ] 2.2 Release `v0.1.0` runs `check` and `publish` green
- [ ] 2.3 Package `0.1.0` is in GitHub Packages, linked to the repo, and public
- [ ] 2.4 Re-running the `v0.1.0` release fails visibly with `E409`
- [ ] 2.5 Mismatched release `v0.1.1` fails the guard and is deleted
- [ ] 2.6 Only release and tag `v0.1.0` remain
