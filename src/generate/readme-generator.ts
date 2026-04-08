import type { AnalysisResult } from "../core/types";
import { formatList, renderCodeBlock } from "../utils/text";

function renderTree(analysis: AnalysisResult): string {
  const treeLines = analysis.snapshot.treeLines.slice(0, 120);
  if (analysis.snapshot.treeLines.length > treeLines.length) {
    treeLines.push(`... (${analysis.snapshot.treeLines.length - treeLines.length} more entries omitted)`);
  }

  return renderCodeBlock("text", [analysis.snapshot.repoName, ...treeLines]);
}

function inferSetupSteps(analysis: AnalysisResult): string[] {
  const packageManifest = analysis.snapshot.manifests.packageJson;
  if (packageManifest) {
    const commands = ["Install dependencies with `npm install`."];
    if (packageManifest.scripts.build) {
      commands.push("Build the project with `npm run build`.");
    }
    if (packageManifest.scripts.test) {
      commands.push("Run the test suite with `npm test` or the repository's configured test command.");
    }
    return commands;
  }

  if (analysis.snapshot.manifests.requirementsTxt) {
    return [
      "Create a virtual environment if needed.",
      "Install dependencies with `pip install -r requirements.txt`."
    ];
  }

  return ["Review the repository manifests to install dependencies before running the project."];
}

function inferUsage(analysis: AnalysisResult): string[] {
  const packageManifest = analysis.snapshot.manifests.packageJson;
  const usageNotes: string[] = [];

  for (const entrypoint of analysis.entrypoints.slice(0, 3)) {
    usageNotes.push(`Primary entrypoint: \`${entrypoint.relativePath}\` (${entrypoint.evidence}).`);
  }

  if (packageManifest?.scripts.start) {
    usageNotes.push("Start the application with the repository's `npm start` script.");
  } else if (packageManifest?.scripts.dev) {
    usageNotes.push("Use the `npm run dev` script for local development.");
  }

  if (analysis.endpoints.length > 0) {
    const sampleEndpoints = analysis.endpoints.slice(0, 5).map((endpoint) => `${endpoint.method} ${endpoint.routePath}`);
    usageNotes.push(`Detected HTTP surface: ${sampleEndpoints.join(", ")}.`);
  }

  return usageNotes.length > 0
    ? usageNotes
    : ["Inspect the detected entrypoints to determine how the project is started or consumed."];
}

export function generateReadme(analysis: AnalysisResult): string {
  const packageManifest = analysis.snapshot.manifests.packageJson;
  const title = packageManifest?.name ?? analysis.snapshot.repoName;
  const primaryLanguage = Object.entries(analysis.snapshot.languageStats).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Unknown";
  const setupSteps = inferSetupSteps(analysis);
  const usageSteps = inferUsage(analysis);
  const moduleSummary = analysis.modules.slice(0, 6).map((moduleInfo) => `${moduleInfo.path}: ${moduleInfo.summary}`);

  return [
    `# ${title}`,
    "",
    "## Overview",
    "",
    packageManifest?.description ?? analysis.overview,
    "",
    "## Technology Snapshot",
    "",
    formatList([
      `Project type: ${analysis.architecture.projectKind}`,
      `Primary language: ${primaryLanguage}`,
      `Source files scanned: ${analysis.snapshot.sourceFiles.length}`,
      `Dependencies detected: ${analysis.dependencies.length}`
    ]),
    "",
    "## Project Structure",
    "",
    renderTree(analysis),
    "",
    "## Setup",
    "",
    formatList(setupSteps),
    "",
    "## Usage",
    "",
    formatList(usageSteps),
    "",
    "## Key Modules",
    "",
    formatList(moduleSummary.length > 0 ? moduleSummary : ["No strong module boundaries were detected."])
  ].join("\n");
}

