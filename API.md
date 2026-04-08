# repo2docs API

## CLI

### `repo2docs <github_repo_url_or_local_path> [--output <dir>] [--verbose]`

Runs the full documentation pipeline and writes:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

into the resolved output directory.

## Primary Functions

### `generateRepositoryDocs(input, options)`

Main public workflow entry.

Responsibilities:

- resolve input source
- prepare a GitHub repository cache when needed
- analyze the repository
- generate markdown
- write output files

### `generateRepositoryDocsFromPath(rootPath, options)`

Runs the analysis and markdown pipeline for an already-local repository path.

### `analyzeRepositoryPath(rootPath, source)`

Builds the complete `AnalysisResult` used by the markdown generators.

### `generateDocs(analysis)`

Returns the markdown content for:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

## Input and Repository Preparation

### `resolveRepositorySource(input, cacheRoot?)`

Accepts either a GitHub URL or a local path and returns a normalized `RepositorySource`.

### `normalizeGithubUrl(rawUrl, cacheRoot?)`

Validates a GitHub repository URL and returns its normalized clone metadata.

### `prepareRepository(rawUrl, options?)`

Clones or refreshes a cached GitHub repository and returns a ready-to-analyze local checkout.

### `syncRepositoryToCache(options)`

Low-level Git sync step used by `prepareRepository`.

## Analysis Functions

### `scanRepository(rootPath, repoName?)`

Discovers files, directories, manifests, source files, and language distribution.

### `detectDependencies(snapshot)`

Parses supported manifests and emits normalized dependency information.

### `buildProjectInsights(snapshot, dependencies, entrypoints)`

Detects:

- package manager
- scripts
- frameworks
- build/test/lint tooling
- config files
- environment files
- notable patterns

### `extractSymbolInsights(snapshot)`

Extracts exported symbols, HTTP endpoints, import relationships, and export counts from TypeScript, JavaScript, Python, Go, and Rust source files, including mounted router prefix composition for effective HTTP paths.

### `detectEntrypoints(snapshot, packageManifest, endpoints)`

Finds likely application or library entry points.

### `analyzeArchitecture(snapshot, dependencies, entrypoints, symbols, endpoints, projectInsights, localImportGraph, fileExportCounts)`

Produces module summaries, project kind, and data-flow notes.

## Generation Functions

### `generateReadme(analysis)`

Builds an onboarding-oriented README using grounded repository facts.

### `generateArchitectureDoc(analysis)`

Builds a system-oriented architecture document focused on structure and flow.

### `generateApiDoc(analysis)`

Builds an API-oriented document from detected routes and exported symbols.

### `writeDocs(docs, outputDir)`

Writes the generated markdown files to the resolved destination.

## Important Types

### `RepositorySource`

Normalized description of the analysis target.

### `RepositorySnapshot`

Low-level repository scan results.

### `ProjectInsights`

Higher-level tooling and configuration signals.

### `AnalysisResult`

The final structured analysis used to generate markdown.

### `GeneratedDocs`

The rendered markdown output strings.
