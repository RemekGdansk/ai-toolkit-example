# @remekgdansk/ai-toolkit-example

An npm package that installs the author's shared AI-agent skills into a consumer repo as a Claude Code skills-directory plugin. It currently ships one skill, `repo-refresh`: it updates `main` from the remote and, after you confirm, deletes the local branches whose work is already in `main`.

Install is an explicit command, not a `postinstall` script. Requires Node 22 or later.

## Install

The package is published to GitHub Packages as `@remekgdansk/ai-toolkit-example`. GitHub Packages needs a token even to install a public package.

1. Create a classic personal access token with only the `read:packages` scope and an expiry date. GitHub Packages accepts only classic tokens.

2. Log in to the registry once per machine:

   ```sh
   npm login --scope=@remekgdansk --auth-type=legacy --registry=https://npm.pkg.github.com
   ```

   Enter your GitHub username in lowercase (npm rejects uppercase with `npm warn Name must be lowercase`, prompts again and writes nothing) and the token as the password. npm stores the token in your user-level `~/.npmrc`, outside the repo.

3. In the consumer repo root, commit a `.npmrc` that holds only the scope line:

   ```ini
   @remekgdansk:registry=https://npm.pkg.github.com
   ```

   Never add a token line or a `${...}` auth reference to it.

4. Add a pinned script to the consumer's `package.json`:

   ```json
   "scripts": {
     "ai-toolkit": "npx --yes @remekgdansk/ai-toolkit-example@0.3.0"
   }
   ```

   It is a script, not a dev dependency, because as a dependency every `npm ci` would need the token, including deploy builds and Dependabot. The version pin lives in this one line; to update, bump it.

5. From the consumer repo root, run the installer:

   ```sh
   npm run ai-toolkit -- install
   ```

   On success it prints `installed @remekgdansk/ai-toolkit-example@0.3.0 (3 files)`, the command to invoke the skill, and a reminder to reload plugins. It exits 0.

When the token expires, create a new one and re-run the `npm login` command.

## Install in CI

This setup assumes the consumer repo runs Dependabot, and the job below is skipped on Dependabot's pull requests. If your repo doesn't use Dependabot, drop the `dependabot[bot]` condition from the `if`.

Use a second classic token with only `read:packages`, stored as the Actions secret `GH_PKG_TOKEN`. Create the secret with:

```sh
gh secret set GH_PKG_TOKEN --repo <owner>/<repo>
```

It reads the value from the prompt. Never pass the token on the command line.

Run the install in its own job, not in a required check:

```yaml
ai-toolkit:
  runs-on: ubuntu-latest
  if: >-
    github.event_name == 'push' ||
    (github.event_name == 'pull_request' &&
    github.event.pull_request.user.login != 'dependabot[bot]' &&
    github.event.pull_request.head.repo.full_name == github.repository)
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v<x> # pin to a commit SHA if your repo requires it
      with:
        persist-credentials: false
    - uses: actions/setup-node@v<x>
      with:
        node-version-file: .nvmrc
        registry-url: https://npm.pkg.github.com
        scope: "@remekgdansk"
        package-manager-cache: false
    - name: Secret present
      env:
        GH_PKG_TOKEN: ${{ secrets.GH_PKG_TOKEN }}
      run: |
        if [ -z "$GH_PKG_TOKEN" ]; then
          echo "::error::GH_PKG_TOKEN is not set. Add a classic token with only read:packages as the Actions secret GH_PKG_TOKEN."
          exit 1
        fi
    - name: Install
      env:
        NODE_AUTH_TOKEN: ${{ secrets.GH_PKG_TOKEN }}
      run: npm run ai-toolkit -- install
```

- `setup-node` with `registry-url` and `scope` writes a runner-only npmrc outside the checkout that reads `NODE_AUTH_TOKEN`, so the committed `.npmrc` stays token-free.
- The job sets `NODE_AUTH_TOKEN` from the secret, and passes the secret to steps only through `env:`.
- The job needs no `npm ci` and no cache: `npx` fetches the pinned package. `package-manager-cache: false` matters because `setup-node` turns npm caching on by itself when `package.json` has a `packageManager` field. `persist-credentials: false` keeps the checkout's git token off disk, since nothing in the job pushes.
- To enforce the token-free `.npmrc`, add a step before the install that fails when `.npmrc` is not exactly the scope line, or when `git grep -lE '_auth(Token)?=|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}'` matches a tracked file. Where a token has `=` or an alphanumeric, these patterns have `(` or `[`, so they never match their own text in the workflow file. `-l` prints only file names, so a leaked token never reaches the log.
- The `if` skips Dependabot PRs and PRs from forks. They don't receive Actions secrets, so the job would always fail there. Dependabot PRs still run your other checks, and Dependabot itself needs no registry token, because the toolkit is not a dependency.

