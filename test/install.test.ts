import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CLI = path.join(REPO_ROOT, "dist", "cli.js");

const PACKAGE_NAME = "@remekgdansk/ai-toolkit-example";
const MANIFEST = ".claude/.ai-toolkit-example-manifest.json";
const TARGET_DIR = ".claude/skills/ai-toolkit-example";
const PLUGIN_JSON = `${TARGET_DIR}/.claude-plugin/plugin.json`;
const SKILL_MD = `${TARGET_DIR}/skills/repo-refresh/SKILL.md`;

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface ManifestJson {
  package: string;
  version: string;
  files: { path: string; sha256: string }[];
  createdDirs: string[];
}

/** A fresh temp consumer folder, removed after the test. */
function makeConsumer(t: TestContext, options: { packageJson?: boolean } = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ai-toolkit-example-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (options.packageJson !== false) {
    writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ name: "consumer", private: true }, null, 2)}\n`);
  }
  return dir;
}

function run(cwd: string, ...args: string[]): RunResult {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function at(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

function writeAt(root: string, relative: string, content: string): void {
  mkdirSync(path.dirname(at(root, relative)), { recursive: true });
  writeFileSync(at(root, relative), content);
}

function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Deterministic hash of a whole folder: every directory and file path, plus file contents. */
function hashTree(root: string): string {
  const entries: string[] = [];
  const walk = (dir: string, relative: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        entries.push(`d ${childRelative}`);
        walk(childPath, childRelative);
      } else {
        entries.push(`f ${childRelative} ${sha256(readFileSync(childPath))}`);
      }
    }
  };
  walk(root, "");
  return sha256(entries.sort().join("\n"));
}

function readManifest(root: string): ManifestJson {
  return JSON.parse(readFileSync(at(root, MANIFEST), "utf8")) as ManifestJson;
}

function pluginSource(relative: string): Buffer {
  return readFileSync(path.join(REPO_ROOT, "plugin", ...relative.split("/")));
}

function assertExit(result: RunResult, expected: number): void {
  assert.equal(result.status, expected, `exit ${String(result.status)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test("1. fresh install into a repo with no .claude/ writes the plugin and a hashed manifest", (t) => {
  const root = makeConsumer(t);

  const result = run(root, "install");

  assertExit(result, 0);
  for (const relative of [MANIFEST, PLUGIN_JSON, SKILL_MD]) {
    assert.ok(existsSync(at(root, relative)), `${relative} exists`);
  }
  const manifest = readManifest(root);
  assert.equal(manifest.package, PACKAGE_NAME);
  assert.deepEqual(manifest.files, [
    { path: PLUGIN_JSON, sha256: sha256(pluginSource(".claude-plugin/plugin.json")) },
    { path: SKILL_MD, sha256: sha256(pluginSource("skills/repo-refresh/SKILL.md")) },
  ]);
  assert.ok(manifest.createdDirs.includes(".claude"));
  assert.ok(manifest.createdDirs.includes(".claude/skills"));
  assert.deepEqual(manifest.createdDirs, [...manifest.createdDirs].sort());
  assert.ok(readFileSync(at(root, MANIFEST), "utf8").endsWith("}\n"));
  assert.match(result.stdout, /\/ai-toolkit-example:repo-refresh/);
  assert.match(result.stdout, /\/reload-plugins/);
});

test("2. pre-existing consumer files are byte-identical after install", (t) => {
  const root = makeConsumer(t);
  writeAt(root, ".claude/skills/other/SKILL.md", "---\nname: other\n---\nconsumer skill\n");
  writeAt(root, "CLAUDE.md", "# Consumer rules\n");
  const before = {
    skill: readFileSync(at(root, ".claude/skills/other/SKILL.md")),
    rules: readFileSync(at(root, "CLAUDE.md")),
  };

  assertExit(run(root, "install"), 0);

  assert.deepEqual(readFileSync(at(root, ".claude/skills/other/SKILL.md")), before.skill);
  assert.deepEqual(readFileSync(at(root, "CLAUDE.md")), before.rules);
  const manifest = readManifest(root);
  assert.ok(!manifest.createdDirs.includes(".claude"), "existing .claude is not recorded as created");
  assert.ok(!manifest.createdDirs.includes(".claude/skills"), "existing .claude/skills is not recorded as created");
});

test("3. a second run exits 0 and leaves the whole folder unchanged", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const before = hashTree(root);

  assertExit(run(root, "install"), 0);

  assert.equal(hashTree(root), before);
});

test("4. an existing plugin folder with no manifest is a conflict and nothing is written", (t) => {
  const root = makeConsumer(t);
  mkdirSync(at(root, TARGET_DIR), { recursive: true });
  const before = hashTree(root);

  const result = run(root, "install");

  assertExit(result, 1);
  assert.ok(result.stderr.includes(TARGET_DIR), result.stderr);
  assert.match(result.stderr, /move or delete/);
  assert.equal(hashTree(root), before);
});

