import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
export {
  parseWorkspace,
  type Workspace,
} from "./workspace";

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

function file(objPath: string, generation?: string) {
  const { bucket, prefix } = privateBase();
  const full = prefix ? `${prefix}/${objPath}` : objPath;
  return storageClient.bucket(bucket).file(
    full,
    generation ? { generation } : undefined,
  );
}

function errorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = Number((error as { code?: unknown }).code);
  return Number.isFinite(code) ? code : undefined;
}

export function isStorePreconditionFailed(error: unknown): boolean {
  return errorCode(error) === 412;
}

export function isStoreNotFound(error: unknown): boolean {
  return errorCode(error) === 404;
}

export interface StoreObjectVersion {
  generation: string;
  revision: string;
}

export interface StoreJsonVersioned<T> {
  value: T | null;
  version: StoreObjectVersion;
}

const MISSING_VERSION: StoreObjectVersion = {
  generation: "0",
  revision: "0",
};

function versionFromMetadata(metadata: {
  generation?: unknown;
  metadata?: Record<string, unknown>;
}): StoreObjectVersion {
  const generation = String(metadata.generation ?? "0");
  const customRevision = metadata.metadata?.["revision"];
  return {
    generation,
    revision:
      typeof customRevision === "string" && customRevision
        ? customRevision
        : generation,
  };
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

/**
 * Loads a JSON object together with the exact GCS generation used to read it.
 * The public revision is custom metadata set by conditional writes; old objects
 * without that metadata use their generation as a backwards-compatible token.
 */
export async function storeLoadJsonVersioned<T>(
  objPath: string,
): Promise<StoreJsonVersioned<T>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [metadata] = await file(objPath).getMetadata();
      const version = versionFromMetadata(metadata);
      const [contents] = await file(objPath, version.generation).download();
      try {
        return {
          value: JSON.parse(contents.toString("utf8")) as T,
          version,
        };
      } catch {
        return { value: null, version };
      }
    } catch (error) {
      if (errorCode(error) === 404) {
        // The object can disappear between metadata and the generation-specific
        // download while a month is finalized. Retry before declaring it empty.
        if (attempt < 2) continue;
        return { value: null, version: MISSING_VERSION };
      }
      throw error;
    }
  }
  return { value: null, version: MISSING_VERSION };
}

/** Returns only the lightweight public revision, without downloading JSON. */
export async function storeGetRevision(objPath: string): Promise<string> {
  try {
    const [metadata] = await file(objPath).getMetadata();
    return versionFromMetadata(metadata).revision;
  } catch (error) {
    if (errorCode(error) === 404) return MISSING_VERSION.revision;
    throw error;
  }
}

/** Returns the current object generation without downloading its contents. */
export async function storeGetGeneration(objPath: string): Promise<string> {
  try {
    const [metadata] = await file(objPath).getMetadata();
    return String(metadata.generation ?? "0");
  } catch (error) {
    if (errorCode(error) === 404) return MISSING_VERSION.generation;
    throw error;
  }
}

/**
 * Atomically replaces JSON only when the object still has the generation that
 * was read. GCS returns 412 if another app instance wrote first.
 */
export async function storeSaveJsonConditional(
  objPath: string,
  obj: unknown,
  ifGenerationMatch: string,
): Promise<string> {
  const revision = randomUUID();
  await file(objPath).save(JSON.stringify(obj), {
    contentType: "application/json",
    metadata: { metadata: { revision } },
    preconditionOpts: { ifGenerationMatch },
  });
  return revision;
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

export async function storeCopy(
  from: string,
  to: string,
  generation?: string,
): Promise<boolean> {
  const src = file(from, generation);
  const [exists] = await src.exists();
  if (!exists) return false;
  await src.copy(file(to));
  return true;
}

export async function storeDelete(objPath: string): Promise<void> {
  await file(objPath).delete({ ignoreNotFound: true });
}

export async function storeDeleteConditional(
  objPath: string,
  ifGenerationMatch: string,
): Promise<void> {
  await file(objPath).delete({
    ifGenerationMatch,
  });
}

// Lista os objetos sob um prefixo, devolvendo caminhos relativos ao diretório
// privado (o mesmo formato aceito pelas demais funções deste módulo).
export async function storeListPrefix(objPrefix: string): Promise<string[]> {
  const { bucket, prefix } = privateBase();
  const full = prefix ? `${prefix}/${objPrefix}` : objPrefix;
  const [files] = await storageClient.bucket(bucket).getFiles({ prefix: full });
  return files.map((f) => (prefix ? f.name.slice(prefix.length + 1) : f.name));
}
