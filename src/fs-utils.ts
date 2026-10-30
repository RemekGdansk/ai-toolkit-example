import { lstatSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";

/** Absolute path for a POSIX path relative to the consumer root. */
export function abs(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

/** ".claude/skills/x/file" -> [".claude", ".claude/skills", ".claude/skills/x"] */
export function ancestors(relative: string): string[] {
  const segments = relative.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function byDepthAscending(a: string, b: string): number {
  const depth = a.split("/").length - b.split("/").length;
  return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
}

export function isEmptyDir(absolute: string): boolean {
  return lstatOf(absolute)?.isDirectory() === true && readdirSync(absolute).length === 0;
}

/** lstat that returns undefined for a missing path. */
export function lstatOf(absolute: string): Stats | undefined {
  return missingAsUndefined(() => lstatSync(absolute));
}

/** stat (follows symlinks) that returns undefined for a missing path. */
export function statOf(absolute: string): Stats | undefined {
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
