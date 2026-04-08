# repo2docs API Reference

## CLI Command

### `repo2docs <github_repo_url>`

Runs the full documentation pipeline for a GitHub repository and writes:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

## Public Application Functions

### `generateRepositoryDocs(rawRepoUrl, options)`

High-level entry point for the CLI workflow.

Responsibilities:

- prepare the repository cache
- analyze the cloned repository
- generate markdown documents
- write output files to disk

Returns a `GenerateRepositoryDocsResult` object containing analysis data, generated markdown, and output file paths.

### `generateRepositoryDocsFromPath(rootPath, options)`

Runs the same documentation pipeline against a local repository path instead of cloning from GitHub.

Use this in tests or local integrations where the repository already exists on disk.

### `analyzeRepositoryPath(rootPath, source)`

Runs repository scanning, dependency detection, symbol extraction, entry-point detection, and architecture inference for a local repository path.

Returns a structured `AnalysisResult`.

### `generateDocs(analysis)`

Converts a completed `AnalysisResult` into a `GeneratedDocs` object with markdown content for all three documents.

## Git Layer

### `normalizeGithubUrl(rawUrl, cacheRoot?)`

Validates a GitHub repository URL and converts it into a normalized `RepositorySource`.

Key outputs:

- repository owner
- repository name
- canonical clone URL
- cache directory path

### `syncRepositoryToCache(options)`

Clones the repository if the cache does not exist, otherwise fetches the remote and updates the cached checkout.

Returns:

- `cachePath`
- `currentRevision`
- `defaultBranch`

### `prepareRepository(rawUrl, options?)`

Combines URL normalization and repository synchronization into a single call used by the CLI entrypoint.

## Analysis Layer

### `scanRepository(rootPath, repoName?)`

Walks the repository tree, applies ignore rules, collects manifests, identifies source files, and builds a tree representation used in generated docs.

### `detectDependencies(snapshot)`

Parses supported manifests and normalizes dependency data into a shared structure.

Currently supports:

- `package.json`
- `tsconfig.json`
- `requirements.txt`
- `pyproject.toml`
- `go.mod`
- `Cargo.toml`

### `detectEntrypoints(snapshot, packageManifest, endpoints)`

Detects likely project entry points using package metadata, conventional filenames, and discovered HTTP endpoint files.

### `extractSymbolInsights(snapshot)`

Uses the TypeScript compiler API to extract:

- exported functions
- exported classes
- exported interfaces and types
- Express-style route registrations
- local import graph relationships

### `analyzeArchitecture(snapshot, dependencies, entrypoints, symbols, endpoints, localImportGraph, fileExportCounts)`

Infers project kind, groups files into modules, summarizes system flow, and produces architecture notes.

## Document Generation Layer

### `generateReadme(analysis)`

Builds a repository overview document intended for onboarding and repository landing pages.

### `generateArchitectureDoc(analysis)`

Builds a technical system overview focused on structure, modules, entry points, and dependency signals.

### `generateApiDoc(analysis)`

Builds a public API overview by grouping exported symbols and HTTP endpoints by module.

## Output Layer

### `writeDocs(docs, outputDir)`

Creates the output directory when needed and writes:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

Returns the resolved file paths for the generated documents.

## Core Types

### `RepositorySource`

Normalized metadata for the requested repository, including cache location and canonical clone URL.

### `RepositorySnapshot`

The static view of the scanned repository:

- entries
- source files
- language distribution
- manifest data
- tree lines
- warnings

### `AnalysisResult`

The central analysis object used by the generator layer. It includes:

- dependencies
- entry points
- modules
- symbols
- endpoints
- architecture summary
- repository overview

### `GeneratedDocs`

Final markdown strings for the generated documentation files.

### `WriteResult`

Resolved output directory and generated file paths.

