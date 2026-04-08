import test from "node:test";
import assert from "node:assert/strict";
import { resolveRepositorySource } from "../../src/input/source-resolver";
import { getFixturePath } from "../helpers";

test("resolveRepositorySource accepts a GitHub URL", async () => {
  const resolved = await resolveRepositorySource("https://github.com/octocat/Hello-World");

  assert.equal(resolved.source.kind, "github");
  assert.equal(resolved.source.owner, "octocat");
  assert.equal(resolved.source.repo, "Hello-World");
});

test("resolveRepositorySource accepts a local path", async () => {
  const fixturePath = getFixturePath("basic-node-app");
  const resolved = await resolveRepositorySource(fixturePath);

  assert.equal(resolved.source.kind, "local");
  assert.equal(resolved.localPath, fixturePath);
  assert.equal(resolved.source.repo, "basic-node-app");
});
