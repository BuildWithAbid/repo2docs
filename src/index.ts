import * as path from "node:path";
import type { AnalysisResult, GeneratedDocs, Logger, RepositorySource, WriteResult } from "./core/types";
import { analyzeArchitecture } from "./analyze/architecture-analyzer";
import { detectDependencies } from "./analyze/dependency-detector";
import { detectEntrypoints } from "./analyze/entrypoint-detector";
import { scanRepository } from "./analyze/repo-scanner";
import { extractSymbolInsights } from "./analyze/symbol-extractor";
import { generateApiDoc } from "./generate/api-generator";
import { generateArchitectureDoc } from "./generate/architecture-generator";
import { generateReadme } from "./generate/readme-generator";
import { prepareRepository } from "./git/repo-manager";
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

export async function analyzeRepositoryPath(rootPath: string, source: RepositorySource): Promise<AnalysisResult> {
  const snapshot = await scanRepository(rootPath, source.repo);
  const dependencyResult = await detectDependencies(snapshot);
  snapshot.manifests = dependencyResult.manifests;
  snapshot.description = dependencyResult.manifests.packageJson?.description;

  const symbolInsights = await extractSymbolInsights(snapshot);
  const entrypoints = detectEntrypoints(snapshot, snapshot.manifests.packageJson, symbolInsights.endpoints);
  const architectureResult = analyzeArchitecture(
    snapshot,
    dependencyResult.dependencies,
    entrypoints,
    symbolInsights.symbols,
    symbolInsights.endpoints,
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
    rawUrl: rootPath,
    owner: "local",
    repo: path.basename(rootPath),
    cloneUrl: rootPath,
    cachePath: rootPath,
    defaultBranch: "local"
  };
  const analysis = await analyzeRepositoryPath(rootPath, source);
  const docs = generateDocs(analysis);
  const writtenFiles = await writeDocs(docs, options.outputDir ?? process.cwd());

  return {
    analysis,
    docs,
    writtenFiles
  };
}

export async function generateRepositoryDocs(
  rawRepoUrl: string,
  options: GenerateRepositoryDocsOptions = {}
): Promise<GenerateRepositoryDocsResult> {
  const context = await prepareRepository(rawRepoUrl, {
    cacheRoot: options.cacheRoot,
    logger: options.logger
  });

  return generateRepositoryDocsFromPath(context.rootPath, {
    outputDir: options.outputDir,
    logger: options.logger,
    source: context.source
  });
}

