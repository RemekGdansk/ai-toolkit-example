# Archive SHA repoint: local-install-claude-code

## 2026-10-30

- **Target**: `origin/main` (`git@github.com:RemekGdansk/ai-toolkit-example.git`), snapshot `b802b5c10a5559e600b546cfda3566247e03c2f0`
- **Integration commit**: `b802b5c` Install toolkit locally and expose its skill in Claude Code (S-01) (#1)
- **PR**: https://github.com/RemekGdansk/ai-toolkit-example/pull/1 (state MERGED, base `main`)
- **Evidence**:
  - PR #1 was squash-merged: `b802b5c` has a single parent, `0679a66`.
  - Its commit list contains `c5c6ae1`, `25154b7`, `fdf17eb`, `ad57957`, `ab64c6a` and `f5e6645`.
  - The tree of `b802b5c` (`5a9b277`) is identical to the PR head `f5e6645`, so the squash integrates exactly the implementation covered by these rows.
  - The phase SHAs fail `git merge-base --is-ancestor` against the target (exit 1, in a full clone). `b802b5c` passes (exit 0).
- **Decision**: the user chose "Update and archive" at the `/10x-archive` prompt.

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.5 | `25154b7` → `25154b7f0e2b55d4a2ca2ddbbeb919bad3095921` (feat(local-install-claude-code): Package skeleton and skill files (p1)) | `b802b5c` |
| 2.1–2.3 | `fdf17eb` → `fdf17eb75fa968d4c7f7d5cce1de3cdbc291b302` (feat(local-install-claude-code): Installer, manifest and guards (p2)) | `b802b5c` |
| 3.1–3.8 | `ad57957` → `ad57957973965be04f230f16f716b4ccf5125d26` (docs(local-install-claude-code): End-to-end check in critical-path (p3)) | `b802b5c` |

Rows repointed: 16.
