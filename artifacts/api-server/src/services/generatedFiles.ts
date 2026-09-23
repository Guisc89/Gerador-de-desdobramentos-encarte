import fs from "node:fs/promises";
import path from "node:path";
import { storeSave } from "./objectStore";
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

/**
 * Persist a generated download in shared storage before keeping the local-disk
 * copy used by the current instance. Generation and download requests can land
 * on different autoscale instances, so disk alone is only a cache.
 */
export async function persistGeneratedFile(
  workspace: Workspace,
  filename: string,
  contents: Buffer,
  contentType: "image/png" | "application/pdf",
): Promise<string> {
  await storeSave(
    generatedObjectPath(workspace, filename),
    contents,
    contentType,
  );
  return writeGeneratedFile(workspace, filename, contents);
}