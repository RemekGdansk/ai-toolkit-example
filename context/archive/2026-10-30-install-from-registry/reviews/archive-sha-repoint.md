# Archive SHA repoint

## 2026-10-30

- **Target**: `origin/main` (RemekGdansk/ai-toolkit-example), snapshot `9bf72922ffdbe90861e8343160eff6a5cead159e`
- **Integration commit**: `9bf7292` "Install from GitHub Packages into critical-path (S-03) (#5)"
- **PR**: https://github.com/RemekGdansk/ai-toolkit-example/pull/5 (MERGED, base `main`, squash)
- **Evidence**: `dda9d35`, `aa3f600` and `8325132` are in PR #5's commit list, and none of them is an ancestor of the target (`merge-base --is-ancestor` exit 1, non-shallow repo). `9bf7292` is in target history (exit 0). The PR head `ee59acb` has the same file tree as `9bf7292`. The PR diff covers `README.md` (Phase 3) and this change folder, including the Progress records for Phases 1–2.
- **Scope note**: the code for Phases 1–2 landed in `RemekGdansk/critical-path` as `a320625` (#77), with a review follow-up in `4cc34b0` (#80). The toolkit-repo SHAs for those phases only ever pointed at the commits that recorded their Progress, and the repoint keeps that meaning.
- **Decision**: the user chose "Update and archive" during `/10x-archive`.

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.12 | `dda9d35` (`dda9d35e2d20dad169fd1d0165f082308dea1655`) | `9bf7292` |
| 2.1–2.10 | `aa3f600` (`aa3f600ecf672c63a3d5bc8c22e151547503c709`) | `9bf7292` |
| 3.1–3.5 | `8325132` (`8325132ff0057c80a46ce605c7d21bad6c66d291`) | `9bf7292` |

Rows repointed: 27.
