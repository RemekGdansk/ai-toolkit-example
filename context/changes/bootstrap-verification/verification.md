---
bootstrapped_at: 2026-10-30T14:52:00Z
starter_id: custom
starter_name: TypeScript (tsc) Node.js package
project_name: ai-toolkit-example
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: best-effort
phase_3_status: ok
audit_command: npm audit --json
---

# Bootstrap verification log

## Hand-off

```yaml
starter_id: custom
custom_starter:
  name: TypeScript (tsc) Node.js package
  docs_url: https://www.typescriptlang.org/docs/
package_manager: npm
project_name: ai-toolkit-example
hints:
  language_family: js
  team_size: solo
  deployment_target: github-packages
  ci_provider: github-actions
  ci_default_flow: manual-promotion
  bootstrapper_confidence: best-effort
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

A solo developer with an 8-hour budget is building an installable library of AI-agent skills, not an app, and no registry starter covers a JavaScript library, so the pick is assessed directly. TypeScript compiled with the official `tsc` compiler meets the stated preferences for TypeScript and mainstream tooling: it is typed, it is the most common way to build a Node.js package in agent training data, and its docs (alongside the Node.js and npm docs) are current and versioned. The standard npm package layout (src to dist, `bin` entries for the installer and uninstaller, `files` allow-list) gives the conventions a framework would. Node cannot strip types from files under `node_modules`, so the installer ships as compiled JavaScript and the package keeps zero runtime dependencies. It publishes to GitHub Packages from GitHub Actions only when a version release is cut, matching FR-001, and merges to main only run checks. No technology-forcing features are in scope. All five self-check points came back true, so no quality override applies.

## Pre-scaffold verification

| Signal      | Value                                          | Severity | Notes                                                                                   |
| ----------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| npm package | not run                                        | —        | custom starter: no `create-*` CLI to resolve from a card                                |
| GitHub repo | not run                                        | —        | `custom_starter.docs_url` (typescriptlang.org) is not a GitHub URL; no recency signal   |
| typescript  | v7.0.2, `time.modified` 2026-10-30T08:33:35Z   | fresh    | informational only, checked while resolving the generator command (not a gating signal) |

Local toolchain at scaffold time: Node v24.21.0, npm 12.0.2.

## Scaffold log

**Resolved invocation**: `mkdir .bootstrap-scaffold && cd .bootstrap-scaffold && echo '{"name":"ai-toolkit-example"}' > package.json && npm init -y && npm install -D typescript @types/node && npx tsc --init --rootDir src --outDir dist --types node`
**Command source**: official TypeScript docs: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html (minimal `tsc --init`), https://www.typescriptlang.org/docs/handbook/release-notes/typescript-1-6.html (`--init` stores passed flags). Approved by the user before running.
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 4 (`package.json`, `package-lock.json`, `tsconfig.json`, `node_modules/`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: absent in scaffold (cwd `.gitignore` untouched)
**.bootstrap-scaffold cleanup**: deleted

Notes:

- The name is seeded before `npm init -y` because npm rejects the temp directory name `.bootstrap-scaffold` as a package name (`npm error Invalid name`).
- `--rootDir src --outDir dist` matches the hand-off's src→dist layout. TypeScript 7 requires `rootDir` to be set explicitly when emitting to `outDir`.
- `--types node` + `@types/node` enable Node built-in typings; the 5.9+ minimal `tsc --init` defaults to `types: []`.
- npm 12's `npm init -y` writes `"type": "commonjs"`, `"main": "index.js"` and version `1.0.0`. Combined with `module: nodenext`, `tsc` will emit CommonJS. Adjust `type`, `main`/`bin`, `files` and `version` when building the package.
- `tsc --init` sets `"jsx": "react-jsx"` by default; it is harmless here but irrelevant for a Node package.
- No `src/` directory was created; `tsc` will fail with "no inputs" until a first `.ts` file exists under `src/`.

Captured stdout (abridged): `Wrote to .../.bootstrap-scaffold/package.json`, `added 4 packages, and audited 5 packages in 916ms`, `found 0 vulnerabilities`, `Created a new tsconfig.json`.
Captured stderr: `npm notice run ai-toolkit-example@1.0.0 npx` / `npm notice run 'tsc' --init --rootDir src --outDir dist --types node`.

## Post-scaffold audit

**Tool**: npm audit --json
**Exit code**: 0
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW (0 info)
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/0/0 (direct devDependencies: `typescript@^7.0.2`, `@types/node@^26.6.6`)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| bootstrapper_confidence | best-effort                                                                                   |
| quality_override        | false                                                                                         |
| path_taken              | custom                                                                                        |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                          |
| deployment_target       | github-packages                                                                               |
| ci_provider             | github-actions                                                                                |
| ci_default_flow         | manual-promotion                                                                              |
| has_auth                | false                                                                                         |
| has_payments            | false                                                                                         |
| has_realtime            | false                                                                                         |
| has_ai                  | false                                                                                         |
| has_background_jobs     | false                                                                                         |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. (This directory is already a git repo.)
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. (None were created in this run.)
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. (The tree is clean.)
- Add `node_modules/` and `dist/` to `.gitignore`; the scaffold did not ship one and the existing file does not cover them.
