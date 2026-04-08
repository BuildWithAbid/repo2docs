import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRepositoryPath, generateDocs, generateRepositoryDocsFromPath } from "../../src/index";
import { createTempDir, getFixturePath } from "../helpers";

test("analyzeRepositoryPath detects entrypoints, modules, symbols, and endpoints", async () => {
  const fixturePath = getFixturePath("basic-node-app");
  const analysis = await analyzeRepositoryPath(fixturePath, {
    rawUrl: fixturePath,
    owner: "local",
    repo: "basic-node-app",
    cloneUrl: fixturePath,
    cachePath: fixturePath,
    defaultBranch: "local"
  });

  assert.ok(analysis.entrypoints.some((entrypoint) => entrypoint.relativePath === "src/index.ts"));
  assert.ok(analysis.modules.some((moduleInfo) => moduleInfo.path === "src/routes"));
  assert.ok(analysis.symbols.some((symbol) => symbol.name === "registerUserRoutes"));
  assert.ok(analysis.symbols.some((symbol) => symbol.name === "UserService"));
  assert.ok(analysis.endpoints.some((endpoint) => endpoint.method === "GET" && endpoint.routePath === "/users"));
});

test("generateRepositoryDocsFromPath writes all markdown outputs", async () => {
  const outputDir = await createTempDir("repo2docs-output-");
  const fixturePath = getFixturePath("basic-node-app");

  const result = await generateRepositoryDocsFromPath(fixturePath, {
    outputDir
  });

  assert.ok(result.docs.readme.includes("# basic-node-app"));
  assert.ok(result.docs.architecture.includes("## Main Modules"));
  assert.ok(result.docs.api.includes("## HTTP Endpoints"));

  const regeneratedDocs = generateDocs(result.analysis);
  assert.ok(regeneratedDocs.api.includes("UserService"));
});

