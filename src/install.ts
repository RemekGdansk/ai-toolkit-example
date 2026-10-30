import { lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";
import process from "node:process";
import { MANIFEST_PATH, ManifestError, readManifest, sha256, writeManifest } from "./manifest.js";
import type { Manifest, ManifestFile } from "./manifest.js";
import { listPayload, PLUGIN_NAME, readPackageInfo, TARGET_DIR } from "./payload.js";

const PREFIX = "ai-toolkit-example:";

interface PlannedFile {
  readonly targetPath: string;
  readonly content: Buffer;
  readonly sha256: string;
  /** False when the target already holds exactly this content. */
  readonly needsWrite: boolean;
}

/**
 * Installs the bundled plugin into `<cwd>/.claude/skills/ai-toolkit-example/`.
 * Plans everything and checks every guard before the first write; the manifest is written last.
 */
export function install(): number {
  const root = process.cwd();

  if (!statOf(abs(root, "package.json"))?.isFile()) {
    printError(`no package.json in ${root}; run from the consumer repo root`);
    return 1;
  }

  const pkg = readPackageInfo();

  let previous: Manifest | undefined;
  try {
    previous = readManifest(root, pkg.name);
  } catch (error) {
    if (error instanceof ManifestError) {
      printError(error.message);
      printError(
        `nothing was written. Restore ${MANIFEST_PATH} to the file install wrote, or delete it together with ${TARGET_DIR}/, then re-run install.`,
      );
      return 1;
    }
    throw error;
  }

  // ---- Plan ----------------------------------------------------------------

  const payload = listPayload();
  const previousFiles = new Map<string, string>((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const targetPaths = new Set(payload.map((file) => file.targetPath));

  const localEdits: string[] = [];
  const conflicts = new Set<string>();

  // Guard: local edit. A managed file that exists but no longer matches its recorded hash.
  const currentHashes = new Map<string, string>();
  for (const [filePath, recorded] of previousFiles) {
    const stats = lstatOf(abs(root, filePath));
    if (stats === undefined) {
      continue;
    }
    const current = stats.isFile() ? sha256(readFileSync(abs(root, filePath))) : undefined;
    if (current !== recorded) {
      localEdits.push(filePath);
    } else {
      currentHashes.set(filePath, current);
    }
  }

  // Guard: unmanaged conflict. The plugin folder with no manifest, or a target path install doesn't own.
  if (previous === undefined && lstatOf(abs(root, TARGET_DIR)) !== undefined) {
    conflicts.add(TARGET_DIR);
  }
  for (const targetPath of targetPaths) {
    if (!previousFiles.has(targetPath) && lstatOf(abs(root, targetPath)) !== undefined) {
      conflicts.add(targetPath);
    }
  }

  // Every folder the targets and the manifest need, shallowest first. One that exists as a non-folder is a conflict.
  const neededDirs = [...new Set([...targetPaths, MANIFEST_PATH].flatMap(ancestors))].sort(byDepthAscending);
  for (const dir of neededDirs) {
    const stats = statOf(abs(root, dir));
    if (stats === undefined ? lstatOf(abs(root, dir)) !== undefined : !stats.isDirectory()) {
      conflicts.add(dir);
    }
  }

  if (localEdits.length > 0 || conflicts.size > 0) {
    printGuardFailure(localEdits.sort(), [...conflicts].sort());
    return 1;
  }

  const planned: PlannedFile[] = payload.map((file) => {
    const content = readFileSync(file.sourcePath);
    const hash = sha256(content);
    return { targetPath: file.targetPath, content, sha256: hash, needsWrite: currentHashes.get(file.targetPath) !== hash };
  });
  const staleFiles = [...previousFiles.keys()].filter((filePath) => !targetPaths.has(filePath));

  // ---- Apply ---------------------------------------------------------------

  try {
    for (const filePath of staleFiles) {
      rmSync(abs(root, filePath), { force: true });
    }

    for (const dir of [...(previous?.createdDirs ?? [])].sort(byDepthAscending).reverse()) {
      if (isEmptyDir(abs(root, dir))) {
        rmdirSync(abs(root, dir));
      }
    }

    const createdDirs = new Set((previous?.createdDirs ?? []).filter((dir) => statOf(abs(root, dir))?.isDirectory()));
    for (const dir of neededDirs) {
      if (statOf(abs(root, dir)) === undefined) {
        mkdirSync(abs(root, dir));
        createdDirs.add(dir);
      }
    }

    for (const file of planned) {
      if (file.needsWrite) {
        writeFileSync(abs(root, file.targetPath), file.content);
      }
    }

    const files: ManifestFile[] = planned.map((file) => ({ path: file.targetPath, sha256: file.sha256 }));
    writeManifest(root, { package: pkg.name, version: pkg.version, files, createdDirs: [...createdDirs] });
  } catch (error) {
    printError(`install failed while writing files: ${(error as Error).message}`);
    printError("re-run install; it reports anything left in an unexpected state.");
    return 1;
  }

  // ---- Report --------------------------------------------------------------

  const skills = planned
    .map((file) => path.posix.relative(TARGET_DIR, file.targetPath).split("/"))
    .flatMap(([folder, name, file, ...rest]) =>
      folder === "skills" && name !== undefined && file === "SKILL.md" && rest.length === 0 ? [name] : [],
    );

  console.log(`${PREFIX} installed ${pkg.name}@${pkg.version} (${planned.length} files) into ${TARGET_DIR}/`);
  for (const skill of skills) {
    console.log(`${PREFIX} invoke it in Claude Code as /${PLUGIN_NAME}:${skill}`);
  }
  console.log(
    `${PREFIX} next: run /reload-plugins in Claude Code (or restart Claude Code from the repo root), and accept the workspace trust prompt so the project plugin loads`,
  );
  return 0;
}

function printGuardFailure(localEdits: readonly string[], conflicts: readonly string[]): void {
  printError("install stopped; nothing was written.");
  if (localEdits.length > 0) {
    printError("these installed files were changed after install:");
    for (const filePath of localEdits) {
      printError(`  ${filePath}`);
    }
    printError("  -> revert your edits to these files (keep a copy elsewhere if you need them), then re-run install.");
  }
  if (conflicts.length > 0) {
    printError("these paths already exist and are not managed by ai-toolkit-example:");
    for (const conflict of conflicts) {
      printError(`  ${conflict}`);
    }
    printError("  -> move or delete these paths, then re-run install.");
  }
}

function printError(message: string): void {
  console.error(`${PREFIX} ${message}`);
}

/** Absolute path for a POSIX path relative to the consumer root. */
function abs(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

/** ".claude/skills/x/file" -> [".claude", ".claude/skills", ".claude/skills/x"] */
function ancestors(relative: string): string[] {
  const segments = relative.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

function byDepthAscending(a: string, b: string): number {
  const depth = a.split("/").length - b.split("/").length;
  return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
}

function isEmptyDir(absolute: string): boolean {
  return lstatOf(absolute)?.isDirectory() === true && readdirSync(absolute).length === 0;
}

/** lstat that returns undefined for a missing path. */
function lstatOf(absolute: string): Stats | undefined {
  return missingAsUndefined(() => lstatSync(absolute));
}

/** stat (follows symlinks) that returns undefined for a missing path. */
function statOf(absolute: string): Stats | undefined {
  return missingAsUndefined(() => statSync(absolute));
}

function missingAsUndefined(read: () => Stats): Stats | undefined {
  try {
    return read();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return undefined;
    }
    throw error;
  }
}