The CI token expires too. Before it does, create a new classic `read:packages` token and run `gh secret set GH_PKG_TOKEN --repo <owner>/<repo>` again. Otherwise the job turns red on the expiry date.

## Install from a local build

For developing the toolkit, install it from a tarball instead of the registry.

1. In this repo, build the tarball:

   ```sh
   npm pack
   ```

   This creates `remekgdansk-ai-toolkit-example-0.3.0.tgz`.

2. In the consumer repo, add it as a dev dependency:

   ```sh
   npm i -D <path-to-this-repo>/remekgdansk-ai-toolkit-example-0.3.0.tgz
   ```

   With npm 12 or later you may see `npm warn install-scripts ... blocked because they are not covered by allowScripts`. Those packages are the consumer's own dependencies; this package has no install scripts, so the warning does not affect it.

3. From the consumer repo root (the folder with its `package.json`), run the installer:

   ```sh
   npx ai-toolkit-example install
   ```

   It prints and exits as in the registry install.

## Use in Claude Code

1. Launch Claude Code from the consumer repo root. A project plugin loads only from there.
2. Accept the workspace trust prompt. A project plugin does not load in an untrusted workspace.
3. Run `/reload-plugins` (or restart Claude Code from the repo root).
4. Run `/ai-toolkit-example:repo-refresh`.

Claude Code lists the plugin as `ai-toolkit-example@skills-dir`. You can also ask it to refresh, tidy or clean up the repo.

The skill needs git 2.38 or later and `node` on your `PATH`. All git logic lives in a bundled script; Claude Code only runs it, shows its output and asks you. The flow:

1. **Plan.** The script fetches `main`'s remote with `git fetch --prune` and fast-forwards local `main` without switching branches. Your working tree changes only when `main` is the checked-out branch, and then only through a clean fast-forward. If it cannot (offline, no upstream, `main` diverged, uncommitted changes the fast-forward would overwrite, or `main` checked out in another worktree), it warns and goes on with local `main`. It then lists every local branch under "Delete" or "Keep", each with a reason. A branch is listed for deletion when it was merged into `main`, squash-merged (merging it into `main` would change nothing), or fast-forward merged with its upstream gone.
2. **Confirm.** Claude Code asks once: "Delete all listed", "Choose which to delete" or "Cancel".
3. **Delete.** The script re-checks each chosen branch and deletes it only if it is still a candidate at the same commit you saw. Anything else is refused with a reason.

The skill never deletes:

- `main`, the checked-out branch, or a branch checked out in another worktree;
- a branch with changes that are not in `main`, including a squash-merged branch with a later commit or one whose squash `main` reverted;
- a branch with no commits of its own, unless it was fast-forward merged and its upstream is gone;
- a never-merged branch whose commits add up to no change (for example a file added and then removed, or only empty commits);
- the last branch that holds a stash's base commit.

It never pushes and never deletes remote branches. The only remote operation is the fetch. The script refuses to run, and changes nothing, outside a git work tree, without a local `main`, or while a merge, rebase, cherry-pick, revert or bisect is in progress.

## What gets written

All paths are relative to the consumer repo root:

- `.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json`
- `.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md`
- `.claude/skills/ai-toolkit-example/skills/repo-refresh/scripts/repo-refresh.mjs`
- `.claude/.ai-toolkit-example-manifest.json`: records each installed file with its SHA-256 hash and each folder install created.

Nothing else in the consumer repo is touched. Other skills in `.claude/skills/` stay as they are.

## Re-running

Running `npm run ai-toolkit -- install` again is safe. With the same package version it exits 0 and leaves every file unchanged.

Install exits 1 in the cases below. It checks all but the last before its first write, so in those cases nothing is written:

| Message | Remedy |
| --- | --- |
| `no package.json in <dir>; run from the consumer repo root` | `cd` to the consumer repo root and re-run. |
| `these installed files were changed after install:` | Revert your edits to the listed files (keep a copy elsewhere if you need them), then re-run. |
| `these paths already exist and are not managed by ai-toolkit-example:` | Move or delete the listed paths, then re-run. This includes `.claude/skills/ai-toolkit-example/` when there is no manifest, and a `.claude`, `.claude/skills` or manifest that is a symlink. |
| `.claude/.ai-toolkit-example-manifest.json` cannot be read, is not valid JSON, is invalid, or belongs to another package | Restore the manifest to the file install wrote, or delete it together with `.claude/skills/ai-toolkit-example/`, then re-run. |
| `unexpected error: ...` | Fix the reported problem (for example, file permissions), then re-run. |
| `install failed while writing files: ...` | Re-run install. It reports anything left in an unexpected state. |

An unknown command, or any argument after `install` or `uninstall`, exits 2 and prints the usage. `npm run ai-toolkit -- --help` prints the usage and exits 0.

npm can fail before the installer runs. Then nothing is written either:

