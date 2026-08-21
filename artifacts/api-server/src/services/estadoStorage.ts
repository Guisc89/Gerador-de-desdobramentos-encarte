import { randomUUID } from "node:crypto";
import type { Produto } from "./excelParser";
import {
  type Workspace,
  storeSave,
  storeSaveJson,
  storeLoad,
  storeLoadJson,
  storeLoadJsonVersioned,
  storeGetRevision,
  storeGetGeneration,
  storeSaveJsonConditional,
  isStorePreconditionFailed,
  isStoreNotFound,
  storeCopy,
  storeDelete,
  storeDeleteConditional,
  storeExists,
} from "./objectStore";

// Per-workspace (RS / MS) persisted state so the user can resume where they
// stopped, even after a server restart or a republish (production filesystem
// is ephemeral). Layout in the private bucket:
//   encartes/<ws>/estado.json      — full state (server + frontend blob)
//   encartes/<ws>/precario.pdf     — last generated preçário PDF
//   encartes/<ws>/historico/...    — previous month's archive

export type Etapa = "precarios" | "telas" | "cards" | "stories";

export interface EstadoServidor {
  produtos: Produto[];
  mes: string;
  bg: string;
  nomeArquivo: string;
  filename: string; // generated PDF filename on disk
  // Durable immutable PDF object for this exact state revision. Older states
  // may not have it and continue using encartes/<ws>/precario.pdf.
  precarioObject?: string;
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
}

interface HistoricoStored extends HistoricoMeta {
  fence?: string;
  precarioObject?: string;
}

interface PendingFinalization {
  fence: string;
  expectedVersion: string;
  expectedGeneration: string;
  archiveEstado: string;
  archivePrecario?: string;
  sourcePrecarioObject?: string;
  sourcePrecarioGeneration?: string;
  meta: HistoricoMeta;
}

export interface EstadoVersionado {
  estado: EstadoEncarte;
  version: string;
  anterior?: EstadoEncarte;
}

export class EstadoConflictError extends Error {
  constructor(public readonly version: string) {
    super("O encarte foi atualizado em outra sessão.");
    this.name = "EstadoConflictError";
  }
}

const estadoPath = (ws: Workspace) => `encartes/${ws}/estado.json`;
const precarioPath = (ws: Workspace) => `encartes/${ws}/precario.pdf`;
const histPath = (ws: Workspace, f: string) => `encartes/${ws}/historico/${f}`;
const mutationLockPath = (ws: Workspace) =>
  `encartes/${ws}/.mutation-lock.json`;
const pendingFinalizationPath = (ws: Workspace) =>
  `encartes/${ws}/finalizacao-pendente.json`;

const LOCK_LEASE_MS = 180_000;
const LOCK_WAIT_MS = 60_000;

interface MutationLock {
  owner: string;
  expiresAt: number;
}

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireMutationLock(ws: Workspace): Promise<string> {
  const lockPath = mutationLockPath(ws);
  const owner = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    try {
      await storeSaveJsonConditional(
        lockPath,
        { owner, expiresAt: Date.now() + LOCK_LEASE_MS } satisfies MutationLock,
        "0",
      );
      const created = await storeLoadJsonVersioned<MutationLock>(lockPath);
      if (created.value?.owner === owner) {
        return created.version.generation;
      }
    } catch (error) {
      if (!isStorePreconditionFailed(error)) throw error;
    }

    const current = await storeLoadJsonVersioned<MutationLock>(lockPath);
    if (
      current.version.generation !== "0" &&
      typeof current.value?.expiresAt === "number" &&
      current.value.expiresAt <= Date.now()
    ) {
      try {
        await storeDeleteConditional(
          lockPath,
          current.version.generation,
        );
      } catch (error) {
        if (!isStorePreconditionFailed(error) && !isStoreNotFound(error)) {
          throw error;
        }
      }
      continue;
    }
    await delay(150);
  }

  throw new Error(
    "O encarte está concluindo outra atualização. Tente novamente em instantes.",
  );
}

