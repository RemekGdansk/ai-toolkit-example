#!/usr/bin/env node
// @ts-check
/**
 * repo-refresh: update `main` from its upstream without switching branches, then
 * classify every local branch as a deletion candidate or kept, each with a reason.
 *
 * Usage: node repo-refresh.mjs plan [--json]
 *
 * Zero dependencies: only node: built-ins and the git CLI (2.38 or newer).
 * Exit codes: 0 success (warnings included), 1 failed precondition or unexpected error, 2 usage error.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PREFIX = "repo-refresh:";
const MAIN = "main";
const MAIN_REF = `refs/heads/${MAIN}`;
const MIN_GIT = { major: 2, minor: 38 };
const FETCH_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 256 * 1024 * 1024;
const SHORT_SHA = 7;

const USAGE = `Usage: node repo-refresh.mjs <command>

Commands:
  plan [--json]   Update main from its upstream, then list local branches to delete or keep`;

class UsageError extends Error {}
class PreconditionError extends Error {}

/**
 * @typedef {object} GitResult
 * @property {number | null} status
 * @property {string} stdout
 * @property {string} stderr
 * @property {Error | undefined} error
 */

/**
 * @typedef {object} Repo
 * @property {string | null} currentBranch Checked-out branch in this worktree, or null on a detached HEAD.
 * @property {Map<string, string>} worktreeBranches Branch name -> path of every worktree that has it checked out.
 */

/**
 * @typedef {object} MainState
 * @property {string} sha
 * @property {string} tree
 * @property {Set<string>} firstParent Every commit on main's first-parent history.
 */

/**
 * @typedef {object} MainResult
 * @property {boolean} updated
 * @property {string} from
 * @property {string} to
 * @property {string} note
 */

/**
 * @typedef {object} BranchEntry
 * @property {string} branch
 * @property {string} sha
 * @property {string} reason
 */

/**
 * @typedef {object} Classification
 * @property {BranchEntry[]} candidates
 * @property {BranchEntry[]} kept
 */

// ---------------------------------------------------------------------------
// git

/**
 * Run git with an argument array (never a shell string) and a fixed C locale.
 * @param {readonly string[]} args
 * @param {{ env?: Record<string, string>, timeout?: number }} [options]
 * @returns {GitResult}
 */
function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, ...options.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: MAX_BUFFER,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
}

/**
 * Run git and return its stdout without the trailing newline; throw on a non-zero exit.
 * @param {readonly string[]} args
 * @returns {string}
 */
