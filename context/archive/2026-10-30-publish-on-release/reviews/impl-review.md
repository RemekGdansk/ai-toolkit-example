<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Publish on Version Release

- **Plan**: context/changes/publish-on-release/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (1 observation) |
| Scope Discipline | PASS |
| Safety & Quality | PASS (1 observation) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (1 observation) |

## Evidence

- Automated 1.1–1.7 re-run locally on 2026-10-30: all pass. `npm test` ran 18 tests, all passing. The lockfile root is `@remekgdansk/ai-toolkit-example`. Registry and repository URL are correct. The pack dry-run lists `dist/cli.js`, `plugin/.claude-plugin/plugin.json` and `plugin/skills/repo-refresh/SKILL.md`. All four `uses:` are SHA-pinned. `github.event.release` appears only in `env:` (lines 29–30). `validate:plugin` passes.
- Phase 2 checked against GitHub Actions runs:
  - Run 41105924142 (pre-release v0.1.0): `check` failed with the pre-release message, `publish` skipped.
  - Run 41106110981, attempt 1: `check` and `publish` green.
  - Run 41106110981, attempt 2: `publish` failed with "You cannot publish over the previously published versions: 0.1.0."
  - Run 41106832818 (v0.1.1): `check` failed with the mismatch message naming `v0.1.1` and `0.1.0`, `publish` skipped.
  - `gh release list` and `git ls-remote --tags` show only `v0.1.0`.
- Not verified from the CLI: package visibility and repository link (2.3). The `gh` token lacks `read:packages`.

## Findings

### F1 — Release guard doesn't check that the tagged commit is on `main`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/publish-ai-toolkit.yml:26
- **Detail**: The guard checks the tag name and the pre-release flag, but not where the tag points. The README tells the author to use `--target main`, but nothing enforces it. A release cut from any branch or commit with a matching `package.json` version would build and publish code that never passed a PR. In this single-maintainer repo with no branch protection, the author can already push straight to `main`, so the practical risk is low today. It grows once collaborators or branch protection arrive.
- **Fix**: Add a guard check that the release commit is an ancestor of `origin/main` (`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`, with `fetch-depth: 0` on checkout, or a targeted `git fetch origin main`).
  - Strength: Closes the gap between the README procedure and what CI enforces. The check stays read-only and fails before `npm ci`.
  - Tradeoff: Fetches more history. It also adds a rule the plan didn't ask for (plan scope: tag and pre-release only).
  - Confidence: MED — standard pattern, but not yet run against this workflow.
  - Blind spot: Branch protection and tag rulesets are not configured, so this may be better handled at the repo-settings level.
- **Decision**: FIXED (differently) — repo rulesets instead of a CI check, created 2026-10-30:
  - `Protect main` (id 26231063): applies to `~DEFAULT_BRANCH`. It blocks deletion and force-push, requires a PR with 0 approvals and a passing `check` status. The admin can bypass only through a PR, so direct pushes to `main` are blocked.
  - `Release tags` (id 26231067): blocks updates to `refs/tags/v*`, so a published tag cannot be moved. Delete and recreate still work.
  - Known residual gap: the admin can still create a `v*` tag on a commit that isn't on `main`. Rulesets cannot restrict where a tag points.

### F2 — Lockfile diff goes beyond the planned root name/version change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package-lock.json:7
- **Detail**: The plan expected the only diff to be the root `name` and `version`. `packages[""]` also gained `license`, `bin` and `engines`. npm mirrors these root-package fields from `package.json`. No dependency entries changed, which is what the plan's revert rule protected against, so the result is correct. The plan's stated expectation was just imprecise.
- **Fix**: None needed. Optionally note this in the plan for the record.
- **Decision**: SKIPPED

### F3 — Plan still describes the duplicate failure as `E409`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/publish-on-release/plan.md (Desired End State, Phase 2 criteria, Progress 2.4)
- **Detail**: The real publish log for run 41106110981 attempt 2 shows `npm error You cannot publish over the previously published versions: 0.1.0.` with no visible `E409` code. The Phase 2 commit (326dd28) correctly updated the README failure table to the real message, but the plan text still says `E409`. Separately, 2.3 (package linked and public) has no evidence in the diff or the CLI, because the local `gh` token lacks `read:packages`. Its checkmark rests on the author's manual UI check.
- **Fix**: Add a one-line note under Phase 2 recording the actual registry message. Optionally confirm 2.3 with `gh auth refresh -h github.com -s read:packages` and `gh api /users/RemekGdansk/packages/npm/ai-toolkit-example --jq '.visibility, .repository.full_name'`.
- **Decision**: FIXED — added an "Observed" note under Phase 2 step 4 in plan.md with the real registry message. 2.3 is still not CLI-verified (needs `read:packages`).
