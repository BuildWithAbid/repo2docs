import type { AnalysisResult, SymbolInfo } from "../core/types";

function appendSection(sections: string[], title: string, body: string[]): void {
  if (body.length === 0) {
    return;
  }

  sections.push("", `## ${title}`, "", ...body);
}

function groupSymbolsByModule(symbols: SymbolInfo[]): Map<string, SymbolInfo[]> {
  const grouped = new Map<string, SymbolInfo[]>();

  for (const symbol of symbols) {
    const collection = grouped.get(symbol.modulePath) ?? [];
    collection.push(symbol);
    grouped.set(symbol.modulePath, collection);
  }

  return new Map([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function generateApiDoc(analysis: AnalysisResult): string {
  const sections: string[] = [
    "# API",
    "",
    `Detected ${analysis.symbols.length} exported symbols and ${analysis.endpoints.length} HTTP endpoints using static analysis.`
  ];

  if (analysis.entrypoints.length > 0) {
    appendSection(
      sections,
      "Primary Entrypoints",
      analysis.entrypoints.map((entrypoint) => `- \`${entrypoint.relativePath}\` [${entrypoint.confidence}] ${entrypoint.evidence}`)
    );
  }

  if (analysis.endpoints.length > 0) {
    appendSection(
      sections,
      "HTTP Endpoints",
      analysis.endpoints.map((endpoint) => `- \`${endpoint.method} ${endpoint.routePath}\` in \`${endpoint.filePath}\`${endpoint.handlerName ? ` handled by \`${endpoint.handlerName}\`` : ""}`)
    );
  }

  if (analysis.symbols.length === 0) {
    appendSection(sections, "Exported Symbols", ["No public API surface was confidently detected."]);
    return sections.join("\n");
  }

  const moduleSections: string[] = [];
  for (const [modulePath, symbols] of groupSymbolsByModule(analysis.symbols).entries()) {
    moduleSections.push(`### ${modulePath}`, "");
    for (const symbol of symbols.sort((left, right) => left.name.localeCompare(right.name))) {
      const memberSummary = symbol.members && symbol.members.length > 0
        ? ` Members: ${symbol.members.join("; ")}.`
        : "";
      moduleSections.push(`- \`${symbol.signature}\` (${symbol.kind}) ${symbol.summary}${memberSummary}`);
    }
    moduleSections.push("");
  }

  appendSection(sections, "Exported Symbols", moduleSections);

  return sections.join("\n").trimEnd();
}
