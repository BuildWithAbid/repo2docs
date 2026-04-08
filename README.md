# repo2docs

`repo2docs` is a TypeScript CLI that analyzes a GitHub repository or local project directory and generates three developer-facing documents:

- `README.md`
- `ARCHITECTURE.md`
- `API.md`

Version 2.1 focuses on output quality, code-aware heuristics, local-path support, and safer default behavior.

## What v2 Improves

- Supports both GitHub repository URLs and local paths.
- Writes generated docs into a dedicated folder by default: `repo2docs-output/<repo>/`.
- Produces less generic documentation by grounding output in detected entry points, scripts, modules, routes, frameworks, tooling, and config files.
- Detects package managers, build tools, test setup, linting, CI signals, environment files, and notable repository patterns.
- Improves CLI help text, terminal output, and error messages.
- Expands automated tests around analysis, repository syncing, and input resolution.
- Composes mounted router prefixes into effective HTTP endpoints such as `/api/users`, not just raw router-local paths.
- Reuses shared markdown helpers so the generated documents stay structurally consistent.

## Install

```bash
npm install
npm run build
```

## Usage

### Analyze a GitHub repository

```bash
repo2docs https://github.com/owner/repository
```

### Analyze a local repository

```bash
repo2docs .
```

### Write output to a custom folder

```bash
repo2docs ../my-service --output ./docs-output/my-service
```

### Show CLI help

```bash
repo2docs --help
```

## Default Output

If `--output` is not provided, `repo2docs` writes generated documents to:

```text
repo2docs-output/<repo-name>/
```

Example:

```text
repo2docs-output/my-service/README.md
repo2docs-output/my-service/ARCHITECTURE.md
repo2docs-output/my-service/API.md
```

## What the Tool Detects

### Repository structure

- source files and directory layout
- likely entry points
- important modules
- language distribution

### Tooling and runtime signals

- package manager
- build tools
- test setup
- lint and formatting tools
- CI workflow files
- environment and deployment files

### Code surface

- exported functions
- exported classes
- exported interfaces and types
- HTTP endpoints across common JS, Python, Go, and Rust server patterns
- mounted router prefixes for effective route reporting
- re-exported public module surfaces
- local import relationships used for module summaries

## Generated Documents

### `README.md`

Focused on onboarding:

- project overview
- quick facts
- getting started steps
- detected scripts
- entry points
- important modules
- dependencies
- configuration surface

### `ARCHITECTURE.md`

Focused on system understanding:

- system shape
- entry points
- module map
- data flow
- tooling and config surface
- notable patterns

### `API.md`

Focused on public code surface:

- primary entry points
- HTTP endpoints
- exported symbols grouped by module

## Project Structure

```text
src/
  analyze/   Repository scanning, heuristics, and architecture inference
  core/      Shared types and operational errors
  generate/  Markdown document renderers
  git/       GitHub clone and fetch support
  input/     Input resolution for GitHub URLs and local paths
  output/    Output writing
  utils/     Shared helpers
test/
  fixtures/     Sample repositories used by tests
  integration/  End-to-end behavior tests
  unit/         Focused logic tests
```

## Development

```bash
npm run build
npm test
```

## Constraints and Philosophy

- deterministic heuristics over AI calls
- minimal dependencies
- practical output over speculative documentation
- simple architecture that is easy to extend

## License

MIT
