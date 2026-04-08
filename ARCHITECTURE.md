# repo2docs Architecture

## Overview

`repo2docs` is a staged documentation pipeline. It resolves an input source, prepares a repository if needed, runs deterministic analysis passes, and renders three markdown outputs into a dedicated directory.

The codebase stays intentionally small: each stage owns one responsibility and exchanges typed data structures instead of hidden side effects.

## Runtime Flow

```text
CLI
  -> Parse arguments
  -> Resolve input source (GitHub URL or local path)
  -> Clone or refresh repository cache when needed
  -> Scan repository tree
  -> Detect manifests, dependencies, scripts, tooling, and config files
  -> Extract symbols, routes, and import relationships
  -> Infer architecture and module roles
  -> Render README.md, ARCHITECTURE.md, API.md
  -> Write files to repo2docs-output/<repo>/ or a custom --output path
```

## Main Modules

### `src/cli.ts`

Parses arguments, prints help text, configures logging, and handles process exit behavior.

### `src/input/source-resolver.ts`

Determines whether the input is a GitHub URL or a local path and normalizes it into a shared `RepositorySource`.

### `src/git/repo-manager.ts`

Handles GitHub-specific repository preparation:

- URL normalization
- cache path selection
- `git clone`
- `git fetch`
- branch checkout

### `src/analyze/repo-scanner.ts`

Builds the repository snapshot:

- file and directory entries
- source file list
- manifest discovery
- language counts
- repository tree rendering

### `src/analyze/dependency-detector.ts`

Parses supported manifests and normalizes dependency metadata.

### `src/analyze/project-insights.ts`

Builds higher-level repository facts:

- package manager
- scripts
- framework signals
- build/test/lint tooling
- config files
- environment files
- notable repository patterns

### `src/analyze/symbol-extractor.ts`

Uses the TypeScript compiler API plus lightweight language heuristics to extract:

- exported functions
- exported classes
- exported interfaces and types
- default exports
- re-exported public symbols
- HTTP routes from common JS, Python, Go, and Rust patterns
- local import relationships

### `src/analyze/entrypoint-detector.ts`

Detects entry points from:

- `package.json` fields
- CLI `bin` declarations
- conventional bootstrap filenames
- route-bearing files

### `src/analyze/architecture-analyzer.ts`

Infers:

- project kind
- module roles
- module summaries
- high-level data flow

### `src/generate/`

Contains the markdown renderers. These modules are intentionally pure: they consume an `AnalysisResult` and return strings.

### `src/output/write-docs.ts`

Writes the final markdown files to the resolved output directory.

## Core Data Model

### `RepositorySource`

Normalized input metadata shared across GitHub and local-path flows.

### `RepositorySnapshot`

Low-level repository facts collected during scanning.

### `ProjectInsights`

Higher-level heuristics about frameworks, tooling, scripts, config files, and patterns.

### `AnalysisResult`

The main analysis artifact consumed by the markdown generators.

## Design Decisions

### Deterministic output

The tool does not rely on AI calls. Every sentence is built from code structure, manifests, and naming heuristics so output stays reproducible and inexpensive.

### Incremental analysis

The repository is analyzed in layers: scan first, then manifests and dependencies, then symbols and routes, then architecture. This keeps each pass understandable and testable.

### Conservative documentation

The generators avoid unsupported claims. If the repository does not provide enough evidence, the tool leaves sections out instead of filling them with invented content.

### Dedicated output folder

Version 2 no longer writes into the current working directory by default. The dedicated output folder reduces accidental overwrites and makes repeated runs safer.

## Testing

The project uses Node's built-in test runner with:

- unit tests for URL and input resolution
- integration tests for analysis and output generation
- repository sync tests against temporary local Git repos

The fixture repository under `test/fixtures/basic-node-app` is intentionally rich enough to exercise entry-point detection, route detection, tooling detection, config detection, and output rendering.
