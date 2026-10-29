---
project: "ai-toolkit-example"
context_type: greenfield
created: 2026-10-29
updated: 2026-10-29
product_type: library
target_scale:
  users: small          # just the author in v1
  qps: n/a              # installable package; no running service
  data_volume: n/a
timeline_budget:
  mvp_weeks: 1          # author's budget: 8 working hours
  hard_deadline: null
  after_hours_only: false # day-job work
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "context type"
      decision: "greenfield — the toolkit package is new; critical-path is its first consumer, not the system being changed"
    - topic: "recipient"
      decision: "the author themself, working on GitHub; package must be open source (not private)"
    - topic: "audience size (v1)"
      decision: "just the author"
    - topic: "consumer AI tools"
      decision: "Claude Code must-have; GitHub Copilot and Codex nice-to-have; all other tools out of v1"
    - topic: "delivery model"
      decision: "Model 1 — npm package on GitHub Packages (course default), public visibility"
    - topic: "more complex model (CodeArtifact / API+CLI)"
      decision: "not needed — no reason for it"
    - topic: "package name"
      decision: "@remekgdansk/ai-toolkit-example"
    - topic: "source repo"
      decision: "this repo (RemekGdansk/ai-toolkit-example) hosts the package source and its publish workflow"
    - topic: "access control"
      decision: "publish only via CI GITHUB_TOKEN; install via read:packages PAT locally + CI secret in critical-path; revoke = revoke/expire PAT"
    - topic: "v1 skills"
      decision: "repository refresh only; code-review deferred"
    - topic: "v1 agents"
      decision: "Claude Code, Copilot, Codex all targeted; Claude built and verified first; Copilot/Codex may slip"
    - topic: "timeline"
      decision: "8 working hours"
    - topic: "stash protection"
      decision: "keep a branch if it is the only branch from which a stash's base commit is reachable"
    - topic: "refresh on a feature branch"
      decision: "update main without switching branches"
    - topic: "deletion confirmation"
      decision: "show the delete/keep list with reasons, then confirm"
    - topic: "gone upstream"
      decision: "supporting signal only; still needs the changes-in-main check"
  frs_drafted: 11
  quality_check_status: accepted
---

# Shape notes

## Seed idea

> Create an AI toolkit [...] I want to be able to use this AI toolkit in my [...] project https://github.com/RemekGdansk/critical-path. [...] start with point 1 which is choosing the right form of the AI Toolkit.

Target minimal starter (from the seed): `package.json`, `install.js`, `uninstall.js`, `skills/code-review/SKILL.md`, `rules/CLAUDE.md`, `.github/workflows/publish-ai-toolkit.yml`.

## Delivery model decision

**Model 1 — npm package on GitHub Packages.** The only recipient is me, working on GitHub (first consumer: `critical-path`), with no one else whose access must be revoked, so a package on the registry my GitHub account already has is enough. One package carries rules and skills for Claude Code (must-have), with Copilot and Codex formats as nice-to-haves. It is public (open source), and I accept that GitHub Packages still requires a `read:packages` token to install it. CodeArtifact (Model 2) and API+CLI (Model 3) solve problems I don't have — no AWS org, no external recipients with limited access — so I deliberately don't use them.

## Vision & Problem Statement

Pain: the motivation is mainly learning the shared-registry distribution pattern — packaging AI artifacts (skills, rules) as a versioned package and installing them into a consumer repo. Today `critical-path` gets its AI skills only from an external skills-distribution tool; there is nothing of the author's own being distributed yet.

Moment: setting up AI-tool skills and rules in `critical-path` (the first consumer repo).

Insight: not stated.

## User & Persona

Primary persona: the author — sole developer, the only consumer in v1. First consumer repo is `RemekGdansk/critical-path` (public). Uses Claude Code (must-have); GitHub Copilot and Codex are nice-to-have targets.

## User Stories

### US-01: Author refreshes critical-path with the installed toolkit

