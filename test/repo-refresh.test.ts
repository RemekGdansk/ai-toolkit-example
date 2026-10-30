import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = path.join(REPO_ROOT, "plugin", "skills", "repo-refresh", "scripts", "repo-refresh.mjs");

/** Environment isolated from the user's git config and from any GIT_* variables of the calling process. */
const ENV: Record<string, string> = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => !key.startsWith("GIT_") && value !== undefined)),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test Author",
  GIT_AUTHOR_EMAIL: "author@example.com",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "Test Committer",
  GIT_COMMITTER_EMAIL: "committer@example.com",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  LC_ALL: "C",
};

interface Fixture {
  /** Temp folder holding everything below. */
  readonly root: string;
  /** Bare repository acting as the remote. */
  readonly remote: string;
  /** The author's clone, where the script runs. */
  readonly work: string;
}

interface Entry {
  branch: string;
  sha: string;
  reason: string;
}

interface Report {
  main: { updated: boolean; from: string; to: string; note: string };
  candidates: Entry[];
  kept: Entry[];
  warnings: string[];
}

interface PlanResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function gitRaw(cwd: string, args: readonly string[]): PlanResult {
  const result = spawnSync("git", args, { cwd, env: ENV, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(cwd: string, ...args: string[]): string {
  const result = gitRaw(cwd, args);
  assert.equal(result.status, 0, `git ${args.join(" ")} failed in ${cwd}:\n${result.stderr}`);
  return result.stdout.trim();
}

/** A temp bare remote plus a clone with one pushed commit on main; removed after the test. */
function makeFixture(t: TestContext): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), "repo-refresh-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "clone", "-q", remote, work);
  git(work, "symbolic-ref", "HEAD", "refs/heads/main");
  commit(work, "base.txt", "base\n", "initial");
  git(work, "push", "-q", "-u", "origin", "main");
  return { root, remote, work };
}

/** A second clone of the remote, standing in for other people pushing to it. */
function otherClone(fx: Fixture): string {
  const other = path.join(fx.root, "other");
  git(fx.root, "clone", "-q", fx.remote, other);
  return other;
}

/** Push one new commit to the remote's main from another clone; returns the new remote main SHA. */
function advanceRemoteMain(fx: Fixture, file = "upstream.txt"): string {
  const other = otherClone(fx);
  commit(other, file, "from upstream\n", `upstream ${file}`);
  git(other, "push", "-q", "origin", "main");
  return git(other, "rev-parse", "HEAD");
}

function commit(cwd: string, file: string, content: string, message: string): string {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

/** Create `branch` from main with one commit per file, then return to main. */
function branchWithCommits(cwd: string, branch: string, files: readonly string[]): string {
  git(cwd, "checkout", "-q", "-b", branch, "main");
  for (const file of files) commit(cwd, file, `${branch} ${file}\n`, `${branch}: ${file}`);
  const tip = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "-q", "main");
  return tip;
}

/** Squash-merge `branch` into main (main checked out). */
function squashMerge(cwd: string, branch: string): void {
  git(cwd, "merge", "-q", "--squash", branch);
  git(cwd, "commit", "-q", "-m", `squash ${branch}`);
}

/** Delete a branch on the remote side only, as a host does after merging a PR. */
function deleteOnRemote(fx: Fixture, branch: string): void {
  git(fx.remote, "branch", "-D", branch);
}

function runScript(cwd: string, ...args: string[]): PlanResult {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: ENV, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertExit(result: PlanResult, expected: number): void {
  assert.equal(result.status, expected, `exit ${String(result.status)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function plan(cwd: string): Report {
  const result = runScript(cwd, "plan", "--json");
  assertExit(result, 0);
  return JSON.parse(result.stdout) as Report;
}

function candidate(report: Report, branch: string): Entry | undefined {
  return report.candidates.find((entry) => entry.branch === branch);
}

function kept(report: Report, branch: string): Entry | undefined {
  return report.kept.find((entry) => entry.branch === branch);
}

function assertCandidate(report: Report, branch: string, reason: RegExp): void {
  const entry = candidate(report, branch);
  assert.ok(entry, `${branch} is a candidate\n${JSON.stringify(report, null, 2)}`);
  assert.match(entry.reason, reason);
  assert.equal(kept(report, branch), undefined, `${branch} is not also kept`);
}

function assertKept(report: Report, branch: string, reason?: RegExp): void {
  const entry = kept(report, branch);
  assert.ok(entry, `${branch} is kept\n${JSON.stringify(report, null, 2)}`);
  if (reason !== undefined) assert.match(entry.reason, reason);
  assert.equal(candidate(report, branch), undefined, `${branch} is not also a candidate`);
}

function refs(gitDir: string, pattern?: string): string {
  return git(gitDir, "for-each-ref", "--format=%(refname) %(objectname)", ...(pattern === undefined ? [] : [pattern]));
}

function headsExceptMain(cwd: string): string {
  return refs(cwd, "refs/heads/")
    .split("\n")
    .filter((line) => !line.startsWith("refs/heads/main "))
    .join("\n");
}

test("R1 off main: main is fast-forwarded; HEAD, branch and working tree are unchanged", (t) => {
  const fx = makeFixture(t);
  const remoteMain = advanceRemoteMain(fx);
  const oldMain = git(fx.work, "rev-parse", "main");
  git(fx.work, "checkout", "-q", "-b", "feature");
  commit(fx.work, "feature.txt", "feature\n", "feature work");
  writeFileSync(path.join(fx.work, "base.txt"), "uncommitted edit\n");
  writeFileSync(path.join(fx.work, "untracked.txt"), "untracked\n");
  const before = {
    head: git(fx.work, "rev-parse", "HEAD"),
    branch: git(fx.work, "branch", "--show-current"),
    status: git(fx.work, "status", "--porcelain"),
    base: readFileSync(path.join(fx.work, "base.txt"), "utf8"),
  };

  const report = plan(fx.work);

  assert.equal(report.main.updated, true);
  assert.equal(report.main.from, oldMain);
  assert.equal(report.main.to, remoteMain);
  assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), remoteMain);
  assert.equal(git(fx.work, "rev-parse", "HEAD"), before.head);
  assert.equal(git(fx.work, "branch", "--show-current"), before.branch);
  assert.equal(git(fx.work, "status", "--porcelain"), before.status);
  assert.equal(readFileSync(path.join(fx.work, "base.txt"), "utf8"), before.base);
  assert.deepEqual(report.warnings, []);
});

test("R2 on main with a clean tree: main is fast-forwarded", (t) => {
  const fx = makeFixture(t);
  const remoteMain = advanceRemoteMain(fx);

  const report = plan(fx.work);

  assert.equal(report.main.updated, true);
  assert.equal(report.main.to, remoteMain);
  assert.equal(git(fx.work, "rev-parse", "HEAD"), remoteMain);
  assert.equal(git(fx.work, "branch", "--show-current"), "main");
  assert.equal(readFileSync(path.join(fx.work, "upstream.txt"), "utf8"), "from upstream\n");
  assert.equal(git(fx.work, "status", "--porcelain"), "");
});

test("R17 on main with a dirty file the update would touch, even with merge.autoStash: warning, tree unchanged", (t) => {
  const fx = makeFixture(t);
  const localMain = git(fx.work, "rev-parse", "main");
  advanceRemoteMain(fx, "base.txt");
  git(fx.work, "config", "merge.autoStash", "true");
  writeFileSync(path.join(fx.work, "base.txt"), "my uncommitted edit\n");

  const report = plan(fx.work);

  assert.equal(report.main.updated, false);
  assert.ok(report.warnings.some((warning) => /merge --ff-only/.test(warning)), report.warnings.join("\n"));
  assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), localMain);
  assert.equal(readFileSync(path.join(fx.work, "base.txt"), "utf8"), "my uncommitted edit\n");
  assert.equal(git(fx.work, "status", "--porcelain"), "M base.txt");
  assert.equal(git(fx.work, "stash", "list"), "");
});

test("R18 main mid-rebase in another worktree: warning, main unchanged, the rebase is left intact", (t) => {
  const fx = makeFixture(t);
  const initial = git(fx.work, "rev-parse", "main");
  const localMain = commit(fx.work, "conflict.txt", "main\n", "main adds conflict.txt");
  git(fx.work, "push", "-q", "origin", "main");
  git(fx.work, "checkout", "-q", "-b", "side", initial);
  commit(fx.work, "conflict.txt", "side\n", "side adds conflict.txt");
  git(fx.work, "checkout", "-q", "-b", "work", initial);
  advanceRemoteMain(fx);
  const wt = path.join(fx.root, "wt");
  git(fx.work, "worktree", "add", "-q", wt, "main");
  assert.notEqual(gitRaw(wt, ["rebase", "side"]).status, 0, "rebase stops on a conflict");

  const report = plan(fx.work);

  assert.equal(report.main.updated, false);
  assert.ok(
    report.warnings.some((warning) => /main is checked out in worktree .*\(rebase in progress\)/.test(warning)),
    report.warnings.join("\n"),
  );
  assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), localMain);
  assert.equal(gitRaw(wt, ["rebase", "--abort"]).status, 0);
  assert.equal(git(wt, "branch", "--show-current"), "main");
});

test("R19 a fetch refspec into refs/heads/: no fetch, warning, unpushed branches survive", async (t) => {
  for (const refspec of ["+refs/heads/*:refs/heads/*", "+refs/*:refs/*"]) {
    await t.test(refspec, (t) => {
      const fx = makeFixture(t);
      const localMain = git(fx.work, "rev-parse", "main");
      git(fx.work, "config", "--add", "remote.origin.fetch", refspec);
      const unpushed = branchWithCommits(fx.work, "unpushed-work", ["u.txt"]);
      advanceRemoteMain(fx);
      git(fx.work, "checkout", "-q", "--detach", "main");

      const report = plan(fx.work);

      assert.equal(report.main.updated, false);
      assert.ok(report.warnings.some((warning) => /writes to local branches/.test(warning)), report.warnings.join("\n"));
      assert.equal(tip(fx.work, "unpushed-work"), unpushed);
      assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), localMain);
    });
  }
});

test("R3 local main diverged from the remote: warning, main unchanged, classified against local main", (t) => {
  const fx = makeFixture(t);
  advanceRemoteMain(fx);
  branchWithCommits(fx.work, "local-merged", ["local.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge local-merged", "local-merged");
  const localMain = git(fx.work, "rev-parse", "main");

  const report = plan(fx.work);

  assert.equal(report.main.updated, false);
  assert.match(report.main.note, /diverged/);
  assert.ok(report.warnings.some((warning) => /diverged/.test(warning)), report.warnings.join("\n"));
  assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), localMain);
  assertCandidate(report, "local-merged", /merged into main/);
  assert.equal(kept(report, "main")?.sha, localMain);
});

test("R4 main with no upstream, and an unreachable remote: a warning each, exit 0", (t) => {
  {
    const fx = makeFixture(t);
    git(fx.work, "branch", "--unset-upstream", "main");

    const report = plan(fx.work);

    assert.equal(report.main.updated, false);
    assert.ok(report.warnings.some((warning) => /no upstream/.test(warning)), report.warnings.join("\n"));
  }
  {
    const fx = makeFixture(t);
    git(fx.work, "remote", "set-url", "origin", path.join(fx.root, "missing.git"));
    const before = git(fx.work, "rev-parse", "main");

    const report = plan(fx.work);

    assert.equal(report.main.updated, false);
    assert.ok(report.warnings.some((warning) => /could not fetch/.test(warning)), report.warnings.join("\n"));
    assert.equal(git(fx.work, "rev-parse", "main"), before);
  }
});

test("R5 a regular-merged branch is a candidate: merged into main", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "feature", ["a.txt", "b.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");

  const report = plan(fx.work);

  assertCandidate(report, "feature", /^merged into main/);
});

test("R6 a squash-merged branch, with main moving on afterwards, is a candidate: squash-merged", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "feature", ["a.txt", "b.txt"]);
  squashMerge(fx.work, "feature");
  commit(fx.work, "later.txt", "later\n", "main moves on");

  const report = plan(fx.work);

  assertCandidate(report, "feature", /^squash-merged/);
});

test("R7 a squash-merged branch with one extra commit after the squash is kept", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "feature", ["a.txt"]);
  squashMerge(fx.work, "feature");
  git(fx.work, "checkout", "-q", "feature");
  commit(fx.work, "extra.txt", "extra\n", "after the squash");
  git(fx.work, "checkout", "-q", "main");

  const report = plan(fx.work);

  assertKept(report, "feature", /has changes not in main/);
});

test("R8 a squash-merged branch whose squash main later reverted is kept", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "feature", ["a.txt"]);
  squashMerge(fx.work, "feature");
  git(fx.work, "revert", "--no-edit", "HEAD");

  const report = plan(fx.work);

  assertKept(report, "feature", /has changes not in main/);
});

test("R16 a never-merged branch with no net change is kept, not listed as squash-merged", async (t) => {
  await t.test("a file added and then removed", (t) => {
    const fx = makeFixture(t);
    git(fx.work, "checkout", "-q", "-b", "wip", "main");
    commit(fx.work, "feature.txt", "feature work\n", "add feature");
    git(fx.work, "rm", "-q", "feature.txt");
    git(fx.work, "commit", "-q", "-m", "remove feature");
    git(fx.work, "checkout", "-q", "main");

    const report = plan(fx.work);

    assertKept(report, "wip", /^no net changes against main \(never merged\)$/);
  });

  await t.test("only an empty commit", (t) => {
    const fx = makeFixture(t);
    git(fx.work, "checkout", "-q", "-b", "notes", "main");
    git(fx.work, "commit", "-q", "--allow-empty", "-m", "WIP notes");
    git(fx.work, "checkout", "-q", "main");
    commit(fx.work, "later.txt", "later\n", "main moves on");

    const report = plan(fx.work);

    assertKept(report, "notes", /^no net changes against main \(never merged\)$/);
  });
});

test("R9 a branch at a main commit: kept unless fast-forward merged with its upstream gone", (t) => {
  const fx = makeFixture(t);
  git(fx.work, "branch", "fresh");
  git(fx.work, "branch", "tracked");
  git(fx.work, "push", "-q", "-u", "origin", "tracked");
  git(fx.work, "checkout", "-q", "-b", "ff-gone");
  commit(fx.work, "ff.txt", "ff\n", "fast-forward work");
  git(fx.work, "push", "-q", "-u", "origin", "ff-gone");
  git(fx.work, "checkout", "-q", "main");
  git(fx.work, "merge", "-q", "--ff-only", "ff-gone");
  git(fx.work, "push", "-q", "origin", "main");
  deleteOnRemote(fx, "ff-gone");

  const report = plan(fx.work);

  assertKept(report, "fresh", /no commits of its own/);
  assertKept(report, "tracked", /no commits of its own/);
  assertCandidate(report, "ff-gone", /fast-forward merged; upstream gone/);
});

test("R10 an unmerged branch with a gone upstream is kept and the reason mentions it", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "wip", ["wip.txt"]);
  git(fx.work, "push", "-q", "-u", "origin", "wip");
  deleteOnRemote(fx, "wip");

  const report = plan(fx.work);

  assertKept(report, "wip", /has changes not in main.*upstream gone/);
});

test("R11 a merged branch checked out here or in another worktree is kept", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "here", ["here.txt"]);
  branchWithCommits(fx.work, "there", ["there.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge here", "here");
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge there", "there");
  git(fx.work, "worktree", "add", "-q", path.join(fx.root, "wt"), "there");
  git(fx.work, "checkout", "-q", "here");

  const report = plan(fx.work);

  assertKept(report, "here", /^checked out$/);
  assertKept(report, "there", /checked out in worktree/);
});

test("R12 a branch whose merge-tree conflicts with main is kept", (t) => {
  const fx = makeFixture(t);
  git(fx.work, "checkout", "-q", "-b", "conflict");
  commit(fx.work, "base.txt", "branch change\n", "branch edits base");
  git(fx.work, "checkout", "-q", "main");
  commit(fx.work, "base.txt", "main change\n", "main edits base");

  const report = plan(fx.work);

  assertKept(report, "conflict", /has changes not in main/);
});

test("R13 stash rules protect the last holders of a stash's base", async (t) => {
  await t.test("a squash-merged candidate that is the only holder of a stash's base is kept", (t) => {
    const fx = makeFixture(t);
    branchWithCommits(fx.work, "sq", ["sq.txt"]);
    squashMerge(fx.work, "sq");
    git(fx.work, "checkout", "-q", "sq");
    writeFileSync(path.join(fx.work, "sq.txt"), "stashed edit\n");
    git(fx.work, "stash", "-q");
    git(fx.work, "checkout", "-q", "main");

    const report = plan(fx.work);

    assertKept(report, "sq", /holds the base of stash@\{0\}/);
  });

  await t.test("two candidates hold the base and no kept branch does: both are kept", (t) => {
    const fx = makeFixture(t);
    branchWithCommits(fx.work, "sq1", ["sq.txt"]);
    git(fx.work, "branch", "sq2", "sq1");
    squashMerge(fx.work, "sq1");
    git(fx.work, "checkout", "-q", "sq1");
    writeFileSync(path.join(fx.work, "sq.txt"), "stashed edit\n");
    git(fx.work, "stash", "-q");
    git(fx.work, "checkout", "-q", "main");

    const report = plan(fx.work);

    assertKept(report, "sq1", /holds the base of stash@\{0\}/);
    assertKept(report, "sq2", /holds the base of stash@\{0\}/);
  });

  await t.test("the base is reachable from main: the candidate stays a candidate", (t) => {
    const fx = makeFixture(t);
    git(fx.work, "checkout", "-q", "-b", "feat");
    commit(fx.work, "feat.txt", "feat\n", "feat work");
    writeFileSync(path.join(fx.work, "feat.txt"), "stashed edit\n");
    git(fx.work, "stash", "-q");
    git(fx.work, "checkout", "-q", "main");
    git(fx.work, "merge", "-q", "--no-ff", "-m", "merge feat", "feat");

    const report = plan(fx.work);

    assertCandidate(report, "feat", /merged into main/);
  });
});

test("R14 plan changes no refs/heads/* except main and leaves the remote's refs unchanged", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "merged", ["m.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  branchWithCommits(fx.work, "squashed", ["s.txt"]);
  squashMerge(fx.work, "squashed");
  git(fx.work, "push", "-q", "origin", "main");
  branchWithCommits(fx.work, "unmerged", ["u.txt"]);
  git(fx.work, "push", "-q", "-u", "origin", "unmerged");
  branchWithCommits(fx.work, "gone", ["g.txt"]);
  git(fx.work, "push", "-q", "-u", "origin", "gone");
  deleteOnRemote(fx, "gone");
  const remoteMain = advanceRemoteMain(fx, "other.txt");
  git(fx.work, "checkout", "-q", "unmerged");
  const before = { heads: headsExceptMain(fx.work), remote: refs(fx.remote) };

  const report = plan(fx.work);

  assert.equal(headsExceptMain(fx.work), before.heads);
  assert.equal(refs(fx.remote), before.remote);
  assert.equal(git(fx.work, "rev-parse", "refs/heads/main"), remoteMain);
  assert.equal(report.main.updated, true);
  assert.deepEqual(report.candidates.map((entry) => entry.branch), ["merged", "squashed"]);
  assert.deepEqual(report.kept.map((entry) => entry.branch), ["main", "gone", "unmerged"]);

  const text = runScript(fx.work, "plan");
  assertExit(text, 0);
  assert.match(text.stdout, /^Main: already up to date\nDelete \(2\):\n  merged [0-9a-f]{7}  merged into main\n  squashed [0-9a-f]{7}  squash-merged[^\n]*\nKeep \(3\):\n  main  main\n/);
  assert.doesNotMatch(text.stdout, /Warnings:/);
  assert.equal(headsExceptMain(fx.work), before.heads);
});

test("R15 failed preconditions exit 1 with nothing changed; usage errors exit 2", async (t) => {
  await t.test("no local main", (t) => {
    const fx = makeFixture(t);
    advanceRemoteMain(fx);
    git(fx.work, "branch", "-m", "main", "trunk");
    const before = refs(fx.work);

    const result = runScript(fx.work, "plan", "--json");

    assertExit(result, 1);
    assert.match(result.stderr, /no local main/);
    assert.equal(result.stdout, "");
    assert.equal(refs(fx.work), before);
  });

  await t.test("a rebase in progress", (t) => {
    const fx = makeFixture(t);
    git(fx.work, "checkout", "-q", "-b", "topic");
    commit(fx.work, "base.txt", "topic change\n", "topic edits base");
    git(fx.work, "checkout", "-q", "main");
    commit(fx.work, "base.txt", "main change\n", "main edits base");
    git(fx.work, "checkout", "-q", "topic");
    assert.notEqual(gitRaw(fx.work, ["rebase", "main"]).status, 0, "rebase stops on a conflict");
    advanceRemoteMain(fx);
    const before = { refs: refs(fx.work), status: git(fx.work, "status", "--porcelain") };

    const result = runScript(fx.work, "plan", "--json");

    assertExit(result, 1);
    assert.match(result.stderr, /rebase is in progress/);
    assert.equal(refs(fx.work), before.refs);
    assert.equal(git(fx.work, "status", "--porcelain"), before.status);
  });

  await t.test("a revert in progress", (t) => {
    const fx = makeFixture(t);
    const first = commit(fx.work, "base.txt", "first change\n", "first edits base");
    commit(fx.work, "base.txt", "second change\n", "second edits base");
    assert.notEqual(gitRaw(fx.work, ["revert", "--no-edit", first]).status, 0, "revert stops on a conflict");
    advanceRemoteMain(fx);
    const before = { refs: refs(fx.work), status: git(fx.work, "status", "--porcelain") };

    const result = runScript(fx.work, "plan", "--json");

    assertExit(result, 1);
    assert.match(result.stderr, /revert is in progress/);
    assert.equal(refs(fx.work), before.refs);
    assert.equal(git(fx.work, "status", "--porcelain"), before.status);
  });

  await t.test("unknown subcommand and bad arguments", (t) => {
    const fx = makeFixture(t);
    const before = refs(fx.work);

    for (const args of [["bogus"], [], ["plan", "--bogus"]]) {
      const result = runScript(fx.work, ...args);
      assertExit(result, 2);
      assert.match(result.stderr, /Usage:/);
    }
    assert.match(runScript(fx.work, "bogus").stderr, /unknown command "bogus"/);
    assert.equal(refs(fx.work), before);
  });
});

function tip(cwd: string, branch: string): string {
  return git(cwd, "rev-parse", `refs/heads/${branch}`);
}

function branchExists(cwd: string, branch: string): boolean {
  return gitRaw(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0;
}

/** The `<branch>=<sha>` pairs from the last line of `plan`'s text output (the printed delete command). */
function deletePairsFromPlanText(cwd: string): string[] {
  const result = runScript(cwd, "plan");
  assertExit(result, 0);
  const lines = result.stdout.trimEnd().split("\n");
  assert.equal(lines.at(-2), "Delete command:", result.stdout);
  const match = /^ {2}node (\S+) delete (.+)$/.exec(lines.at(-1) ?? "");
  assert.ok(match, result.stdout);
  assert.equal(match[1], SCRIPT);
  return (match[2] ?? "").split(" ");
}

/** Section lines of `delete`'s text output: branch names under "Deleted (N):" and "Refused (N):". */
function deleteSections(stdout: string): { deleted: string[]; refused: Map<string, string> } {
  const match = /^Deleted \((\d+)\):\n((?: {2}.*\n)*)Refused \((\d+)\):\n((?: {2}.*\n)*)$/.exec(stdout);
  assert.ok(match, `delete output has Deleted and Refused sections:\n${stdout}`);
  const rows = (block: string): [string, string][] =>
    block
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => {
        const [branch = "", ...reason] = line.trim().split("  ");
        return [branch, reason.join("  ")];
      });
  const deleted = rows(match[2] ?? "").map(([branch]) => branch);
  const refused = new Map(rows(match[4] ?? ""));
  assert.equal(deleted.length, Number(match[1]));
  assert.equal(refused.size, Number(match[3]));
  return { deleted, refused };
}

test("D1 deletes the listed regular-merged and squash-merged candidates; other branches and the remote are unchanged", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "merged", ["m.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  branchWithCommits(fx.work, "squashed", ["s.txt"]);
  squashMerge(fx.work, "squashed");
  git(fx.work, "push", "-q", "origin", "main");
  branchWithCommits(fx.work, "unmerged", ["u.txt"]);
  git(fx.work, "push", "-q", "-u", "origin", "unmerged");
  git(fx.work, "branch", "fresh");
  git(fx.work, "checkout", "-q", "unmerged");
  const pairs = deletePairsFromPlanText(fx.work);
  assert.deepEqual(pairs, [`merged=${tip(fx.work, "merged")}`, `squashed=${tip(fx.work, "squashed")}`]);
  const before = {
    others: refs(fx.work, "refs/heads/")
      .split("\n")
      .filter((line) => !/^refs\/heads\/(merged|squashed) /.test(line))
      .join("\n"),
    remote: refs(fx.remote),
    head: git(fx.work, "rev-parse", "HEAD"),
  };

  const result = runScript(fx.work, "delete", ...pairs);

  assertExit(result, 0);
  const sections = deleteSections(result.stdout);
  assert.deepEqual(sections.deleted, ["merged", "squashed"]);
  assert.equal(sections.refused.size, 0);
  assert.equal(branchExists(fx.work, "merged"), false);
  assert.equal(branchExists(fx.work, "squashed"), false);
  assert.equal(refs(fx.work, "refs/heads/"), before.others);
  assert.equal(refs(fx.remote), before.remote);
  assert.equal(git(fx.work, "branch", "--show-current"), "unmerged");
  assert.equal(git(fx.work, "rev-parse", "HEAD"), before.head);
});

test("D2 a branch that gained a commit after plan is refused and kept: exit 1", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "feature", ["a.txt"]);
  squashMerge(fx.work, "feature");
  const report = plan(fx.work);
  const seen = candidate(report, "feature");
  assert.ok(seen, JSON.stringify(report, null, 2));
  git(fx.work, "checkout", "-q", "feature");
  commit(fx.work, "late.txt", "late\n", "after plan");
  git(fx.work, "checkout", "-q", "main");
  const newTip = tip(fx.work, "feature");

  const result = runScript(fx.work, "delete", `feature=${seen.sha}`);

  assertExit(result, 1);
  const sections = deleteSections(result.stdout);
  assert.deepEqual(sections.deleted, []);
  assert.match(sections.refused.get("feature") ?? "", /tip is now/);
  assert.equal(tip(fx.work, "feature"), newTip);
});

test("D3 main, the checked-out branch, kept branches, a missing branch and a branch mid-rebase in another worktree are refused: exit 1", (t) => {
  const fx = makeFixture(t);
  const initial = git(fx.work, "rev-parse", "main");
  // A merged branch checked out here.
  branchWithCommits(fx.work, "here", ["here.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge here", "here");
  // An unmerged branch.
  branchWithCommits(fx.work, "unmerged", ["u.txt"]);
  // A squash-merged candidate holding the only stash base.
  branchWithCommits(fx.work, "stashed", ["st.txt"]);
  squashMerge(fx.work, "stashed");
  git(fx.work, "checkout", "-q", "stashed");
  writeFileSync(path.join(fx.work, "st.txt"), "stashed edit\n");
  git(fx.work, "stash", "-q");
  git(fx.work, "checkout", "-q", "main");
  // A merged branch mid-rebase in another worktree (reported as detached; kept via the rebase's head-name).
  git(fx.work, "checkout", "-q", "-b", "onto", initial);
  commit(fx.work, "rb.txt", "onto\n", "onto adds rb.txt");
  git(fx.work, "checkout", "-q", "main");
  branchWithCommits(fx.work, "rebasing", ["rb.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge rebasing", "rebasing");
  const wt = path.join(fx.root, "wt");
  git(fx.work, "worktree", "add", "-q", wt, "rebasing");
  assert.notEqual(gitRaw(wt, ["rebase", "onto"]).status, 0, "rebase stops on a conflict");
  git(fx.work, "checkout", "-q", "here");
  const report = plan(fx.work);
  assertKept(report, "rebasing", /^checked out in worktree .*\(rebase in progress\)$/);
  const before = refs(fx.work, "refs/heads/");
  const pair = (branch: string): string => `${branch}=${tip(fx.work, branch)}`;

  const result = runScript(
    fx.work,
    "delete",
    pair("main"),
    pair("here"),
    pair("unmerged"),
    pair("stashed"),
    `missing=${tip(fx.work, "main")}`,
    pair("rebasing"),
  );

  assertExit(result, 1);
  const sections = deleteSections(result.stdout);
  assert.deepEqual(sections.deleted, []);
  assert.match(sections.refused.get("main") ?? "", /not a deletion candidate: main/);
  assert.match(sections.refused.get("here") ?? "", /not a deletion candidate: checked out/);
  assert.match(sections.refused.get("unmerged") ?? "", /not a deletion candidate: has changes not in main/);
  assert.match(sections.refused.get("stashed") ?? "", /not a deletion candidate: holds the base of stash@\{0\}/);
  assert.match(sections.refused.get("missing") ?? "", /no such local branch/);
  assert.match(sections.refused.get("rebasing") ?? "", /not a deletion candidate: checked out in worktree/);
  assert.equal(refs(fx.work, "refs/heads/"), before);
});

test("D4 a mix of valid and refused pairs deletes only the valid ones", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "merged", ["m.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  branchWithCommits(fx.work, "squashed", ["s.txt"]);
  squashMerge(fx.work, "squashed");
  branchWithCommits(fx.work, "unmerged", ["u.txt"]);
  const unmergedTip = tip(fx.work, "unmerged");

  const result = runScript(
    fx.work,
    "delete",
    `merged=${tip(fx.work, "merged").slice(0, 7)}`,
    `unmerged=${unmergedTip}`,
    `squashed=${tip(fx.work, "squashed")}`,
  );

  assertExit(result, 1);
  const sections = deleteSections(result.stdout);
  assert.deepEqual(sections.deleted, ["merged", "squashed"]);
  assert.deepEqual([...sections.refused.keys()], ["unmerged"]);
  assert.equal(branchExists(fx.work, "merged"), false);
  assert.equal(branchExists(fx.work, "squashed"), false);
  assert.equal(tip(fx.work, "unmerged"), unmergedTip);
});

test("D6 a merged candidate whose name starts with `-` is deleted, not read as an option", (t) => {
  const fx = makeFixture(t);
  const merged = branchWithCommits(fx.work, "merged", ["m.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  git(fx.work, "update-ref", "refs/heads/-r", merged);
  git(fx.work, "branch", "-q", "-D", "merged");
  assertCandidate(plan(fx.work), "-r", /merged into main/);

  const result = runScript(fx.work, "delete", `-r=${merged}`);

  assertExit(result, 0);
  assert.deepEqual(deleteSections(result.stdout).deleted, ["-r"]);
  assert.equal(branchExists(fx.work, "-r"), false);
});

test("D5 malformed arguments exit 2 with nothing deleted, even next to valid pairs", (t) => {
  const fx = makeFixture(t);
  branchWithCommits(fx.work, "merged", ["m.txt"]);
  git(fx.work, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  const valid = `merged=${tip(fx.work, "merged")}`;
  const before = refs(fx.work);

  for (const args of [
    [],
    [valid, "merged"],
    [valid, "--json"],
    [valid, "repo-refresh.mjs", "plan"],
    [valid, `merged=${tip(fx.work, "merged").slice(0, 6)}`],
    [valid, "merged=xyz1234"],
    [valid, `merged=${tip(fx.work, "merged")}0`],
    [valid, `=${tip(fx.work, "merged")}`],
  ]) {
    const result = runScript(fx.work, "delete", ...args);
    assertExit(result, 2);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, "");
    assert.equal(refs(fx.work), before, `nothing changed for: delete ${args.join(" ")}`);
  }
});
