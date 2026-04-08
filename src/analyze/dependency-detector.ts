import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DependencyInfo, ManifestSet, PackageManifestInfo, RepositorySnapshot } from "../core/types";

interface DependencyDetectionResult {
  dependencies: DependencyInfo[];
  manifests: ManifestSet;
}

function ensureArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function flattenExports(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenExports(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenExports(item));
  }

  return [];
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function parsePackageManifest(raw: Record<string, unknown>): PackageManifestInfo {
  const binField = raw.bin;
  const normalizedBin: Record<string, string> = {};
  if (typeof binField === "string" && typeof raw.name === "string") {
    normalizedBin[raw.name] = binField;
  } else if (binField && typeof binField === "object") {
    for (const [name, value] of Object.entries(binField)) {
      if (typeof value === "string") {
        normalizedBin[name] = value;
      }
    }
  }

  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    version: typeof raw.version === "string" ? raw.version : undefined,
    description: typeof raw.description === "string" ? raw.description : undefined,
    scripts: isStringMap(raw.scripts) ? raw.scripts : {},
    dependencies: isStringMap(raw.dependencies) ? raw.dependencies : {},
    devDependencies: isStringMap(raw.devDependencies) ? raw.devDependencies : {},
    peerDependencies: isStringMap(raw.peerDependencies) ? raw.peerDependencies : {},
    packageManager: typeof raw.packageManager === "string" ? raw.packageManager : undefined,
    main: typeof raw.main === "string" ? raw.main : undefined,
    module: typeof raw.module === "string" ? raw.module : undefined,
    types: typeof raw.types === "string" ? raw.types : undefined,
    bin: normalizedBin,
    exports: flattenExports(raw.exports),
    workspaces: ensureArray(raw.workspaces)
  };
}

function parseRequirementsFile(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function parsePyprojectDependencies(contents: string): string[] {
  const dependencies: string[] = [];
  const lines = contents.split(/\r?\n/);
  let inDependenciesBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("dependencies = [")) {
      inDependenciesBlock = true;
      continue;
    }

    if (inDependenciesBlock) {
      if (trimmed === "]") {
        inDependenciesBlock = false;
        continue;
      }

      const match = trimmed.match(/^"(.+)"[,]?$/);
      if (match) {
        dependencies.push(match[1]);
      }
    }
  }

  return dependencies;
}

function parseGoModDependencies(contents: string): string[] {
  const dependencies: string[] = [];
  const lines = contents.split(/\r?\n/);
  let inRequireBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("require (")) {
      inRequireBlock = true;
      continue;
    }

    if (inRequireBlock) {
      if (trimmed === ")") {
        inRequireBlock = false;
        continue;
      }

      if (trimmed) {
        dependencies.push(trimmed);
      }
      continue;
    }

    if (trimmed.startsWith("require ")) {
      dependencies.push(trimmed.replace(/^require\s+/, ""));
    }
  }

  return dependencies;
}

function parseCargoDependencies(contents: string): string[] {
  const dependencies: string[] = [];
  const lines = contents.split(/\r?\n/);
  let inDependenciesSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inDependenciesSection = trimmed === "[dependencies]";
      continue;
    }

    if (inDependenciesSection && trimmed.length > 0 && !trimmed.startsWith("#")) {
      dependencies.push(trimmed);
    }
  }

  return dependencies;
}

export async function detectDependencies(snapshot: RepositorySnapshot): Promise<DependencyDetectionResult> {
  const dependencies: DependencyInfo[] = [];
  const manifests: ManifestSet = {
    ...snapshot.manifests,
    rawManifestFiles: [...snapshot.manifests.rawManifestFiles]
  };

  const tryReadFile = async (relativeFilePath: string): Promise<string | undefined> => {
    try {
      return await fs.readFile(path.join(snapshot.rootPath, relativeFilePath), "utf8");
    } catch {
      return undefined;
    }
  };

  const packageJsonContents = await tryReadFile("package.json");
  if (packageJsonContents) {
    const raw = JSON.parse(packageJsonContents) as Record<string, unknown>;
    const packageManifest = parsePackageManifest(raw);
    manifests.packageJson = packageManifest;

    for (const [name, version] of Object.entries(packageManifest.dependencies)) {
      dependencies.push({ ecosystem: "node", name, version, group: "runtime", sourceFile: "package.json" });
    }
    for (const [name, version] of Object.entries(packageManifest.devDependencies)) {
      dependencies.push({ ecosystem: "node", name, version, group: "development", sourceFile: "package.json" });
    }
    for (const [name, version] of Object.entries(packageManifest.peerDependencies)) {
      dependencies.push({ ecosystem: "node", name, version, group: "peer", sourceFile: "package.json" });
    }
  }

  const tsconfigContents = await tryReadFile("tsconfig.json");
  if (tsconfigContents) {
    manifests.tsconfig = JSON.parse(tsconfigContents) as Record<string, unknown>;
    dependencies.push({
      ecosystem: "tooling",
      name: "typescript-config",
      sourceFile: "tsconfig.json"
    });
  }

  const requirementsContents = await tryReadFile("requirements.txt");
  if (requirementsContents) {
    manifests.requirementsTxt = parseRequirementsFile(requirementsContents);
    for (const requirement of manifests.requirementsTxt) {
      dependencies.push({
        ecosystem: "python",
        name: requirement,
        sourceFile: "requirements.txt"
      });
    }
  }

  const pyprojectContents = await tryReadFile("pyproject.toml");
  if (pyprojectContents) {
    manifests.pyprojectDependencies = parsePyprojectDependencies(pyprojectContents);
    for (const dependency of manifests.pyprojectDependencies) {
      dependencies.push({
        ecosystem: "python",
        name: dependency,
        sourceFile: "pyproject.toml"
      });
    }
  }

  const goModContents = await tryReadFile("go.mod");
  if (goModContents) {
    manifests.goDependencies = parseGoModDependencies(goModContents);
    for (const dependency of manifests.goDependencies) {
      dependencies.push({
        ecosystem: "go",
        name: dependency,
        sourceFile: "go.mod"
      });
    }
  }

  const cargoContents = await tryReadFile("Cargo.toml");
  if (cargoContents) {
    manifests.cargoDependencies = parseCargoDependencies(cargoContents);
    for (const dependency of manifests.cargoDependencies) {
      dependencies.push({
        ecosystem: "rust",
        name: dependency,
        sourceFile: "Cargo.toml"
      });
    }
  }

  return {
    dependencies,
    manifests
  };
}

