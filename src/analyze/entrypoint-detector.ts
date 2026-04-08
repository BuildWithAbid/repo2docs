import type { EndpointInfo, EntrypointInfo, PackageManifestInfo, RepositorySnapshot } from "../core/types";

const COMMON_ENTRYPOINTS = [
  "src/index.ts",
  "src/index.tsx",
  "src/index.js",
  "src/main.ts",
  "src/main.js",
  "src/server.ts",
  "src/server.js",
  "index.ts",
  "index.js",
  "main.py",
  "app.py",
  "cmd/main.go",
  "src/main.rs"
];

function resolveSourcePath(candidatePath: string, fileSet: Set<string>): string | undefined {
  if (!candidatePath) {
    return undefined;
  }

  if (fileSet.has(candidatePath)) {
    return candidatePath;
  }

  const normalized = candidatePath.replace(/^\.\/+/, "");
  if (fileSet.has(normalized)) {
    return normalized;
  }

  const extensionVariants = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  const withoutExtension = normalized.replace(/\.[^.]+$/, "");
  for (const extension of extensionVariants) {
    const withExtension = `${withoutExtension}${extension}`;
    if (fileSet.has(withExtension)) {
      return withExtension;
    }
  }

  if (normalized.startsWith("dist/")) {
    const srcCandidate = normalized.replace(/^dist\//, "src/").replace(/\.[^.]+$/, "");
    for (const extension of extensionVariants) {
      const withExtension = `${srcCandidate}${extension}`;
      if (fileSet.has(withExtension)) {
        return withExtension;
      }
    }
  }

  for (const extension of extensionVariants) {
    const indexCandidate = `${normalized}/index${extension}`;
    if (fileSet.has(indexCandidate)) {
      return indexCandidate;
    }
  }

  return undefined;
}

function addEntrypoint(
  collection: EntrypointInfo[],
  seenKeys: Set<string>,
  relativePath: string | undefined,
  kind: string,
  evidence: string,
  confidence: EntrypointInfo["confidence"]
): void {
  if (!relativePath) {
    return;
  }

  const key = `${kind}:${relativePath}`;
  if (seenKeys.has(key)) {
    return;
  }

  seenKeys.add(key);
  collection.push({
    kind,
    relativePath,
    evidence,
    confidence
  });
}

export function detectEntrypoints(
  snapshot: RepositorySnapshot,
  packageManifest: PackageManifestInfo | undefined,
  endpoints: EndpointInfo[]
): EntrypointInfo[] {
  const fileSet = new Set(
    snapshot.entries.filter((entry): entry is Extract<typeof entry, { kind: "file" }> => entry.kind === "file").map((entry) => entry.relativePath)
  );
  const entrypoints: EntrypointInfo[] = [];
  const seenKeys = new Set<string>();

  if (packageManifest) {
    for (const [binName, binPath] of Object.entries(packageManifest.bin)) {
      addEntrypoint(
        entrypoints,
        seenKeys,
        resolveSourcePath(binPath, fileSet) ?? binPath,
        "cli-bin",
        `Declared in package.json bin field as ${binName}`,
        "high"
      );
    }

    addEntrypoint(
      entrypoints,
      seenKeys,
      resolveSourcePath(packageManifest.main ?? "", fileSet),
      "package-main",
      "Declared in package.json main field",
      "high"
    );
    addEntrypoint(
      entrypoints,
      seenKeys,
      resolveSourcePath(packageManifest.module ?? "", fileSet),
      "package-module",
      "Declared in package.json module field",
      "high"
    );

    for (const exportTarget of packageManifest.exports) {
      addEntrypoint(
        entrypoints,
        seenKeys,
        resolveSourcePath(exportTarget, fileSet),
        "package-export",
        "Declared in package.json exports field",
        "high"
      );
    }
  }

  for (const candidate of COMMON_ENTRYPOINTS) {
    addEntrypoint(
      entrypoints,
      seenKeys,
      resolveSourcePath(candidate, fileSet),
      "conventional-entrypoint",
      `Matches conventional entrypoint pattern ${candidate}`,
      "medium"
    );
  }

  if (endpoints.length > 0) {
    const mostReferencedEndpointFile = [...endpoints].sort((left, right) => left.filePath.localeCompare(right.filePath))[0];
    addEntrypoint(
      entrypoints,
      seenKeys,
      mostReferencedEndpointFile?.filePath,
      "http-surface",
      "Contains detected HTTP endpoint registrations",
      "medium"
    );
  }

  const confidenceRank: Record<EntrypointInfo["confidence"], number> = {
    high: 0,
    medium: 1,
    low: 2
  };

  return entrypoints.sort((left, right) => {
    const confidenceDifference = confidenceRank[left.confidence] - confidenceRank[right.confidence];
    if (confidenceDifference !== 0) {
      return confidenceDifference;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
}

