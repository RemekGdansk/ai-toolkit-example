---
project: ai-toolkit-example
version: 1
status: draft                    # draft | active | locked
created: 2026-10-30
updated: 2026-10-31
prd_version: 1
main_goal: learn
top_blocker: time
milestone_id: first-registry-delivered-toolkit
milestone_seq: 1
milestone_status: open           # open | done
---

# Roadmap: ai-toolkit-example

> Derived from `context/foundation/prd.md` (v1) + `context/foundation/shape-notes.md` (Forward: technical-roadmap) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First registry-delivered toolkit** — Status: open

- **Intent:** Prove the shared-registry distribution loop end to end for Claude Code: a CI-published version installs into `critical-path`, the repo-refresh skill works there safely, updates deliver new content, and uninstall leaves the repo as it was.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** all must-have FRs (FR-001, FR-002, FR-003, FR-004, FR-006, FR-007, FR-008, FR-011), US-01, both NFRs, and the Access Control section. Nice-to-have FR-005, FR-009 and FR-010 are parked for a later milestone (see `## Parked`).

## Vision recap

The author wants to learn the shared-registry distribution pattern: packaging their own AI skills and rules as a versioned package and installing it into a consumer repo. Today `critical-path`, the first consumer, gets AI skills only from an external distribution tool; nothing of the author's own is distributed yet. v1 ships one skill, repository refresh, for Claude Code.

## North star

**S-03: Author installs a CI-published version into `critical-path` and uses the toolkit's skill from Claude Code there** — this is the full distribution loop the project exists to learn, and it is the PRD's first primary success criterion.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the core product idea (a versioned package from a registry delivers working AI skills into a consumer repo). It is placed as early as its prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                                                       | Prerequisites | PRD refs                                          | Status   |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------- | -------- |
| S-01 | local-install-claude-code   | install the toolkit into `critical-path` with one command and see its skill in Claude Code, in a toolkit-named subfolder | —             | FR-003, FR-004, FR-006, NFR-install-idempotent, US-01 | done        |
| S-02 | publish-on-release          | cut a version release and have CI publish it to the registry, with a visible failure for a reused version  | —             | FR-001, FR-002                                    | done        |
| S-03 | install-from-registry       | install a CI-published version into `critical-path`, locally and in its CI, with no token in committed files | S-01, S-02    | FR-003, FR-004, US-01                             | done        |
| S-04 | safe-repo-refresh           | ask Claude Code in `critical-path` to refresh the repo and delete only branches whose work is already in main, after confirming | S-01          | FR-011, US-01, NFR-no-unmerged-work-lost          | done |
| S-05 | clean-uninstall             | run the uninstall command and get `critical-path` back exactly as it was before install                    | S-01          | FR-008, FR-006                                    | done |
| S-06 | update-to-new-version       | bump the version, publish, update in `critical-path` and get the changed skill with nothing stale or duplicated | S-03          | FR-007, FR-001                                    | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                 | Chain                        | Note                                                                                       |
| ------ | --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| A      | Install lifecycle     | `S-01` → `S-05`              | Exercises the installer/manifest contract first, which is the least familiar part (`learn`). |
| B      | Registry delivery     | `S-02` → `S-03` → `S-06`     | `S-03` joins Stream A at `S-01`; this is the north-star track.                              |
| C      | Repo-refresh skill    | `S-04`                       | Joins Stream A at `S-01`; the skill's safety logic can be built alongside Stream B.         |

## Baseline

What's already in place in the codebase as of `2026-10-30` (auto-researched + user-confirmed).
There are no Foundations below: every missing piece is small enough to land inside the first slice that needs it.

- **Frontend:** not applicable — the product is an installable package with no UI.
- **Backend / API:** partial — package scaffold only (`package.json` unscoped with no bin/files/publish config, `tsconfig.json` mapping `src` → `dist`); no source, installer, uninstaller or skills yet. Reference templates live in `.claude/config-templates/m5l4-github-packages-*.template` but are not wired in.
- **Data:** absent — the only persisted state will be the install manifest (FR-006).
- **Auth:** absent — no registry config yet; no app-level auth is required (PRD Access Control: registry access only).
- **Deploy / infra:** absent — no CI workflows; per `tech-stack.md`: GitHub Packages, GitHub Actions, publish on version release.
- **Observability:** not applicable — no running service; no test runner wired yet (`test` script is a placeholder).

