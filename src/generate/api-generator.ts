import type { AnalysisResult, SymbolInfo } from "../core/types";

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
    "## Summary",
    "",
    `Detected ${analysis.symbols.length} exported symbols and ${analysis.endpoints.length} HTTP endpoints using static heuristics.`
  ];

  if (analysis.endpoints.length > 0) {
    sections.push(
      "",
      "## HTTP Endpoints",
      "",
      ...analysis.endpoints.map((endpoint) => `- \`${endpoint.method} ${endpoint.routePath}\` in \`${endpoint.filePath}\`${endpoint.handlerName ? ` handled by \`${endpoint.handlerName}\`` : ""}`)
    );
  }

  if (analysis.symbols.length === 0) {
    sections.push("", "## Exported Symbols", "", "No public API surface was confidently detected.");
    return sections.join("\n");
  }

  sections.push("", "## Exported Symbols");

  for (const [modulePath, symbols] of groupSymbolsByModule(analysis.symbols).entries()) {
    sections.push("", `### ${modulePath}`, "");
    for (const symbol of symbols.sort((left, right) => left.name.localeCompare(right.name))) {
      const memberSummary = symbol.members && symbol.members.length > 0
        ? ` Members: ${symbol.members.join("; ")}.`
        : "";
      sections.push(`- \`${symbol.signature}\` (${symbol.kind}) ${symbol.summary}${memberSummary}`);
    }
  }

  return sections.join("\n");
}

