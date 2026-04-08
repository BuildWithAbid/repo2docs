import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GeneratedDocs, WriteResult } from "../core/types";

export async function writeDocs(docs: GeneratedDocs, outputDir: string): Promise<WriteResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const files = {
    "README.md": path.join(outputDir, "README.md"),
    "ARCHITECTURE.md": path.join(outputDir, "ARCHITECTURE.md"),
    "API.md": path.join(outputDir, "API.md")
  } as const;

  await Promise.all([
    fs.writeFile(files["README.md"], docs.readme, "utf8"),
    fs.writeFile(files["ARCHITECTURE.md"], docs.architecture, "utf8"),
    fs.writeFile(files["API.md"], docs.api, "utf8")
  ]);

  return {
    outputDir,
    files
  };
}

