import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export function getFixturePath(name: string): string {
  return path.resolve(__dirname, "..", "..", "test", "fixtures", name);
}

export async function copyFixture(name: string, destinationPath: string): Promise<void> {
  await fs.cp(getFixturePath(name), destinationPath, { recursive: true });
}

export async function runCommand(command: string, args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });

  return stdout.trim();
}

export async function initializeGitRepository(rootPath: string): Promise<void> {
  await runCommand("git", ["init", "--initial-branch=main"], rootPath);
  await runCommand("git", ["config", "user.email", "repo2docs@example.com"], rootPath);
  await runCommand("git", ["config", "user.name", "repo2docs"], rootPath);
  await runCommand("git", ["add", "."], rootPath);
  await runCommand("git", ["commit", "-m", "initial"], rootPath);
}

