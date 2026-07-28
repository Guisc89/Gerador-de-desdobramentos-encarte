import type { Produto } from "./excelParser";
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

// Per-workspace (RS / MS) persisted state so the user can resume where they
// stopped, even after a server restart or a republish (production filesystem
// is ephemeral). Layout in the private bucket:
//   encartes/<ws>/estado.json      — full state (server + frontend blob)
//   encartes/<ws>/precario.pdf     — last generated preçário PDF
//   encartes/<ws>/auditados/...    — audited PDFs (auditadoStorage.ts)
//   encartes/<ws>/historico/...    — previous month's archive

export type Etapa = "precarios" | "telas" | "cards" | "stories";

export interface EstadoServidor {
  produtos: Produto[];
  mes: string;
  bg: string;
  nomeArquivo: string;
  filename: string; // generated PDF filename on disk
  atualizadoEm: string;
}

export interface EstadoEncarte {
  etapa?: Etapa;
  servidor?: EstadoServidor;
  // Opaque blob saved by the frontend (telas organization, photos, etc.)
  frontend?: unknown;
  frontendAtualizadoEm?: string;
}

export interface HistoricoMeta {
  mes: string;
  finalizadoEm: string;
  temPrecario: boolean;
  temAuditado: boolean;
}

const estadoPath = (ws: Workspace) => `encartes/${ws}/estado.json`;
const precarioPath = (ws: Workspace) => `encartes/${ws}/precario.pdf`;
const histPath = (ws: Workspace, f: string) => `encartes/${ws}/historico/${f}`;

// Serialize ALL mutations per workspace through a queue. This prevents two
// classes of races: (1) concurrent read-modify-write on estado.json losing
// fields (autosave vs upload/generate), and (2) "Finalizar mês" running while
// a fire-and-forget persistence write is still in flight and resurrecting the
// just-cleared month.
const queues = new Map<Workspace, Promise<unknown>>();

function enqueue<T>(ws: Workspace, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(ws) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    ws,
    next.catch(() => undefined),
  );
  return next;
}

export async function getEstado(ws: Workspace): Promise<EstadoEncarte> {
  return (await storeLoadJson<EstadoEncarte>(estadoPath(ws))) || {};
}

export function mergeEstado(
  ws: Workspace,
  patch: Partial<EstadoEncarte>,
): Promise<EstadoEncarte> {
  return enqueue(ws, async () => {
    const atual = await getEstado(ws);
    const novo: EstadoEncarte = { ...atual, ...patch };
    await storeSaveJson(estadoPath(ws), novo);
    return novo;
  });
}

// Blobs de frontend que o autosave envia. Merge defensivo: um cliente "vazio"
// (aba recém-aberta, restauração incompleta, save disparado cedo demais) NUNCA
// pode apagar dados bons já persistidos — sub-blocos null/ausentes preservam o
// valor existente, e o mapa de fotos é mesclado chave a chave.
interface FrontendBlob {
  catalogo?: unknown;
  fotos?: Record<string, unknown>;
  // Chaves que o cliente pede para APAGAR do mapa de fotos (remoções e
  // renomeações). Necessário porque o merge é aditivo: a ausência de uma chave
  // nunca apaga nada — só um pedido explícito (tombstone ou valor null).
  fotosRemovidas?: unknown;
  telas?: unknown;
  cardsExtras?: unknown;
  storiesExtras?: unknown;
}