- **Given** `critical-path` with the author's own `CLAUDE.md` content and several local branches — some merged into main (one of them squash-merged), one not merged
- **When** the author installs `@remekgdansk/ai-toolkit-example` and asks Claude Code to refresh the repo
- **Then** main is up to date with the remote, the merged branches (including the squash-merged one) are deleted, the unmerged branch is kept, and the author's own `CLAUDE.md` text is unchanged

#### Acceptance Criteria
- The currently checked-out branch is never deleted.
- A branch is never deleted if it is the only branch a given stash refers to.
- Unmerged branches are kept.
- The author's own `CLAUDE.md` content outside the toolkit's sentinel markers is unchanged.

## Functional Requirements

### Publishing
- FR-001: Author can publish a new toolkit version to the package registry by bumping the version and cutting a version release (CI does the publish). Priority: must-have
  > Socrates: Counter-argument considered: "publishing on every push to main fires on README edits too." Resolution: revised — publish is triggered by a version release, not by push.
- FR-002: Author gets a visible CI failure when publishing a version that already exists. Priority: must-have
  > Socrates: Counter-argument considered: "the registry already rejects a duplicate version, so the failed publish step is the visible failure." Resolution: accepted — the registry's rejection satisfies this FR; no custom pre-check needed.

### Install / update
- FR-003: Author can install the toolkit into a consumer repo with one install command, both locally and in the consumer's CI. Priority: must-have
  > Socrates: Counter-arguments considered: "consumer CI doesn't need it" and "running setup automatically on package install is fragile." Resolution: stands as written.
- FR-004: Author can use the toolkit's skills in Claude Code after install, with the skills in a toolkit-named subfolder. Priority: must-have
  > Socrates: Counter-arguments considered: "a subfolder costs discoverability (workspace trust, launch from repo root)" and "installed files pollute the consumer's git." Resolution: stands as written.
- FR-005: Author gets the toolkit's rules inserted between sentinel markers in the consumer's `CLAUDE.md`, with nothing outside the markers changed. Priority: nice-to-have
  > Socrates: Counter-argument considered: "repo-refresh is a self-contained skill; shipping rules in v1 adds install/uninstall complexity for nothing." Resolution: demoted to nice-to-have — rules support stays in the design but is not required for v1.
- FR-006: Author can rely on install recording every file and text block it added in a manifest. Priority: must-have
  > Socrates: Counter-arguments considered: "the manifest must outlive the package" and "derive it instead of storing it." Resolution: stands as written.
- FR-007: Author can update to a newer version and get the new content, with the old version's content replaced and no duplicates. Priority: must-have
  > Socrates: Counter-arguments considered: "skills removed in a newer version linger" and "locally edited installed files get clobbered." Resolution: stands as written.

### Uninstall
- FR-008: Author can uninstall the toolkit with an explicit uninstall command run before removing the package, removing exactly what the manifest lists and leaving their own content intact. Priority: must-have
  > Socrates: Counter-argument considered: "removing the package does not run any toolkit cleanup, so removing it alone leaves files orphaned." Resolution: revised — uninstall is an explicit command the author runs before removing the package.

### Other agents
- FR-009: Author can use the toolkit's skills and rules from GitHub Copilot after install. Priority: nice-to-have
  > Socrates: Counter-arguments considered: "Copilot may already read Claude's skill files" and "first to slip in 8 hours." Resolution: stands as written.
- FR-010: Author can use the toolkit's skills and rules from Codex after install. Priority: nice-to-have
  > Socrates: Counter-arguments considered: "three per-agent copies drift" and "first to slip in 8 hours." Resolution: stands as written.

### Skill: repository refresh
- FR-011: Author can run the repo-refresh skill to update main from the remote and delete local branches already merged into main, including squash-merged ones. Priority: must-have
  > Socrates: Counter-arguments considered: "squash-merge detection is inferred and a false positive deletes real work" and "branch deletion shouldn't be left to the LLM improvising git commands." Resolution: stands as written.

