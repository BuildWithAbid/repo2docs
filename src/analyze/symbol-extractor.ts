import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts = require("typescript");
import type { EndpointInfo, RepositorySnapshot, SymbolExtractionResult, SymbolInfo, SymbolKind } from "../core/types";
import { capitalize, humanizeIdentifier, splitIdentifier } from "../utils/text";

const SUPPORTED_SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);

interface DeclarationRecord {
  name: string;
  kind: SymbolKind;
  node: ts.Node;
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
    `${basePath}.cjs`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
    `${basePath}/index.mts`,
    `${basePath}/index.cts`,
    `${basePath}/index.mjs`,
    `${basePath}/index.cjs`
  ];

  return candidates.find((candidate) => fileSet.has(candidate));
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

function collectExplicitExports(sourceFile: ts.SourceFile, declarations: Map<string, DeclarationRecord>): SymbolInfo[] {
  const exportedSymbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  const addRecord = (record: DeclarationRecord) => {
    const key = `${record.kind}:${record.name}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    exportedSymbols.push(createSymbolInfo(record, sourceFile));
  };

  for (const statement of sourceFile.statements) {
    if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
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

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exportedName = element.propertyName?.text ?? element.name.text;
        const record = declarations.get(exportedName);
        if (record) {
          addRecord(record);
        }
      }
    }
  }

  return exportedSymbols;
}

export async function extractSymbolInsights(snapshot: RepositorySnapshot): Promise<SymbolExtractionResult> {
  const candidateFiles = snapshot.sourceFiles.filter((file) => SUPPORTED_SCRIPT_EXTENSIONS.has(file.extension));
  const fileSet = new Set(candidateFiles.map((file) => file.relativePath));
  const symbols: SymbolInfo[] = [];
  const endpoints: EndpointInfo[] = [];
  const localImportGraph = new Map<string, Set<string>>();
  const fileExportCounts = new Map<string, number>();

  for (const file of candidateFiles) {
    if (file.size > 1024 * 1024) {
      continue;
    }

    const sourceText = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(file.relativePath, sourceText, ts.ScriptTarget.Latest, true, getScriptKind(file.relativePath));
    const declarations = collectTopLevelDeclarations(sourceFile);
    const exportedSymbols = collectExplicitExports(sourceFile, declarations).map((symbol) => ({
      ...symbol,
      modulePath: file.relativePath
    }));

    fileExportCounts.set(file.relativePath, exportedSymbols.length);
    symbols.push(...exportedSymbols);

    const localImports = new Set<string>();

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

      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveLocalImport(file.relativePath, node.moduleSpecifier.text, fileSet);
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
        const routePath = literalToRoutePath(node.arguments[0]);
        if (routePath) {
          endpoints.push({
            method,
            routePath,
            filePath: file.relativePath,
            handlerName: getHandlerName(node.arguments[1])
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    localImportGraph.set(file.relativePath, localImports);
  }

  const seenSymbols = new Set<string>();
  const uniqueSymbols = symbols.filter((symbol) => {
    const key = `${symbol.modulePath}:${symbol.kind}:${symbol.name}`;
    if (seenSymbols.has(key)) {
      return false;
    }

    seenSymbols.add(key);
    return true;
  });

  const seenEndpoints = new Set<string>();
  const uniqueEndpoints = endpoints.filter((endpoint) => {
    const key = `${endpoint.filePath}:${endpoint.method}:${endpoint.routePath}`;
    if (seenEndpoints.has(key)) {
      return false;
    }

    seenEndpoints.add(key);
    return true;
  });

  return {
    symbols: uniqueSymbols,
    endpoints: uniqueEndpoints,
    localImportGraph,
    fileExportCounts
  };
}
