import { mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { abs, ancestors, byDepthAscending, isEmptyDir, lstatOf, statOf } from "./fs-utils.js";
import { findEditedFiles, MANIFEST_PATH, ManifestError, readManifest, sha256, shippedHashes, writeManifest } from "./manifest.js";
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
  const staleFiles = [...previousFiles.keys()].filter((filePath) => !targetPaths.has(filePath));

  const conflicts = new Set<string>();

  // Guard: local edit. A managed file that exists but matches neither its recorded hash nor the
  // shipped one (a file already holding the shipped content is what an interrupted upgrade leaves).
  const { edited: localEdits, currentHashes } = findEditedFiles(root, previous?.files ?? [], shippedHashes());

  // Guard: unmanaged conflict. The plugin folder with no manifest, or a target path install doesn't own.
  if (previous === undefined && lstatOf(abs(root, TARGET_DIR)) !== undefined) {
    conflicts.add(TARGET_DIR);
  }
  for (const targetPath of targetPaths) {
    if (!previousFiles.has(targetPath) && lstatOf(abs(root, targetPath)) !== undefined) {
      conflicts.add(targetPath);
    }
  }

  // Every folder the targets and the manifest need, shallowest first. One that exists as a non-folder
  // (including a symlink, which would send writes outside the repo) is a conflict.
  const neededDirs = [...new Set([...targetPaths, MANIFEST_PATH].flatMap(ancestors))].sort(byDepthAscending);
  for (const dir of neededDirs) {
    const stats = lstatOf(abs(root, dir));
    if (stats !== undefined && !stats.isDirectory()) {
      conflicts.add(dir);
    }
  }

  // The manifest itself must be a regular file; writing through a symlink would land outside the repo.
  const manifestStats = lstatOf(abs(root, MANIFEST_PATH));
  if (manifestStats !== undefined && !manifestStats.isFile()) {
    conflicts.add(MANIFEST_PATH);
  }

  // Guard: a symlinked folder above anything install may remove would send the removal elsewhere.
  for (const dir of new Set([...staleFiles, ...(previous?.createdDirs ?? [])].flatMap(ancestors))) {
    if (lstatOf(abs(root, dir))?.isSymbolicLink()) {
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