test("5. a locally edited installed file blocks re-install and the edit is preserved", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const edited = "---\nname: repo-refresh\n---\nmy local edit\n";
  writeFileSync(at(root, SKILL_MD), edited);
  const before = hashTree(root);

  const result = run(root, "install");

  assertExit(result, 1);
  assert.ok(result.stderr.includes(SKILL_MD), result.stderr);
  assert.match(result.stderr, /revert/);
  assert.equal(readFileSync(at(root, SKILL_MD), "utf8"), edited);
  assert.equal(hashTree(root), before);
});

test("6. a managed file no longer shipped is removed with its now-empty created folder", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const staleDir = `${TARGET_DIR}/skills/old-skill`;
  const staleFile = `${staleDir}/SKILL.md`;
  const staleContent = "---\nname: old-skill\n---\nretired\n";
  writeAt(root, staleFile, staleContent);
  const manifest = readManifest(root);
  manifest.files.push({ path: staleFile, sha256: sha256(staleContent) });
  manifest.createdDirs.push(staleDir);
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  assertExit(run(root, "install"), 0);

  assert.ok(!existsSync(at(root, staleFile)), "stale file removed");
  assert.ok(!existsSync(at(root, staleDir)), "now-empty created folder removed");
  assert.ok(existsSync(at(root, SKILL_MD)), "current skill still installed");
  const after = readManifest(root);
  assert.deepEqual(after.files.map((file) => file.path), [PLUGIN_JSON, SKILL_MD]);
  assert.ok(!after.createdDirs.includes(staleDir));
});

test("7. no package.json in cwd exits 1 and writes nothing", (t) => {
  const root = makeConsumer(t, { packageJson: false });
  const before = hashTree(root);

  const result = run(root, "install");

  assertExit(result, 1);
  assert.match(result.stderr, /run from the consumer repo root/);
  assert.equal(hashTree(root), before);
  assert.ok(!existsSync(at(root, ".claude")));
});

test("8. a malformed or foreign manifest exits 1 and writes nothing", (t) => {
  const cases: { name: string; content: string; message: RegExp }[] = [
    { name: "malformed", content: "{ not json", message: /not valid JSON/ },
    {
      name: "foreign package",
      content: `${JSON.stringify({ package: "@someone/else", version: "1.0.0", files: [], createdDirs: [] }, null, 2)}\n`,
      message: /@someone\/else/,
    },
  ];
  for (const { name, content, message } of cases) {
    const root = makeConsumer(t);
    writeAt(root, MANIFEST, content);
    const before = hashTree(root);

    const result = run(root, "install");

    assertExit(result, 1);
    assert.match(result.stderr, message, `${name}: ${result.stderr}`);
    assert.equal(hashTree(root), before, `${name}: folder unchanged`);
  }
});

test("9. plugin.json version equals package.json version", () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version: string };
  const plugin = JSON.parse(pluginSource(".claude-plugin/plugin.json").toString("utf8")) as { version: string };

  assert.equal(plugin.version, pkg.version);
});

test("10. an unknown subcommand or an extra argument to install exits 2", (t) => {
  const root = makeConsumer(t);

  const result = run(root, "bogus");

  assertExit(result, 2);
  assert.match(result.stderr, /unknown command "bogus"/);

  const extra = run(root, "install", "--help");

  assertExit(extra, 2);
  assert.match(extra.stderr, /unexpected argument "--help"/);
  assert.ok(!existsSync(at(root, ".claude")), "nothing installed");
});

test("11. a manifest pointing outside the plugin folder exits 1 and writes nothing", (t) => {
  const settings = ".claude/settings.json";
  const settingsContent = '{"permissions":{}}\n';
  const cases: { name: string; files: { path: string; sha256: string }[]; createdDirs: string[] }[] = [
    { name: "consumer file in .claude", files: [{ path: settings, sha256: sha256(settingsContent) }], createdDirs: [] },
    { name: "other skill folder", files: [{ path: ".claude/skills/other/SKILL.md", sha256: sha256("x") }], createdDirs: [] },
    { name: "foreign created folder", files: [], createdDirs: [".claude/other"] },
  ];
  for (const { name, files, createdDirs } of cases) {
    const root = makeConsumer(t);
    assertExit(run(root, "install"), 0);
    writeAt(root, settings, settingsContent);
    const manifest = readManifest(root);
    manifest.files.push(...files);
    manifest.createdDirs.push(...createdDirs);
    writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    const before = hashTree(root);

    const result = run(root, "install");

    assertExit(result, 1);
    assert.match(result.stderr, /unsafe or malformed path/, `${name}: ${result.stderr}`);
    assert.equal(hashTree(root), before, `${name}: folder unchanged`);
    assert.ok(existsSync(at(root, settings)), `${name}: consumer file kept`);
  }
});

