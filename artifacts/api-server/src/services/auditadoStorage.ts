import { Storage } from "@google-cloud/storage";

// GCS client authenticated via the Replit sidecar (works in dev and in the
// published deployment). Do not modify the credential setup.
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageClient = new Storage({
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

export interface AuditadoInfo {
  mes: string;
  nomeOriginal: string;
  enviadoEm: string; // ISO date
  tamanhoBytes: number;
}

export interface AuditadoStatus {
  atual: AuditadoInfo | null;
  anterior: AuditadoInfo | null;
}

function privateDir(): { bucket: string; prefix: string } {
  const dir = process.env["PRIVATE_OBJECT_DIR"] || "";
  if (!dir) {
    throw new Error(
      "Armazenamento não configurado (PRIVATE_OBJECT_DIR ausente).",
    );
  }
  // Format: /<bucket>/<path...>
  const parts = dir.replace(/^\/+/, "").split("/");
  const bucket = parts[0]!;
  const prefix = parts.slice(1).join("/");
  return { bucket, prefix: prefix ? `${prefix}/auditados` : "auditados" };
}

function objectPath(prefix: string, slot: "atual" | "anterior", ext: string) {
  return `${prefix}/${slot}.${ext}`;
}

async function readMeta(
  bucket: string,
  prefix: string,
  slot: "atual" | "anterior",
): Promise<AuditadoInfo | null> {
  const file = storageClient
    .bucket(bucket)
    .file(objectPath(prefix, slot, "json"));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [contents] = await file.download();
  try {
    return JSON.parse(contents.toString("utf8")) as AuditadoInfo;
  } catch {
    return null;
  }
}

export async function getAuditadoStatus(): Promise<AuditadoStatus> {
  const { bucket, prefix } = privateDir();
  const [atual, anterior] = await Promise.all([
    readMeta(bucket, prefix, "atual"),
    readMeta(bucket, prefix, "anterior"),
  ]);
  return { atual, anterior };
}

export async function saveAuditado(
  pdf: Buffer,
  info: Omit<AuditadoInfo, "enviadoEm" | "tamanhoBytes">,
): Promise<AuditadoStatus> {
  const { bucket, prefix } = privateDir();
  const b = storageClient.bucket(bucket);

  // Rotate: current becomes previous (only two are kept).
  const atualPdf = b.file(objectPath(prefix, "atual", "pdf"));
  const [hasAtual] = await atualPdf.exists();
  if (hasAtual) {
    await Promise.all([
      atualPdf.copy(b.file(objectPath(prefix, "anterior", "pdf"))),
      b
        .file(objectPath(prefix, "atual", "json"))
        .copy(b.file(objectPath(prefix, "anterior", "json")))
        .catch(() => undefined),
    ]);
  }

  const meta: AuditadoInfo = {
    ...info,
    enviadoEm: new Date().toISOString(),
    tamanhoBytes: pdf.length,
  };
  await Promise.all([
    atualPdf.save(pdf, { contentType: "application/pdf" }),
    b.file(objectPath(prefix, "atual", "json")).save(JSON.stringify(meta), {
      contentType: "application/json",
    }),
  ]);
  return getAuditadoStatus();
}

export async function downloadAuditado(
  slot: "atual" | "anterior",
): Promise<{ meta: AuditadoInfo; pdf: Buffer } | null> {
  const { bucket, prefix } = privateDir();
  const meta = await readMeta(bucket, prefix, slot);
  if (!meta) return null;
  const file = storageClient.bucket(bucket).file(objectPath(prefix, slot, "pdf"));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [pdf] = await file.download();
  return { meta, pdf };
}

export async function removeAuditado(slot: "atual" | "anterior"): Promise<void> {
  const { bucket, prefix } = privateDir();
  const b = storageClient.bucket(bucket);
  await Promise.all([
    b.file(objectPath(prefix, slot, "pdf")).delete({ ignoreNotFound: true }),
    b.file(objectPath(prefix, slot, "json")).delete({ ignoreNotFound: true }),
  ]);
}
