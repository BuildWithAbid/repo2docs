import * as os from "node:os";
import * as path from "node:path";

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function getCacheRoot(): string {
  return path.join(os.homedir(), ".repo2docs-cache");
}

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function relativePath(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}

