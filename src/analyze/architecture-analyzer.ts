import type {
  ArchitectureInfo,
  DependencyInfo,
  EndpointInfo,
  EntrypointInfo,
  ModuleInfo,
  RepositorySnapshot,
  SymbolInfo
} from "../core/types";
import { humanizeIdentifier, pluralize } from "../utils/text";

interface ArchitectureAnalysisResult {
  architecture: ArchitectureInfo;
  modules: ModuleInfo[];
  overview: string;
}

function indefiniteArticle(value: string): string {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function topLanguage(snapshot: RepositorySnapshot): string {
  const [language] = Object.entries(snapshot.languageStats).sort((left, right) => right[1] - left[1])[0] ?? ["source code"];
  return language;
}

function detectProjectKind(
  dependencies: DependencyInfo[],
  entrypoints: EntrypointInfo[],
  endpoints: EndpointInfo[],
  snapshot: RepositorySnapshot
): string {
  const dependencyNames = new Set(dependencies.map((dependency) => dependency.name.toLowerCase()));
  const workspaces = snapshot.manifests.packageJson?.workspaces.length ?? 0;

  if (workspaces > 0 || snapshot.entries.some((entry) => entry.relativePath.startsWith("packages/"))) {
    return "monorepo";
  }
  if (endpoints.length > 0) {
    return "API server";
  }
  if (entrypoints.some((entrypoint) => entrypoint.kind === "cli-bin")) {
    return "CLI application";
  }
  if (dependencyNames.has("react") || dependencyNames.has("next") || dependencyNames.has("vue") || dependencyNames.has("svelte")) {
    return "web application";
  }
  if (entrypoints.some((entrypoint) => entrypoint.kind.startsWith("package-"))) {
    return "library";
  }

  return "application";
}

function moduleSummary(moduleName: string): string {
  const normalized = moduleName.toLowerCase();
  if (normalized.includes("route")) {
    return "Defines route registration and transport-facing endpoint handlers.";
  }
  if (normalized.includes("service")) {
    return "Contains business logic and reusable application services.";
  }
  if (normalized.includes("controller")) {
    return "Coordinates incoming requests and response shaping.";
  }
  if (normalized.includes("util") || normalized.includes("helper")) {
    return "Provides shared helper utilities used across the codebase.";
  }
  if (normalized.includes("config")) {
    return "Holds configuration loading and environment-specific defaults.";
  }
  if (normalized.includes("model") || normalized.includes("schema")) {
    return "Defines core data models and structural contracts.";
  }

  return `Contains ${humanizeIdentifier(moduleName)} related implementation files.`;
}

function getModuleKey(relativePath: string): { name: string; path: string } {
  const parts = relativePath.split("/");
  const sourceRoots = new Set(["src", "lib", "app", "packages"]);

  if (parts.length >= 2 && sourceRoots.has(parts[0])) {
    return {
      name: parts[1],
      path: `${parts[0]}/${parts[1]}`
    };
  }

  return {
    name: parts[0] ?? "(root)",
    path: parts[0] ?? "(root)"
  };
}

function buildModules(
  snapshot: RepositorySnapshot,
  symbols: SymbolInfo[],
  localImportGraph: Map<string, Set<string>>,
  fileExportCounts: Map<string, number>
): ModuleInfo[] {
  const moduleMap = new Map<string, ModuleInfo>();

  for (const file of snapshot.sourceFiles) {
    const moduleKey = getModuleKey(file.relativePath);
    const existing = moduleMap.get(moduleKey.path) ?? {
      name: moduleKey.name,
      path: moduleKey.path,
      fileCount: 0,
      exportCount: 0,
      importCount: 0,
      summary: moduleSummary(moduleKey.name),
      relatedPaths: []
    };

    existing.fileCount += 1;
    existing.exportCount += fileExportCounts.get(file.relativePath) ?? 0;
    existing.importCount += localImportGraph.get(file.relativePath)?.size ?? 0;
    existing.relatedPaths.push(file.relativePath);

    moduleMap.set(moduleKey.path, existing);
  }

  for (const moduleInfo of moduleMap.values()) {
    moduleInfo.relatedPaths = [...new Set(moduleInfo.relatedPaths)].sort().slice(0, 5);
    if (moduleInfo.exportCount === 0) {
      const moduleSymbols = symbols.filter((symbol) => symbol.modulePath.startsWith(moduleInfo.path));
      moduleInfo.exportCount = moduleSymbols.length;
    }
  }

  return [...moduleMap.values()].sort((left, right) => {
    if (right.exportCount !== left.exportCount) {
      return right.exportCount - left.exportCount;
    }
    if (right.fileCount !== left.fileCount) {
      return right.fileCount - left.fileCount;
    }
    return left.path.localeCompare(right.path);
  });
}

function buildDataFlow(projectKind: string, entrypoints: EntrypointInfo[], modules: ModuleInfo[], endpoints: EndpointInfo[]): string[] {
  const flow: string[] = [];

  const primaryEntrypoint = entrypoints[0];
  if (primaryEntrypoint) {
    flow.push(`Execution starts from \`${primaryEntrypoint.relativePath}\`, which is the highest-confidence detected entrypoint.`);
  }

  const topModules = modules.slice(0, 3).map((moduleInfo) => `\`${moduleInfo.path}\``);
  if (topModules.length > 0) {
    flow.push(`The implementation is organized around ${topModules.join(", ")} as the main internal modules.`);
  }

  if (projectKind === "API server" && endpoints.length > 0) {
    flow.push(`HTTP requests enter through ${endpoints.length} detected ${pluralize(endpoints.length, "endpoint")} and are delegated into route and service modules.`);
  } else if (projectKind === "CLI application") {
    flow.push("The CLI bootstrap initializes command handling and then delegates work into internal modules.");
  } else if (projectKind === "library") {
    flow.push("Consumers enter through exported package entrypoints, which re-export or invoke deeper modules.");
  }

  return flow;
}

export function analyzeArchitecture(
  snapshot: RepositorySnapshot,
  dependencies: DependencyInfo[],
  entrypoints: EntrypointInfo[],
  symbols: SymbolInfo[],
  endpoints: EndpointInfo[],
  localImportGraph: Map<string, Set<string>>,
  fileExportCounts: Map<string, number>
): ArchitectureAnalysisResult {
  const modules = buildModules(snapshot, symbols, localImportGraph, fileExportCounts);
  const projectKind = detectProjectKind(dependencies, entrypoints, endpoints, snapshot);
  const language = topLanguage(snapshot);
  const dependencyNames = dependencies.slice(0, 5).map((dependency) => dependency.name);

  const loweredProjectKind = projectKind.toLowerCase();
  const overviewParts = [
    `${snapshot.repoName} is ${indefiniteArticle(loweredProjectKind)} ${loweredProjectKind} written primarily in ${language}.`,
    `The repository contains ${snapshot.sourceFiles.length} source ${pluralize(snapshot.sourceFiles.length, "file")} across ${modules.length} main ${pluralize(modules.length, "module")}.`
  ];

  if (endpoints.length > 0) {
    overviewParts.push(`It exposes ${endpoints.length} detected HTTP ${pluralize(endpoints.length, "endpoint")}.`);
  }

  if (dependencyNames.length > 0) {
    overviewParts.push(`Notable dependencies include ${dependencyNames.join(", ")}.`);
  }

  const overview = overviewParts.join(" ");
  const architecture: ArchitectureInfo = {
    projectKind,
    overview,
    dataFlow: buildDataFlow(projectKind, entrypoints, modules, endpoints),
    notes: [
      `Primary language: ${language}`,
      `Detected ${symbols.length} exported ${pluralize(symbols.length, "symbol")} with heuristic parsing`
    ]
  };

  return {
    architecture,
    modules,
    overview
  };
}
