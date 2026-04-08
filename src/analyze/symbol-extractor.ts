import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts = require("typescript");
import type { EndpointInfo, FileEntry, RepositorySnapshot, SymbolExtractionResult, SymbolInfo, SymbolKind } from "../core/types";
import { capitalize, humanizeIdentifier, splitIdentifier } from "../utils/text";

const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);

interface DeclarationRecord {
  name: string;
  kind: SymbolKind;
  node: ts.Node;
}

interface NamedReExport {
  kind: "named";
  from: string;
  importedName: string;
  exportedName: string;
}

interface WildcardReExport {
  kind: "all";
  from: string;
}

type ReExportSpec = NamedReExport | WildcardReExport;

interface FileExtractionResult {
  symbols: SymbolInfo[];
  endpoints: EndpointInfo[];
  localImports: Set<string>;
  reExports: ReExportSpec[];
}

function getScriptKind(relativePath: string): ts.ScriptKind {
  if (relativePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (relativePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (relativePath.endsWith(".js") || relativePath.endsWith(".mjs") || relativePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, syntaxKind: ts.SyntaxKind): boolean {
  const modifiers = (node as ts.HasModifiers).modifiers;
  return !!modifiers?.some((modifier: ts.ModifierLike) => modifier.kind === syntaxKind);
}

function extractDocComment(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const leadingRanges = ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? [];
  const jsDocRange = [...leadingRanges].reverse().find((range) => sourceFile.text.slice(range.pos, range.end).startsWith("/**"));
  if (!jsDocRange) {
    return undefined;
  }

  return sourceFile.text
    .slice(jsDocRange.pos, jsDocRange.end)
    .replace(/^\/\*\*|\*\/$/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .join(" ")
    .trim();
}

function getParameterSignature(parameter: ts.ParameterDeclaration): string {
  const name = parameter.name.getText();
  const optional = parameter.questionToken ? "?" : "";
  const rest = parameter.dotDotDotToken ? "..." : "";
  const type = parameter.type ? `: ${parameter.type.getText()}` : "";
  return `${rest}${name}${optional}${type}`;
}

function getFunctionSignature(name: string, node: ts.SignatureDeclarationBase): string {
  const parameters = node.parameters.map((parameter) => getParameterSignature(parameter)).join(", ");
  const returnType = node.type ? `: ${node.type.getText()}` : "";
  return `${name}(${parameters})${returnType}`;
}

function getClassSignature(node: ts.ClassDeclaration): string {
  const className = node.name?.text ?? "default";
  const heritageClause = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
  const extendsText = heritageClause?.types?.[0]?.expression.getText() ? ` extends ${heritageClause.types[0].expression.getText()}` : "";
  return `class ${className}${extendsText}`;
}

function extractClassMembers(node: ts.ClassDeclaration): string[] {
  return node.members.flatMap((member) => {
    if (ts.isMethodDeclaration(member) && member.name && !hasModifier(member, ts.SyntaxKind.PrivateKeyword)) {
      return [getFunctionSignature(member.name.getText(), member)];
    }

    if (ts.isConstructorDeclaration(member)) {
      return [getFunctionSignature("constructor", member)];
    }

    return [];
  });
}

function inferSummary(name: string, kind: SymbolKind): string {
  const words = splitIdentifier(name);
  const firstWord = words[0]?.toLowerCase();
  const subject = words.slice(1).join(" ") || humanizeIdentifier(name);

  if (kind === "function") {
    switch (firstWord) {
      case "get":
      case "list":
      case "load":
      case "read":
      case "create":
      case "build":
      case "generate":
      case "write":
      case "update":
      case "parse":
      case "detect":
      case "extract":
      case "register":
      case "start":
        return `${capitalize(firstWord)}s ${subject}.`;
      default:
        return `Provides ${humanizeIdentifier(name)}.`;
    }
  }

  if (kind === "class") {
    return `Represents ${humanizeIdentifier(name)}.`;
  }

  if (kind === "interface" || kind === "type") {
    return `Describes ${humanizeIdentifier(name)}.`;
  }

  return `Stores ${humanizeIdentifier(name)}.`;
}

function resolveLocalImport(fromFile: string, specifier: string, fileSet: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const basePath = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    `${basePath}.mjs`,
    `${basePath}.cjs`
  ];

  const indexCandidates = candidates.flatMap((candidate) => [
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
    `${candidate}/index.js`,
    `${candidate}/index.jsx`,
    `${candidate}/index.mts`,
    `${candidate}/index.cts`,
    `${candidate}/index.mjs`,
    `${candidate}/index.cjs`
  ]);

  return [...candidates, ...indexCandidates].find((candidate) => fileSet.has(candidate));
}

function literalToRoutePath(expression: ts.Expression | undefined): string | undefined {
  if (!expression) {
    return undefined;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return undefined;
}

function getHandlerName(expression: ts.Expression | undefined): string | undefined {
  if (!expression) {
    return undefined;
  }

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return undefined;
}

function collectTopLevelDeclarations(sourceFile: ts.SourceFile): Map<string, DeclarationRecord> {
  const declarations = new Map<string, DeclarationRecord>();

  const register = (name: string | undefined, kind: SymbolKind, node: ts.Node) => {
    if (!name) {
      return;
    }

    declarations.set(name, { name, kind, node });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      register(statement.name?.text, "function", statement);
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      register(statement.name?.text, "class", statement);
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      register(statement.name.text, "interface", statement);
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      register(statement.name.text, "type", statement);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const initializer = declaration.initializer;
        const kind: SymbolKind = initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
          ? "function"
          : "constant";
        register(declaration.name.text, kind, declaration);
      }
    }
  }

  return declarations;
}

function createSymbolInfo(record: DeclarationRecord, sourceFile: ts.SourceFile): SymbolInfo {
  const docComment = extractDocComment(record.node, sourceFile);
  const summary = docComment || inferSummary(record.name, record.kind);

  if (record.kind === "function") {
    const node = record.node;
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      return {
        name: record.name,
        kind: "function",
        modulePath: sourceFile.fileName,
        exported: true,
        signature: getFunctionSignature(record.name, node),
        summary,
        docComment
      };
    }

    if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      return {
        name: record.name,
        kind: "function",
        modulePath: sourceFile.fileName,
        exported: true,
        signature: getFunctionSignature(record.name, node.initializer),
        summary,
        docComment
      };
    }
  }

  if (record.kind === "class" && ts.isClassDeclaration(record.node)) {
    return {
      name: record.name,
      kind: "class",
      modulePath: sourceFile.fileName,
      exported: true,
      signature: getClassSignature(record.node),
      summary,
      docComment,
      members: extractClassMembers(record.node)
    };
  }

  if (record.kind === "interface" && ts.isInterfaceDeclaration(record.node)) {
    return {
      name: record.name,
      kind: "interface",
      modulePath: sourceFile.fileName,
      exported: true,
      signature: `interface ${record.name}`,
      summary,
      docComment
    };
  }

  if (record.kind === "type" && ts.isTypeAliasDeclaration(record.node)) {
    return {
      name: record.name,
      kind: "type",
      modulePath: sourceFile.fileName,
      exported: true,
      signature: `type ${record.name}`,
      summary,
      docComment
    };
  }

  return {
    name: record.name,
    kind: "constant",
    modulePath: sourceFile.fileName,
    exported: true,
    signature: `const ${record.name}`,
    summary,
    docComment
  };
}