| Message | Remedy |
| --- | --- |
| `npm error code E401` and `npm error 401 Unauthorized - GET https://npm.pkg.github.com/@remekgdansk%2fai-toolkit-example - authentication token not provided` | The token is missing, lacks `read:packages`, has expired or was revoked. Locally, create a new token and re-run the `npm login` command. In CI, replace the `GH_PKG_TOKEN` secret. |
| `npm error code ETARGET` and `npm error notarget No matching version found for @remekgdansk/ai-toolkit-example@<version>.` | The pinned version is not published. Check the published versions with `npm view @remekgdansk/ai-toolkit-example versions` or on the package's GitHub Packages page, then fix the version in the `ai-toolkit` script. |
| `npm error code E404` and `npm error 404 Not Found - GET https://npm.pkg.github.com/@remekgdansk%2f<name> - npm package "<name>" does not exist under owner "remekgdansk"` | The package name in the `ai-toolkit` script is misspelled. Fix it to `@remekgdansk/ai-toolkit-example`. |

## Uninstall

From the consumer repo root, run:

```sh
npm run ai-toolkit -- uninstall
```

With a local build, run `npx ai-toolkit-example uninstall` instead.

The pinned version must be 0.3.0 or later. Older versions have no `uninstall` command and exit 2 with `unknown command "uninstall"`. To remove an install made by an older version, first bump the pin in the `ai-toolkit` script to 0.3.0 or later (with a local build, install the newer tarball), then run uninstall. You don't need to re-install first: uninstall reads the manifest the older install wrote.

Uninstall removes exactly what the manifest records:

- the files it lists under `.claude/skills/ai-toolkit-example/`;
- the manifest, `.claude/.ai-toolkit-example-manifest.json`;
- the folders install created, once they are empty.

Everything else stays, including other skills in `.claude/skills/`. A folder install created that still holds your files stays too, and uninstall reports it as `kept <dir>/: it holds files ai-toolkit-example did not install`. When the kept folder is `.claude/skills/ai-toolkit-example/` itself, the line adds `move them out before installing again`: install refuses that folder once the manifest is gone.

On success it prints `uninstalled @remekgdansk/ai-toolkit-example@0.3.0 (3 files removed) from .claude/skills/ai-toolkit-example/`, then any `kept` folders and the next steps. It exits 0. The version is the one the manifest records, so an install made by 0.2.1 is reported as `@0.2.1`.

If there is no manifest and no `.claude/skills/ai-toolkit-example/`, it prints `not installed in <dir>; nothing removed` and exits 0.

Uninstall exits 1 in the cases below. It checks all but the last before its first removal, so in those cases nothing is removed:

| Message | Remedy |
| --- | --- |
| `no package.json in <dir>; run from the consumer repo root` | `cd` to the consumer repo root and re-run. |
| `uninstall stopped; nothing was removed.` and `these installed files were changed after install:` | Move the listed files out of `.claude/skills/ai-toolkit-example/` (or delete them), then re-run. A managed file replaced by a symlink or a folder is listed here too. |
| `uninstall stopped; nothing was removed.` and `these paths are not safe to remove through:` | The listed paths are symlinked folders on the way to a managed file (such as `.claude` or `.claude/skills`), or a manifest that is not a regular file. Removing through them could delete files outside the repo. Replace or remove them, then re-run. |
| `.claude/.ai-toolkit-example-manifest.json` cannot be read, is not valid JSON, is invalid, or belongs to another package, followed by `nothing was removed.` | Restore the manifest to the file install wrote, or delete it together with `.claude/skills/ai-toolkit-example/` yourself. |
| `.claude/skills/ai-toolkit-example/ exists but .claude/.ai-toolkit-example-manifest.json does not; ...` | The folder is not managed by the toolkit. Delete it yourself if it is a leftover install. |
| `unexpected error: ...` | Fix the reported problem (for example, file permissions), then re-run. |
| `uninstall failed while removing files: ...` | Fix the reported problem, then re-run uninstall. Anything already removed is skipped, because the manifest is removed after every managed file. |

Uninstall touches only what install added. After it, do these by hand:

1. Run `/reload-plugins` in Claude Code (or restart it from the repo root).
2. If you no longer want the toolkit, also remove:
   - the `ai-toolkit` script from `package.json` (with a local build, run `npm uninstall @remekgdansk/ai-toolkit-example` instead);
   - the `@remekgdansk:registry=https://npm.pkg.github.com` line from `.npmrc`;
   - the `ai-toolkit` CI job;
   - the `GH_PKG_TOKEN` secret, with `gh secret delete GH_PKG_TOKEN --repo <owner>/<repo>`.

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
| `You cannot publish over the previously published versions: <version>` (in the publish step) | That version is already published and cannot be replaced. Bump the version, merge, and cut a new release. |

To delete a bad release and its tag:

```sh
gh release delete <tag> --cleanup-tag --yes
```
