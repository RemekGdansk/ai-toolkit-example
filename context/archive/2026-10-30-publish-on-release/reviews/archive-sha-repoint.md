# Archive SHA repoint: publish-on-release

## 2026-10-30

- **Target**: `origin/main` (`git@github.com:RemekGdansk/ai-toolkit-example.git`), snapshot `f04bc64dc1fc9a0f0872e7f7ed2a2caa7f4561b8`
- **Integration commit**: `f04bc64` S-02 close-out: release verification and implementation review (#3)
- **PR**: https://github.com/RemekGdansk/ai-toolkit-example/pull/3 (state MERGED, base `main`)
- **Evidence**:
  - PR #3 was squash-merged: `f04bc64` has a single parent.
  - Its commit list contains `326dd28`, `6ea5df7` and `70b8653`.
  - The tree of `f04bc64` (`7886736`) is identical to the PR head `70b8653`.
  - The README change in `326dd28` appears unchanged in `f04bc64`.
  - `326dd28` fails `git merge-base --is-ancestor` against the target (exit 1, in a full clone). `f04bc64` passes (exit 0).
  - Rows 1.1–1.10 (`1bb3d27`) are already in the target history and were left unchanged.
- **Decision**: the user chose "Update and archive" at the `/10x-archive` prompt.

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 2.1–2.6 | `326dd28` → `326dd2888477034ab2ee7899bcd079f3cf202a5d` (docs(publish-on-release): First release and failure paths (p2)) | `f04bc64` |

Rows repointed: 6.