function cloneReExportedSymbol(symbol: SymbolInfo, modulePath: string, exportedName: string, fromPath: string): SymbolInfo {
  const signature = symbol.signature.replace(new RegExp(`\\b${symbol.name}\\b`), exportedName);
  return {
    ...symbol,
    name: exportedName,
    modulePath,
    signature,
    summary: symbol.summary.endsWith(".")
      ? `${symbol.summary} Re-exported from \`${fromPath}\`.`
      : `${symbol.summary} Re-exported from \`${fromPath}\`.`
  };
}

function collectExplicitExports(
  sourceFile: ts.SourceFile,
  declarations: Map<string, DeclarationRecord>,
  fileSet: Set<string>
): { symbols: SymbolInfo[]; reExports: ReExportSpec[] } {
  const exportedSymbols: SymbolInfo[] = [];
  const reExports: ReExportSpec[] = [];
  const seen = new Set<string>();

  const addSymbol = (symbol: SymbolInfo) => {
    const key = `${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    exportedSymbols.push(symbol);
  };

  const addRecord = (record: DeclarationRecord) => {
    addSymbol(createSymbolInfo(record, sourceFile));
  };

  for (const statement of sourceFile.statements) {
    if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        if (ts.isFunctionDeclaration(statement)) {
          addSymbol({
            name: statement.name?.text ?? "default",
            kind: "function",
            modulePath: sourceFile.fileName,
            exported: true,
            signature: getFunctionSignature(statement.name?.text ?? "default", statement),
            summary: extractDocComment(statement, sourceFile) || "Default exported function.",
            docComment: extractDocComment(statement, sourceFile)
          });
          continue;
        }

        if (ts.isClassDeclaration(statement)) {
          addSymbol({
            name: statement.name?.text ?? "default",
            kind: "class",
            modulePath: sourceFile.fileName,
            exported: true,
            signature: statement.name?.text ? getClassSignature(statement) : "default class",
            summary: extractDocComment(statement, sourceFile) || "Default exported class.",
            docComment: extractDocComment(statement, sourceFile),
            members: extractClassMembers(statement)
          });
          continue;
        }
      }

      if (
        ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)
      ) {
        const name = statement.name?.getText();
        const record = name ? declarations.get(name) : undefined;
        if (record) {
          addRecord(record);
        }
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const name = ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
          const record = name ? declarations.get(name) : undefined;
          if (record) {
            addRecord(record);
          }
        }
      }
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const resolved = resolveLocalImport(sourceFile.fileName, statement.moduleSpecifier.text, fileSet);
      if (!resolved) {
        continue;
      }

      if (!statement.exportClause) {
        reExports.push({ kind: "all", from: resolved });
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          reExports.push({
            kind: "named",
            from: resolved,
            importedName: element.propertyName?.text ?? element.name.text,
            exportedName: element.name.text
          });
        }
      }
    }
  }

  return {
    symbols: exportedSymbols,
    reExports
  };
}

function pushEndpoint(collection: EndpointInfo[], endpoint: EndpointInfo): void {
  collection.push(endpoint);
}

function detectDecoratorRoutes(sourceFile: ts.SourceFile, filePath: string, collection: EndpointInfo[]): void {
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name) {
      const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
      for (const decorator of decorators) {
        if (!ts.isCallExpression(decorator.expression) || !ts.isIdentifier(decorator.expression.expression)) {
          continue;
        }

        const decoratorName = decorator.expression.expression.text.toLowerCase();
        if (!HTTP_METHODS.has(decoratorName)) {
          continue;
        }

        pushEndpoint(collection, {
          method: decoratorName.toUpperCase(),
          routePath: literalToRoutePath(decorator.expression.arguments[0]) ?? "/",
          filePath,
          handlerName: node.name.getText()
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function extractScriptFile(file: FileEntry, fileSet: Set<string>, sourceText: string): FileExtractionResult {
  const sourceFile = ts.createSourceFile(file.relativePath, sourceText, ts.ScriptTarget.Latest, true, getScriptKind(file.relativePath));
  const declarations = collectTopLevelDeclarations(sourceFile);
  const exportResult = collectExplicitExports(sourceFile, declarations, fileSet);
  const localImports = new Set<string>();
  const endpoints: EndpointInfo[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = resolveLocalImport(file.relativePath, node.moduleSpecifier.text, fileSet);
      if (resolved) {
        localImports.add(resolved);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const resolved = resolveLocalImport(file.relativePath, node.arguments[0].text, fileSet);
      if (resolved) {
        localImports.add(resolved);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      HTTP_METHODS.has(node.expression.name.text.toLowerCase())
    ) {
      const method = node.expression.name.text.toUpperCase();
      const directPath = literalToRoutePath(node.arguments[0]);
      if (directPath) {
        pushEndpoint(endpoints, {
          method,
          routePath: directPath,
          filePath: file.relativePath,
          handlerName: getHandlerName(node.arguments[1])
        });
      } else if (
        ts.isCallExpression(node.expression.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression.expression) &&
        node.expression.expression.expression.name.text === "route"
      ) {
        const routePath = literalToRoutePath(node.expression.expression.arguments[0]);
        if (routePath) {
          pushEndpoint(endpoints, {
            method,
            routePath,
            filePath: file.relativePath,
            handlerName: getHandlerName(node.arguments[0])
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  detectDecoratorRoutes(sourceFile, file.relativePath, endpoints);

  return {
    symbols: exportResult.symbols.map((symbol) => ({ ...symbol, modulePath: file.relativePath })),
    endpoints,
    localImports,
    reExports: exportResult.reExports
  };
}

function extractPythonFile(file: FileEntry, sourceText: string): FileExtractionResult {
  const symbols: SymbolInfo[] = [];
  const endpoints: EndpointInfo[] = [];
  const explicitExports = new Set<string>();
  const allMatch = sourceText.match(/__all__\s*=\s*\[([\s\S]*?)\]/m);
  if (allMatch) {
    const names = allMatch[1].match(/['"]([^'"]+)['"]/g) ?? [];
    for (const entry of names) {
      explicitExports.add(entry.replace(/['"]/g, ""));
    }
  }

  const classRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/gm;
  for (const match of sourceText.matchAll(classRegex)) {
    const name = match[1];
    if (name.startsWith("_") || (explicitExports.size > 0 && !explicitExports.has(name))) {
      continue;
    }
    symbols.push({
      name,
      kind: "class",
      modulePath: file.relativePath,
      exported: true,
      signature: `class ${name}`,
      summary: inferSummary(name, "class")
    });
  }

  const functionRegex = /^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm;
  for (const match of sourceText.matchAll(functionRegex)) {
    const name = match[1];
    if (name.startsWith("_") || (explicitExports.size > 0 && !explicitExports.has(name))) {
      continue;
    }
    const parameters = match[2].trim();
    const returnType = match[3]?.trim();
    symbols.push({
      name,
      kind: "function",
      modulePath: file.relativePath,
      exported: true,
      signature: `${name}(${parameters})${returnType ? ` -> ${returnType}` : ""}`,
      summary: inferSummary(name, "function")
    });
  }

  for (const match of sourceText.matchAll(/@[\w.]+\.(get|post|put|patch|delete|options|head)\(\s*["']([^"']+)["']/gm)) {
    pushEndpoint(endpoints, {
      method: match[1].toUpperCase(),
      routePath: match[2],
      filePath: file.relativePath
    });
  }

  for (const match of sourceText.matchAll(/@[\w.]+\.route\(\s*["']([^"']+)["'][\s\S]*?methods\s*=\s*\[([^\]]+)\]/gm)) {
    const routePath = match[1];
    const methods = [...match[2].matchAll(/["']([A-Z]+)["']/g)].map((entry) => entry[1]);
    for (const method of methods) {
      pushEndpoint(endpoints, {
        method,
        routePath,
        filePath: file.relativePath
      });
    }
  }

  return {
    symbols,
    endpoints,
    localImports: new Set<string>(),
    reExports: []
  };
}

function extractGoFile(file: FileEntry, sourceText: string): FileExtractionResult {
  const symbols: SymbolInfo[] = [];
  const endpoints: EndpointInfo[] = [];

  for (const match of sourceText.matchAll(/^func\s+([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*([^{\n]+)?\{/gm)) {
    const name = match[1];
    symbols.push({
      name,
      kind: "function",
      modulePath: file.relativePath,
      exported: true,
      signature: `${name}(${match[2].trim()})${match[3] ? ` ${match[3].trim()}` : ""}`,
      summary: inferSummary(name, "function")
    });
  }

  for (const match of sourceText.matchAll(/^type\s+([A-Z][A-Za-z0-9_]*)\s+(struct|interface)\b/gm)) {
    const name = match[1];
    const kind: SymbolKind = match[2] === "struct" ? "class" : "interface";
    symbols.push({
      name,
      kind,
      modulePath: file.relativePath,
      exported: true,
      signature: `${match[2]} ${name}`,
      summary: inferSummary(name, kind)
    });
  }

  for (const match of sourceText.matchAll(/\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\(\s*"([^"]+)"/gm)) {
    pushEndpoint(endpoints, {
      method: match[1],
      routePath: match[2],
      filePath: file.relativePath
    });
  }

  for (const match of sourceText.matchAll(/HandleFunc\(\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)(?:\.Methods\(([^)]+)\))?/gm)) {
    const methods = match[3]
      ? [...match[3].matchAll(/"([A-Z]+)"/g)].map((entry) => entry[1])
      : ["ANY"];
    for (const method of methods) {
      pushEndpoint(endpoints, {
        method,
        routePath: match[1],
        filePath: file.relativePath,
        handlerName: match[2]
      });
    }
  }

  return {
    symbols,
    endpoints,
    localImports: new Set<string>(),
    reExports: []
  };
}

function extractRustFile(file: FileEntry, sourceText: string): FileExtractionResult {
  const symbols: SymbolInfo[] = [];
  const endpoints: EndpointInfo[] = [];

  for (const match of sourceText.matchAll(/^pub\s+fn\s+([a-zA-Z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm)) {
    const name = match[1];
    symbols.push({
      name,
      kind: "function",
      modulePath: file.relativePath,
      exported: true,
      signature: `${name}(${match[2].trim()})`,
      summary: inferSummary(name, "function")
    });
  }

  for (const match of sourceText.matchAll(/^pub\s+(struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
    const rawKind = match[1];
    const name = match[2];
    const kind: SymbolKind = rawKind === "trait" ? "interface" : rawKind === "struct" ? "class" : "type";
    symbols.push({
      name,
      kind,
      modulePath: file.relativePath,
      exported: true,
      signature: `${rawKind} ${name}`,
      summary: inferSummary(name, kind)
    });
  }

  for (const match of sourceText.matchAll(/#\[(get|post|put|patch|delete|head|options)\("([^"]+)"\)\]/gm)) {
    pushEndpoint(endpoints, {
      method: match[1].toUpperCase(),
      routePath: match[2],
      filePath: file.relativePath
    });
  }

  return {
    symbols,
    endpoints,
    localImports: new Set<string>(),
    reExports: []
  };
}

function extractForFile(file: FileEntry, sourceText: string, fileSet: Set<string>): FileExtractionResult {
  if (SCRIPT_EXTENSIONS.has(file.extension)) {
    return extractScriptFile(file, fileSet, sourceText);
  }
  if (file.extension === ".py") {
    return extractPythonFile(file, sourceText);
  }
  if (file.extension === ".go") {
    return extractGoFile(file, sourceText);
  }
  if (file.extension === ".rs") {
    return extractRustFile(file, sourceText);
  }

  return {
    symbols: [],
    endpoints: [],
    localImports: new Set<string>(),
    reExports: []
  };
}

function dedupeSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.modulePath}:${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeEndpoints(endpoints: EndpointInfo[]): EndpointInfo[] {
  const seen = new Set<string>();
  return endpoints.filter((endpoint) => {
    const key = `${endpoint.filePath}:${endpoint.method}:${endpoint.routePath}:${endpoint.handlerName ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function extractSymbolInsights(snapshot: RepositorySnapshot): Promise<SymbolExtractionResult> {
  const candidateFiles = snapshot.sourceFiles;
  const fileSet = new Set(candidateFiles.filter((file) => SCRIPT_EXTENSIONS.has(file.extension)).map((file) => file.relativePath));
  const localImportGraph = new Map<string, Set<string>>();
  const fileExportCounts = new Map<string, number>();
  const symbolMap = new Map<string, SymbolInfo[]>();
  const reExportMap = new Map<string, ReExportSpec[]>();
  const endpoints: EndpointInfo[] = [];

  for (const file of candidateFiles) {
    if (file.size > 1024 * 1024) {
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const extraction = extractForFile(file, sourceText, fileSet);
    localImportGraph.set(file.relativePath, extraction.localImports);
    symbolMap.set(file.relativePath, extraction.symbols);
    reExportMap.set(file.relativePath, extraction.reExports);
    endpoints.push(...extraction.endpoints);
  }

  for (let iteration = 0; iteration < 10; iteration += 1) {
    let changed = false;

    for (const [filePath, reExports] of reExportMap.entries()) {
      const currentSymbols = symbolMap.get(filePath) ?? [];
      const additions: SymbolInfo[] = [];

      for (const reExport of reExports) {
        const targetSymbols = symbolMap.get(reExport.from) ?? [];
        if (targetSymbols.length === 0) {
          continue;
        }

        if (reExport.kind === "all") {
          for (const symbol of targetSymbols) {
            if (symbol.name === "default") {
              continue;
            }
            additions.push(cloneReExportedSymbol(symbol, filePath, symbol.name, reExport.from));
          }
          continue;
        }

        const target = targetSymbols.find((symbol) => symbol.name === reExport.importedName);
        if (target) {
          additions.push(cloneReExportedSymbol(target, filePath, reExport.exportedName, reExport.from));
        }
      }

      const deduped = dedupeSymbols([...currentSymbols, ...additions]);
      if (deduped.length !== currentSymbols.length) {
        symbolMap.set(filePath, deduped);
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  const symbols = dedupeSymbols([...symbolMap.values()].flat()).sort((left, right) => {
    if (left.modulePath !== right.modulePath) {
      return left.modulePath.localeCompare(right.modulePath);
    }
    return left.name.localeCompare(right.name);
  });

  for (const [filePath, entries] of symbolMap.entries()) {
    fileExportCounts.set(filePath, entries.length);
  }

  return {
    symbols,
    endpoints: dedupeEndpoints(endpoints),
    localImportGraph,
    fileExportCounts
  };
}
