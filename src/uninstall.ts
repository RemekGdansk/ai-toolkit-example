import { rmdirSync, rmSync } from "node:fs";
import process from "node:process";
import { abs, ancestors, byDepthAscending, isEmptyDir, lstatOf, statOf } from "./fs-utils.js";
import { findEditedFiles, MANIFEST_PATH, ManifestError, readManifest, shippedHashes } from "./manifest.js";
import type { Manifest } from "./manifest.js";
import { readPackageInfo, TARGET_DIR } from "./payload.js";

const PREFIX = "ai-toolkit-example:";

/**
 * Removes everything the manifest in `<cwd>/.claude/` lists. Checks every guard before the first
 * removal; the manifest is removed after everything except its own parent folder, so an interrupted
 * run can be finished by running uninstall again.
 */
export function uninstall(): number {
  const root = process.cwd();

  if (!statOf(abs(root, "package.json"))?.isFile()) {
    printError(`no package.json in ${root}; run from the consumer repo root`);
    return 1;
  }

  const pkg = readPackageInfo();

  let manifest: Manifest | undefined;
  try {
    manifest = readManifest(root, pkg.name);
  } catch (error) {
    if (error instanceof ManifestError) {
      printError(error.message);
      printError(
        `nothing was removed. Restore ${MANIFEST_PATH} to the file install wrote, or move out any files you changed or added in ${TARGET_DIR}/, then delete it together with that folder.`,
      );
      return 1;
    }
    throw error;
  }

  if (manifest === undefined) {
    if (lstatOf(abs(root, TARGET_DIR)) === undefined) {
      console.log(`${PREFIX} not installed in ${root}; nothing removed`);
      return 0;
    }
    printError(
      `${TARGET_DIR}/ exists but ${MANIFEST_PATH} does not; it is not managed by ai-toolkit-example, so nothing was removed. Delete it yourself if it is a leftover install.`,
    );
    return 1;
  }

  // ---- Guards --------------------------------------------------------------

  // Guard: local edit, with the same definition install uses.
  const { edited } = findEditedFiles(root, manifest.files, shippedHashes());

  // Guard: unsafe path. Removing through a symlinked folder, or removing a manifest that is not a
  // regular file, could delete files outside the repo.
  const unsafe = new Set<string>();
  const manifestStats = lstatOf(abs(root, MANIFEST_PATH));
  if (manifestStats !== undefined && !manifestStats.isFile()) {
    unsafe.add(MANIFEST_PATH);
  }
  const managedPaths = [...manifest.files.map((file) => file.path), ...manifest.createdDirs, MANIFEST_PATH];
  for (const dir of new Set(managedPaths.flatMap(ancestors))) {
    if (lstatOf(abs(root, dir))?.isSymbolicLink()) {
      unsafe.add(dir);
    }
  }

  if (edited.length > 0 || unsafe.size > 0) {
    printGuardFailure([...edited].sort(), [...unsafe].sort());
    return 1;
  }

  // ---- Apply ---------------------------------------------------------------

  const manifestAncestors = new Set(ancestors(MANIFEST_PATH));
  const createdDeepestFirst = [...manifest.createdDirs].sort(byDepthAscending).reverse();
  let removed = 0;

  try {
    for (const { path: filePath } of manifest.files) {
      if (lstatOf(abs(root, filePath)) !== undefined) {
        rmSync(abs(root, filePath));
        removed += 1;
      }
    }

    for (const dir of createdDeepestFirst.filter((dir) => !manifestAncestors.has(dir))) {
      if (isEmptyDir(abs(root, dir))) {
        rmdirSync(abs(root, dir));
      }
    }

    if (lstatOf(abs(root, MANIFEST_PATH)) !== undefined) {
      rmSync(abs(root, MANIFEST_PATH));
    }

    for (const dir of createdDeepestFirst.filter((dir) => manifestAncestors.has(dir))) {
      if (isEmptyDir(abs(root, dir))) {
        rmdirSync(abs(root, dir));
      }
    }
  } catch (error) {
    printError(`uninstall failed while removing files: ${(error as Error).message}`);
    printError("re-run uninstall; anything already removed is skipped.");
    return 1;
  }

  // ---- Report --------------------------------------------------------------

  const leftover = [...manifest.createdDirs]
    .sort(byDepthAscending)
    .map((dir) => ({ dir, stats: lstatOf(abs(root, dir)) }))
    .filter(({ stats }) => stats !== undefined);

  console.log(`${PREFIX} uninstalled ${pkg.name}@${manifest.version} (${removed} files removed) from ${TARGET_DIR}/`);
  for (const { dir, stats } of leftover) {
    if (stats?.isDirectory()) {
      // Install refuses a plugin folder without a manifest, so say how to get back to installable.
      const hint = dir === TARGET_DIR ? "; move them out before installing again" : "";
      console.log(`${PREFIX} kept ${dir}/: it holds files ai-toolkit-example did not install${hint}`);
    } else {
      console.log(`${PREFIX} left ${dir}: it is no longer a folder; remove it before installing again`);
    }
  }
  console.log(
    `${PREFIX} next: run /reload-plugins in Claude Code (or restart it). If you no longer need the toolkit, remove the ai-toolkit script from package.json and the @remekgdansk line from .npmrc.`,
  );
  return 0;
}

function printGuardFailure(edited: readonly string[], unsafe: readonly string[]): void {
  printError("uninstall stopped; nothing was removed.");
  if (edited.length > 0) {
    printError("these installed files were changed after install:");
    for (const filePath of edited) {
      printError(`  ${filePath}`);
    }
    printError(`  -> move these files out of ${TARGET_DIR}/ (or delete them), then re-run uninstall.`);
  }
  if (unsafe.length > 0) {
    printError("these paths are not safe to remove through:");
    for (const unsafePath of unsafe) {
      printError(`  ${unsafePath}`);
    }
    printError(
      "  -> these paths are symlinks or not regular files; removing through them could delete files outside the repo. Replace or remove them, then re-run uninstall.",
    );
  }
}

function printError(message: string): void {
  console.error(`${PREFIX} ${message}`);
}
