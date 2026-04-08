import type {
  ArchitectureInfo,
  DependencyInfo,
  EndpointInfo,
  EntrypointInfo,
  ModuleInfo,
  ProjectInsights,
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

function applicationFrameworkNames(projectInsights: ProjectInsights): string[] {
  return projectInsights.frameworks
    .filter((framework) => framework.category === "frontend" || framework.category === "backend" || framework.category === "fullstack" || framework.category === "runtime")
    .map((framework) => framework.name);
}

function detectProjectKind(
  dependencies: DependencyInfo[],
  entrypoints: EntrypointInfo[],
  endpoints: EndpointInfo[],
  snapshot: RepositorySnapshot,
  projectInsights: ProjectInsights
): string {
  const dependencyNames = new Set(dependencies.map((dependency) => dependency.name.toLowerCase()));
  const workspaces = snapshot.manifests.packageJson?.workspaces.length ?? 0;
  const frameworkNames = new Set(projectInsights.frameworks.map((framework) => framework.name));

  if (workspaces > 0 || snapshot.entries.some((entry) => entry.relativePath.startsWith("packages/"))) {
    return "monorepo";
  }
  if (endpoints.length > 0) {
    return "API server";
  }
  if (entrypoints.some((entrypoint) => entrypoint.kind === "cli-bin")) {
    return "CLI application";
  }
  if (frameworkNames.has("Next.js") || frameworkNames.has("Nuxt")) {
    return "fullstack web application";
  }
  if (dependencyNames.has("react") || dependencyNames.has("vue") || dependencyNames.has("svelte") || dependencyNames.has("@angular/core")) {
    return "frontend application";
  }
  if (entrypoints.some((entrypoint) => entrypoint.kind.startsWith("package-"))) {
    return "library";
  }

  return "application";
}

function detectModuleRole(moduleName: string, modulePath: string, relatedPaths: string[], endpointCount: number): string {
  const names = [moduleName.toLowerCase(), modulePath.toLowerCase(), ...relatedPaths.map((item) => item.toLowerCase())];
  const contains = (needle: string) => names.some((value) => value.includes(needle));

  if (endpointCount > 0 || contains("route") || contains("router")) {
    return "routing";
  }
  if (contains("service")) {
    return "services";
  }
  if (contains("controller")) {
    return "controllers";
  }
  if (contains("config") || contains("env")) {
    return "configuration";
  }
  if (contains("model") || contains("schema") || contains("entity")) {
    return "models";
  }
  if (contains("component") || contains("view") || contains("page")) {
    return "ui";
  }
  if (contains("util") || contains("helper")) {
    return "utilities";
  }
  if (contains("test") || contains("spec")) {
    return "testing";
  }

  return "core";
}

function buildModuleSummary(role: string, endpointCount: number, topSymbols: string[], relatedPaths: string[]): string {
  const evidence: string[] = [];

  switch (role) {
    case "routing":
      evidence.push("Handles route registration and request-facing wiring.");
      break;
    case "services":
      evidence.push("Contains reusable business logic and service-level orchestration.");
      break;
    case "controllers":
      evidence.push("Coordinates request handling and response shaping.");
      break;
    case "configuration":
      evidence.push("Defines configuration loading or environment-specific behavior.");
      break;
    case "models":
      evidence.push("Defines domain models, schemas, or data contracts.");
      break;
    case "ui":
      evidence.push("Contains UI-facing components or presentation logic.");
      break;
    case "utilities":
      evidence.push("Provides shared helpers used across the codebase.");
      break;
    case "testing":
      evidence.push("Holds test-specific logic or verification helpers.");
      break;
    default:
      evidence.push("Groups a core area of the codebase.");
      break;
  }

  if (endpointCount > 0) {
    evidence.push(`Includes ${endpointCount} detected ${pluralize(endpointCount, "endpoint")}.`);
  }
  if (topSymbols.length > 0) {
    evidence.push(`Key exports include ${topSymbols.slice(0, 3).join(", ")}.`);
  } else if (relatedPaths.length > 0) {
    evidence.push(`Notable files include ${relatedPaths.slice(0, 2).join(", ")}.`);
  }

  return evidence.join(" ");
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

  if (parts.length === 1 && (/\.config\./i.test(parts[0]) || parts[0].startsWith("."))) {
    return {
      name: "config",
      path: "config"
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
  endpoints: EndpointInfo[],
  localImportGraph: Map<string, Set<string>>,
  fileExportCounts: Map<string, number>
): ModuleInfo[] {
  const moduleMap = new Map<string, ModuleInfo>();

  for (const file of snapshot.sourceFiles) {
    const moduleKey = getModuleKey(file.relativePath);
    const existing = moduleMap.get(moduleKey.path) ?? {
      name: moduleKey.name,
      path: moduleKey.path,
      role: "core",
      fileCount: 0,
      exportCount: 0,
      importCount: 0,
      summary: "",
      relatedPaths: [],
      notableFiles: [],
      topSymbols: []
    };

    existing.fileCount += 1;
    existing.exportCount += fileExportCounts.get(file.relativePath) ?? 0;
    existing.importCount += localImportGraph.get(file.relativePath)?.size ?? 0;
    existing.relatedPaths.push(file.relativePath);

    moduleMap.set(moduleKey.path, existing);
  }

  for (const moduleInfo of moduleMap.values()) {
    const relatedPaths = [...new Set(moduleInfo.relatedPaths)].sort();
    const moduleSymbols = symbols
      .filter((symbol) => symbol.modulePath.startsWith(`${moduleInfo.path}/`) || symbol.modulePath === moduleInfo.path)
      .map((symbol) => symbol.name);
    const moduleEndpoints = endpoints.filter((endpoint) => endpoint.filePath.startsWith(`${moduleInfo.path}/`) || endpoint.filePath === moduleInfo.path);

    moduleInfo.relatedPaths = relatedPaths.slice(0, 5);
    moduleInfo.notableFiles = relatedPaths.slice(0, 3);
    moduleInfo.topSymbols = [...new Set(moduleSymbols)].sort().slice(0, 4);
    moduleInfo.role = detectModuleRole(moduleInfo.name, moduleInfo.path, relatedPaths, moduleEndpoints.length);
    moduleInfo.summary = buildModuleSummary(moduleInfo.role, moduleEndpoints.length, moduleInfo.topSymbols, moduleInfo.notableFiles);
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

function buildDataFlow(
  projectKind: string,
  entrypoints: EntrypointInfo[],
  modules: ModuleInfo[],
  endpoints: EndpointInfo[],
  projectInsights: ProjectInsights
): string[] {
  const flow: string[] = [];
  const primaryEntrypoint = entrypoints[0];

  if (primaryEntrypoint) {
    flow.push(`Execution starts from \`${primaryEntrypoint.relativePath}\`, the highest-confidence detected entrypoint.`);
  }

  const topModules = modules.slice(0, 3).map((moduleInfo) => `\`${moduleInfo.path}\` (${moduleInfo.role})`);
  if (topModules.length > 0) {
    flow.push(`The codebase is organized around ${topModules.join(", ")} as the most active module areas.`);
  }

  if (projectKind === "API server" && endpoints.length > 0) {
    flow.push(`HTTP requests enter through ${endpoints.length} detected ${pluralize(endpoints.length, "endpoint")} and then flow into route and service layers.`);
  } else if (projectKind === "CLI application") {
    flow.push("The CLI bootstrap resolves input, runs analysis, and then emits markdown output files.");
  } else if (projectKind === "library") {
    flow.push("Consumers enter through exported package entrypoints that expose the public module surface.");
  }

  if (projectInsights.environmentFiles.length > 0) {
    flow.push(`Configuration is partially environment-driven through ${projectInsights.environmentFiles.join(", ")}.`);
  }

  return flow;
}

export function analyzeArchitecture(
  snapshot: RepositorySnapshot,
  dependencies: DependencyInfo[],
  entrypoints: EntrypointInfo[],
  symbols: SymbolInfo[],
  endpoints: EndpointInfo[],
  projectInsights: ProjectInsights,
  localImportGraph: Map<string, Set<string>>,
  fileExportCounts: Map<string, number>
): ArchitectureAnalysisResult {
  const modules = buildModules(snapshot, symbols, endpoints, localImportGraph, fileExportCounts);
  const projectKind = detectProjectKind(dependencies, entrypoints, endpoints, snapshot, projectInsights);
  const language = topLanguage(snapshot);
  const frameworkNames = applicationFrameworkNames(projectInsights).slice(0, 4);

  const loweredProjectKind = projectKind.toLowerCase();
  const overviewParts = [
    `${snapshot.repoName} is ${indefiniteArticle(loweredProjectKind)} ${loweredProjectKind} written primarily in ${language}.`,
    `The repository contains ${snapshot.sourceFiles.length} source ${pluralize(snapshot.sourceFiles.length, "file")} across ${modules.length} main ${pluralize(modules.length, "module")}.`
  ];

  if (frameworkNames.length > 0) {
    overviewParts.push(`Detected frameworks and runtime signals include ${frameworkNames.join(", ")}.`);
  }
  if (endpoints.length > 0) {
    overviewParts.push(`It exposes ${endpoints.length} detected HTTP ${pluralize(endpoints.length, "endpoint")}.`);
  }

  const overview = overviewParts.join(" ");
  const architecture: ArchitectureInfo = {
    projectKind,
    overview,
    dataFlow: buildDataFlow(projectKind, entrypoints, modules, endpoints, projectInsights),
    notes: [
      `Primary language: ${language}`,
      `Package manager: ${projectInsights.packageManager ?? "not confidently detected"}`,
      `Detected ${symbols.length} exported ${pluralize(symbols.length, "symbol")} with static parsing`
    ]
  };

  return {
    architecture,
    modules,
    overview
  };
}
