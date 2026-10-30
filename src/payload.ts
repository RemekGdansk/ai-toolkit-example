import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Plugin name; must equal `name` in plugin/.claude-plugin/plugin.json. */
export const PLUGIN_NAME = "ai-toolkit-example";

/** Where the plugin folder lands in the consumer, POSIX-relative to its root. */
export const TARGET_DIR = `.claude/skills/${PLUGIN_NAME}`;

// Compiled to dist/payload.js, so the package root is one level up.
const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const PLUGIN_ROOT = path.join(PACKAGE_ROOT, "plugin");

export interface PayloadFile {
  /** Absolute path of the bundled file inside this package. */
  readonly sourcePath: string;
  /** POSIX path relative to the consumer root. */
  readonly targetPath: string;
}

export interface PackageInfo {
  readonly name: string;
  readonly version: string;
}

/** Every file under the bundled plugin/ folder, mapped to its consumer path, sorted by target path. */
export function listPayload(): PayloadFile[] {
  const files: PayloadFile[] = [];

  const walk = (dir: string, segments: readonly string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const sourcePath = path.join(dir, entry.name);
      const next = [...segments, entry.name];
      if (entry.isDirectory()) {
        walk(sourcePath, next);
      } else if (entry.isFile()) {
        files.push({ sourcePath, targetPath: path.posix.join(TARGET_DIR, ...next) });
      } else {
        throw new Error(`unsupported entry in bundled plugin folder: ${sourcePath}`);
      }
    }
  };

  walk(PLUGIN_ROOT, []);
  return files.sort((a, b) => (a.targetPath < b.targetPath ? -1 : a.targetPath > b.targetPath ? 1 : 0));
}

/** Name and version of this package, read from its own package.json. */
export function readPackageInfo(): PackageInfo {
  const raw: unknown = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("name" in raw) ||
    !("version" in raw) ||
    typeof raw.name !== "string" ||
    typeof raw.version !== "string"
  ) {
    throw new Error("bundled package.json has no string name and version");
  }
  return { name: raw.name, version: raw.version };
}
