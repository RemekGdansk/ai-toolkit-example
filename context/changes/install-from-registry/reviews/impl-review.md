<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Install from Registry

- **Plan**: context/changes/install-from-registry/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

Code under review: `RemekGdansk/critical-path` squash commit `a320625` (#77: `.npmrc`, `package.json`, `.github/workflows/ci.yml`, `context/deployment/deploy-plan.md`) and this repo's `main..install-from-registry` (`README.md`, roadmap, change docs).

Re-run evidence: `npm test` 18/18 passed; in `critical-path`, `.npmrc` matches the scope line byte for byte, `package-lock.json` is unchanged by `a320625`, the toolkit is not in any dependency field, the token `git grep` finds nothing, `npm view …@0.1.0 version` prints `0.1.0`, `--userconfig /dev/null` gives the recorded E401, the npx cache entry resolves from `npm.pkg.github.com/download/…/0.1.0`, all 5 `uses:` lines are SHA-pinned, `secrets.GH_PKG_TOKEN` appears only as `env:` values (3 lines). PR #77 shows `ci`, `ai-toolkit` and `Workers Builds` all green; on the `main` push run for `a320625`, `ai-toolkit` is green with `installed …@0.1.0 (2 files)`, `2 files present with matching hashes` and an unchanged second install.

Benign additions beyond the plan, with no finding: `package-manager-cache: false` on `setup-node` (commented in the workflow), and a per-file hash check in Assert.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — README "version not found" row quotes E404; npm actually reports ETARGET

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:170
- **Detail**: Phase 3 says the README is written from what was actually observed. The new row says a pinned version that isn't published fails with `npm error code E404`. Running `npx --yes @remekgdansk/ai-toolkit-example@9.9.9 --help` in `critical-path` instead prints `npm error code ETARGET` / `npm error notarget No matching version found for @remekgdansk/ai-toolkit-example@9.9.9.` npm only gives E404 when the package name itself doesn't exist. A reader who searches the README for the message they got will not find this row.
- **Fix**: Change the row to quote `npm error code ETARGET` and `No matching version found for @remekgdansk/ai-toolkit-example@<version>`, keeping the remedy as written. Optionally mention that E404 means a misspelled package name.
- **Decision**: FIXED — README row now quotes the observed ETARGET message; added an E404 row for a misspelled package name (also observed)

### F2 — README CI snippet leaves out the hardening the verified job has

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: README.md:74
- **Detail**: The `## Install in CI` snippet is a reduced copy of the `critical-path` job. It has no `persist-credentials: false` on checkout, no `package-manager-cache: false`, and no token-hygiene step. The bullets below it say "no cache", but setup-node turns caching on automatically when `package.json` has a `packageManager` field. Without the hygiene step, the PRD's "no tokens in committed files" guardrail is only advice in the README, not something a check enforces. The plan's README contract didn't require these, so this is not drift.
- **Fix**: Add `persist-credentials: false` and `package-manager-cache: false` to the snippet, and one sentence pointing to `critical-path`'s "Token hygiene" step as an optional guard (and why its patterns never match their own text).
- **Decision**: FIXED — snippet gains `persist-credentials: false` and `package-manager-cache: false`; bullets explain both and describe an optional token-hygiene step with self-non-matching patterns

### F3 — Dependabot auto-merges to main don't run the ai-toolkit job

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: critical-path/.github/workflows/ci.yml:6-10
- **Detail**: Phase 2's intent says the job runs on "every `main` push". `gh run list --workflow ci.yml --branch main` shows push runs for `a320625` but none for `4c02ca3` (#78) or `2d4b5a2` (#79). Those were merged by `dependabot-auto-merge.yml` with `GITHUB_TOKEN`, and pushes made that way don't trigger workflows. This was already true before this change and affects `ci` the same way. In practice, `ai-toolkit` runs only on human PRs and human merges, so an expired `GH_PKG_TOKEN` shows up on the next human PR.
- **Fix**: Record this in the plan's Desired End State and in `critical-path`'s deploy-plan token section. No workflow change.
- **Decision**: FIXED — noted in plan.md Desired End State and in critical-path deploy-plan.md via RemekGdansk/critical-path#80