## Non-Functional Requirements

- No unmerged work is ever lost: repo refresh never deletes a branch carrying commits whose changes are not in main.
- Install is idempotent: running install twice leaves the consumer repo in the same state as running it once.

## Business Logic

Repo refresh updates main from the remote without switching branches, then proposes deleting only those local branches whose work is already in main (merged or squash-merged; a gone upstream supports but never replaces this check), never the checked-out branch or the only branch containing a stash's base commit, and deletes nothing until the author confirms the list.

Inputs: the local branches, their upstream state (present or gone), the up-to-date main, the currently checked-out branch, and the stash list. Each local branch is classified as a deletion candidate or kept, with a reason.

- A branch is a candidate when its changes are already in main — via a regular merge or a squash merge. A gone upstream counts as a supporting signal only together with that check; a gone upstream alone keeps the branch.
- A branch is always kept when it is the checked-out branch, or when it is the only branch from which some stash's base commit is reachable (deleting it would leave that stash with no branch).
- Output: the author sees the list of branches to delete and to keep, each with its reason, and confirms before anything is deleted. The author stays on the branch they were on.

## Access Control

Single human user (the author); no roles. Access is about the package registry, not an app login.

- **Publish:** only the CI publish workflow in `RemekGdansk/ai-toolkit-example`, using a credential scoped to that workflow. No personal publish tokens.
- **Install (local):** a personal read-only install token, kept in the author's local environment — never in a committed file. The consumer's committed config only points the package's scope at the registry and carries no credentials.
- **Install (CI):** `critical-path`'s CI installs the package with a read-only install token stored as a CI secret.
- **Revocation:** install access ends when the install token (local or the CI secret) is revoked or expires; publish access ends when the workflow's or repo's permissions change. No per-user access list in v1.

## MVP flow (draft)

1. Author edits a skill/rule in `ai-toolkit-example` and bumps the version.
2. CI publishes `@remekgdansk/ai-toolkit-example` to GitHub Packages.
3. In `critical-path`, author runs `npm i -D @remekgdansk/ai-toolkit-example`.
4. Install places the toolkit's skills in **their own toolkit-named subfolder** (not loose next to the consumer's own skills) for each supported agent, adds the rules text between sentinel markers in the consumer's rules file, and records what it added in a manifest.
5. The AI agent in `critical-path` picks up the skills and rules.
6. Uninstall removes exactly what was added; the consumer's own content stays intact.

v1 skill: **repository refresh** only — pull changes from main, delete already-merged local branches including squash-merged ones. `code-review` is deferred to a later version.

v1 agents: Claude Code, GitHub Copilot and Codex all targeted; Claude Code is built and verified first, Copilot and Codex follow in the same design. If time runs out, Copilot/Codex slip without rework.

Timeline: author wants it done in 8 working hours (`mvp_weeks: 1`).

## Success Criteria

