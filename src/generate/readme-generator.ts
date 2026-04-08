import type { AnalysisResult, DependencyInfo, ScriptInfo } from "../core/types";
import { appendSection, describeApplicationStack } from "./markdown";
import { formatList, renderCodeBlock } from "../utils/text";

function renderTree(analysis: AnalysisResult): string {
  const treeLines = analysis.snapshot.treeLines.slice(0, 80);
  if (analysis.snapshot.treeLines.length > treeLines.length) {
    treeLines.push(`... (${analysis.snapshot.treeLines.length - treeLines.length} more entries omitted)`);
  }

  return renderCodeBlock("text", [analysis.snapshot.repoName, ...treeLines]);
}

function getInstallCommand(packageManager: string | undefined): string {
  switch (packageManager) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

function getRunScriptCommand(packageManager: string | undefined, scriptName: string): string {
  switch (packageManager) {
    case "yarn":
      return `yarn ${scriptName}`;
    case "pnpm":
      return `pnpm ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}

function selectInterestingScripts(scripts: ScriptInfo[]): ScriptInfo[] {
  const preferredOrder: ScriptInfo["category"][] = ["dev", "start", "build", "test", "lint", "format", "release", "other"];
  return [...scripts]
    .sort((left, right) => preferredOrder.indexOf(left.category) - preferredOrder.indexOf(right.category) || left.name.localeCompare(right.name))
    .slice(0, 8);
}

function buildGettingStarted(analysis: AnalysisResult): string[] {
  const steps: string[] = [];
  const packageManager = analysis.projectInsights.packageManager;

  if (analysis.snapshot.manifests.packageJson) {
    steps.push(`Install dependencies with \`${getInstallCommand(packageManager)}\`.`);
  } else if (analysis.snapshot.manifests.requirementsTxt) {
    steps.push("Install dependencies with `pip install -r requirements.txt`.");
  }

  if (analysis.projectInsights.environmentFiles.length > 0) {
    steps.push(`Review environment files before running the project: ${analysis.projectInsights.environmentFiles.map((item) => `\`${item}\``).join(", ")}.`);
  }

  const devScript = analysis.projectInsights.scripts.find((script) => script.category === "dev");
  const startScript = analysis.projectInsights.scripts.find((script) => script.category === "start");
  const testScript = analysis.projectInsights.scripts.find((script) => script.category === "test");

  if (devScript) {
    steps.push(`Start the local development workflow with \`${getRunScriptCommand(packageManager, devScript.name)}\`.`);
  } else if (startScript) {
    steps.push(`Run the application with \`${getRunScriptCommand(packageManager, startScript.name)}\`.`);
  } else if (analysis.entrypoints[0]) {
    steps.push(`Start from the detected entrypoint \`${analysis.entrypoints[0].relativePath}\`.`);
  }

  if (testScript) {
    steps.push(`Run the test suite with \`${getRunScriptCommand(packageManager, testScript.name)}\`.`);
  }

  return steps;
}

function groupDependencies(dependencies: DependencyInfo[]): string[] {
  return dependencies
    .filter((dependency) => dependency.group === "runtime" || dependency.group === "development")
    .slice(0, 12)
    .map((dependency) => `${dependency.name}${dependency.version ? ` (${dependency.version})` : ""}${dependency.group ? ` - ${dependency.group}` : ""}`);
}

export function generateReadme(analysis: AnalysisResult): string {
  const packageManifest = analysis.snapshot.manifests.packageJson;
  const title = packageManifest?.name ?? analysis.snapshot.repoName;
  const primaryLanguage = Object.entries(analysis.snapshot.languageStats).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Unknown";
  const quickFacts = [
    `Project type: ${analysis.architecture.projectKind}`,
    `Primary language: ${primaryLanguage}`,
    `Package manager: ${analysis.projectInsights.packageManager ?? "Not confidently detected"}`,
    `Frameworks and major libraries: ${describeApplicationStack(analysis)}`,
    `Entry points detected: ${analysis.entrypoints.length}`,
    `Source files scanned: ${analysis.snapshot.sourceFiles.length}`
  ];

  const sections: string[] = [
    `# ${title}`,
    "",
    packageManifest?.description ?? analysis.overview
  ];
  const gettingStarted = buildGettingStarted(analysis);

  appendSection(sections, "Overview", [
    analysis.overview,
    ...(analysis.projectInsights.notablePatterns.length > 0 ? ["", ...formatList(analysis.projectInsights.notablePatterns).split("\n")] : [])
  ]);

  appendSection(sections, "Quick Facts", formatList(quickFacts).split("\n"));

  appendSection(
    sections,
    "Getting Started",
    formatList(gettingStarted.length > 0 ? gettingStarted : ["Inspect the detected entrypoints and scripts before running the project."]).split("\n")
  );

  if (analysis.projectInsights.scripts.length > 0) {
    appendSection(
      sections,
      "Scripts",
      formatList(selectInterestingScripts(analysis.projectInsights.scripts).map((script) => `\`${script.name}\`: \`${script.command}\``)).split("\n")
    );
  }

  if (analysis.entrypoints.length > 0) {
    appendSection(
      sections,
      "Entrypoints",
      formatList(analysis.entrypoints.map((entrypoint) => `\`${entrypoint.relativePath}\` [${entrypoint.confidence}] ${entrypoint.evidence}`)).split("\n")
    );
  }

  if (analysis.modules.length > 0) {
    appendSection(
      sections,
      "Important Modules",
      formatList(
        analysis.modules.slice(0, 8).map((moduleInfo) => `\`${moduleInfo.path}\` (${moduleInfo.role}) - ${moduleInfo.summary}`)
      ).split("\n")
    );
  }

  const dependencyLines = groupDependencies(analysis.dependencies);
  if (dependencyLines.length > 0) {
    appendSection(sections, "Dependencies", formatList(dependencyLines).split("\n"));
  }

  if (analysis.projectInsights.configFiles.length > 0 || analysis.projectInsights.environmentFiles.length > 0) {
    appendSection(
      sections,
      "Configuration",
      formatList(
        analysis.projectInsights.configFiles
          .slice(0, 10)
          .map((configFile) => `\`${configFile.path}\` - ${configFile.description}`)
      ).split("\n")
    );
  }

  appendSection(sections, "Repository Structure", [renderTree(analysis)]);

  if (analysis.warnings.length > 0) {
    appendSection(sections, "Analysis Notes", formatList(analysis.warnings.slice(0, 10)).split("\n"));
  }

  return sections.join("\n");
}
