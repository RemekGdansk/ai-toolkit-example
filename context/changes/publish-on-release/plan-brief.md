# Publish on Version Release — Plan Brief

> Full plan: `context/changes/publish-on-release/plan.md`

## What & Why

Add a GitHub Actions workflow that publishes `@remekgdansk/ai-toolkit-example` to GitHub Packages when the author cuts a version release. Publishing a version that already exists fails the run visibly. This is roadmap slice S-02 (FR-001, FR-002). S-03 needs a CI-published version to install into `critical-path`.

## Starting Point

The package from S-01 builds with `tsc` on `prepack` and is installed from a local tarball. It has no `publishConfig` or `repository` field, its lockfile root still says `ai-toolkit-example@1.0.0`, and the repo has no CI, tags or releases. The course template triggers on push and silently skips duplicate versions, which contradicts FR-002. It also validates a layout this repo doesn't have.

## Desired End State

One workflow, `publish-ai-toolkit.yml`:
- Runs checks on PRs and pushes to `main`.
- On a published GitHub Release tagged `v<package.json version>`, publishes the exact tarball the checks built.
- A duplicate version fails with the registry's `E409`, and a pre-release or mismatched tag fails before anything is published.

`0.1.0` is in GitHub Packages, linked to this repo and public. The README documents how to release.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Publish trigger | GitHub Release `published`, not push or tag push | FR-001 says "cut a version release"; merges to `main` only run checks. | PRD + tech-stack |
| Duplicate version | No pre-check; the registry's `E409` fails the publish step | FR-002 accepted the registry rejection as the visible failure. | PRD |
| Version guard | `check` fails unless the tag equals `v<package.json version>` | Release name, tag and registry version can never disagree, and a forgotten bump fails with a clear message. | Plan |
| Pre-releases | Rejected by the same guard | There's no dist-tag channel in scope, so a pre-release would otherwise publish as `latest`. | Plan |
| Checks on PR/main | `npm ci`, `npm test`, `npm pack` + tarball contents check | Uses only existing tooling and catches the empty-`dist/` and missing-dot-folder failures. | Plan |
| Plugin schema check | Stays local (`npm run validate:plugin`) | The `claude` CLI isn't on runners and pulling it into CI is unverified. | Plan |
| Publish isolation | `check` (read-only) uploads the tarball; `publish` (`packages: write`) runs `npm publish <tgz> --ignore-scripts` | The registry gets the tested bytes, and no dependency or build code runs where the write token exists. | Plan |
| Credentials | `GITHUB_TOKEN`, `packages: write` on the publish job only | PRD Access Control: workflow-scoped credential, no personal publish tokens. | PRD |
| Package link and visibility | `repository` field links it; set Public by hand after the first publish | Linked packages inherit access but not visibility (new packages start private). | Plan (GitHub docs) |

## Scope

**In scope:**
- `package.json` `publishConfig` + `repository`; lockfile root refresh
- `.github/workflows/publish-ai-toolkit.yml` (check + guard + publish)
- README `## Releasing` section
- Real `v0.1.0` release, public visibility, and proof of each failure path

**Out of scope:**
- Duplicate pre-check or "skip if published"; publish on push; auto bump/release
- Pre-release / `next` channel; `master` branch; npm provenance
- `claude plugin validate` in CI; actionlint/zizmor
- Consumer `.npmrc`, install tokens, `critical-path` changes (S-03)

## Architecture / Approach

```
PR / push main ──► check: checkout → setup-node 24 → npm ci → npm test → npm pack → tarball contents check
release published ──► check: [tag == v<version> && !prerelease] → … → upload package-tarball
                      └─► publish (packages: write): download tarball → setup-node (npm.pkg.github.com, @remekgdansk)
                                                    → npm publish ./*.tgz --ignore-scripts   (E409 on duplicate = red run)
```

All actions are pinned to verified full SHAs. The release payload reaches the guard only through `env:`, never interpolated into the script.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Publish metadata and workflow | Publishable `package.json`, clean lockfile, workflow, README; green PR with `publish` skipped | `--ignore-scripts` in the wrong place shipping a tarball without `dist/` |
| 2. First release and failure paths | `0.1.0` published, linked and public; pre-release, duplicate and mismatch each fail visibly | Irreversible public visibility; throwaway releases left behind |

**Prerequisites:** Node ≥22 (dev: 24), `gh` authenticated with repo access, user approval to open and merge the PR and to create and delete releases.
**Estimated effort:** ~1–1.5 hours across 2 phases (Phase 2 is mostly waiting on runs).

## Open Risks & Assumptions

- Assumes `GITHUB_TOKEN` can create a new user-scoped npm package on first publish when the `repository` field points at the workflow's own repo (this is how the GitHub docs example works).
- Assumes `upload-artifact` with `overwrite: true` lets a re-run of the same release upload again. If not, prove the duplicate path with a fresh release run instead.
- Making the package public cannot be undone; the PRD wants it public.

## Success Criteria (Summary)

- Cutting release `v0.1.0` publishes `@remekgdansk/ai-toolkit-example@0.1.0` to GitHub Packages with no personal token involved.
- Re-releasing an existing version, tagging the wrong version or marking a pre-release each turns the run red before or at publish, and leaves the registry unchanged.
- PRs and pushes to `main` run checks and never publish.