async function withMutationLock<T>(
  ws: Workspace,
  fn: (fence: string) => Promise<T>,
): Promise<T> {
  const fence = await acquireMutationLock(ws);
  try {
    await recoverPendingFinalization(ws, fence);
    return await fn(fence);
  } finally {
    try {
      await storeDeleteConditional(mutationLockPath(ws), fence);
    } catch {
      // A lease left behind after a transient failure expires automatically.
    }
  }
}

export async function getEstado(ws: Workspace): Promise<EstadoEncarte> {
  return (await storeLoadJson<EstadoEncarte>(estadoPath(ws))) || {};
}

export async function getEstadoVersionado(
  ws: Workspace,
): Promise<EstadoVersionado> {
  const result = await storeLoadJsonVersioned<EstadoEncarte>(estadoPath(ws));
  return {
    estado: result.value || {},
    version: result.version.revision,
  };
}

export function getEstadoVersion(ws: Workspace): Promise<string> {
  return storeGetRevision(estadoPath(ws));
}

async function commitEstado(
  ws: Workspace,
  mutate: (atual: EstadoEncarte) => EstadoEncarte,
  expectedVersion?: string,
): Promise<EstadoVersionado> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const loaded = await storeLoadJsonVersioned<EstadoEncarte>(estadoPath(ws));
    const atual = loaded.value || {};

    if (
      expectedVersion !== undefined &&
      loaded.version.revision !== expectedVersion
    ) {
      throw new EstadoConflictError(loaded.version.revision);
    }

    const novo = mutate(atual);
    try {
      const version = await storeSaveJsonConditional(
        estadoPath(ws),
        novo,
        loaded.version.generation,
      );
      return { estado: novo, version, anterior: atual };
    } catch (error) {
      if (!isStorePreconditionFailed(error)) throw error;
      if (expectedVersion !== undefined) {
        throw new EstadoConflictError(await getEstadoVersion(ws));
      }
      // Server-owned patches can be safely rebuilt over the latest object.
      // Client-owned frontend blobs never enter this retry path.
    }
  }
  throw new Error("Muitas atualizações simultâneas no mesmo encarte.");
}

export function mergeEstado(
  ws: Workspace,
  patch: Partial<EstadoEncarte>,
  expectedVersion?: string,
): Promise<EstadoVersionado> {
  return enqueue(ws, () =>
    withMutationLock(ws, () =>
      commitEstado(ws, (atual) => ({ ...atual, ...patch }), expectedVersion),
    ),
  );
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
  expectedVersion: string,
): Promise<EstadoVersionado> {
  return enqueue(ws, () =>
    withMutationLock(ws, () =>
      commitEstado(ws, (atual) => {
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
    return novo;
      }, expectedVersion),
    ),
  );
}

export async function savePrecarioPdfVersioned(
  ws: Workspace,
  pdf: Buffer,
): Promise<string> {
  const objectPath =
    `encartes/${ws}/precarios/${randomUUID()}.pdf`;
  await storeSave(objectPath, pdf, "application/pdf");
  return objectPath;
}

export function removePrecarioPdfVersioned(objectPath: string): Promise<void> {
  return storeDelete(objectPath);
}

export async function loadPrecarioPdf(
  ws: Workspace,
  objectPath?: string | null,
): Promise<Buffer | null> {
  return storeLoad(objectPath || precarioPath(ws));
}

interface FencedWriteResult {
  written: boolean;
  generation: string;
}

function compareFences(left: string, right: string): number {
  try {
    const a = BigInt(left);
    const b = BigInt(right);
    return a === b ? 0 : a > b ? 1 : -1;
  } catch {
    return left.localeCompare(right);
  }
}

