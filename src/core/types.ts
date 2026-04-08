export type Confidence = "high" | "medium" | "low";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
}

export interface RepositorySource {
  kind: "github" | "local";
  rawUrl: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  cachePath: string;
  defaultBranch: string;
}

export interface RepositoryContext {
  source: RepositorySource;
  rootPath: string;
  currentRevision: string;
}

export interface FileEntry {
  relativePath: string;
  absolutePath: string;
  kind: "file";
  extension: string;
  size: number;
  depth: number;
}

export interface DirectoryEntry {
  relativePath: string;
  absolutePath: string;
  kind: "directory";
  depth: number;
}

export type SnapshotEntry = FileEntry | DirectoryEntry;

export interface PackageManifestInfo {
  name?: string;
  version?: string;
  description?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  packageManager?: string;
  engines: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  bin: Record<string, string>;
  exports: string[];
  workspaces: string[];
}

export interface ManifestSet {
  rawManifestFiles: string[];
  packageJson?: PackageManifestInfo;
  tsconfig?: Record<string, unknown>;
  requirementsTxt?: string[];
  pyprojectDependencies?: string[];
  goDependencies?: string[];
  cargoDependencies?: string[];
}

export interface ScriptInfo {
  name: string;
  command: string;
  category: "dev" | "build" | "test" | "start" | "lint" | "format" | "release" | "other";
}

export interface FrameworkInfo {
  name: string;
  category: "frontend" | "backend" | "fullstack" | "testing" | "build" | "linting" | "runtime";
  evidence: string;
}

export interface ToolingInfo {
  packageManager?: string;
  buildTools: string[];
  testTools: string[];
  lintTools: string[];
  ciTools: string[];
}

export interface ConfigFileInfo {
  path: string;
  category: "environment" | "testing" | "build" | "ci" | "container" | "quality" | "deployment" | "workspace";
  description: string;
}

export interface ProjectInsights {
  packageManager?: string;
  frameworks: FrameworkInfo[];
  tooling: ToolingInfo;
  scripts: ScriptInfo[];
  configFiles: ConfigFileInfo[];
  environmentFiles: string[];
  notablePatterns: string[];
  importantFiles: string[];
}

export interface RepositorySnapshot {
  rootPath: string;
  repoName: string;
  description?: string;
  entries: SnapshotEntry[];
  sourceFiles: FileEntry[];
  languageStats: Record<string, number>;
  treeLines: string[];
  manifests: ManifestSet;
  warnings: string[];
}

export interface DependencyInfo {
  ecosystem: "node" | "python" | "go" | "rust" | "tooling";
  name: string;
  version?: string;
  group?: string;
  sourceFile: string;
}

export interface EntrypointInfo {
  kind: string;
  relativePath: string;
  confidence: Confidence;
  evidence: string;
}

export type SymbolKind = "function" | "class" | "interface" | "type" | "constant";

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  modulePath: string;
  exported: boolean;
  signature: string;
  summary: string;
  docComment?: string;
  members?: string[];
}

export interface EndpointInfo {
  method: string;
  routePath: string;
  filePath: string;
  handlerName?: string;
}

export interface ModuleInfo {
  name: string;
  path: string;
  role: string;
  fileCount: number;
  exportCount: number;
  importCount: number;
  summary: string;
  relatedPaths: string[];
  notableFiles: string[];
  topSymbols: string[];
}

export interface ArchitectureInfo {
  projectKind: string;
  overview: string;
  dataFlow: string[];
  notes: string[];
}

export interface AnalysisResult {
  source: RepositorySource;
  snapshot: RepositorySnapshot;
  dependencies: DependencyInfo[];
  entrypoints: EntrypointInfo[];
  modules: ModuleInfo[];
  symbols: SymbolInfo[];
  endpoints: EndpointInfo[];
  projectInsights: ProjectInsights;
  architecture: ArchitectureInfo;
  overview: string;
  warnings: string[];
}

export interface SymbolExtractionResult {
  symbols: SymbolInfo[];
  endpoints: EndpointInfo[];
  localImportGraph: Map<string, Set<string>>;
  fileExportCounts: Map<string, number>;
}

export interface GeneratedDocs {
  readme: string;
  architecture: string;
  api: string;
}

export interface WriteResult {
  outputDir: string;
  files: Record<"README.md" | "ARCHITECTURE.md" | "API.md", string>;
}