export function mergeEstadoFrontend(
  ws: Workspace,
  patch: Partial<EstadoEncarte>,
  frontendPatch: unknown,
): Promise<EstadoEncarte> {
  return enqueue(ws, async () => {
    const atual = await getEstado(ws);
    const velho = (atual.frontend || {}) as FrontendBlob;
    const novoFe = (frontendPatch || {}) as FrontendBlob;

    const escolhe = <K extends keyof FrontendBlob>(k: K): FrontendBlob[K] => {
      const v = novoFe[k];
      return v === null || v === undefined ? velho[k] : v;
    };

    // Fotos: mescla chave a chave — chaves novas vencem, antigas não somem só
    // porque o cliente ainda não as tinha carregado.
    const fotosVelhas = velho.fotos && typeof velho.fotos === "object" ? velho.fotos : {};
    const fotosNovas = novoFe.fotos && typeof novoFe.fotos === "object" ? novoFe.fotos : {};
    const fotos: Record<string, unknown> = { ...fotosVelhas, ...fotosNovas };
    // Exclusões explícitas: tombstones enviados pelo cliente e valores null
    // (usado pelo POST /estado/foto para remover uma única foto).
    if (Array.isArray(novoFe.fotosRemovidas)) {
      for (const k of novoFe.fotosRemovidas) {
        if (typeof k === "string") delete fotos[k];
      }
    }
    for (const k of Object.keys(fotos)) {
      if (fotos[k] === null) delete fotos[k];
    }

    const frontend: FrontendBlob = {
      catalogo: escolhe("catalogo"),
      fotos,
      telas: escolhe("telas"),
      cardsExtras: escolhe("cardsExtras"),
      storiesExtras: escolhe("storiesExtras"),
    };

    const novo: EstadoEncarte = {
      ...atual,
      ...patch,
      frontend,
      frontendAtualizadoEm: new Date().toISOString(),
    };
    await storeSaveJson(estadoPath(ws), novo);
    return novo;
  });
}

export function savePrecarioPdf(ws: Workspace, pdf: Buffer): Promise<void> {
  return enqueue(ws, () => storeSave(precarioPath(ws), pdf, "application/pdf"));
}

export async function loadPrecarioPdf(ws: Workspace): Promise<Buffer | null> {
  return storeLoad(precarioPath(ws));
}

/**
 * Finalize the current month: everything moves to `historico/` (replacing the
 * previous archive) and the current workspace is cleared for the next month.
 * The current audited PDF (if any) is archived too.
 */
export function finalizarMes(ws: Workspace): Promise<HistoricoMeta> {
  // Enqueued: waits for any in-flight persistence writes for this workspace,
  // and blocks new ones until the rotation + cleanup is complete.
  return enqueue(ws, () => finalizarMesInterno(ws));
}

async function finalizarMesInterno(ws: Workspace): Promise<HistoricoMeta> {
  const estado = await getEstado(ws);
  const mes = estado.servidor?.mes || "";

  const temPrecario = await storeCopy(precarioPath(ws), histPath(ws, "precario.pdf"));
  const temAuditado = await storeCopy(
    `encartes/${ws}/auditados/atual.pdf`,
    histPath(ws, "auditado.pdf"),
  );
  await storeCopy(estadoPath(ws), histPath(ws, "estado.json"));

  const meta: HistoricoMeta = {
    mes,
    finalizadoEm: new Date().toISOString(),
    temPrecario,
    temAuditado,
  };
  await storeSaveJson(histPath(ws, "meta.json"), meta);

  // Clear current cycle (audited "anterior" also goes — new month starts clean;
  // the archived audited PDF remains available in the history).
  await Promise.all([
    storeDelete(estadoPath(ws)),
    storeDelete(precarioPath(ws)),
    storeDelete(`encartes/${ws}/auditados/atual.pdf`),
    storeDelete(`encartes/${ws}/auditados/atual.json`),
    storeDelete(`encartes/${ws}/auditados/anterior.pdf`),
    storeDelete(`encartes/${ws}/auditados/anterior.json`),
  ]);
  return meta;
}

export async function getHistorico(ws: Workspace): Promise<HistoricoMeta | null> {
  return storeLoadJson<HistoricoMeta>(histPath(ws, "meta.json"));
}

export async function downloadHistorico(
  ws: Workspace,
  qual: "precario" | "auditado",
): Promise<Buffer | null> {
  return storeLoad(histPath(ws, `${qual}.pdf`));
}

export async function historicoExiste(ws: Workspace): Promise<boolean> {
  return storeExists(histPath(ws, "meta.json"));
}
