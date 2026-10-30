# @remekgdansk/ai-toolkit-example

An npm package that installs the author's shared AI-agent skills into a consumer repo as a Claude Code skills-directory plugin. It currently ships one skill, `repo-refresh`, as a read-only preview: it reports the repo's branches and changes nothing.

Install is an explicit command, not a `postinstall` script. Requires Node 22 or later.

## Install

1. In this repo, build the tarball:

   ```sh
   npm pack
   ```

   This creates `remekgdansk-ai-toolkit-example-0.1.0.tgz`.

2. In the consumer repo, add it as a dev dependency:

   ```sh
   npm i -D <path-to-this-repo>/remekgdansk-ai-toolkit-example-0.1.0.tgz
   ```

   With npm 12 or later you may see `npm warn install-scripts ... blocked because they are not covered by allowScripts`. Those packages are the consumer's own dependencies; this package has no install scripts, so the warning does not affect it.

3. From the consumer repo root (the folder with its `package.json`), run the installer:

   ```sh
   npx ai-toolkit-example install
   ```

   On success it prints the installed version and file count, the command to invoke the skill, and a reminder to reload plugins. It exits 0.

## Use in Claude Code

1. Launch Claude Code from the consumer repo root. A project plugin loads only from there.
2. Accept the workspace trust prompt. A project plugin does not load in an untrusted workspace.
3. Run `/reload-plugins` (or restart Claude Code from the repo root).
4. Run `/ai-toolkit-example:repo-refresh`.

Claude Code lists the plugin as `ai-toolkit-example@skills-dir`.

## What gets written

All paths are relative to the consumer repo root:

- `.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json`
- `.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md`
- `.claude/.ai-toolkit-example-manifest.json`: records each installed file with its SHA-256 hash and each folder install created.

Nothing else in the consumer repo is touched. Other skills in `.claude/skills/` stay as they are.

## Re-running

Running `npx ai-toolkit-example install` again is safe. With the same package version it exits 0 and leaves every file unchanged.

Install exits 1 in the cases below. It checks all but the last before its first write, so in those cases nothing is written:

| Message | Remedy |
| --- | --- |
| `no package.json in <dir>; run from the consumer repo root` | `cd` to the consumer repo root and re-run. |
| `these installed files were changed after install:` | Revert your edits to the listed files (keep a copy elsewhere if you need them), then re-run. |
| `these paths already exist and are not managed by ai-toolkit-example:` | Move or delete the listed paths, then re-run. This includes `.claude/skills/ai-toolkit-example/` when there is no manifest, and a `.claude`, `.claude/skills` or manifest that is a symlink. |
| `.claude/.ai-toolkit-example-manifest.json` cannot be read, is not valid JSON, is invalid, or belongs to another package | Restore the manifest to the file install wrote, or delete it together with `.claude/skills/ai-toolkit-example/`, then re-run. |
| `unexpected error: ...` | Fix the reported problem (for example, file permissions), then re-run. |
| `install failed while writing files: ...` | Re-run install. It reports anything left in an unexpected state. |

An unknown command, or any argument after `install`, exits 2 and prints the usage. `npx ai-toolkit-example --help` prints the usage and exits 0.

## Releasing

The package is published to GitHub Packages as `@remekgdansk/ai-toolkit-example` by the `Publish AI Toolkit` workflow. Pull requests and pushes to `main` only run the checks. Publishing happens only when a GitHub Release is published whose tag is `v` followed by the `package.json` version.

1. On a branch, bump the version. This updates `package.json` and `package-lock.json`:

   ```sh
   npm version <x.y.z> --no-git-tag-version
   ```

2. Open a pull request and merge it once the checks are green.

3. Cut the release from `main`, not marked as a pre-release:

   ```sh
   gh release create v<x.y.z> --target main --generate-notes
   ```

   The workflow checks the tag, builds, tests and packs the tarball, then publishes that tarball.

If the release run fails:

| Failure | Remedy |
| --- | --- |
| `Release tag '<tag>' does not match package.json version '<version>'` | Delete the release and its tag, then fix the version (bump, merge) or cut the release with the right tag. |
| `Release <tag> is marked as a pre-release` | Delete the pre-release and cut a normal release. Pre-releases are not published. |
| `E409` / `Cannot publish over existing version` | That version is already published and cannot be replaced. Bump the version, merge, and cut a new release. |

To delete a bad release and its tag:

```sh
gh release delete <tag> --cleanup-tag --yes
```
