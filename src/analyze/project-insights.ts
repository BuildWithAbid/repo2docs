import type {
  ConfigFileInfo,
  DependencyInfo,
  EntrypointInfo,
  FrameworkInfo,
  ProjectInsights,
  RepositorySnapshot,
  ScriptInfo
} from "../core/types";

const FRAMEWORK_RULES: Array<{
  dependency: string;
  category: FrameworkInfo["category"];
  name: string;
}> = [
  { dependency: "express", category: "backend", name: "Express" },
  { dependency: "fastify", category: "backend", name: "Fastify" },
  { dependency: "koa", category: "backend", name: "Koa" },
  { dependency: "@nestjs/core", category: "backend", name: "NestJS" },
  { dependency: "hono", category: "backend", name: "Hono" },
  { dependency: "fastapi", category: "backend", name: "FastAPI" },
  { dependency: "flask", category: "backend", name: "Flask" },
  { dependency: "django", category: "fullstack", name: "Django" },
  { dependency: "gin", category: "backend", name: "Gin" },
  { dependency: "gorilla/mux", category: "backend", name: "Gorilla Mux" },
  { dependency: "actix-web", category: "backend", name: "Actix Web" },
  { dependency: "axum", category: "backend", name: "Axum" },
  { dependency: "react", category: "frontend", name: "React" },
  { dependency: "next", category: "fullstack", name: "Next.js" },
  { dependency: "vue", category: "frontend", name: "Vue" },
  { dependency: "nuxt", category: "fullstack", name: "Nuxt" },
  { dependency: "svelte", category: "frontend", name: "Svelte" },
  { dependency: "@angular/core", category: "frontend", name: "Angular" },
  { dependency: "jest", category: "testing", name: "Jest" },
  { dependency: "vitest", category: "testing", name: "Vitest" },
  { dependency: "@playwright/test", category: "testing", name: "Playwright" },
  { dependency: "cypress", category: "testing", name: "Cypress" },
  { dependency: "vite", category: "build", name: "Vite" },
  { dependency: "webpack", category: "build", name: "Webpack" },
  { dependency: "rollup", category: "build", name: "Rollup" },
  { dependency: "tsup", category: "build", name: "tsup" },
  { dependency: "esbuild", category: "build", name: "esbuild" },
  { dependency: "eslint", category: "linting", name: "ESLint" },
  { dependency: "prettier", category: "linting", name: "Prettier" },
  { dependency: "@biomejs/biome", category: "linting", name: "Biome" }
];

