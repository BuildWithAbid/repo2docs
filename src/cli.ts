#!/usr/bin/env node
import { Repo2DocsError } from "./core/errors";
import { generateRepositoryDocs } from "./index";
import { createLogger } from "./utils/logger";

function printUsage(): void {
  console.log("Usage: repo2docs <github_repo_url>");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(args.length === 1 ? 0 : 1);
  }

  const logger = createLogger();

  try {
    const result = await generateRepositoryDocs(args[0], {
      outputDir: process.cwd(),
      logger
    });

    logger.info(`Generated documentation for ${result.analysis.source.owner}/${result.analysis.source.repo}`);
    logger.info(`README.md -> ${result.writtenFiles.files["README.md"]}`);
    logger.info(`ARCHITECTURE.md -> ${result.writtenFiles.files["ARCHITECTURE.md"]}`);
    logger.info(`API.md -> ${result.writtenFiles.files["API.md"]}`);
  } catch (error) {
    if (error instanceof Repo2DocsError) {
      console.error(error.message);
      process.exit(1);
    }

    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

void main();