## Foundations

None. Each cross-cutting element (package metadata, registry config, test harness) is introduced in the first slice that needs it: package layout and manifest in S-01, publish workflow in S-02, consumer registry config and tokens in S-03, git fixture tests in S-04.

## Slices

### S-01: Local install into Claude Code

- **Outcome:** user can install the toolkit (from a locally packed build) into `critical-path` with one install command, see its skill in Claude Code in a toolkit-named subfolder, and re-run install with no change in result.
- **Change ID:** local-install-claude-code
- **PRD refs:** FR-003, FR-004, FR-006, NFR-install-idempotent, US-01
- **Prerequisites:** —
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Does Claude Code's plugin-folder mechanism (shape-notes: a folder with a plugin descriptor loads as a namespaced plugin) satisfy the "toolkit-named subfolder" requirement in `critical-path`, given workspace trust and launch-from-root? — Owner: author (verify during `/10x-plan`). Block: no.
- **Risk:** Sequenced first because it is the least familiar mechanism and every other slice depends on its manifest; if subfolder discovery fails, FR-004's subfolder requirement has to be revisited before anything ships.
- **Status:** done

### S-02: Publish on version release

- **Outcome:** user can bump the version, cut a version release, and have CI publish the package to the registry; publishing a version that already exists fails the CI run visibly.
- **Change ID:** publish-on-release
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Independent of the installer, so it can run alongside S-01 and keep the north star close; the main risk is publish credentials leaking beyond the workflow-scoped credential required by Access Control.
- **Status:** done

### S-03: Install from the registry (north star)

- **Outcome:** user can install a CI-published version into `critical-path` with one command — locally with a personal read-only token in their environment, and in `critical-path`'s CI with a read-only token in CI secrets — and use the toolkit's skill from Claude Code; committed config only points the package scope at the registry.
- **Change ID:** install-from-registry
- **PRD refs:** FR-003, FR-004, US-01
- **Prerequisites:** S-01, S-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the full distribution loop and the milestone's validation point; the risk is token handling (the registry requires a token even for a public package), so the "no token in committed files" guardrail must be verified here.
- **Status:** done

### S-04: Safe repo refresh

- **Outcome:** user can ask Claude Code in `critical-path` to refresh the repo: main is updated from the remote without switching branches, local branches whose work is in main (merged or squash-merged) are listed for deletion with reasons, the checked-out branch, unmerged branches and the only branch holding a stash's base commit are kept, and nothing is deleted until the user confirms.
- **Change ID:** safe-repo-refresh
- **PRD refs:** FR-011, US-01, NFR-no-unmerged-work-lost
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - How is "changes already in main" decided for squash-merged branches reliably enough that a false positive never deletes real work? — Owner: author (research during `/10x-plan`). Block: no.
- **Risk:** The only slice that can destroy user work; the safety rules in Business Logic must be verified against a fixture repo before the skill is used on `critical-path`.
- **Status:** done

### S-05: Clean uninstall

- **Outcome:** user can run the explicit uninstall command before removing the package and get `critical-path` back exactly as it was before install — every file and text block in the manifest removed, nothing else touched.
- **Change ID:** clean-uninstall
- **PRD refs:** FR-008, FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Depends only on the manifest from S-01, so it can land early; the risk is the manifest missing an item and uninstall leaving orphans, which the "exact inverse of install" guardrail must catch.
- **Status:** done

### S-06: Update to a new version