const CONFIG_FILE_RULES: Array<{
  matcher: RegExp;
  category: ConfigFileInfo["category"];
  description: string;
}> = [
  { matcher: /^\.env(\..+)?$/, category: "environment", description: "Environment variable file" },
  { matcher: /^docker-compose(\.[^.]+)?\.ya?ml$/i, category: "container", description: "Docker Compose configuration" },
  { matcher: /^Dockerfile(\..+)?$/, category: "container", description: "Docker build definition" },
  { matcher: /^vercel\.json$/i, category: "deployment", description: "Vercel deployment configuration" },
  { matcher: /^netlify\.toml$/i, category: "deployment", description: "Netlify deployment configuration" },
  { matcher: /^render\.ya?ml$/i, category: "deployment", description: "Render deployment configuration" },
  { matcher: /^Procfile$/i, category: "deployment", description: "Process startup declaration" },
  { matcher: /^pnpm-workspace\.yaml$/i, category: "workspace", description: "pnpm workspace definition" },
  { matcher: /^turbo\.json$/i, category: "workspace", description: "Turborepo workspace configuration" },
  { matcher: /^nx\.json$/i, category: "workspace", description: "Nx workspace configuration" },
  { matcher: /^lerna\.json$/i, category: "workspace", description: "Lerna workspace configuration" },
  { matcher: /^vitest\.config\.(ts|js|mjs|cjs)$/i, category: "testing", description: "Vitest configuration" },
  { matcher: /^jest\.config\.(ts|js|mjs|cjs)$/i, category: "testing", description: "Jest configuration" },
  { matcher: /^playwright\.config\.(ts|js|mjs|cjs)$/i, category: "testing", description: "Playwright configuration" },
  { matcher: /^cypress\.config\.(ts|js|mjs|cjs)$/i, category: "testing", description: "Cypress configuration" },
  { matcher: /^vite\.config\.(ts|js|mjs|cjs)$/i, category: "build", description: "Vite configuration" },
  { matcher: /^webpack\.config\.(ts|js|mjs|cjs)$/i, category: "build", description: "Webpack configuration" },
  { matcher: /^rollup\.config\.(ts|js|mjs|cjs)$/i, category: "build", description: "Rollup configuration" },
  { matcher: /^tsup\.config\.(ts|js|mjs|cjs)$/i, category: "build", description: "tsup configuration" },
  { matcher: /^eslint\.config\.(ts|js|mjs|cjs)$/i, category: "quality", description: "ESLint configuration" },
  { matcher: /^\.eslintrc(\..+)?$/i, category: "quality", description: "ESLint configuration" },
  { matcher: /^\.prettierrc(\..+)?$/i, category: "quality", description: "Prettier configuration" },
  { matcher: /^prettier\.config\.(ts|js|mjs|cjs)$/i, category: "quality", description: "Prettier configuration" },
  { matcher: /^biome\.json$/i, category: "quality", description: "Biome configuration" }
];

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function categorizeScript(name: string): ScriptInfo["category"] {
  if (/^(dev|watch|serve)$/.test(name)) {
    return "dev";
  }
  if (/^(build|compile|bundle)$/.test(name)) {
    return "build";
  }
  if (/^(test|test:.+|e2e|coverage)$/.test(name)) {
    return "test";
  }
  if (/^(start|preview)$/.test(name)) {
    return "start";
  }
  if (/^(lint|check|typecheck)$/.test(name)) {
    return "lint";
  }
  if (/^(format|fmt)$/.test(name)) {
    return "format";
  }
  if (/^(release|publish)$/.test(name)) {
    return "release";
  }
  return "other";
}