test("12. a symlinked folder above a stale managed file blocks install and nothing outside is removed", (t) => {
  const root = makeConsumer(t);
  const outside = makeConsumer(t, { packageJson: false });
  assertExit(run(root, "install"), 0);
  const victimContent = "outside the consumer\n";
  writeFileSync(path.join(outside, "victim.txt"), victimContent);
  const linkedDir = `${TARGET_DIR}/skills/linked`;
  symlinkSync(outside, at(root, linkedDir));
  const manifest = readManifest(root);
  manifest.files.push({ path: `${linkedDir}/victim.txt`, sha256: sha256(victimContent) });
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBefore = readFileSync(at(root, MANIFEST));

  const result = run(root, "install");

  assertExit(result, 1);
  assert.ok(result.stderr.includes(linkedDir), result.stderr);
  assert.ok(existsSync(path.join(outside, "victim.txt")), "file outside the consumer kept");
  assert.deepEqual(readFileSync(at(root, MANIFEST)), manifestBefore);
});

test("13. a symlinked .claude/skills or manifest is a conflict and nothing is written outside the repo", (t) => {
  {
    const root = makeConsumer(t);
    const shared = makeConsumer(t, { packageJson: false });
    mkdirSync(at(root, ".claude"));
    symlinkSync(shared, at(root, ".claude/skills"));

    const result = run(root, "install");

    assertExit(result, 1);
    assert.ok(result.stderr.includes(".claude/skills"), result.stderr);
    assert.deepEqual(readdirSync(shared), [], "shared folder untouched");
    assert.ok(!existsSync(at(root, MANIFEST)));
  }
  {
    const root = makeConsumer(t);
    const outside = makeConsumer(t, { packageJson: false });
    const outsideManifest = path.join(outside, "written-by-install.json");
    mkdirSync(at(root, ".claude"));
    symlinkSync(outsideManifest, at(root, MANIFEST));

    const result = run(root, "install");

    assertExit(result, 1);
    assert.ok(result.stderr.includes(MANIFEST), result.stderr);
    assert.ok(!existsSync(outsideManifest), "nothing written through the manifest symlink");
    assert.ok(!existsSync(at(root, TARGET_DIR)));
  }
});

test("14. an edited file that is no longer shipped blocks install instead of being removed", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const staleFile = `${TARGET_DIR}/skills/old-skill/SKILL.md`;
  const manifest = readManifest(root);
  manifest.files.push({ path: staleFile, sha256: sha256("as installed\n") });
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  writeAt(root, staleFile, "edited by the consumer\n");
  const before = hashTree(root);

  const result = run(root, "install");

  assertExit(result, 1);
  assert.ok(result.stderr.includes(staleFile), result.stderr);
  assert.equal(readFileSync(at(root, staleFile), "utf8"), "edited by the consumer\n");
  assert.equal(hashTree(root), before);
});

test("15. a created folder that now holds consumer files is kept when its managed file is removed", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const staleDir = `${TARGET_DIR}/skills/old-skill`;
  const staleFile = `${staleDir}/SKILL.md`;
  const staleContent = "retired\n";
  const consumerFile = `${staleDir}/notes.md`;
  writeAt(root, staleFile, staleContent);
  writeAt(root, consumerFile, "mine\n");
  const manifest = readManifest(root);
  manifest.files.push({ path: staleFile, sha256: sha256(staleContent) });
  manifest.createdDirs.push(staleDir);
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  assertExit(run(root, "install"), 0);

  assert.ok(!existsSync(at(root, staleFile)), "stale managed file removed");
  assert.equal(readFileSync(at(root, consumerFile), "utf8"), "mine\n");
});

test("16. an upgrade rewrites a managed file whose shipped content changed", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const oldContent = "---\nname: repo-refresh\n---\nprevious version\n";
  writeFileSync(at(root, SKILL_MD), oldContent);
  const manifest = readManifest(root);
  manifest.files = manifest.files.map((file) => (file.path === SKILL_MD ? { path: SKILL_MD, sha256: sha256(oldContent) } : file));
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  assertExit(run(root, "install"), 0);

  const shipped = pluginSource("skills/repo-refresh/SKILL.md");
  assert.deepEqual(readFileSync(at(root, SKILL_MD)), shipped);
  assert.equal(readManifest(root).files.find((file) => file.path === SKILL_MD)?.sha256, sha256(shipped));
});

test("17. a re-run after an interrupted upgrade completes instead of reporting a local edit", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  // The manifest still records the previous version's hash, but the new content was already written.
  const manifest = readManifest(root);
  manifest.files = manifest.files.map((file) => (file.path === SKILL_MD ? { path: SKILL_MD, sha256: sha256("previous version\n") } : file));
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  const result = run(root, "install");

  assertExit(result, 0);
  const shipped = pluginSource("skills/repo-refresh/SKILL.md");
  assert.deepEqual(readFileSync(at(root, SKILL_MD)), shipped);
  assert.equal(readManifest(root).files.find((file) => file.path === SKILL_MD)?.sha256, sha256(shipped));
});

test("18. an unexpected I/O error exits 1 with a prefixed message and no stack trace", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  chmodSync(at(root, SKILL_MD), 0o000);

  const result = run(root, "install");

  assertExit(result, 1);
  assert.match(result.stderr, /^ai-toolkit-example: unexpected error: .*EACCES/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
