---
project: "ai-toolkit-example"
version: 1
status: draft
created: 2026-10-29
context_type: greenfield
product_type: library
target_scale:
  users: small          # just the author in v1
  qps: n/a              # installable package; no running service
  data_volume: n/a
timeline_budget:
  mvp_weeks: 1          # author's budget: 8 working hours
  hard_deadline: null
  after_hours_only: false # day-job work
---

# ai-toolkit-example — PRD

## Vision & Problem Statement

Pain: the motivation is mainly learning the shared-registry distribution pattern — packaging AI artifacts (skills, rules) as a versioned package and installing them into a consumer repo. Today `critical-path` gets its AI skills only from an external skills-distribution tool; there is nothing of the author's own being distributed yet.

Moment: setting up AI-tool skills and rules in `critical-path` (the first consumer repo).

# TODO: insight — see Open Questions

## User & Persona

Primary persona: the author — sole developer, the only consumer in v1. First consumer repo is `RemekGdansk/critical-path` (public). Uses Claude Code (must-have); GitHub Copilot and Codex are nice-to-have targets.

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

## Non-Goals

- **No code-review skill in v1** — deferred to a later version; v1 ships repo refresh only.
- **No agents beyond Claude Code, GitHub Copilot and Codex** — Cursor, Windsurf and others are out of v1.
- **No gated access or alternative delivery** — no private package, no per-user access list, no managed cloud registry, no API+CLI delivery; the only recipient is the author.
- **No remote branch deletion** — repo refresh only ever deletes local branches; it never deletes or pushes anything on the remote.
- **No Windows support** — install, uninstall and repo refresh only need to work on macOS and Linux in v1.
- **No automatic updates** — installed skills change only when the author updates the package; no background sync or update checks.

## Open Questions

1. **Where do GitHub Copilot and Codex discover skills and rules, and can they use a toolkit-owned subfolder?** — Owner: author (research step). Affects FR-009, FR-010 and the "own subfolder" requirement. Block: no (both are nice-to-have).
2. **What is the insight — what does the author understand that the status quo (an external skills-distribution tool) doesn't?** — TBD by user. Shape notes record "Insight: not stated." Block: no (the product is primarily a learning exercise).
3. **Are the nice-to-have FRs (FR-005, FR-009, FR-010) inside or outside the v1 cut?** — Owner: author. Nice-to-have is treated as outside MVP scope, but the shape notes say Copilot and Codex are "targeted" in v1 and "may slip". Decide whether v1 is done without them. Block: no.
