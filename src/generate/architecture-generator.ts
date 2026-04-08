import type { AnalysisResult } from "../core/types";
import { formatList, renderCodeBlock } from "../utils/text";

function appendSection(sections: string[], title: string, body: string[]): void {
  if (body.length === 0) {
    return;
  }

  sections.push("", `## ${title}`, "", ...body);
}

function describeApplicationStack(analysis: AnalysisResult): string {
  const frameworkNames = analysis.projectInsights.frameworks
    .filter((framework) => framework.category === "frontend" || framework.category === "backend" || framework.category === "fullstack" || framework.category === "runtime")
    .map((framework) => framework.name);

  return frameworkNames.length > 0 ? frameworkNames.join(", ") : "None confidently detected";
}

function renderModuleLines(analysis: AnalysisResult): string[] {
  return analysis.modules.slice(0, 10).map((moduleInfo) => {
    const fileNotes = moduleInfo.notableFiles.length > 0 ? ` Files: ${moduleInfo.notableFiles.join(", ")}.` : "";
    const symbolNotes = moduleInfo.topSymbols.length > 0 ? ` Top exports: ${moduleInfo.topSymbols.join(", ")}.` : "";
    return `\`${moduleInfo.path}\` (${moduleInfo.role}, ${moduleInfo.fileCount} files) - ${moduleInfo.summary}${fileNotes}${symbolNotes}`;
  });
}

export function generateArchitectureDoc(analysis: AnalysisResult): string {
  const sections: string[] = [
    "# Architecture",
    "",
    analysis.architecture.overview
  ];

  appendSection(
    sections,
    "System Shape",
    formatList([
      `Project type: ${analysis.architecture.projectKind}`,
      `Primary language: ${Object.entries(analysis.snapshot.languageStats).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Unknown"}`,
      `Package manager: ${analysis.projectInsights.packageManager ?? "Not confidently detected"}`,
      `Frameworks: ${describeApplicationStack(analysis)}`
    ]).split("\n")
  );

  if (analysis.entrypoints.length > 0) {
    appendSection(
      sections,
      "Entrypoints",
      formatList(analysis.entrypoints.map((entrypoint) => `\`${entrypoint.relativePath}\` [${entrypoint.confidence}] ${entrypoint.evidence}`)).split("\n")
    );
  }

  if (analysis.modules.length > 0) {
    appendSection(sections, "Module Map", formatList(renderModuleLines(analysis)).split("\n"));
  }

  if (analysis.architecture.dataFlow.length > 0) {
    appendSection(sections, "Data Flow", formatList(analysis.architecture.dataFlow).split("\n"));
  }

  if (analysis.projectInsights.configFiles.length > 0 || analysis.projectInsights.environmentFiles.length > 0) {
    appendSection(
      sections,
      "Configuration Surface",
      formatList(
        analysis.projectInsights.configFiles
          .slice(0, 12)
          .map((configFile) => `\`${configFile.path}\` - ${configFile.description}`)
      ).split("\n")
    );
  }

  if (
    analysis.projectInsights.tooling.buildTools.length > 0 ||
    analysis.projectInsights.tooling.testTools.length > 0 ||
    analysis.projectInsights.tooling.lintTools.length > 0 ||
    analysis.projectInsights.tooling.ciTools.length > 0
  ) {
    appendSection(
      sections,
      "Tooling",
      formatList([
        `Build tools: ${analysis.projectInsights.tooling.buildTools.length > 0 ? analysis.projectInsights.tooling.buildTools.join(", ") : "None detected"}`,
        `Test tools: ${analysis.projectInsights.tooling.testTools.length > 0 ? analysis.projectInsights.tooling.testTools.join(", ") : "None detected"}`,
        `Linting and formatting: ${analysis.projectInsights.tooling.lintTools.length > 0 ? analysis.projectInsights.tooling.lintTools.join(", ") : "None detected"}`,
        `CI signals: ${analysis.projectInsights.tooling.ciTools.length > 0 ? analysis.projectInsights.tooling.ciTools.join(", ") : "None detected"}`
      ]).split("\n")
    );
  }

  if (analysis.projectInsights.notablePatterns.length > 0) {
    appendSection(sections, "Notable Patterns", formatList(analysis.projectInsights.notablePatterns).split("\n"));
  }

  appendSection(
    sections,
    "Repository Tree",
    [renderCodeBlock("text", [analysis.snapshot.repoName, ...analysis.snapshot.treeLines.slice(0, 100)])]
  );

  return sections.join("\n");
}
