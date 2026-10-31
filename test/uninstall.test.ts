import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CLI = path.join(REPO_ROOT, "dist", "cli.js");

const MANIFEST = ".claude/.ai-toolkit-example-manifest.json";
const TARGET_DIR = ".claude/skills/ai-toolkit-example";
const PLUGIN_JSON = `${TARGET_DIR}/.claude-plugin/plugin.json`;
const SKILL_MD = `${TARGET_DIR}/skills/repo-refresh/SKILL.md`;
const REFRESH_SCRIPT = `${TARGET_DIR}/skills/repo-refresh/scripts/repo-refresh.mjs`;

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

function writeManifest(root: string, manifest: ManifestJson): void {
  writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
}

function assertExit(result: RunResult, expected: number): void {
  assert.equal(result.status, expected, `exit ${String(result.status)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test("U1. install then uninstall in a repo with no .claude/ restores the pre-install tree", (t) => {
  const root = makeConsumer(t);
  const before = hashTree(root);
  assertExit(run(root, "install"), 0);

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.equal(hashTree(root), before);
  assert.ok(!existsSync(at(root, ".claude")), ".claude/ created by install is gone");
  assert.match(result.stdout, /uninstalled @remekgdansk\/ai-toolkit-example@\S+ \(3 files removed\)/);
  assert.match(result.stdout, /\/reload-plugins/);
});

test("U2. pre-existing consumer files are byte-identical after uninstall and .claude/skills stays", (t) => {
  const root = makeConsumer(t);
  const settings = ".claude/settings.json";
  const otherSkill = ".claude/skills/other-skill/SKILL.md";
  writeAt(root, settings, '{"permissions":{}}\n');
  writeAt(root, otherSkill, "---\nname: other-skill\n---\nconsumer skill\n");
  const before = {
    tree: hashTree(root),
    settings: readFileSync(at(root, settings)),
    otherSkill: readFileSync(at(root, otherSkill)),
  };
  assertExit(run(root, "install"), 0);

  assertExit(run(root, "uninstall"), 0);

  assert.deepEqual(readFileSync(at(root, settings)), before.settings);
  assert.deepEqual(readFileSync(at(root, otherSkill)), before.otherSkill);
  assert.ok(existsSync(at(root, ".claude/skills")), ".claude/skills was not created by install");
  assert.ok(!existsSync(at(root, TARGET_DIR)));
  assert.ok(!existsSync(at(root, MANIFEST)));
  assert.equal(hashTree(root), before.tree);
});

test("U3. a second uninstall exits 0, reports not installed and changes nothing", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  assertExit(run(root, "uninstall"), 0);
  const before = hashTree(root);

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.match(result.stdout, /not installed/);
  assert.equal(hashTree(root), before);
});

test("U4. a plugin folder with no manifest exits 1 and nothing is removed", (t) => {
  const root = makeConsumer(t);
  writeAt(root, `${TARGET_DIR}/notes.md`, "mine\n");
  const before = hashTree(root);

  const result = run(root, "uninstall");

  assertExit(result, 1);
  assert.ok(result.stderr.includes(`${TARGET_DIR}/ exists but ${MANIFEST} does not`), result.stderr);
  assert.match(result.stderr, /nothing was removed/);
  assert.equal(hashTree(root), before);
});

test("U5. an edited managed file blocks uninstall and the edit is preserved", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const edited = "---\nname: repo-refresh\n---\nmy local edit\n";
  writeFileSync(at(root, SKILL_MD), edited);
  const before = hashTree(root);

  const result = run(root, "uninstall");

  assertExit(result, 1);
  assert.match(result.stderr, /uninstall stopped; nothing was removed/);
  assert.ok(result.stderr.includes(SKILL_MD), result.stderr);
  assert.match(result.stderr, /move these files out of/);
  assert.equal(readFileSync(at(root, SKILL_MD), "utf8"), edited);
  assert.equal(hashTree(root), before);
});

test("U6. a managed file deleted beforehand is skipped and the rest is removed", (t) => {
  const root = makeConsumer(t);
  const before = hashTree(root);
  assertExit(run(root, "install"), 0);
  rmSync(at(root, REFRESH_SCRIPT));

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.match(result.stdout, /\(2 files removed\)/);
  assert.equal(hashTree(root), before);
});

test("U7. a consumer file inside a created folder is kept with its folder, which is reported", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const consumerDir = `${TARGET_DIR}/skills/repo-refresh`;
  const consumerFile = `${consumerDir}/notes.md`;
  writeAt(root, consumerFile, "mine\n");

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.equal(readFileSync(at(root, consumerFile), "utf8"), "mine\n");
  assert.ok(result.stdout.includes(`kept ${consumerDir}/: it holds files ai-toolkit-example did not install\n`), result.stdout);
  assert.ok(
    result.stdout.includes(
      `kept ${TARGET_DIR}/: it holds files ai-toolkit-example did not install; move them out before installing again\n`,
    ),
    result.stdout,
  );
  for (const relative of [PLUGIN_JSON, SKILL_MD, REFRESH_SCRIPT, MANIFEST]) {
    assert.ok(!existsSync(at(root, relative)), `${relative} removed`);
  }
  assert.ok(!existsSync(at(root, `${TARGET_DIR}/.claude-plugin`)), "emptied created folder removed");
  assert.ok(!existsSync(at(root, `${consumerDir}/scripts`)), "emptied created folder removed");
});

test("U8. a malformed or foreign manifest exits 1 and removes nothing", (t) => {
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
    assertExit(run(root, "install"), 0);
    writeFileSync(at(root, MANIFEST), content);
    const before = hashTree(root);

    const result = run(root, "uninstall");

    assertExit(result, 1);
    assert.match(result.stderr, message, `${name}: ${result.stderr}`);
    assert.match(result.stderr, /nothing was removed/, `${name}: ${result.stderr}`);
    assert.equal(hashTree(root), before, `${name}: folder unchanged`);
  }
});

test("U8b. a manifest listing paths outside the plugin folder exits 1 and removes nothing", (t) => {
  // The hash matches, so only manifest path validation keeps uninstall from deleting the consumer's file.
  const settings = ".claude/settings.json";
  const settingsContent = '{ "theme": "dark" }\n';
  const cases: { name: string; files: { path: string; sha256: string }[]; createdDirs: string[] }[] = [
    { name: "consumer file in .claude", files: [{ path: settings, sha256: sha256(settingsContent) }], createdDirs: [] },
    { name: "foreign created folder", files: [], createdDirs: [".claude/other"] },
  ];
  for (const { name, files, createdDirs } of cases) {
    const root = makeConsumer(t);
    assertExit(run(root, "install"), 0);
    writeAt(root, settings, settingsContent);
    mkdirSync(at(root, ".claude/other"));
    const manifest = readManifest(root);
    manifest.files.push(...files);
    manifest.createdDirs.push(...createdDirs);
    writeFileSync(at(root, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    const before = hashTree(root);

    const result = run(root, "uninstall");

    assertExit(result, 1);
    assert.match(result.stderr, /unsafe or malformed path/, `${name}: ${result.stderr}`);
    assert.match(result.stderr, /nothing was removed/, `${name}: ${result.stderr}`);
    assert.equal(hashTree(root), before, `${name}: folder unchanged`);
    assert.ok(existsSync(at(root, settings)), `${name}: consumer file kept`);
    assert.ok(existsSync(at(root, ".claude/other")), `${name}: consumer folder kept`);
  }
});

test("U9. a symlinked .claude/skills or manifest exits 1 and nothing outside the repo is removed", (t) => {
  {
    const root = makeConsumer(t);
    const outside = makeConsumer(t, { packageJson: false });
    assertExit(run(root, "install"), 0);
    const shared = path.join(outside, "skills");
    renameSync(at(root, ".claude/skills"), shared);
    symlinkSync(shared, at(root, ".claude/skills"));
    const outsideBefore = hashTree(outside);
    const manifestBefore = readFileSync(at(root, MANIFEST));

    const result = run(root, "uninstall");

    assertExit(result, 1);
    assert.match(result.stderr, /symlinks or not regular files/);
    assert.ok(result.stderr.includes(".claude/skills"), result.stderr);
    assert.equal(hashTree(outside), outsideBefore, "files outside the repo kept");
    assert.deepEqual(readFileSync(at(root, MANIFEST)), manifestBefore);
  }
  {
    const root = makeConsumer(t);
    const outside = makeConsumer(t, { packageJson: false });
    assertExit(run(root, "install"), 0);
    const outsideManifest = path.join(outside, "manifest.json");
    renameSync(at(root, MANIFEST), outsideManifest);
    symlinkSync(outsideManifest, at(root, MANIFEST));
    const outsideBefore = hashTree(outside);

    const result = run(root, "uninstall");

    assertExit(result, 1);
    assert.match(result.stderr, /symlinks or not regular files/);
    assert.ok(result.stderr.includes(MANIFEST), result.stderr);
    assert.equal(hashTree(outside), outsideBefore, "file outside the repo kept");
    assert.ok(lstatSync(at(root, MANIFEST)).isSymbolicLink(), "manifest symlink kept");
    for (const relative of [PLUGIN_JSON, SKILL_MD, REFRESH_SCRIPT]) {
      assert.ok(existsSync(at(root, relative)), `${relative} kept`);
    }
  }
});

test("U10. a manifest from an older version with its older content is fully removed", (t) => {
  const root = makeConsumer(t);
  const before = hashTree(root);
  assertExit(run(root, "install"), 0);
  const oldPluginJson = '{"name":"ai-toolkit-example","version":"0.1.0"}\n';
  const oldSkill = "---\nname: repo-refresh\n---\nprevious version\n";
  writeFileSync(at(root, PLUGIN_JSON), oldPluginJson);
  writeFileSync(at(root, SKILL_MD), oldSkill);
  const manifest = readManifest(root);
  manifest.version = "0.1.0";
  manifest.files = manifest.files.map((file) =>
    file.path === PLUGIN_JSON
      ? { path: PLUGIN_JSON, sha256: sha256(oldPluginJson) }
      : file.path === SKILL_MD
        ? { path: SKILL_MD, sha256: sha256(oldSkill) }
        : file,
  );
  writeManifest(root, manifest);

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.match(result.stdout, /uninstalled @remekgdansk\/ai-toolkit-example@0\.1\.0 \(3 files removed\)/);
  assert.equal(hashTree(root), before);
});

test("U11. after an interrupted upgrade the shipped content is removed, not reported as edited", (t) => {
  const root = makeConsumer(t);
  const before = hashTree(root);
  assertExit(run(root, "install"), 0);
  // The manifest still records the previous version's hash, but the new content was already written.
  const manifest = readManifest(root);
  manifest.files = manifest.files.map((file) => (file.path === SKILL_MD ? { path: SKILL_MD, sha256: sha256("previous version\n") } : file));
  writeManifest(root, manifest);

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.ok(!result.stderr.includes(SKILL_MD), result.stderr);
  assert.ok(!existsSync(at(root, SKILL_MD)));
  assert.equal(hashTree(root), before);
});

test("U12. a re-run after an interrupted uninstall finishes the removal", (t) => {
  const root = makeConsumer(t);
  const before = hashTree(root);
  assertExit(run(root, "install"), 0);
  // An interrupted uninstall: some managed files and their emptied created folders are gone, the manifest is not.
  rmSync(at(root, PLUGIN_JSON));
  rmSync(at(root, `${TARGET_DIR}/.claude-plugin`), { recursive: true });
  rmSync(at(root, REFRESH_SCRIPT));
  rmSync(at(root, `${TARGET_DIR}/skills/repo-refresh/scripts`), { recursive: true });
  assert.ok(existsSync(at(root, MANIFEST)));

  const result = run(root, "uninstall");

  assertExit(result, 0);
  assert.equal(hashTree(root), before);
});

test("U13. no package.json in cwd exits 1 and removes nothing", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  rmSync(at(root, "package.json"));
  const before = hashTree(root);

  const result = run(root, "uninstall");

  assertExit(result, 1);
  assert.match(result.stderr, /run from the consumer repo root/);
  assert.equal(hashTree(root), before);
});

test("U14. an extra argument to uninstall exits 2 and --help lists uninstall", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const before = hashTree(root);

  for (const extra of ["extra", "--help"]) {
    const result = run(root, "uninstall", extra);

    assertExit(result, 2);
    assert.ok(result.stderr.includes(`unexpected argument "${extra}"`), result.stderr);
    assert.equal(hashTree(root), before, `uninstall ${extra}: nothing removed`);
  }

  const help = run(root, "--help");

  assertExit(help, 0);
  assert.match(help.stdout, /^\s+uninstall\s+Remove everything install added/m);
});

test("U15. install, uninstall, install succeeds and writes the same manifest", (t) => {
  const root = makeConsumer(t);
  assertExit(run(root, "install"), 0);
  const first = readFileSync(at(root, MANIFEST));

  assertExit(run(root, "uninstall"), 0);
  assertExit(run(root, "install"), 0);

  assert.deepEqual(readFileSync(at(root, MANIFEST)), first);
});
