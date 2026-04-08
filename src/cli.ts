#!/usr/bin/env node
import * as path from "node:path";
import { Repo2DocsError } from "./core/errors";
import { generateRepositoryDocs } from "./index";
import { createLogger } from "./utils/logger";

interface CliOptions {
  input?: string;
  outputDir?: string;
  verbose: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log([
    "repo2docs v2",
    "",
    "Generate README, architecture, and API documentation from a GitHub repository or local path.",
    "",
    "Usage:",
    "  repo2docs <github_repo_url_or_local_path> [--output <dir>] [--verbose]",
    "",
    "Options:",
    "  -h, --help         Show help text",
    "  -o, --output <dir> Write generated files into the given directory",
    "  -v, --verbose      Show debug logging",
    "",
    "Examples:",
    "  repo2docs https://github.com/octocat/Hello-World",
    "  repo2docs .",
    "  repo2docs ../my-service --output ./docs-output/my-service"
  ].join("\n"));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    verbose: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "-h" || argument === "--help") {
      options.help = true;
      continue;
    }

    if (argument === "-v" || argument === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (argument === "-o" || argument === "--output") {
      const outputValue = argv[index + 1];
      if (!outputValue || outputValue.startsWith("-")) {
        throw new Repo2DocsError("The --output option requires a directory path.", "INVALID_CLI_ARGS");
      }
      options.outputDir = path.resolve(outputValue);
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Repo2DocsError(`Unknown option: ${argument}`, "INVALID_CLI_ARGS");
    }

    if (options.input) {
      throw new Repo2DocsError("Only one repository input may be provided.", "INVALID_CLI_ARGS");
    }

    options.input = argument;
  }

  return options;
}

async function main(): Promise<void> {
  let options: CliOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("");
    printHelp();
    process.exit(1);
    return;
  }

  if (options.help || !options.input) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  const logger = createLogger({ verbose: options.verbose });

  try {
    const result = await generateRepositoryDocs(options.input, {
      outputDir: options.outputDir,
      logger
    });

    logger.info("");
    logger.info(`Generated documentation for ${result.analysis.source.repo}`);
    logger.info(`Output directory: ${result.writtenFiles.outputDir}`);
    logger.info(`README.md -> ${result.writtenFiles.files["README.md"]}`);
    logger.info(`ARCHITECTURE.md -> ${result.writtenFiles.files["ARCHITECTURE.md"]}`);
    logger.info(`API.md -> ${result.writtenFiles.files["API.md"]}`);
  } catch (error) {
    if (error instanceof Repo2DocsError) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }

    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

void main();
