<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Update to a New Version (S-06)

- **Plan**: context/changes/update-to-new-version/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated evidence checked on 2026-10-31: `npm test` passes 77/77; `npm view @remekgdansk/ai-toolkit-example versions` lists `0.4.0`; `Publish AI Toolkit` is green on the S-06 PR (41193522177), on main (41193568505) and on the `v0.4.0` release (41193572625); the `critical-path` repoint PR run 41193775577 has `ai-toolkit` and `ci` green. The workflow tarball check is unchanged and no new `src/` module was added. Plan drift: no DRIFT or MISSING items. The extra counts assertion in test 17 matches the plan's Testing Strategy.

## Findings

### F1 — Same-version run that restores missing files prints "nothing changed"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/install.ts:151 (also :154, :166)
- **Detail**: `noOp` compares only the previous manifest with the payload and ignores `needsWrite`. `findEditedFiles` skips managed files that are missing on disk (src/manifest.ts:105-108), so on the same version a deleted managed file gets rewritten (and deleted `createdDirs` are recreated). The run still prints `already at …; nothing changed` and leaves out `/reload-plugins`. Reproduced: install 0.4.0, `rm -rf .claude/skills/ai-toolkit-example/skills/repo-refresh`, install again: both files come back, exit 0, output says `already at @remekgdansk/ai-toolkit-example@0.4.0; nothing changed`. This is the only way to reach a write under `noOp`; a present file with different content is refused as a local edit. Inherited from the plan's no-op definition, not drift.
- **Fix A ⭐ Recommended**: Also require that nothing was written: `noOp` additionally needs `planned.every((f) => !f.needsWrite)` and no folder created in this run; otherwise fall through to the `reinstalled` line, which prints `/reload-plugins`. Add test 24 (same version, delete a managed file → no `nothing changed`, `/reload-plugins` printed, file restored).
  - Strength: Smallest change; keeps the four result forms the plan defined, makes "nothing changed" true, and restores the reload hint when skill content was rewritten.
  - Tradeoff: The counts read `(0 changed, 0 added, 0 removed, 3 unchanged)` for a run that restored files, because counts are manifest-vs-payload by design. Needs a 0.4.1 release.
  - Confidence: HIGH — `needsWrite` and the created-folder set are already computed in `install()`.
  - Blind spot: None significant.
- **Fix B**: Add a dedicated line for the case, e.g. `restored <k> missing files of <name>@<version> in <dir>/`, followed by `/reload-plugins`.
  - Strength: Output says exactly what happened; no misleading zero counts.
  - Tradeoff: A fifth result form beyond the plan; README table and tests grow. Needs a 0.4.1 release.
  - Confidence: MED — wording and the interplay with the version-change forms (restore during an update) need a decision.
  - Blind spot: Whether restoring a missing file during an `updated` run should also be surfaced.
- **Decision**: FIXED (Fix A). `noOp` also requires `planned.every((file) => !file.needsWrite)` (src/install.ts:151); a missing folder always holds a missing file, so no separate folder check. Test 24 added; it fails on the old code and passes with the fix (78/78). Release as 0.4.1 still to do.

### F2 — README result-line table describes disk state, but the code compares manifest with payload

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md:214, :216 (also :171, :230-232)
- **Detail**: The `reinstalled` row says "Same version, but some installed files differed and were restored." It actually prints when the manifest-recorded hashes differ from the payload or stale files exist (a rebuilt local tarball without a version bump, or a re-run after an interrupted update, test 17). Files that differ on disk are refused as local edits. The `already at` row ("every file already matches") and the Re-running sentence at :171 ("leaves every file unchanged") are wrong in the F1 case. The "After updating" list at :230-232 does not say the `/reload-plugins` reminder is left out when nothing changed.
- **Fix**: Reword the `reinstalled` row to "Same version, but the shipped files differ from what the manifest records (for example a rebuilt local tarball or an interrupted update)", align the `already at` row and :171 with the F1 fix, and note that the reload reminder appears only when files changed.
- **Decision**: FIXED. README Re-running sentence, `reinstalled` and `already at` rows reworded (including the F1 restore case); "After updating" notes the reload reminder is printed whenever files were written and left out after `already at`.

### F3 — `transitionVerb` can call different versions `reinstalled`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/install.ts:199-215
- **Detail**: `PLAIN_VERSION` accepts digit runs of any length and leading zeros, and `Number()` loses precision above 2^53. `1.0.0` vs `01.0.0`, or two 17-digit components that round to the same number, give `reinstalled` although the strings differ. It only affects a hand-edited manifest; real npm versions are fine.
- **Fix**: After the numeric loop, return `from === to ? "reinstalled" : "replaced"` instead of `"reinstalled"`.
- **Decision**: FIXED. `transitionVerb` falls back to string equality after the numeric loop; test 25 (`0<current>` → `replaced`) added, 79/79 pass.

### F4 — Test 19 checks only three named consumer files outside the target folder

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/install.test.ts:487
- **Detail**: The plan says consumer files outside `TARGET_DIR` stay byte-identical. Test 19 compares `package.json`, `CLAUDE.md` and `.claude/skills/other/SKILL.md` only, so a stray new file outside `TARGET_DIR` (other than the manifest) would go unnoticed.
- **Fix**: Compare `hashTree` of the consumer before and after, filtered to paths outside `TARGET_DIR` and the manifest.
- **Decision**: FIXED. `hashTree` takes an optional `exclude` list; test 19 asserts `hashTree(root, [TARGET_DIR, MANIFEST])` is unchanged instead of three named files. 79/79 pass.

### F5 — Some checked manual and break-check items have no recorded evidence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/update-to-new-version/plan.md (Progress 1.2, 1.4, 2.9)
- **Detail**: 1.2 (each new test fails when broken), 1.4 (scratch-consumer result line) and 2.9 (Claude Code shows the new wording and `plan` still runs) are marked done, but neither the commits nor `reviews/critical-path-update-diff.md` record what was observed. The other manual items are backed by that proof file.
- **Fix**: Add a short "Other checks" section to `reviews/critical-path-update-diff.md` with the observed output for 1.2, 1.4 and 2.9.
- **Decision**: FIXED. `reviews/critical-path-update-diff.md` gained "Other checks": a break-check table re-run during review (every new test, 19–25, fails on its break), the scratch-consumer 0.3.1 -> 0.4.0 output from a local tarball, and the author's confirmation of 2.9.
