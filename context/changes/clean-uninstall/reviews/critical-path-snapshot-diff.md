# critical-path snapshot diffs

Evidence for Progress 2.5. On 2026-10-31, in `critical-path` with the `ai-toolkit` pin at 0.3.0, every path except `.git/` and `node_modules/` was listed: `D` is a folder, `F <sha256>` a file. The script was:

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

## A (before) → B (after `npm run ai-toolkit -- uninstall`)

A had 1044 entries, B 1035. Only the 3 managed files, the manifest and the 5 created folders are removed:

```diff
16d15
< F a171d6e673a1ceb24870b024d078018d6dc1fd2cc6dde66293d4cbb0491ec305 ./.claude/.ai-toolkit-example-manifest.json
231,238d229
< D ./.claude/skills/ai-toolkit-example
< D ./.claude/skills/ai-toolkit-example/.claude-plugin
< F ae23c3eeea47dd68700038101db7f2a24ec355ecea909b65a512f171c0497d50 ./.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json
< D ./.claude/skills/ai-toolkit-example/skills
< D ./.claude/skills/ai-toolkit-example/skills/repo-refresh
< F 3ae5e23a46f48610960385cf17a0653c7f612e1b7637fa07fc7d0dcb6199b6f3 ./.claude/skills/ai-toolkit-example/skills/repo-refresh/SKILL.md
< D ./.claude/skills/ai-toolkit-example/skills/repo-refresh/scripts
< F 05593ee03537fb8e6e93c0454716068412f316c8137ac5f19e3d208a4ad3d81a ./.claude/skills/ai-toolkit-example/skills/repo-refresh/scripts/repo-refresh.mjs
```

## A (before) → C (after re-install at 0.3.0)

Only `plugin.json` (the version) and the manifest differ:

```diff
16c16
< F a171d6e673a1ceb24870b024d078018d6dc1fd2cc6dde66293d4cbb0491ec305 ./.claude/.ai-toolkit-example-manifest.json
---
> F 144aa3c2434b3fb4c989e20770973ffb9d41c7a0ec272f900221b63aff0e9066 ./.claude/.ai-toolkit-example-manifest.json
233c233
< F ae23c3eeea47dd68700038101db7f2a24ec355ecea909b65a512f171c0497d50 ./.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json
---
> F 23ee46d7004ff56e06e3b8e6cfd3446997bde075a691cd672b5292a6edda5f16 ./.claude/skills/ai-toolkit-example/.claude-plugin/plugin.json
```
