<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Install from Registry (S-03)

- **Plan**: context/changes/install-from-registry/plan.md
- **Mode**: Deep
- **Date**: 2026-10-30
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓, 7/7 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (12/9/5 rows before triage)

Verified claims: the installer reads the consumer root from `process.cwd()` (`src/install.ts:24`), and the package has a single bin. The success line matches 1.5 (`src/install.ts:161`). The leftover manifest's `createdDirs` stay inside `.claude/skills/ai-toolkit-example/`. `setup-node` v7 writes its npmrc to `$RUNNER_TEMP`, points `NPM_CONFIG_USERCONFIG` at it and no longer exports a placeholder `NODE_AUTH_TOKEN` (Context7, `/actions/setup-node`). `critical-path`'s required checks are `ci` and `Workers Builds: critical-path` (strict, linear history), its only secret is `ROADMAP_SYNC_TOKEN`, and it tracks no `.npmrc`. The hygiene patterns cannot match their own literal text.

## Findings

### F1 — Dependabot isn't checked after .npmrc lands

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Success Criteria; brief "Open Risks"
- **Detail**: Dependabot's npm updater reads the committed `.npmrc`. The plan proves Workers Builds is unaffected but never checks Dependabot. A Dependabot failure is silent: no PR, no red check, only an error on the repo's Dependabot page. `critical-path` relies on weekly Dependabot updates plus auto-merge.
- **Fix**: Add a Phase 2 manual criterion: after the merge, start a Dependabot npm "Check for updates" and confirm no registry error, or record it as not yet observed. Add Dependabot to the brief's Open Risks.
- **Decision**: FIXED. Added a Phase 2 manual bullet and Progress row 2.10, and a new Open Risks line in plan-brief.md.

### F2 — Two Phase 2 checks don't test what they claim

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Automated Verification (2.1, 2.2)
- **Detail**: 2.2 runs `grep -n 'GH_PKG_TOKEN'` and expects no hit in a `run:` block. But step 4 requires `::error::GH_PKG_TOKEN is not set …` inside a `run:` script, so a correct implementation fails the check. 2.1 claims "the workflow parses", but its command only greps for SHA pins.
- **Fix**: 2.2 → grep `secrets\.GH_PKG_TOKEN` and expect only `env:` value lines. 2.1 → drop "parses" (2.4's green PR run proves the workflow parses).
- **Decision**: FIXED. Reworded 2.1 and 2.2 in the Phase 2 criteria and in Progress.

### F3 — No record of PAT expiry dates

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 Tokens; Phase 3 README "Install in CI"
- **Detail**: Both PATs must expire, so the CI PAT will turn the non-required `ai-toolkit` job red on every human PR on a predictable date. `critical-path`'s `dependabot.yml` warns that a permanently red check teaches everyone to ignore red. Nothing records the date.
- **Fix**: Record both expiry dates (change.md Notes and `critical-path`'s `deploy-plan.md`), and have the README's "Install in CI" section name the rotation command (`gh secret set GH_PKG_TOKEN`, read from the prompt).
- **Decision**: FIXED. Updated the Phase 1 §1 contract, manual check 1.10 and its Progress row, and the Phase 3 README "Install in CI" contract.
