import fs from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "./workspace";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

export function generatedFilePath(
  workspace: Workspace,
  filename: string,
): string {
  return path.join(OUTPUT_DIR, workspace, path.basename(filename));
}

export function generatedObjectPath(
  workspace: Workspace,
  filename: string,
): string {
  return `arquivos/${workspace}/${path.basename(filename)}`;
}

export function generatedDownloadUrl(
  workspace: Workspace,
  filename: string,
): string {
  return `/api/download/${encodeURIComponent(path.basename(filename))}?ws=${workspace}`;
}

export async function writeGeneratedFile(
  workspace: Workspace,
  filename: string,
  contents: Buffer,
): Promise<string> {
  const filepath = generatedFilePath(workspace, filename);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, contents);
  return filepath;
}