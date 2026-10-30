import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TARGET_DIR } from "./payload.js";

/** Manifest location, POSIX-relative to the consumer root. */
export const MANIFEST_PATH = ".claude/.ai-toolkit-example-manifest.json";

export interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
}

/** The only record of what the toolkit owns in the consumer repo. */
export interface Manifest {
  readonly package: string;
  readonly version: string;
  readonly files: readonly ManifestFile[];
  readonly createdDirs: readonly string[];
}

/** The manifest exists but cannot be trusted: unreadable, invalid, or written by another package. */
export class ManifestError extends Error {}

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function manifestFilePath(root: string): string {
  return path.join(root, ...MANIFEST_PATH.split("/"));
}

/**
 * Reads and validates the manifest. Returns undefined only when there is no manifest file;
 * any other problem throws ManifestError.
 */
export function readManifest(root: string, expectedPackage: string): Manifest | undefined {
  let text: string;
  try {
    text = readFileSync(manifestFilePath(root), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return undefined;
    }
    throw new ManifestError(`cannot read ${MANIFEST_PATH}: ${(error as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ManifestError(`${MANIFEST_PATH} is not valid JSON`);
  }

  const manifest = validate(raw);
  if (manifest.package !== expectedPackage) {
    throw new ManifestError(
      `${MANIFEST_PATH} belongs to package "${manifest.package}", not "${expectedPackage}"`,
    );
  }
  return manifest;
}

/** 2-space JSON plus a trailing newline, with files and createdDirs sorted, so equal content gives equal bytes. */
export function serializeManifest(manifest: Manifest): string {
  const files = [...manifest.files]
    .sort((a, b) => compare(a.path, b.path))
    .map((file) => ({ path: file.path, sha256: file.sha256 }));
  const createdDirs = [...manifest.createdDirs].sort(compare);
  const ordered = { package: manifest.package, version: manifest.version, files, createdDirs };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function writeManifest(root: string, manifest: Manifest): void {
  writeFileSync(manifestFilePath(root), serializeManifest(manifest));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(reason: string): never {
  throw new ManifestError(`${MANIFEST_PATH} is invalid: ${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A normalized POSIX path under .claude/. Callers narrow it further to the plugin folder. */
function isManagedPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value === ".claude" || value.startsWith(".claude/")) &&
    !value.endsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    path.posix.normalize(value) === value
  );
}

/** The plugin folder, a folder inside it, or one of its ancestors (.claude, .claude/skills). */
function isPluginDirOrAncestor(dir: string): boolean {
  return dir === TARGET_DIR || dir.startsWith(`${TARGET_DIR}/`) || TARGET_DIR.startsWith(`${dir}/`);
}

function validate(raw: unknown): Manifest {
  if (!isRecord(raw)) {
    fail("expected a JSON object");
  }

  const { package: pkg, version, files, createdDirs } = raw;
  if (typeof pkg !== "string" || pkg === "") {
    fail(`"package" must be a non-empty string`);
  }
  if (typeof version !== "string" || version === "") {
    fail(`"version" must be a non-empty string`);
  }
  if (!Array.isArray(files)) {
    fail(`"files" must be an array`);
  }
  if (!Array.isArray(createdDirs)) {
    fail(`"createdDirs" must be an array`);
  }

  const seenFiles = new Set<string>();
  const validFiles: ManifestFile[] = [];
  for (const entry of files as unknown[]) {
    if (!isRecord(entry)) {
      fail(`every "files" entry must be an object`);
    }
    const { path: filePath, sha256: hash } = entry;
    if (!isManagedPath(filePath) || !filePath.startsWith(`${TARGET_DIR}/`)) {
      fail(`"files" entry has an unsafe or malformed path: ${JSON.stringify(filePath)}`);
    }
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
      fail(`"files" entry ${filePath} has no valid sha256`);
    }
    if (seenFiles.has(filePath)) {
      fail(`"files" lists ${filePath} twice`);
    }
    seenFiles.add(filePath);
    validFiles.push({ path: filePath, sha256: hash });
  }

  const seenDirs = new Set<string>();
  for (const dir of createdDirs as unknown[]) {
    if (!isManagedPath(dir) || !isPluginDirOrAncestor(dir)) {
      fail(`"createdDirs" has an unsafe or malformed path: ${JSON.stringify(dir)}`);
    }
    if (seenDirs.has(dir)) {
      fail(`"createdDirs" lists ${dir} twice`);
    }
    seenDirs.add(dir);
  }

  return { package: pkg, version, files: validFiles, createdDirs: [...seenDirs] };
}