### Primary
- A CI-published version installs into `critical-path` and the repo-refresh skill is usable from Claude Code there.
- Uninstall leaves `critical-path` exactly as it was before install (the author's own files and rules text untouched).
- Bumping the version, publishing and updating in `critical-path` delivers the changed skill.
- `critical-path`'s CI installs the package using a read-only install token held in its CI secrets.

### Secondary
- The repo-refresh skill and rules are also usable from GitHub Copilot and Codex in `critical-path`.
- A public README good enough for someone else to install the package.

### Guardrails
- Never overwrite consumer content: install touches only files in its manifest and only text between its sentinel markers.
- Uninstall is the exact inverse of install, driven by the manifest.
- No tokens in committed files: tokens live only in CI secrets or local env, never in a committed config file.
- Publish only a new version: a release that re-uses an existing version fails visibly instead of half-publishing.

## Non-Goals

- **No code-review skill in v1** — deferred to a later version; v1 ships repo refresh only.
- **No agents beyond Claude Code, GitHub Copilot and Codex** — Cursor, Windsurf and others are out of v1.
- **No gated access or alternative delivery** — no private package, no per-user access list, no managed cloud registry, no API+CLI delivery; the only recipient is the author.
- **No remote branch deletion** — repo refresh only ever deletes local branches; it never deletes or pushes anything on the remote.
- **No Windows support** — install, uninstall and repo refresh only need to work on macOS and Linux in v1.
- **No automatic updates** — installed skills change only when the author updates the package; no background sync or update checks.

## Open Questions

1. **Where do GitHub Copilot and Codex discover skills and rules, and can they use a toolkit-owned subfolder?** — Owner: author (research step). Affects FR-009, FR-010 and the "own subfolder" requirement. Block: no (both are nice-to-have).

## Discovery log

- Recipient: the author, on GitHub. First consumer repo: `RemekGdansk/critical-path` (public, TypeScript).
- The package must be open source, not a private package.
- v1 audience: just the author.
- Consumer AI tools: not only Claude Code.
  - Claude Code — must-have.
  - GitHub Copilot — nice-to-have.
  - Codex — nice-to-have.
  - Any other tool (Cursor, Windsurf, …) — out of scope for v1.
- Fact surfaced during shaping (GitHub docs): GitHub Packages requires a personal access token (classic) to install npm packages, including public ones.
- Delivery model chosen: Model 1 on GitHub Packages (course default), package public.
- Main motivation: mainly the course exercise (learning the distribution pattern).
- More complex models (CodeArtifact, API+CLI): explicitly not needed.
- Package name: `@remekgdansk/ai-toolkit-example`. Source + publish workflow live in this repo.
- Remark on the flow: toolkit skills must land in their own subfolder, not directly under `.claude/skills/` (or the equivalent for other agents).
- Author asked for Copilot and Codex to be included so the design stays extensible.

## Forward: tech-stack

Moved out of the PRD-bound sections on 2026-10-29 (PRD self-review flagged them as technical leak).

- Registry: GitHub Packages (npm registry), package `@remekgdansk/ai-toolkit-example`, public. GitHub Packages requires a classic PAT with `read:packages` to install npm packages, including public ones.
- Publish (FR-001, Access Control): a GitHub Actions workflow in `RemekGdansk/ai-toolkit-example`, triggered by a version tag / GitHub Release, authenticating with `GITHUB_TOKEN`.
- Install (FR-003, Access Control): `npm install` (`npm i -D @remekgdansk/ai-toolkit-example`). Consumer's committed `.npmrc` only maps the `@remekgdansk` scope to `https://npm.pkg.github.com`; the local PAT lives in local env / `~/.npmrc`; consumer CI uses the `read:packages` PAT stored as a repository secret.
- Install hook (FR-003 Socratic): `postinstall` was the concern raised as fragile.
- Uninstall (FR-008): npm v7+ never runs uninstall lifecycle scripts, so the explicit uninstall command runs before `npm uninstall`.
- Consumer repo: `critical-path` is hosted on GitHub and written in TypeScript.
- Rejected delivery alternatives (Non-Goals): AWS CodeArtifact and API+CLI.

## Forward: technical-roadmap

- Claude Code (docs checked 2026-10-29): plain skills are discovered only at `.claude/skills/<skill>/SKILL.md`; a nested folder is NOT discovered. A folder `.claude/skills/<name>/` containing `.claude-plugin/plugin.json` loads as plugin `<name>@skills-dir` with namespaced skills (`<name>:<skill>`). Project scope requires accepting the workspace trust dialog and launching Claude Code from the repo root (or `/reload-plugins`). Candidate mechanism for the "own subfolder" requirement.
- Copilot and Codex skill/rules locations and whether they support a toolkit-owned subfolder: not yet verified — research step.
- npm (docs checked 2026-10-29): npm v7+ does not run `preuninstall`/`uninstall`/`postuninstall` lifecycle scripts, so `uninstall.js` must be invoked explicitly (FR-008).