async function writeFencedJson<T extends object>(
  objectPath: string,
  value: T,
  fence: string,
): Promise<FencedWriteResult> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current =
      await storeLoadJsonVersioned<T & { fence?: string }>(objectPath);
    const currentFence = current.value?.fence;
    if (currentFence) {
      const order = compareFences(currentFence, fence);
      if (order > 0) {
        return { written: false, generation: current.version.generation };
      }
      if (order === 0) {
        return { written: true, generation: current.version.generation };
      }
    }

    try {
      await storeSaveJsonConditional(
        objectPath,
        { ...value, fence },
        current.version.generation,
      );
    } catch (error) {
      if (isStorePreconditionFailed(error)) continue;
      throw error;
    }

    const saved =
      await storeLoadJsonVersioned<T & { fence?: string }>(objectPath);
    if (saved.value?.fence === fence) {
      return { written: true, generation: saved.version.generation };
    }
  }
  throw new Error("Não foi possível publicar a rotação do encarte.");
}

async function deletePendingMarker(
  ws: Workspace,
  generation: string,
): Promise<void> {
  try {
    await storeDeleteConditional(pendingFinalizationPath(ws), generation);
  } catch (error) {
    if (!isStorePreconditionFailed(error) && !isStoreNotFound(error)) {
      throw error;
    }
  }
}

async function cleanupFinalizedSource(
  ws: Workspace,
  pending: PendingFinalization,
): Promise<void> {
  if (pending.sourcePrecarioObject) {
    await storeDelete(pending.sourcePrecarioObject);
    return;
  }
  if (pending.sourcePrecarioGeneration) {
    try {
      await storeDeleteConditional(
        precarioPath(ws),
        pending.sourcePrecarioGeneration,
      );
    } catch (error) {
      if (!isStorePreconditionFailed(error) && !isStoreNotFound(error)) {
        throw error;
      }
    }
  }
}

async function completePendingFinalization(
  ws: Workspace,
  pending: PendingFinalization,
  pendingGeneration: string,
  fence: string,
  recovering: boolean,
): Promise<HistoricoMeta | null> {
  const current = await storeLoadJsonVersioned<EstadoEncarte>(estadoPath(ws));

  if (
    current.version.revision !== "0" &&
    current.version.revision !== pending.expectedVersion
  ) {
    const published =
      await storeLoadJson<HistoricoStored>(histPath(ws, "meta.json"));
    const alreadyPublished =
      published?.precarioObject === pending.archivePrecario &&
      published?.finalizadoEm === pending.meta.finalizadoEm;
    if (!alreadyPublished) {
      await Promise.all([
        storeDelete(pending.archiveEstado),
        pending.archivePrecario
          ? storeDelete(pending.archivePrecario)
          : Promise.resolve(),
      ]);
    }
    await deletePendingMarker(ws, pendingGeneration);
    if (recovering || alreadyPublished) return alreadyPublished ? pending.meta : null;
    throw new EstadoConflictError(current.version.revision);
  }

  if (current.version.revision === pending.expectedVersion) {
    try {
      await storeDeleteConditional(
        estadoPath(ws),
        current.version.generation,
      );
    } catch (error) {
      if (isStorePreconditionFailed(error) || isStoreNotFound(error)) {
        return completePendingFinalization(
          ws,
          pending,
          pendingGeneration,
          fence,
          recovering,
        );
      }
      throw error;
    }
  }

  const storedMeta: HistoricoStored = {
    ...pending.meta,
    fence,
    precarioObject: pending.archivePrecario,
  };
  const publication = await writeFencedJson(
    histPath(ws, "meta.json"),
    storedMeta,
    fence,
  );
  if (!publication.written) {
    await deletePendingMarker(ws, pendingGeneration);
    if (recovering) return null;
    throw new EstadoConflictError(await getEstadoVersion(ws));
  }

  await cleanupFinalizedSource(ws, pending);
  await deletePendingMarker(ws, pendingGeneration);
  return pending.meta;
}

