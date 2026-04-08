import * as path from "node:path";
import type { AnalysisResult, GeneratedDocs, Logger, RepositorySource, WriteResult } from "./core/types";
import { analyzeArchitecture } from "./analyze/architecture-analyzer";
import { detectDependencies } from "./analyze/dependency-detector";
import { detectEntrypoints } from "./analyze/entrypoint-detector";
import { buildProjectInsights } from "./analyze/project-insights";
import { scanRepository } from "./analyze/repo-scanner";
import { extractSymbolInsights } from "./analyze/symbol-extractor";
import { generateApiDoc } from "./generate/api-generator";
import { generateArchitectureDoc } from "./generate/architecture-generator";
import { generateReadme } from "./generate/readme-generator";
import { prepareRepository } from "./git/repo-manager";
import { resolveRepositorySource } from "./input/source-resolver";
import { writeDocs } from "./output/write-docs";

export interface GenerateRepositoryDocsOptions {
  outputDir?: string;
  cacheRoot?: string;
  logger?: Logger;
}

export interface GenerateRepositoryDocsResult {
  analysis: AnalysisResult;
  docs: GeneratedDocs;
  writtenFiles: WriteResult;
}

function resolveDefaultOutputDir(source: RepositorySource, baseDir = process.cwd()): string {
  return path.join(baseDir, "repo2docs-output", source.repo);
}

export async function analyzeRepositoryPath(rootPath: string, source: RepositorySource): Promise<AnalysisResult> {
  const snapshot = await scanRepository(rootPath, source.repo);
  const dependencyResult = await detectDependencies(snapshot);
  snapshot.manifests = dependencyResult.manifests;
  snapshot.description = dependencyResult.manifests.packageJson?.description;

  const symbolInsights = await extractSymbolInsights(snapshot);
  const entrypoints = detectEntrypoints(snapshot, snapshot.manifests.packageJson, symbolInsights.endpoints);
  const projectInsights = buildProjectInsights(snapshot, dependencyResult.dependencies, entrypoints);
  const architectureResult = analyzeArchitecture(
    snapshot,
    dependencyResult.dependencies,
    entrypoints,
    symbolInsights.symbols,
    symbolInsights.endpoints,
    projectInsights,
    symbolInsights.localImportGraph,
    symbolInsights.fileExportCounts
  );

  return {
    source,
    snapshot,
    dependencies: dependencyResult.dependencies,
    entrypoints,
    modules: architectureResult.modules,
    symbols: symbolInsights.symbols,
    endpoints: symbolInsights.endpoints,
    projectInsights,
    architecture: architectureResult.architecture,
    overview: architectureResult.overview,
    warnings: snapshot.warnings
  };
}

export function generateDocs(analysis: AnalysisResult): GeneratedDocs {
  return {
    readme: generateReadme(analysis),
    architecture: generateArchitectureDoc(analysis),
    api: generateApiDoc(analysis)
  };
}

export async function generateRepositoryDocsFromPath(
  rootPath: string,
  options: GenerateRepositoryDocsOptions & { source?: RepositorySource } = {}
): Promise<GenerateRepositoryDocsResult> {
  const source = options.source ?? {
    kind: "local",
    rawUrl: rootPath,
    owner: "local",
    repo: path.basename(rootPath),
    cloneUrl: rootPath,
    cachePath: rootPath,
    defaultBranch: "local"
  };

  options.logger?.info(`Analyzing local repository at ${rootPath}`);
  const analysis = await analyzeRepositoryPath(rootPath, source);
  const docs = generateDocs(analysis);
  const resolvedOutputDir = options.outputDir ?? resolveDefaultOutputDir(source);
  options.logger?.info(`Writing generated docs to ${resolvedOutputDir}`);
  const writtenFiles = await writeDocs(docs, resolvedOutputDir);

  return {
    analysis,
    docs,
    writtenFiles
  };
}

export async function generateRepositoryDocs(
  input: string,
  options: GenerateRepositoryDocsOptions = {}
): Promise<GenerateRepositoryDocsResult> {
  const resolved = await resolveRepositorySource(input, options.cacheRoot);

  if (resolved.source.kind === "local") {
    return generateRepositoryDocsFromPath(resolved.localPath ?? resolved.source.cachePath, {
      ...options,
      source: resolved.source
    });
  }

  options.logger?.info(`Preparing repository from ${resolved.source.cloneUrl}`);
  const context = await prepareRepository(input, {
    cacheRoot: options.cacheRoot,
    logger: options.logger
  });

  options.logger?.info(`Analyzing cached repository at ${context.rootPath}`);
  return generateRepositoryDocsFromPath(context.rootPath, {
    outputDir: options.outputDir ?? resolveDefaultOutputDir(context.source),
    logger: options.logger,
    source: context.source
  });
}
