# repo2docs Architecture

## Overview

`repo2docs` is a modular Node.js CLI that converts repository metadata and static code signals into structured markdown documentation. The design is intentionally simple: each stage has a narrow responsibility, deterministic inputs, and text-based outputs that are easy to test.

## Architecture Goals

- Keep runtime dependencies minimal.
- Prefer deterministic heuristics over opaque generation.
- Separate repository access, analysis, and markdown rendering.
- Keep modules pure where possible so they are easy to unit test.
- Fail clearly when Git operations, URL validation, or file writes fail.

## End-to-End Flow

```text
CLI
  -> Repository URL validation
  -> Git clone or fetch into cache
  -> Repository scan
  -> Manifest and dependency detection
  -> Symbol and endpoint extraction
  -> Architecture and module inference
  -> Markdown generation
  -> Write README.md, ARCHITECTURE.md, API.md
```

## Module Breakdown

### `src/cli.ts`

Handles argument validation, process exit behavior, and user-facing progress logging.

### `src/index.ts`

Acts as the application orchestrator. It connects repository preparation, analysis, document generation, and output writing into a single workflow.

### `src/git/`

Responsible for GitHub URL normalization, repository cache path generation, `git clone`, `git fetch`, branch checkout, and revision tracking.

### `src/analyze/`

Contains the codebase intelligence pipeline.

- `repo-scanner.ts`
  builds the file inventory, source file list, manifest list, language distribution, and tree view.
- `dependency-detector.ts`
  parses supported manifests and normalizes dependency metadata.
- `entrypoint-detector.ts`
  identifies CLI bins, package entry points, and conventional bootstrap files.
- `symbol-extractor.ts`
  uses the TypeScript compiler API to extract exported symbols and Express-style HTTP endpoints.
- `architecture-analyzer.ts`
  groups files into major modules, infers project type, and produces high-level system summaries.

### `src/generate/`

Contains pure markdown renderers for each output document.

- `readme-generator.ts`
- `architecture-generator.ts`
- `api-generator.ts`

### `src/output/`

Writes the generated markdown documents to the selected output directory.

### `src/core/`

Defines shared domain types and operational error classes used across the application.

### `src/utils/`

Holds low-level shared helpers for path normalization, text formatting, and logging.

## Data Model

The internal pipeline is centered around a few stable structures:

- `RepositorySource`
  normalized repository metadata and cache location
- `RepositorySnapshot`
  scanned files, manifests, directory tree, and language distribution
- `AnalysisResult`
  entry points, modules, symbols, dependencies, endpoints, and architecture summary
- `GeneratedDocs`
  final markdown output for `README.md`, `ARCHITECTURE.md`, and `API.md`

## Design Decisions

### Deterministic generation

The project does not call external AI services. All summaries are generated from rules and naming heuristics so results stay reproducible and inexpensive.

### Narrow module responsibilities

The implementation keeps each phase separate. This makes it straightforward to improve one part of the analysis pipeline without changing the rest of the system.

### Conservative extraction

The symbol extraction logic only documents code it can detect with reasonable confidence. When a public API is unclear, the tool prefers omission over speculative documentation.

## Error Handling

Errors are surfaced through a dedicated `Repo2DocsError` type when they are expected operational failures, such as:

- invalid repository URLs
- unsupported hosts
- Git command failures
- write failures

Unexpected exceptions still fail the CLI with a non-zero exit code.

## Testing Strategy

The test suite is split into:

- unit tests for isolated helpers and URL normalization
- integration tests for repository analysis and markdown generation
- repository sync tests using temporary local Git repositories

The fixture repository under `test/fixtures/basic-node-app` provides a stable target for analysis assertions.

## Extension Points

The current design can be extended cleanly in these areas:

- add more manifest parsers in `dependency-detector.ts`
- add more language-specific extractors alongside `symbol-extractor.ts`
- add configurable markdown templates in the generator layer
- add output profiles or custom destinations in the write layer

