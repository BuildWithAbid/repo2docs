import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGithubUrl } from "../../src/git/repo-manager";

test("normalizeGithubUrl accepts a standard GitHub URL", () => {
  const normalized = normalizeGithubUrl("https://github.com/octocat/Hello-World");

  assert.equal(normalized.owner, "octocat");
  assert.equal(normalized.repo, "Hello-World");
  assert.equal(normalized.cloneUrl, "https://github.com/octocat/Hello-World.git");
});

test("normalizeGithubUrl rejects unsupported hosts", () => {
  assert.throws(
    () => normalizeGithubUrl("https://gitlab.com/example/project"),
    /Only github\.com repository URLs are supported\./
  );
});