function git(args) {
  const result = runGit(args);
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${describeFailure(result)}`);
  }
  return result.stdout.replace(/\n$/, "");
}

/**
 * Exit status of a git query whose exit code is the answer (0 = yes, 1 = no); throw on anything else.
 * @param {readonly string[]} args
 * @returns {boolean}
 */
function gitYesNo(args) {
  const result = runGit(args);
  if (result.error === undefined && result.status === 0) return true;
  if (result.error === undefined && result.status === 1) return false;
  throw new Error(`git ${args.join(" ")} failed: ${describeFailure(result)}`);
}

/**
 * One-line description of why a git call failed.
 * @param {GitResult} result
 * @returns {string}
 */
function describeFailure(result) {
  if (result.error !== undefined) {
    const code = /** @type {NodeJS.ErrnoException} */ (result.error).code;
    return code === "ETIMEDOUT" ? "timed out" : result.error.message;
  }
  const lines = result.stderr.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return lines.at(-1) ?? `exit ${String(result.status)}`;
}

/**
 * @param {string} sha
 * @returns {string}
 */
function short(sha) {
  return sha.slice(0, SHORT_SHA);
}

/**
 * Display form of a full ref name: refs/remotes/origin/main -> origin/main.
 * @param {string} ref
 * @returns {string}
 */
function displayRef(ref) {
  return ref.replace(/^refs\/(remotes|heads)\//, "");
}

// ---------------------------------------------------------------------------
// preconditions and repository state

/**
 * Fail with a PreconditionError, before anything is changed, when the repository is not in a state to refresh.
 * @returns {void}
 */
function preconditions() {
  const version = runGit(["--version"]);
  if (version.error !== undefined || version.status !== 0) {
    throw new PreconditionError("git was not found on PATH");
  }
  const match = /(\d+)\.(\d+)/.exec(version.stdout);
  const major = Number(match?.[1] ?? 0);
  const minor = Number(match?.[2] ?? 0);
  if (major < MIN_GIT.major || (major === MIN_GIT.major && minor < MIN_GIT.minor)) {
    throw new PreconditionError(
      `${version.stdout.trim()} is too old; repo-refresh needs git ${MIN_GIT.major}.${MIN_GIT.minor} or newer`,
    );
  }

  const inside = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    throw new PreconditionError("not inside a git work tree");
  }

  if (runGit(["rev-parse", "--verify", "--quiet", `${MAIN_REF}^{commit}`]).status !== 0) {
    throw new PreconditionError("there is no local main branch");
  }

  /** @type {[string, string][]} */
  const markers = [
    ["MERGE_HEAD", "a merge"],
    ["rebase-merge", "a rebase"],
    ["rebase-apply", "a rebase or git am"],
    ["CHERRY_PICK_HEAD", "a cherry-pick"],
    ["BISECT_LOG", "a bisect"],
  ];
  const paths = git(["rev-parse", ...markers.flatMap(([name]) => ["--git-path", name])]).split("\n");
  markers.forEach(([, operation], index) => {
    const marker = paths[index];
    if (marker !== undefined && existsSync(path.resolve(process.cwd(), marker))) {
      throw new PreconditionError(`${operation} is in progress; finish or abort it first`);
    }
  });
}

/**
 * The checked-out branch and the branches checked out in any worktree.
 * @returns {Repo}
 */
function readRepo() {
  const head = runGit(["symbolic-ref", "--quiet", "HEAD"]);
  const headRef = head.status === 0 ? head.stdout.trim() : "";
  const currentBranch = headRef.startsWith("refs/heads/") ? headRef.slice("refs/heads/".length) : null;

  /** @type {Map<string, string>} */
  const worktreeBranches = new Map();
  let worktreePath = "";
  for (const field of git(["worktree", "list", "--porcelain", "-z"]).split("\0")) {
    if (field.startsWith("worktree ")) {
      worktreePath = field.slice("worktree ".length);
    } else if (field.startsWith("branch refs/heads/")) {
      worktreeBranches.set(field.slice("branch refs/heads/".length), worktreePath);
    }
  }
  return { currentBranch, worktreeBranches };
}

/**
 * Resolve main's commit, tree and first-parent history once, so every check in a run uses the same SHAs.
 * @returns {MainState}
 */
function resolveMain() {
  const sha = git(["rev-parse", "--verify", `${MAIN_REF}^{commit}`]);
  const tree = git(["rev-parse", "--verify", `${sha}^{tree}`]);
  const firstParent = new Set(git(["rev-list", "--first-parent", sha]).split("\n").filter((line) => line !== ""));
  return { sha, tree, firstParent };
}

// ---------------------------------------------------------------------------
// updating main without switching branches

/**
 * Fetch main's upstream remote and fast-forward local main if that is safe. Every failure is a warning:
 * classification then runs against local main as it is.
 * @param {Repo} repo
 * @param {string[]} warnings
 * @returns {MainResult}
 */
function updateMain(repo, warnings) {
  const from = git(["rev-parse", "--verify", `${MAIN_REF}^{commit}`]);
  /**
   * @param {string} reason
   * @param {boolean} warn
   * @returns {MainResult}
   */
  const notUpdated = (reason, warn) => {
    if (warn) warnings.push(`main was not updated: ${reason}`);
    return { updated: false, from, to: from, note: `not updated: ${reason}` };
  };

  const remote = runGit(["config", "--get", `branch.${MAIN}.remote`]).stdout.trim();
  const merge = runGit(["config", "--get", `branch.${MAIN}.merge`]).stdout.trim();
  if (remote === "" || merge === "") return notUpdated("main has no upstream", true);

  const fetch = runGit(["-c", "credential.interactive=never", "fetch", "--prune", remote], {
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeout: FETCH_TIMEOUT_MS,
  });
  if (fetch.error !== undefined || fetch.status !== 0) {
    return notUpdated(`could not fetch from ${remote} (${describeFailure(fetch)})`, true);
  }

  const upstreamRef = runGit(["rev-parse", "--symbolic-full-name", `${MAIN}@{upstream}`]).stdout.trim();
  const upstreamSha = upstreamRef === "" ? null : runGit(["rev-parse", "--verify", "--quiet", `${upstreamRef}^{commit}`]);
  if (upstreamSha === null || upstreamSha.status !== 0) {
    return notUpdated(`main's upstream ${displayRef(merge)} was not found on ${remote}`, true);
  }
  const to = upstreamSha.stdout.trim();
  const upstream = displayRef(upstreamRef);

  if (to === from) return { updated: false, from, to: from, note: "already up to date" };
  if (gitYesNo(["merge-base", "--is-ancestor", to, from])) return notUpdated(`main is ahead of ${upstream}`, false);
  if (!gitYesNo(["merge-base", "--is-ancestor", from, to])) return notUpdated(`main has diverged from ${upstream}`, true);

  if (repo.currentBranch === MAIN) {
    const ff = runGit(["merge", "--ff-only", "--quiet", to]);
    if (ff.error !== undefined || ff.status !== 0) {
      return notUpdated(`git merge --ff-only ${upstream} failed (${describeFailure(ff)})`, true);
    }
  } else if (repo.worktreeBranches.has(MAIN)) {
    return notUpdated(`main is checked out in worktree ${repo.worktreeBranches.get(MAIN)}`, true);
  } else {
    const ref = runGit(["update-ref", "-m", `repo-refresh: fast-forward to ${upstream}`, MAIN_REF, to, from]);
    if (ref.error !== undefined || ref.status !== 0) {
      return notUpdated(`git update-ref failed (${describeFailure(ref)})`, true);
    }
  }
  const now = git(["rev-parse", "--verify", `${MAIN_REF}^{commit}`]);
  return { updated: now !== from, from, to: now, note: `updated ${short(from)}..${short(now)}` };
}

