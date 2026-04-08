# repo2docs: Generate Documentation from a GitHub Repository

`repo2docs` is a TypeScript CLI that clones a GitHub repository, analyzes its structure with deterministic heuristics, and generates production-ready project documentation without calling external AI services.

The tool is designed for engineers who need a fast way to create a high-quality `README.md`, `ARCHITECTURE.md`, and `API.md` from an existing codebase.

## Why repo2docs

Maintaining technical documentation is usually delayed because it is repetitive and expensive. `repo2docs` reduces that work by converting repository structure, manifests, exports, entry points, and HTTP routes into clear markdown files that teams can review and refine.

## Key Features

- Clone or refresh a GitHub repository into a local cache.
- Parse repository structure, source files, and common manifests.
- Detect entry points from package metadata and conventional filenames.
- Extract exported functions, classes, interfaces, and HTTP endpoints from TypeScript and JavaScript projects.
- Generate three documentation files: `README.md`, `ARCHITECTURE.md`, and `API.md`.
- Produce deterministic output with no paid APIs and no external AI dependency.

## How It Works

`repo2docs` runs a straightforward pipeline:

1. Validate the GitHub repository URL.
2. Clone or refresh the repository in a local cache directory.
3. Scan files, directories, manifests, and language distribution.
4. Detect entry points, modules, exported symbols, and route handlers.
5. Generate markdown documentation and write it to the current working directory.

## Installation

### Local development

```bash
npm install
npm run build
```

### Run locally

```bash
node dist/src/cli.js https://github.com/owner/repository
```

## CLI Usage

```bash
repo2docs <github_repo_url>
```

### Example

```bash
repo2docs https://github.com/octocat/Hello-World
```

The command writes the following files into the current working directory:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

## Generated Documentation

### README.md

Generates a project overview, setup guidance, usage hints, a technology snapshot, and a repository structure summary.

### ARCHITECTURE.md

Explains system design, entry points, main modules, dependency signals, and inferred data flow.

### API.md

Documents exported symbols and detected HTTP endpoints, grouped by source module.

## Supported Analysis Heuristics

### Repository discovery

- Directory tree traversal
- Source file detection
- Language distribution by file extension
- Common ignore rules for build artifacts and vendored folders

### Manifest parsing

- `package.json`
- `tsconfig.json`
- `requirements.txt`
- `pyproject.toml`
- `go.mod`
- `Cargo.toml`

### Code analysis

- Exported TypeScript and JavaScript functions
- Exported classes, interfaces, and types
- CLI entry points from `bin`, `main`, `module`, and `exports`
- Conventional entry points such as `src/index.ts`, `src/main.ts`, and server bootstrap files
- Express-style route detection for common HTTP methods

## Project Structure

```text
repo2docs/
├── src/
│   ├── analyze/
│   ├── core/
│   ├── generate/
│   ├── git/
│   ├── output/
│   └── utils/
├── test/
│   ├── fixtures/
│   ├── integration/
│   └── unit/
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
npm run build
npm test
```

## Limitations

- Version 1 is strongest on TypeScript and JavaScript repositories.
- Analysis is heuristic and intentionally conservative.
- Private GitHub repositories are not handled automatically by the current CLI workflow.
- The generated output should be reviewed before publishing in customer-facing environments.

## Roadmap

- Better support for Python, Go, and Rust symbol extraction
- Monorepo-aware package summaries
- Configurable output paths and formatting profiles
- Optional repository-level templates for custom documentation style

## License

MIT
