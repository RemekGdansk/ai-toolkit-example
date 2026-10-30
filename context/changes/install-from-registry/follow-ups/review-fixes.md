# Review fixes — install-from-registry

From `reviews/impl-review.md`.

- [x] **F3 (critical-path):** in `context/deployment/deploy-plan.md` → "AI toolkit registry token", after the rotation paragraph, add:
  > The `ai-toolkit` job runs on human PRs and on pushes to `main` that trigger workflows. Dependabot PRs merged by `dependabot-auto-merge.yml` with `GITHUB_TOKEN` start no `push` run, so an expired `GH_PKG_TOKEN` first shows up on the next human PR.

  Land it through a `critical-path` PR, since `main` is protected.