// ---------------------------------------------------------------------------
// classification

/**
 * Classify every local branch: first matching rule wins (see the plan's classification table).
 * Reused by `delete` to re-check branches right before deleting them.
 * @param {Repo} repo
 * @param {MainState} main
 * @returns {Classification}
 */
function classify(repo, main) {
  /** @type {BranchEntry[]} */
  const candidates = [];
  /** @type {BranchEntry[]} */
  const kept = [{ branch: MAIN, sha: main.sha, reason: "main" }];

  const format = "%(refname)%00%(objectname)%00%(upstream)%00%(upstream:track)";
  for (const line of git(["for-each-ref", `--format=${format}`, "refs/heads/"]).split("\n")) {
    if (line === "") continue;
    const [ref = "", sha = "", upstream = "", track = ""] = line.split("\0");
    const branch = ref.slice("refs/heads/".length);
    if (branch === MAIN) continue;
    const gone = upstream !== "" && track === "[gone]";
    const keep = (/** @type {string} */ reason) => kept.push({ branch, sha, reason });
    const candidate = (/** @type {string} */ reason) => candidates.push({ branch, sha, reason });

    // 1-2: never touch a branch that is checked out anywhere.
    if (branch === repo.currentBranch) {
      keep("checked out");
      continue;
    }
    const worktree = repo.worktreeBranches.get(branch);
    if (worktree !== undefined) {
      keep(`checked out in worktree ${worktree}`);
      continue;
    }
    // 3-4: on main's first-parent history = freshly created or fast-forward merged.
    if (main.firstParent.has(sha)) {
      if (gone) candidate("fast-forward merged; upstream gone");
      else keep("no commits of its own");
      continue;
    }
    // 5: an ancestor off the first-parent line = reached main through a regular merge.
    if (gitYesNo(["merge-base", "--is-ancestor", sha, main.sha])) {
      candidate(gone ? "merged into main; upstream gone" : "merged into main");
      continue;
    }
    // 6: merging it into main would produce main's own tree = its changes are already in main.
    const mergeTree = runGit(["merge-tree", "--write-tree", "--no-messages", main.sha, sha]);
    if (mergeTree.error === undefined && mergeTree.status === 0 && mergeTree.stdout.split("\n")[0] === main.tree) {
      candidate(
        gone
          ? "squash-merged: merging it into main would change nothing; upstream gone"
          : "squash-merged: merging it into main would change nothing",
      );
      continue;
    }
    // 7: anything else, including merge-tree conflicts (exit 1).
    keep(gone ? "has changes not in main; upstream gone, not enough on its own" : "has changes not in main");
  }

  return stashPass({ candidates, kept });
}