- **Outcome:** user can bump the toolkit version, publish it, update the package in `critical-path`, and get the changed skill — the old version's content replaced, skills dropped in the new version removed, no duplicates.
- **Change ID:** update-to-new-version
- **PRD refs:** FR-007, FR-001
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - What happens to an installed file the user edited locally when an update replaces it? — Owner: author. Block: no.
- **Risk:** Last because it needs two published versions to exercise; the risk is stale content or a clobbered local edit, both raised in the FR-007 counter-arguments.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                         | Ready for `/10x-plan` | Notes                                  |
| ---------- | ------------------------- | ------------------------------------------------------------- | --------------------- | -------------------------------------- |
| S-01       | local-install-claude-code | Install toolkit locally and expose its skill in Claude Code   | yes                   | Run `/10x-plan local-install-claude-code` |
| S-02       | publish-on-release        | Publish to GitHub Packages on version release                 | yes                   | Run `/10x-plan publish-on-release`     |
| S-03       | install-from-registry     | Install CI-published version into critical-path (local + CI)  | no                    | Needs S-01 and S-02 done               |
| S-04       | safe-repo-refresh         | Repo-refresh skill with safe merged-branch cleanup            | no                    | Needs S-01 done                        |
| S-05       | clean-uninstall           | Manifest-driven uninstall command                             | no                    | Needs S-01 done                        |
| S-06       | update-to-new-version     | Update delivers new content with no stale or duplicate files  | no                    | Needs S-03 done                        |

## Open Roadmap Questions

1. **Where do GitHub Copilot and Codex discover skills and rules, and can they use a toolkit-owned subfolder?** — Owner: author (research step). Block: none in this milestone (gates the parked FR-009 and FR-010).
2. **What is the insight — what does the author understand that the status quo (an external skills-distribution tool) doesn't?** — Owner: author. Block: roadmap-wide no (the product is primarily a learning exercise).
3. **Are the nice-to-have FRs (FR-005, FR-009, FR-010) inside or outside the v1 cut?** — Owner: author. Block: no. Defaulted for this milestone: outside M-1 because time is the main risk; revisit when opening the next milestone.

## Parked

- **Rules inserted between sentinel markers in the consumer's `CLAUDE.md` (FR-005)** — Why parked: nice-to-have; with time as the main risk, deferred to the next milestone.
- **Skills and rules usable from GitHub Copilot (FR-009)** — Why parked: nice-to-have and blocked on research (Open Roadmap Question 1).
- **Skills and rules usable from Codex (FR-010)** — Why parked: nice-to-have and blocked on research (Open Roadmap Question 1).
- **Public README good enough for others to install** — Why parked: secondary success criterion with no FR; not required for M-1.
- **Code-review skill** — Why parked: PRD Non-Goals (deferred to a later version).
- **Agents beyond Claude Code, Copilot and Codex** — Why parked: PRD Non-Goals.
- **Gated access, private package, managed cloud registry, API+CLI delivery** — Why parked: PRD Non-Goals.
- **Remote branch deletion** — Why parked: PRD Non-Goals (refresh only deletes local branches).
- **Windows support** — Why parked: PRD Non-Goals (macOS and Linux only).
- **Automatic updates** — Why parked: PRD Non-Goals.

## Milestone History

## Done

- **S-01: user can install the toolkit (from a locally packed build) into `critical-path` with one install command, see its skill in Claude Code in a toolkit-named subfolder, and re-run install with no change in result.** — Archived 2026-10-30 → `context/archive/2026-10-30-local-install-claude-code/`. Lesson: —.
- **S-02: user can bump the version, cut a version release, and have CI publish the package to the registry; publishing a version that already exists fails the CI run visibly.** — Archived 2026-10-30 → `context/archive/2026-10-30-publish-on-release/`. Lesson: —.
- **S-03: user can install a CI-published version into `critical-path` with one command — locally with a personal read-only token in their environment, and in `critical-path`'s CI with a read-only token in CI secrets — and use the toolkit's skill from Claude Code; committed config only points the package scope at the registry.** — Archived 2026-10-30 → `context/archive/2026-10-30-install-from-registry/`. Lesson: —.
- **S-04: user can ask Claude Code in `critical-path` to refresh the repo: main is updated from the remote without switching branches, local branches whose work is in main (merged or squash-merged) are listed for deletion with reasons, the checked-out branch, unmerged branches and the only branch holding a stash's base commit are kept, and nothing is deleted until the user confirms.** — Archived 2026-10-30 → `context/archive/2026-10-30-safe-repo-refresh/`. Lesson: —.
- **S-05: user can run the explicit uninstall command before removing the package and get `critical-path` back exactly as it was before install — every file and text block in the manifest removed, nothing else touched.** — Archived 2026-10-31 → `context/archive/2026-10-30-clean-uninstall/`. Lesson: —.
