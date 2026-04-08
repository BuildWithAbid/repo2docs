import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Repo2DocsError } from "../core/errors";
import type { Logger, RepositoryContext, RepositorySource } from "../core/types";
import { getCacheRoot, sanitizePathSegment } from "../utils/path";

const execFileAsync = promisify(execFile);

interface SyncRepositoryOptions {
  cloneUrl: string;
  cachePath: string;
  defaultBranch?: string;
  logger?: Logger;
}

export interface PrepareRepositoryOptions {
  cacheRoot?: string;
  logger?: Logger;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });

    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown git failure";
    throw new Repo2DocsError(`Git command failed: git ${args.join(" ")}\n${message}`, "GIT_COMMAND_FAILED");
  }
}

export function normalizeGithubUrl(rawUrl: string, cacheRoot = getCacheRoot()): RepositorySource {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Repo2DocsError(`Invalid repository URL: ${rawUrl}`, "INVALID_REPO_URL");
  }

  if (parsedUrl.hostname.toLowerCase() !== "github.com") {
    throw new Repo2DocsError("Only github.com repository URLs are supported.", "UNSUPPORTED_HOST");
  }

  const pathParts = parsedUrl.pathname.replace(/\/+$/g, "").split("/").filter(Boolean);
  if (pathParts.length < 2) {
    throw new Repo2DocsError("Repository URL must include an owner and repository name.", "INVALID_REPO_URL");
  }

  const owner = pathParts[0];
  const repoName = pathParts[1].replace(/\.git$/i, "");
  if (!owner || !repoName) {
    throw new Repo2DocsError("Repository URL must include an owner and repository name.", "INVALID_REPO_URL");
  }

  const cloneUrl = `https://github.com/${owner}/${repoName}.git`;
  const cachePath = path.join(cacheRoot, `${sanitizePathSegment(owner)}--${sanitizePathSegment(repoName)}`);

  return {
    kind: "github",
    rawUrl,
    owner,
    repo: repoName,
    cloneUrl,
    cachePath,
    defaultBranch: "HEAD"
  };
}

async function detectRemoteHead(cachePath: string): Promise<string | undefined> {
  try {
    const symbolicRef = await runGit(["-C", cachePath, "symbolic-ref", "refs/remotes/origin/HEAD"]);
    const match = symbolicRef.match(/refs\/remotes\/origin\/(.+)$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function detectCurrentRevision(cachePath: string): Promise<string> {
  return runGit(["-C", cachePath, "rev-parse", "HEAD"]);
}

export async function syncRepositoryToCache(options: SyncRepositoryOptions): Promise<{
  cachePath: string;
  currentRevision: string;
  defaultBranch: string;
}> {
  const { cloneUrl, cachePath, logger } = options;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  const gitDirectory = path.join(cachePath, ".git");
  const repoExists = await pathExists(gitDirectory);
  if (!repoExists) {
    logger?.info(`Cloning ${cloneUrl}`);
    await runGit(["clone", "--depth", "1", cloneUrl, cachePath]);
  } else {
    logger?.info(`Refreshing cached repository at ${cachePath}`);
    await runGit(["-C", cachePath, "fetch", "--depth", "1", "--prune", "origin"]);
  }

  const defaultBranch = options.defaultBranch ?? (await detectRemoteHead(cachePath)) ?? "main";
  await runGit(["-C", cachePath, "checkout", "-B", defaultBranch, `origin/${defaultBranch}`]);

  return {
    cachePath,
    currentRevision: await detectCurrentRevision(cachePath),
    defaultBranch
  };
}

export async function prepareRepository(rawUrl: string, options: PrepareRepositoryOptions = {}): Promise<RepositoryContext> {
  const source = normalizeGithubUrl(rawUrl, options.cacheRoot);
  const syncResult = await syncRepositoryToCache({
    cloneUrl: source.cloneUrl,
    cachePath: source.cachePath,
    defaultBranch: source.defaultBranch === "HEAD" ? undefined : source.defaultBranch,
    logger: options.logger
  });

  return {
    source: {
      ...source,
      defaultBranch: syncResult.defaultBranch
    },
    rootPath: syncResult.cachePath,
    currentRevision: syncResult.currentRevision
  };
}
