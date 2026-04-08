import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { analyzeRepositoryPath, generateDocs, generateRepositoryDocsFromPath } from "../../src/index";
import { createTempDir, getFixturePath } from "../helpers";

test("analyzeRepositoryPath detects entrypoints, modules, symbols, and endpoints", async () => {
  const fixturePath = getFixturePath("basic-node-app");
  const analysis = await analyzeRepositoryPath(fixturePath, {
    kind: "local",
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
  assert.equal(analysis.projectInsights.packageManager, "pnpm");
  assert.ok(analysis.projectInsights.frameworks.some((framework) => framework.name === "Express"));
  assert.ok(analysis.projectInsights.tooling.buildTools.includes("tsup"));
  assert.ok(analysis.projectInsights.tooling.testTools.includes("Vitest"));
  assert.ok(analysis.projectInsights.configFiles.some((configFile) => configFile.path === ".github/workflows/ci.yml"));
  assert.ok(analysis.projectInsights.environmentFiles.includes(".env.example"));
});

test("generateRepositoryDocsFromPath writes markdown outputs to the dedicated default folder", async () => {
  const baseDir = await createTempDir("repo2docs-output-");
  const originalCwd = process.cwd();
  const fixturePath = getFixturePath("basic-node-app");

  process.chdir(baseDir);
  try {
    const result = await generateRepositoryDocsFromPath(fixturePath);

    assert.equal(result.writtenFiles.outputDir, path.join(baseDir, "repo2docs-output", "basic-node-app"));
    assert.ok(result.docs.readme.includes("## Entrypoints"));
    assert.ok(result.docs.architecture.includes("## Module Map"));
    assert.ok(result.docs.api.includes("## HTTP Endpoints"));

    const regeneratedDocs = generateDocs(result.analysis);
    assert.ok(regeneratedDocs.api.includes("UserService"));
    assert.ok(regeneratedDocs.readme.includes("## Scripts"));
  } finally {
    process.chdir(originalCwd);
  }
});

test("analyzeRepositoryPath extracts Python API symbols and endpoints", async () => {
  const fixturePath = getFixturePath("python-api-app");
  const analysis = await analyzeRepositoryPath(fixturePath, {
    kind: "local",
    rawUrl: fixturePath,
    owner: "local",
    repo: "python-api-app",
    cloneUrl: fixturePath,
    cachePath: fixturePath,
    defaultBranch: "local"
  });

  assert.ok(analysis.symbols.some((symbol) => symbol.name === "create_app"));
  assert.ok(analysis.symbols.some((symbol) => symbol.name === "HealthService"));
  assert.ok(analysis.endpoints.some((endpoint) => endpoint.method === "GET" && endpoint.routePath === "/health"));
  assert.ok(analysis.endpoints.some((endpoint) => endpoint.method === "POST" && endpoint.routePath === "/metrics"));
  assert.ok(analysis.projectInsights.frameworks.some((framework) => framework.name === "FastAPI"));
});

test("analyzeRepositoryPath follows TypeScript re-exports", async () => {
  const fixturePath = getFixturePath("reexport-lib");
  const analysis = await analyzeRepositoryPath(fixturePath, {
    kind: "local",
    rawUrl: fixturePath,
    owner: "local",
    repo: "reexport-lib",
    cloneUrl: fixturePath,
    cachePath: fixturePath,
    defaultBranch: "local"
  });

  assert.ok(analysis.symbols.some((symbol) => symbol.modulePath === "src/index.ts" && symbol.name === "createProfile"));
  assert.ok(analysis.symbols.some((symbol) => symbol.modulePath === "src/index.ts" && symbol.name === "UserProfile"));
});

test("analyzeRepositoryPath extracts Go symbols and HTTP routes", async () => {
  const fixturePath = getFixturePath("go-api-app");
  const analysis = await analyzeRepositoryPath(fixturePath, {
    kind: "local",
    rawUrl: fixturePath,
    owner: "local",
    repo: "go-api-app",
    cloneUrl: fixturePath,
    cachePath: fixturePath,
    defaultBranch: "local"
  });

  assert.ok(analysis.symbols.some((symbol) => symbol.name === "StartServer"));
  assert.ok(analysis.symbols.some((symbol) => symbol.name === "HealthService"));
  assert.ok(analysis.endpoints.some((endpoint) => endpoint.routePath === "/health"));
});
