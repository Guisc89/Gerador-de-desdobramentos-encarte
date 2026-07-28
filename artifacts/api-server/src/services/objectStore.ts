import { Storage } from "@google-cloud/storage";

// GCS client authenticated via the Replit sidecar (works in dev and in the
// published deployment). Do not modify the credential setup.
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const storageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

/** Workspaces (encartes) supported by the app. */
export type Workspace = "rs" | "ms";

export function parseWorkspace(value: unknown): Workspace {
  return value === "ms" ? "ms" : "rs";
}

/** Resolve PRIVATE_OBJECT_DIR into bucket + base prefix. */
export function privateBase(): { bucket: string; prefix: string } {
  const dir = process.env["PRIVATE_OBJECT_DIR"] || "";
  if (!dir) {
    throw new Error(
      "Armazenamento não configurado (PRIVATE_OBJECT_DIR ausente).",
    );
  }
  const parts = dir.replace(/^\/+/, "").split("/");
  const bucket = parts[0]!;
  const prefix = parts.slice(1).join("/");
  return { bucket, prefix };
}

function file(objPath: string) {
  const { bucket, prefix } = privateBase();
  const full = prefix ? `${prefix}/${objPath}` : objPath;
  return storageClient.bucket(bucket).file(full);
}

export async function storeExists(objPath: string): Promise<boolean> {
  const [exists] = await file(objPath).exists();
  return exists;
}

export async function storeSave(
  objPath: string,
  data: Buffer | string,
  contentType: string,
): Promise<void> {
  await file(objPath).save(data, { contentType });
}

export async function storeLoad(objPath: string): Promise<Buffer | null> {
  const f = file(objPath);
  const [exists] = await f.exists();
  if (!exists) return null;
  const [contents] = await f.download();
  return contents;
}

export async function storeSaveJson(
  objPath: string,
  obj: unknown,
): Promise<void> {
  await storeSave(objPath, JSON.stringify(obj), "application/json");
}

export async function storeLoadJson<T>(objPath: string): Promise<T | null> {
  const buf = await storeLoad(objPath);
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function storeCopy(from: string, to: string): Promise<boolean> {
  const src = file(from);
  const [exists] = await src.exists();
  if (!exists) return false;
  await src.copy(file(to));
  return true;
}

export async function storeDelete(objPath: string): Promise<void> {
  await file(objPath).delete({ ignoreNotFound: true });
}
