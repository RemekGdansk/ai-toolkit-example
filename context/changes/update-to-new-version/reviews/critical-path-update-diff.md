# critical-path update 0.3.0 -> 0.4.0

Evidence for Progress 2.4–2.8. On 2026-10-31, in `critical-path` (`main` at `613337e`, `ai-toolkit` pinned to 0.3.0, manifest at `0.3.0` with 3 files), every path except `.git/` and `node_modules/` was listed: `D` is a folder, `F <sha256>` a file. The script is the same one used for S-05:

```sh
#!/bin/sh
# Usage: snapshot.sh <repo> — every path except .git/ and node_modules/, with type and SHA-256 for files.
cd "$1" || exit 1
find . \( -path ./.git -o -path ./node_modules \) -prune -o -print | LC_ALL=C sort | while IFS= read -r p; do
  if [ -L "$p" ]; then echo "L $p"
  elif [ -d "$p" ]; then echo "D $p"
  else echo "F $(shasum -a 256 "$p" | cut -d' ' -f1) $p"; fi
done
```

## Update

On branch `ai-toolkit-0.4.0`, the `ai-toolkit` script pin was changed from `0.3.0` to `0.4.0`, then `npm run ai-toolkit -- install` was run. It exited 0 and printed (npm notices omitted):

```text
ai-toolkit-example: updated @remekgdansk/ai-toolkit-example 0.3.0 -> 0.4.0 (2 changed, 0 added, 0 removed, 1 unchanged) in .claude/skills/ai-toolkit-example/
ai-toolkit-example: invoke it in Claude Code as /ai-toolkit-example:repo-refresh
ai-toolkit-example: next: run /reload-plugins in Claude Code (or restart Claude Code from the repo root), and accept the workspace trust prompt so the project plugin loads
```

## A (before, 0.3.0) -> B (after update to 0.4.0)

A and B both have 1044 entries, so nothing was added or removed. Only the pin, `plugin.json`, `SKILL.md` and the manifest differ. `repo-refresh.mjs` is unchanged:

```diff
16c16
< F 144aa3c2434b3fb4c989e20770973ffb9d41c7a0ec272f900221b63aff0e9066 ./.claude/.ai-toolkit-example-manifest.json
---
> F 23505395bee87c84f2bc9927dbbc4381cd3c3ca16f63df00955142cebb58c1f0 ./.claude/.ai-toolkit-example-manifest.json
233c233
< F 23ee46d7004ff56e06e3b8e6cfd3446997bde075a691cd672b5292a6edda5f16 ./.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json
---
> F 211c8df69e0bfcee9aff35b9de1be31b4bc5f75b6d244424e70abb0082497d89 ./.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json
236c236
< F 3ae5e23a46f48610960385cf17a0653c7f612e1b7637fa07fc7d0dcb6199b6f3 ./.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md
---
> F 7405228d2459c94ac1c454d907bba8383d36034bf0037d40e830fe84657a594e ./.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md
930c930
< F 4213b2d62d21b39f32f6c6bd335d02fab773b8fa569cfecde71c701d134d754b ./package.json
---
> F 911f84aab107b4964221ce59a1dec4371734027c624aee381e07be4c0c5f8dce ./package.json
```

The manifest records `"version": "0.4.0"` with exactly 3 files.

## Re-run (no-op)

A second `npm run ai-toolkit -- install` exited 0 and printed:

```text
ai-toolkit-example: already at @remekgdansk/ai-toolkit-example@0.4.0; nothing changed in .claude/skills/ai-toolkit-example/
ai-toolkit-example: invoke it in Claude Code as /ai-toolkit-example:repo-refresh
```

There is no `/reload-plugins` line, as designed for the no-op.

## Local edit blocks the update

The line `local edit` was appended to the installed `.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md`, then install was run. It exited 1:

```text
ai-toolkit-example: install stopped; nothing was written.
ai-toolkit-example: these installed files were changed after install:
ai-toolkit-example:   .claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md
ai-toolkit-example:   -> revert your edits to these files (keep a copy elsewhere if you need them), then re-run install.
```

The snapshot taken right after the edit and the one taken after the refused install were identical, so the edit was kept and nothing was written. After `SKILL.md` was restored, install printed `already at @remekgdansk/ai-toolkit-example@0.4.0; nothing changed`. The final snapshot equals B.

## CI

Repoint PR: RemekGdansk/critical-path#85 (`Pin the AI toolkit to 0.4.0`), squash-merged as `8f02311`.

- `ai-toolkit` job: pass, https://github.com/RemekGdansk/critical-path/actions/runs/41193775577/job/124515718868. CI installs fresh, because `.claude/` is gitignored: `installed @remekgdansk/ai-toolkit-example@0.4.0 (3 files) into .claude/skills/ai-toolkit-example/`, and the manifest check passed.
- `ci`: pass.

Release that this depends on: RemekGdansk/ai-toolkit-example#13 (merged as `c9e989b`), tag `v0.4.0`, `Publish AI Toolkit` release run https://github.com/RemekGdansk/ai-toolkit-example/actions/runs/41193572625 (success). `npm view @remekgdansk/ai-toolkit-example versions` lists `0.4.0`.
