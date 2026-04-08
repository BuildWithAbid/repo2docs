import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FileEntry, ManifestSet, RepositorySnapshot, SnapshotEntry } from "../core/types";
import { relativePath, toPosixPath } from "../utils/path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "target",
  "out",
  "bin",
  "obj"
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".php"
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP"
};

const MANIFEST_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml"
]);

interface TreeNode {
  children: Map<string, TreeNode>;
}

function createTreeNode(): TreeNode {
  return {
    children: new Map<string, TreeNode>()
  };
}

function buildTreeLines(entries: SnapshotEntry[]): string[] {
  const root = createTreeNode();
  const paths = entries.map((entry) => entry.relativePath).filter(Boolean).sort();

  for (const relativeEntryPath of paths) {
    const parts = relativeEntryPath.split("/").filter(Boolean);
    let current = root;

    for (const part of parts) {
      let next = current.children.get(part);
      if (!next) {
        next = createTreeNode();
        current.children.set(part, next);
      }
      current = next;
    }
  }

  const renderNode = (node: TreeNode, prefix = ""): string[] => {
    const children = [...node.children.entries()].sort(([left], [right]) => left.localeCompare(right));
    return children.flatMap(([name, child], index) => {
      const isLast = index === children.length - 1;
      const connector = isLast ? "\\-- " : "|-- ";
      const nextPrefix = `${prefix}${isLast ? "    " : "|   "}`;
      return [`${prefix}${connector}${name}`, ...renderNode(child, nextPrefix)];
    });
  };

  return renderNode(root);
}

export async function scanRepository(rootPath: string, repoName = path.basename(rootPath)): Promise<RepositorySnapshot> {
  const entries: SnapshotEntry[] = [];
  const sourceFiles: FileEntry[] = [];
  const languageStats: Record<string, number> = {};
  const rawManifestFiles: string[] = [];
  const warnings: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    const children = await fs.readdir(currentPath, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) {
        continue;
      }

      const absolutePath = path.join(currentPath, child.name);
      const relativeEntryPath = relativePath(rootPath, absolutePath);

      if (child.isDirectory()) {
        entries.push({
          kind: "directory",
          absolutePath,
          relativePath: relativeEntryPath,
          depth
        });
        await walk(absolutePath, depth + 1);
        continue;
      }

      if (!child.isFile()) {
        continue;
      }

      const stats = await fs.stat(absolutePath);
      const extension = path.extname(child.name);
      const fileEntry: FileEntry = {
        kind: "file",
        absolutePath,
        relativePath: relativeEntryPath,
        extension,
        size: stats.size,
        depth
      };

      entries.push(fileEntry);

      if (MANIFEST_NAMES.has(child.name)) {
        rawManifestFiles.push(relativeEntryPath);
      }

      const language = LANGUAGE_BY_EXTENSION[extension];
      if (language) {
        languageStats[language] = (languageStats[language] ?? 0) + 1;
      }

      if (SOURCE_EXTENSIONS.has(extension)) {
        sourceFiles.push(fileEntry);
      }

      if (stats.size > 1024 * 1024) {
        warnings.push(`Large file skipped for deep parsing: ${relativeEntryPath}`);
      }
    }
  }

  await walk(rootPath, 0);

  const manifests: ManifestSet = {
    rawManifestFiles: rawManifestFiles.sort()
  };

  return {
    rootPath: toPosixPath(rootPath),
    repoName,
    entries,
    sourceFiles,
    languageStats,
    treeLines: buildTreeLines(entries),
    manifests,
    warnings
  };
}
