---
change_id: install-from-registry
title: Install from registry
status: archived
created: 2026-10-30
updated: 2026-10-30
archived_at: 2026-10-30T20:29:32Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **PAT expiry (no values recorded):** local install PAT (classic, `read:packages`, user `~/.npmrc`) and CI PAT (classic, `read:packages`, `GH_PKG_TOKEN` in `RemekGdansk/critical-path`) both expire **2027-10-30**. Rotation steps are in `critical-path/context/deployment/deploy-plan.md` → "AI toolkit registry token".
- **Observed E401** (committed `.npmrc` only, `--userconfig /dev/null`): `npm error code E401` / `npm error 401 Unauthorized - GET https://npm.pkg.github.com/@remekgdansk%2fai-toolkit-example - authentication token not provided`.
- **`npm login` rejects uppercase usernames** (`npm warn Name must be lowercase`, then it prompts again and writes nothing). Enter `remekgdansk`; GitHub Packages ignores the username and authenticates with the PAT.
- **CI job landed** via `RemekGdansk/critical-path#77` (squash `a320625`). The throwaway placeholder-token commit turned "Token hygiene" red with `::error file=.npmrc::` and was reverted before the merge. Dependabot PR `#79` showed `ai-toolkit` skipped and still auto-merged on `ci` + Workers Builds.
- **Dependabot after the merge:** the npm security-update job failed with `security_update_not_possible` for `qs`, because `@stryker-mutator/core` → `typed-rest-client@2.3.1` pins `qs@6.15.1`. The same failure predates this change (2026-10-25). Registry calls went only to `registry.npmjs.org` (200), with none to `npm.pkg.github.com` and no 401/403. The version-update job behind `#79` succeeded.