async function recoverPendingFinalization(
  ws: Workspace,
  fence: string,
): Promise<void> {
  const loaded =
    await storeLoadJsonVersioned<PendingFinalization>(
      pendingFinalizationPath(ws),
    );
  if (!loaded.value) return;
  await completePendingFinalization(
    ws,
    loaded.value,
    loaded.version.generation,
    fence,
    true,
  );
}

/**
 * Finalize the current month: everything moves to `historico/` (replacing the
 * previous archive) and the current workspace is cleared for the next month.
 */
export function finalizarMes(
  ws: Workspace,
  expectedVersion: string,
): Promise<HistoricoMeta> {
  // Enqueued: waits for any in-flight persistence writes for this workspace,
  // and blocks new ones until the rotation + cleanup is complete.
  return enqueue(ws, () =>
    withMutationLock(ws, (fence) =>
      finalizarMesInterno(ws, expectedVersion, fence),
    ),
  );
}

async function finalizarMesInterno(
  ws: Workspace,
  expectedVersion: string,
  fence: string,
): Promise<HistoricoMeta> {
  const loaded = await storeLoadJsonVersioned<EstadoEncarte>(estadoPath(ws));
  if (loaded.version.revision !== expectedVersion) {
    throw new EstadoConflictError(loaded.version.revision);
  }
  const estado = loaded.value || {};
  const mes = estado.servidor?.mes || "";
  const archivePrefix =
    `encartes/${ws}/historico/rotacoes/${loaded.version.revision}`;
  const archiveEstado = `${archivePrefix}/estado.json`;
  const archivePrecario = `${archivePrefix}/precario.pdf`;

  // Complete the immutable archive before making the current state disappear.
  // A durable pending marker lets the next mutation resume this exact rotation
  // after a crash or a transient storage failure.
  await storeSaveJson(archiveEstado, estado);
  const precarioObject = estado.servidor?.precarioObject;
  const precarioGeneration = precarioObject
    ? "0"
    : await storeGetGeneration(precarioPath(ws));
  const temPrecario = precarioObject
    ? await storeCopy(precarioObject, archivePrecario)
    : precarioGeneration !== "0" &&
      await storeCopy(
        precarioPath(ws),
        archivePrecario,
        precarioGeneration,
      );

  const meta: HistoricoMeta = {
    mes,
    finalizadoEm: new Date().toISOString(),
    temPrecario,
  };
  const pending: PendingFinalization = {
    fence,
    expectedVersion,
    expectedGeneration: loaded.version.generation,
    archiveEstado,
    archivePrecario: temPrecario ? archivePrecario : undefined,
    sourcePrecarioObject: precarioObject,
    sourcePrecarioGeneration:
      !precarioObject && precarioGeneration !== "0"
        ? precarioGeneration
        : undefined,
    meta,
  };
  const marker = await writeFencedJson(
    pendingFinalizationPath(ws),
    pending,
    fence,
  );
  if (!marker.written) {
    throw new EstadoConflictError(await getEstadoVersion(ws));
  }

  const completed = await completePendingFinalization(
    ws,
    pending,
    marker.generation,
    fence,
    false,
  );
  if (!completed) {
    throw new EstadoConflictError(await getEstadoVersion(ws));
  }
  return completed;
}

export async function getHistorico(ws: Workspace): Promise<HistoricoMeta | null> {
  const stored =
    await storeLoadJson<HistoricoStored>(histPath(ws, "meta.json"));
  if (!stored) return null;
  return {
    mes: stored.mes,
    finalizadoEm: stored.finalizadoEm,
    temPrecario: stored.temPrecario,
  };
}

export async function downloadHistorico(
  ws: Workspace,
): Promise<Buffer | null> {
  const stored =
    await storeLoadJson<HistoricoStored>(histPath(ws, "meta.json"));
  if (!stored?.temPrecario) return null;
  return storeLoad(
    stored.precarioObject || histPath(ws, "precario.pdf"),
  );
}

export async function historicoExiste(ws: Workspace): Promise<boolean> {
  return storeExists(histPath(ws, "meta.json"));
}