/**
 * Keep a candidate when deleting it would leave a stash's base commit on no kept branch.
 * @param {Classification} classification
 * @returns {Classification}
 */
function stashPass({ candidates, kept }) {
  const stashes = git(["stash", "list", "--format=%gd%x00%P"]).split("\n").filter((line) => line !== "");
  for (const stash of stashes) {
    const [name = "", parents = ""] = stash.split("\0");
    const base = parents.split(" ")[0];
    if (base === undefined || base === "") continue;
    const holders = new Set(
      git(["for-each-ref", "--contains", base, "--format=%(refname)", "refs/heads/"])
        .split("\n")
        .filter((ref) => ref !== "")
        .map((ref) => ref.slice("refs/heads/".length)),
    );
    if (kept.some((entry) => holders.has(entry.branch))) continue;
    for (const entry of candidates.filter((candidate) => holders.has(candidate.branch))) {
      candidates.splice(candidates.indexOf(entry), 1);
      kept.push({ branch: entry.branch, sha: entry.sha, reason: `holds the base of ${name}` });
    }
  }
  const [mainEntry, ...rest] = kept;
  rest.sort((a, b) => (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0));
  return { candidates, kept: mainEntry === undefined ? rest : [mainEntry, ...rest] };
}

// ---------------------------------------------------------------------------
// commands

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function plan(args) {
  const unexpected = args.find((arg) => arg !== "--json");
  if (unexpected !== undefined) throw new UsageError(`unexpected argument "${unexpected}" to plan`);
  const json = args.includes("--json");

  preconditions();
  /** @type {string[]} */
  const warnings = [];
  const mainResult = updateMain(readRepo(), warnings);
  const { candidates, kept } = classify(readRepo(), resolveMain());

  if (json) {
    console.log(JSON.stringify({ main: mainResult, candidates, kept, warnings }, null, 2));
    return 0;
  }
  const lines = [`Main: ${mainResult.note}`, `Delete (${candidates.length}):`];
  for (const entry of candidates) lines.push(`  ${entry.branch} ${short(entry.sha)}  ${entry.reason}`);
  lines.push(`Keep (${kept.length}):`);
  for (const entry of kept) lines.push(`  ${entry.branch}  ${entry.reason}`);
  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of warnings) lines.push(`  - ${warning}`);
  }
  console.log(lines.join("\n"));
  return 0;
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function main(args) {
  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") {
    console.log(USAGE);
    return 0;
  }
  if (command === "plan") return plan(rest);
  throw new UsageError(command === undefined ? "missing command" : `unknown command "${command}"`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${PREFIX} ${error.message}\n${USAGE}`);
    process.exitCode = 2;
  } else if (error instanceof PreconditionError) {
    console.error(`${PREFIX} ${error.message}; nothing was changed`);
    process.exitCode = 1;
  } else {
    console.error(`${PREFIX} unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
