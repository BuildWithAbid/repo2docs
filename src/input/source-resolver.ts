import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Repo2DocsError } from "../core/errors";
import type { RepositorySource } from "../core/types";
import { normalizeGithubUrl } from "../git/repo-manager";
import { getCacheRoot, sanitizePathSegment } from "../utils/path";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isGithubUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

export async function resolveRepositorySource(input: string, cacheRoot = getCacheRoot()): Promise<{
  source: RepositorySource;
  localPath?: string;
}> {
  if (isGithubUrl(input)) {
    return {
      source: normalizeGithubUrl(input, cacheRoot)
    };
  }

  const resolvedPath = path.resolve(input);
  if (!(await pathExists(resolvedPath))) {
    throw new Repo2DocsError(
      `Input must be a GitHub repository URL or an existing local path. Received: ${input}`,
      "INVALID_INPUT"
    );
  }

  const stats = await fs.stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Repo2DocsError(`Local input must be a directory. Received: ${resolvedPath}`, "INVALID_LOCAL_PATH");
  }

  const realPath = await fs.realpath(resolvedPath);
  const repoName = path.basename(realPath);
  const ownerName = path.basename(path.dirname(realPath)) || "local";

  return {
    source: {
      kind: "local",
      rawUrl: input,
      owner: sanitizePathSegment(ownerName) || "local",
      repo: repoName,
      cloneUrl: realPath,
      cachePath: realPath,
      defaultBranch: "local"
    },
    localPath: realPath
  };
}