function detectPackageManager(snapshot: RepositorySnapshot): string | undefined {
  const manifestValue = snapshot.manifests.packageJson?.packageManager;
  if (manifestValue) {
    return manifestValue.split("@")[0];
  }

  const rootFileNames = new Set(
    snapshot.entries
      .filter((entry): entry is Extract<typeof entry, { kind: "file" }> => entry.kind === "file" && !entry.relativePath.includes("/"))
      .map((entry) => entry.relativePath)
  );

  if (rootFileNames.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (rootFileNames.has("yarn.lock")) {
    return "yarn";
  }
  if (rootFileNames.has("bun.lockb")) {
    return "bun";
  }
  if (rootFileNames.has("package-lock.json")) {
    return "npm";
  }

  return undefined;
}

function detectFrameworks(dependencies: DependencyInfo[]): FrameworkInfo[] {
  const dependencyNames = new Set(dependencies.map((dependency) => dependency.name.toLowerCase()));
  const frameworks: FrameworkInfo[] = [];

  for (const rule of FRAMEWORK_RULES) {
    if (dependencyNames.has(rule.dependency.toLowerCase())) {
      frameworks.push({
        name: rule.name,
        category: rule.category,
        evidence: `Detected from dependency \`${rule.dependency}\``
      });
    }
  }

  return frameworks.sort((left, right) => left.name.localeCompare(right.name));
}

function detectConfigFiles(snapshot: RepositorySnapshot): { configFiles: ConfigFileInfo[]; environmentFiles: string[] } {
  const configFiles: ConfigFileInfo[] = [];
  const environmentFiles: string[] = [];

  for (const entry of snapshot.entries) {
    if (entry.kind !== "file") {
      continue;
    }

    const parts = entry.relativePath.split("/");
    const filename = parts[parts.length - 1];
    const rootLevel = parts.length === 1 || (parts[0] === ".github" && parts[1] === "workflows");

    if (!rootLevel) {
      continue;
    }

    for (const rule of CONFIG_FILE_RULES) {
      if (rule.matcher.test(filename)) {
        configFiles.push({
          path: entry.relativePath,
          category: rule.category,
          description: rule.description
        });

        if (rule.category === "environment") {
          environmentFiles.push(entry.relativePath);
        }
        break;
      }
    }

    if (entry.relativePath.startsWith(".github/workflows/")) {
      configFiles.push({
        path: entry.relativePath,
        category: "ci",
        description: "GitHub Actions workflow"
      });
    }
  }

  return {
    configFiles: configFiles.sort((left, right) => left.path.localeCompare(right.path)),
    environmentFiles: uniqueSorted(environmentFiles)
  };
}

function deriveTooling(frameworks: FrameworkInfo[], configFiles: ConfigFileInfo[], packageManager: string | undefined): ProjectInsights["tooling"] {
  const buildTools = uniqueSorted(frameworks.filter((framework) => framework.category === "build").map((framework) => framework.name));
  const testTools = uniqueSorted(frameworks.filter((framework) => framework.category === "testing").map((framework) => framework.name));
  const lintTools = uniqueSorted(frameworks.filter((framework) => framework.category === "linting").map((framework) => framework.name));
  const ciTools = uniqueSorted(
    configFiles
      .filter((file) => file.category === "ci")
      .map((file) => file.description)
  );

  return {
    packageManager,
    buildTools,
    testTools,
    lintTools,
    ciTools
  };
}

function detectPatterns(
  snapshot: RepositorySnapshot,
  entrypoints: EntrypointInfo[],
  frameworks: FrameworkInfo[],
  environmentFiles: string[]
): string[] {
  const patterns: string[] = [];
  const frameworkNames = new Set(frameworks.map((framework) => framework.name));
  const httpServiceFrameworks = new Set([
    "Actix Web",
    "Axum",
    "Django",
    "Express",
    "FastAPI",
    "Fastify",
    "Flask",
    "Gin",
    "Gorilla Mux",
    "Hono",
    "Koa",
    "NestJS"
  ]);

  if (snapshot.manifests.packageJson?.workspaces.length || snapshot.entries.some((entry) => entry.relativePath.startsWith("packages/"))) {
    patterns.push("Repository appears to use a workspace or monorepo layout.");
  }
  if (entrypoints.some((entrypoint) => entrypoint.kind === "cli-bin")) {
    patterns.push("Repository exposes a command-line entry point.");
  }
  if ([...frameworkNames].some((frameworkName) => httpServiceFrameworks.has(frameworkName))) {
    patterns.push("Repository contains an HTTP service surface.");
  }
  if (environmentFiles.length > 0) {
    patterns.push("Repository relies on environment-based configuration.");
  }
  if (snapshot.entries.some((entry) => entry.relativePath === "Dockerfile")) {
    patterns.push("Repository includes containerization support.");
  }

  return patterns;
}

function detectScripts(snapshot: RepositorySnapshot): ScriptInfo[] {
  return Object.entries(snapshot.manifests.packageJson?.scripts ?? {})
    .map(([name, command]) => ({
      name,
      command,
      category: categorizeScript(name)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function detectImportantFiles(snapshot: RepositorySnapshot, entrypoints: EntrypointInfo[], configFiles: ConfigFileInfo[]): string[] {
  const importantFiles = [
    ...entrypoints.map((entrypoint) => entrypoint.relativePath),
    ...configFiles.map((file) => file.path)
  ];

  for (const candidate of ["package.json", "tsconfig.json", "README.md", "src/index.ts", "src/main.ts", "src/server.ts"]) {
    if (snapshot.entries.some((entry) => entry.relativePath === candidate)) {
      importantFiles.push(candidate);
    }
  }

  return uniqueSorted(importantFiles).slice(0, 20);
}

export function buildProjectInsights(
  snapshot: RepositorySnapshot,
  dependencies: DependencyInfo[],
  entrypoints: EntrypointInfo[]
): ProjectInsights {
  const packageManager = detectPackageManager(snapshot);
  const frameworks = detectFrameworks(dependencies);
  const { configFiles, environmentFiles } = detectConfigFiles(snapshot);
  const scripts = detectScripts(snapshot);
  const tooling = deriveTooling(frameworks, configFiles, packageManager);

  return {
    packageManager,
    frameworks,
    tooling,
    scripts,
    configFiles,
    environmentFiles,
    notablePatterns: detectPatterns(snapshot, entrypoints, frameworks, environmentFiles),
    importantFiles: detectImportantFiles(snapshot, entrypoints, configFiles)
  };
}
