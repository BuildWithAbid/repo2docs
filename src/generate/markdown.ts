import type { AnalysisResult } from "../core/types";

export function appendSection(sections: string[], title: string, body: string[]): void {
  if (body.length === 0) {
    return;
  }

  sections.push("", `## ${title}`, "", ...body);
}

export function describeApplicationStack(analysis: AnalysisResult): string {
  const frameworkNames = analysis.projectInsights.frameworks
    .filter((framework) => framework.category === "frontend" || framework.category === "backend" || framework.category === "fullstack" || framework.category === "runtime")
    .map((framework) => framework.name);

  return frameworkNames.length > 0 ? frameworkNames.join(", ") : "None confidently detected";
}
