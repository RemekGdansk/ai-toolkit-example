# Review fixes: clean-uninstall

From `reviews/impl-review.md` (2026-10-31).

- **F2 (applied, Fix A).** Phase 1 Change 3, "Report": the plan's `kept <dir>/: it holds files ai-toolkit-example did not install` line now ends with `; move them out before installing again` when `<dir>` is `.claude/skills/ai-toolkit-example`. Without the hint, a successful uninstall that kept the plugin folder left a state both commands refuse, with no guidance. Updated: `src/uninstall.ts`, U7 in `test/uninstall.test.ts`, and the README Uninstall section.
- **F1 (applied).** Added U8b to `test/uninstall.test.ts`, alongside the plan's U1–U15. A manifest listing `.claude/settings.json` with its real hash, or `.claude/other` as a created folder, exits 1 and removes nothing.
- **F3–F5 (applied).** README wording (the manifest is removed after every managed file), stronger assertions in U9's symlinked-manifest case, and `kept` now lists only real folders.

From `reviews/impl-review.md` (full review, 2026-10-31). Earlier entries above came from what is now `reviews/impl-review-phase-1.md`.

- **F1 (applied).** Phase 1 Change 3 step 2: the ManifestError follow-up line now reads `nothing was removed. Restore <MANIFEST_PATH> to the file install wrote, or move out any files you changed or added in <TARGET_DIR>/, then delete it together with that folder.` The plan's version told the user to delete the plugin folder without warning about their own files in it. README row updated.
- **F2 (applied).** Phase 1 Change 3 step 5: a created path that still exists but is no longer a folder, such as a file or symlink, is reported as `left <dir>: it is no longer a folder; remove it before installing again`. The earlier `isDirectory()` filter on `kept` had made it silent. Covered by U7b; README updated.
- **F4 (applied).** Progress 1.1–1.4 repointed from `887f0a8` (branch-only) to `95fd58c`, the squash of #10 on `main`.
- **F6–F9 (applied).** README Uninstall section:
  - points to the npm error table under Re-running;
  - notes that deleting `GH_PKG_TOKEN` does not revoke the token.

  The release workflow's tarball check now requires every `dist/` module the CLI loads. U16 covers the removal-error path. U7b and U16 extend the plan's U1–U15.
