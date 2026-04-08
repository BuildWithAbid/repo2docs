import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { syncRepositoryToCache } from "../../src/git/repo-manager";
import { copyFixture, createTempDir, initializeGitRepository, runCommand } from "../helpers";

test("syncRepositoryToCache clones and refreshes a cached repository", async () => {
  const sourceRepo = await createTempDir("repo2docs-source-");
  await copyFixture("basic-node-app", sourceRepo);
  await initializeGitRepository(sourceRepo);

  const cacheRoot = await createTempDir("repo2docs-cache-");
  const cachePath = path.join(cacheRoot, "basic-node-app");

  const initialClone = await syncRepositoryToCache({
    cloneUrl: sourceRepo,
    cachePath,
    defaultBranch: "main"
  });

  assert.equal(initialClone.defaultBranch, "main");
  const cachedPackageJson = await fs.readFile(path.join(cachePath, "package.json"), "utf8");
  assert.match(cachedPackageJson, /basic-node-app/);

  await fs.writeFile(path.join(sourceRepo, "src", "version.ts"), "export const version = '2.0.0';\n", "utf8");
  await runCommand("git", ["add", "."], sourceRepo);
  await runCommand("git", ["commit", "-m", "add version module"], sourceRepo);

  const refreshedClone = await syncRepositoryToCache({
    cloneUrl: sourceRepo,
    cachePath,
    defaultBranch: "main"
  });

  assert.notEqual(refreshedClone.currentRevision, initialClone.currentRevision);
  const syncedVersionFile = await fs.readFile(path.join(cachePath, "src", "version.ts"), "utf8");
  assert.match(syncedVersionFile, /2\.0\.0/);
});

