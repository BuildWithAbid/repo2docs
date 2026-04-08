import type { AnalysisResult } from "../core/types";
import { formatList, renderCodeBlock } from "../utils/text";

function renderModuleSection(analysis: AnalysisResult): string {
  if (analysis.modules.length === 0) {
    return "- No major modules detected.";
  }

  return analysis.modules
    .map((moduleInfo) => `- \`${moduleInfo.path}\` (${moduleInfo.fileCount} files, ${moduleInfo.exportCount} exports): ${moduleInfo.summary}`)
    .join("\n");
}

export function generateArchitectureDoc(analysis: AnalysisResult): string {
  const dependencySummary = analysis.dependencies.length > 0
    ? formatList(analysis.dependencies.slice(0, 12).map((dependency) => `${dependency.name}${dependency.version ? ` (${dependency.version})` : ""} from ${dependency.sourceFile}`))
    : "- No dependencies detected from supported manifests.";

  const entrypointSummary = analysis.entrypoints.length > 0
    ? formatList(analysis.entrypoints.map((entrypoint) => `${entrypoint.relativePath} [${entrypoint.confidence}] ${entrypoint.evidence}`))
    : "- No entrypoints detected.";
  const dataFlowSummary = analysis.architecture.dataFlow.length > 0
    ? formatList(analysis.architecture.dataFlow)
    : "- No execution flow was confidently inferred from static analysis.";

  return [
    "# Architecture",
    "",
    "## System Overview",
    "",
    analysis.architecture.overview,
    "",
    "## Entrypoints",
    "",
    entrypointSummary,
    "",
    "## Main Modules",
    "",
    renderModuleSection(analysis),
    "",
    "## Data Flow",
    "",
    dataFlowSummary,
    "",
    "## Dependency Snapshot",
    "",
    dependencySummary,
    "",
    "## Repository Tree",
    "",
    renderCodeBlock("text", [analysis.snapshot.repoName, ...analysis.snapshot.treeLines.slice(0, 120)])
  ].join("\n");
}
