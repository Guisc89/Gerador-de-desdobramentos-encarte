import {
  type Workspace,
  storeSave,
  storeSaveJson,
  storeLoad,
  storeLoadJson,
  storeCopy,
  storeDelete,
  storeExists,
} from "./objectStore";

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

function objPath(ws: Workspace, slot: "atual" | "anterior", ext: string) {
  return `encartes/${ws}/auditados/${slot}.${ext}`;
}

async function readMeta(
  ws: Workspace,
  slot: "atual" | "anterior",
): Promise<AuditadoInfo | null> {
  return storeLoadJson<AuditadoInfo>(objPath(ws, slot, "json"));
}

export async function getAuditadoStatus(ws: Workspace): Promise<AuditadoStatus> {
  const [atual, anterior] = await Promise.all([
    readMeta(ws, "atual"),
    readMeta(ws, "anterior"),
  ]);
  return { atual, anterior };
}

export async function saveAuditado(
  ws: Workspace,
  pdf: Buffer,
  info: Omit<AuditadoInfo, "enviadoEm" | "tamanhoBytes">,
): Promise<AuditadoStatus> {
  // Rotate: current becomes previous (only two are kept).
  if (await storeExists(objPath(ws, "atual", "pdf"))) {
    await Promise.all([
      storeCopy(objPath(ws, "atual", "pdf"), objPath(ws, "anterior", "pdf")),
      storeCopy(objPath(ws, "atual", "json"), objPath(ws, "anterior", "json")),
    ]);
  }
  const meta: AuditadoInfo = {
    ...info,
    enviadoEm: new Date().toISOString(),
    tamanhoBytes: pdf.length,
  };
  await Promise.all([
    storeSave(objPath(ws, "atual", "pdf"), pdf, "application/pdf"),
    storeSaveJson(objPath(ws, "atual", "json"), meta),
  ]);
  return getAuditadoStatus(ws);
}

export async function downloadAuditado(
  ws: Workspace,
  slot: "atual" | "anterior",
): Promise<{ meta: AuditadoInfo; pdf: Buffer } | null> {
  const meta = await readMeta(ws, slot);
  if (!meta) return null;
  const pdf = await storeLoad(objPath(ws, slot, "pdf"));
  if (!pdf) return null;
  return { meta, pdf };
}

export async function removeAuditado(
  ws: Workspace,
  slot: "atual" | "anterior",
): Promise<void> {
  await Promise.all([
    storeDelete(objPath(ws, slot, "pdf")),
    storeDelete(objPath(ws, slot, "json")),
  ]);
}
