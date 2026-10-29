---
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
---

## Why this stack

A solo developer with an 8-hour budget is building an installable library of AI-agent skills, not an app, and no registry starter covers a JavaScript library, so the pick is assessed directly. TypeScript compiled with the official `tsc` compiler meets the stated preferences for TypeScript and mainstream tooling: it is typed, it is the most common way to build a Node.js package in agent training data, and its docs (alongside the Node.js and npm docs) are current and versioned. The standard npm package layout (src to dist, `bin` entries for the installer and uninstaller, `files` allow-list) gives the conventions a framework would. Node cannot strip types from files under `node_modules`, so the installer ships as compiled JavaScript and the package keeps zero runtime dependencies. It publishes to GitHub Packages from GitHub Actions only when a version release is cut, matching FR-001, and merges to main only run checks. No technology-forcing features are in scope. All five self-check points came back true, so no quality override applies.
