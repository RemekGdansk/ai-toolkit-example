# Install from Registry — Plan Brief

> Full plan: `context/changes/install-from-registry/plan.md`

## What & Why

Install the CI-published `@remekgdansk/ai-toolkit-example` from GitHub Packages into `critical-path` with one command, both locally and in its CI, then use the toolkit's skill from Claude Code there. This is roadmap slice S-03, the north star (FR-003, FR-004, US-01). It closes the distribution loop and proves the "no tokens in committed files" guardrail.

## Starting Point

`0.1.0` is published and public (S-02), and its installer works from any install location. `critical-path` has only a leftover S-01 tarball install. Its `.claude/` folder is gitignored. Its deploys run through Cloudflare Workers Builds, which runs its own `npm ci`, and Dependabot auto-merges minor and patch bumps.

## Desired End State

`critical-path` commits two things: a scope-only `.npmrc` and an `ai-toolkit` script pinned to `0.1.0`. `npm run ai-toolkit -- install` installs from the registry using the author's `~/.npmrc` token locally and the `GH_PKG_TOKEN` secret in a separate `ai-toolkit` CI job. That job also rejects committed tokens and checks idempotence. `ci` and Cloudflare deploys need no token and stay green. The toolkit README documents the path.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Install tokens | Read-only classic PAT locally and as a CI secret | GitHub Packages needs a token even for public packages and accepts only classic PATs. | PRD (Access Control) |
| Committed config | `.npmrc` = `@remekgdansk:registry=https://npm.pkg.github.com` only | PRD guardrail: committed config points the scope at the registry and carries no credentials. | PRD |
| Dependency model | Pinned `npx --yes …@0.1.0` script, not a devDependency | Only the install step needs the PAT; Cloudflare's `npm ci`, Dependabot and the lockfile stay untouched, and S-06 bumps one line. | Plan |
| CI shape | Separate non-required `ai-toolkit` job, skipped for Dependabot and fork PRs | Those PRs get no Actions secrets; the required `ci` check and auto-merge keep working. | Plan |
| Missing secret | Fails visibly outside the skipped cases | A misconfigured repo must not pass silently. | Plan |
| Local token | `npm login --auth-type=legacy` into user-level `~/.npmrc` | GitHub's documented flow; works for every npm command with no shell setup. | Plan |
| Token check | CI assert (exact `.npmrc`, no token patterns in tracked files) + one manual review | Guards every future PR, not just this change. | Plan |
| Token count | Two separate PATs (local, CI) | Revoking one leaves the other working, matching the PRD's revocation model. | Plan |

## Scope

**In scope:**
- Two classic PATs with `read:packages` only, and the `GH_PKG_TOKEN` secret
- `critical-path`: `.npmrc`, `ai-toolkit` script, `ai-toolkit` CI job, one squash-merged PR
- A clean-slate local install from the registry, plus a Claude Code check
- Toolkit `README.md`: registry install, CI install, `E401` remedy, tarball flow kept for local development

**Out of scope:**
- The toolkit as a devDependency; tokens for Cloudflare or Dependabot; Dependabot `registries:`
- Making `ai-toolkit` a required check; `GITHUB_TOKEN` package access
- Uninstall (S-05), update (S-06), real repo-refresh behaviour (S-04), rules in `CLAUDE.md`
- Installer or publish workflow changes; a new toolkit version

## Architecture / Approach

```
local:  ~/.npmrc (npm login, PAT #1) + critical-path/.npmrc (scope only)
        npm run ai-toolkit -- install ─► npx @remekgdansk/ai-toolkit-example@0.1.0 ─► npm.pkg.github.com
                                                                     └─► writes .claude/skills/ai-toolkit-example/ + manifest
CI (ci.yml, job ai-toolkit; skipped for dependabot/forks):
        checkout → setup-node (registry-url, scope) → token hygiene → secret present?
        → install (NODE_AUTH_TOKEN = GH_PKG_TOKEN, PAT #2) → assert manifest/version/SKILL.md → re-install unchanged
ci job and Cloudflare Workers Builds: unchanged, no token, no @remekgdansk dependency to fetch
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Registry access and consumer config | PATs + secret, `.npmrc` + script, clean-slate registry install, skill works in Claude Code | Leftover S-01 files making install a no-op that proves nothing |
| 2. critical-path CI install job | Green `ai-toolkit` job, proven token-hygiene failure, PR merged, deploy green | Hygiene patterns matching themselves in `ci.yml` |
| 3. Toolkit README for the registry path | Registry and CI install docs with observed error messages | Docs drifting from what was actually run |

**Prerequisites:** S-01 and S-02 done; `0.1.0` public on GitHub Packages; `gh` authenticated with repo and secrets access to `critical-path`; user approval to create PATs, set the secret, push, open and merge the `critical-path` PR.
**Estimated effort:** ~1.5–2 hours across 3 phases (Phase 2 is mostly waiting on CI and Workers Builds).

## Open Risks & Assumptions

- Assumes Workers Builds' automatic install is unaffected by a scope-only `.npmrc` when no `@remekgdansk` dependency exists. Phase 1 checks this with `npm ci --userconfig /dev/null`, and Phase 2 checks it with a real build.
- Assumes Dependabot's npm updater is unaffected by the same line. Its failures are silent (no PR, no red check), so Phase 2 triggers a manual "Check for updates" after the merge.
- The Dependabot skip and the missing-secret failure are reviewed in the diff but may not be seen live during this change.
- Fork PRs and Dependabot PRs skip the token-hygiene check along with the install. Acceptable for a single-author repo.
- The local PAT sits in plain text in `~/.npmrc`, which is outside every repo.
- A classic PAT can read every package the account can access. `read:packages` is the narrowest scope GitHub Packages accepts.

## Success Criteria (Summary)

- On a clean `critical-path`, `npm run ai-toolkit -- install` installs `0.1.0` from GitHub Packages, and `/ai-toolkit-example:repo-refresh` runs in Claude Code.
- `critical-path`'s CI installs the toolkit with the `GH_PKG_TOKEN` secret, and fails if a committed file carries a registry token.
- No committed file in `critical-path` holds a token, and `ci` and Cloudflare deploys keep working without one.
