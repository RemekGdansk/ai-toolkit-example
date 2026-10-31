# Review fixes: clean-uninstall

From `reviews/impl-review.md` (2026-10-31).

- **F2 (applied, Fix A).** Phase 1 Change 3, "Report": the plan's `kept <dir>/: it holds files ai-toolkit-example did not install` line now ends with `; move them out before installing again` when `<dir>` is `.claude/skills/ai-toolkit-example`. Without the hint, a successful uninstall that kept the plugin folder left a state both commands refuse, with no guidance. Updated: `src/uninstall.ts`, U7 in `test/uninstall.test.ts`, and the README Uninstall section.
- **F1 (applied).** Added U8b to `test/uninstall.test.ts`, alongside the plan's U1–U15. A manifest listing `.claude/settings.json` with its real hash, or `.claude/other` as a created folder, exits 1 and removes nothing.
- **F3–F5 (applied).** README wording (the manifest is removed after every managed file), stronger assertions in U9's symlinked-manifest case, and `kept` now lists only real folders.
