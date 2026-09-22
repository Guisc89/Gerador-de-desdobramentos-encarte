import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  isStorePreconditionFailed as defaultIsStorePreconditionFailed,
  storeLoad as defaultStoreLoad,
  storeLoadJsonVersioned as defaultStoreLoadJsonVersioned,
  storeSaveJson as defaultStoreSaveJson,
  storeSaveJsonConditional as defaultStoreSaveJsonConditional,
} from "../services/objectStore";
import { workspaceFromRequest } from "../services/workspace";
import {
  getHistorico as defaultGetHistorico,
  getHistoricoArchive as defaultGetHistoricoArchive,
  type HistoricoArchive,
  type HistoricoMeta,
} from "../services/estadoStorage";
import {
  gerarHistoricoPdf as defaultGerarHistoricoPdf,
  historicoArtifactPath,
  type HistoricoMaterialTipo,
} from "../services/historicoMateriais";

interface GenerationStatus {
  status: "pending" | "failed";
  owner: string;
  startedAt: string;
  error?: string;
}

const GENERATION_LEASE_MS = 15 * 60 * 1000;

export interface HistoricoRouteDeps {
  getHistorico(ws: "rs" | "ms"): Promise<HistoricoMeta | null>;
  getHistoricoArchive(
    ws: "rs" | "ms",
    archiveId: string,
  ): Promise<HistoricoArchive | null>;
  storeLoad(path: string): Promise<Buffer | null>;
  storeLoadJsonVersioned<T>(path: string): Promise<{
    value: T | null;
    version: { generation: string; revision: string };
  }>;
  storeSaveJson(path: string, value: unknown): Promise<void>;
  storeSaveJsonConditional(
    path: string,
    value: unknown,
    generation: string,
  ): Promise<string>;
  isStorePreconditionFailed(error: unknown): boolean;
  gerarHistoricoPdf(
    ws: "rs" | "ms",
    snapshotObject: string,
    archiveId: string,
    tipo: HistoricoMaterialTipo,
  ): Promise<void>;
}

const defaultDeps: HistoricoRouteDeps = {
  getHistorico: defaultGetHistorico,
  getHistoricoArchive: defaultGetHistoricoArchive,
  storeLoad: defaultStoreLoad,
  storeLoadJsonVersioned: defaultStoreLoadJsonVersioned,
  storeSaveJson: defaultStoreSaveJson,
  storeSaveJsonConditional: defaultStoreSaveJsonConditional,
  isStorePreconditionFailed: defaultIsStorePreconditionFailed,
  gerarHistoricoPdf: defaultGerarHistoricoPdf,
};

function tipoOf(value: string): HistoricoMaterialTipo | null {
  return value === "telas" || value === "cards" || value === "stories"
    ? value
    : null;
}

function archiveIdOf(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : null;
}

function statusPath(
  ws: string,
  archiveId: string,
  tipo: HistoricoMaterialTipo,
): string {
  return `encartes/${ws}/historico/rotacoes/${archiveId}/materiais/${tipo}.status.json`;
}

function downloadUrl(
  tipo: HistoricoMaterialTipo,
  archiveId: string,
  ws: string,
): string {
  const query = new URLSearchParams({ archiveId, ws });
  return `/api/historico/download/${tipo}?${query.toString()}`;
}

export function createHistoricoRouter(
  deps: HistoricoRouteDeps = defaultDeps,
): IRouter {
  const router: IRouter = Router();

router.post("/historico/pdf/:tipo", async (req, res) => {
  const tipo = tipoOf(req.params["tipo"] || "");
  if (!tipo) {
    res.status(404).json({ error: "Tipo de material histórico inválido." });
    return;
  }
  const archiveId = archiveIdOf(req.query["archiveId"]);
  if (!archiveId) {
    res.status(400).json({ error: "archiveId obrigatório ou inválido." });
    return;
  }
  const ws = workspaceFromRequest(req);

  try {
    const archive = await deps.getHistoricoArchive(ws, archiveId);
    if (!archive) {
      const current = await deps.getHistorico(ws);
      if (current?.archiveId && current.archiveId !== archiveId) {
        res.status(409).json({
          error: "O histórico foi substituído. Atualize a página.",
          archiveId: current.archiveId,
        });
      } else {
        res.status(404).json({
          error: "Snapshot deste histórico não está disponível.",
        });
      }
      return;
    }
    if (!archive.materiais.includes(tipo)) {
      res.status(404).json({
        error: "Material indisponível no snapshot deste histórico.",
      });
      return;
    }

    const artifactPath = historicoArtifactPath(ws, archiveId, tipo);
    if (await deps.storeLoad(artifactPath)) {
      res.json({
        ok: true,
        downloadUrl: downloadUrl(tipo, archiveId, ws),
      });
      return;
    }

    const jobPath = statusPath(ws, archiveId, tipo);
    const previous =
      await deps.storeLoadJsonVersioned<GenerationStatus>(jobPath);
    const retryFailed = req.query["retry"] === "1";
    if (previous.value?.status === "failed" && !retryFailed) {
      res.status(500).json({
        error: previous.value.error || "Falha ao gerar o material histórico.",
      });
      return;
    }
    const previousStartedAt = Date.parse(previous.value?.startedAt || "");
    const previousIsLive =
      previous.value?.status === "pending" &&
      Number.isFinite(previousStartedAt) &&
      Date.now() - previousStartedAt < GENERATION_LEASE_MS;
    if (previousIsLive) {
      res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
      return;
    }

    const pending: GenerationStatus = {
      status: "pending",
      owner: randomUUID(),
      startedAt: new Date().toISOString(),
    };
    try {
      await deps.storeSaveJsonConditional(
        jobPath,
        pending,
        previous.version.generation,
      );
    } catch (error) {
      if (!deps.isStorePreconditionFailed(error)) throw error;
      res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
      return;
    }

    // Render outside the request lifetime. Polling observes the immutable PDF
    // in object storage, so generation and download may hit different servers.
    void deps.gerarHistoricoPdf(
      ws,
      archive.snapshotObject,
      archive.archiveId,
      tipo,
    ).catch(async (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido.";
      req.log.error(
        { err: error, ws, archiveId, tipo },
        "Erro ao gerar PDF histórico",
      );
      await deps.storeSaveJson(jobPath, {
        ...pending,
        status: "failed",
        error: message,
      } satisfies GenerationStatus).catch(() => {});
    });
    res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
  } catch (error) {
    req.log.error({ err: error, ws, archiveId, tipo }, "Erro no histórico");
    res.status(500).json({ error: "Erro ao consultar o material histórico." });
  }
});

router.get("/historico/download/:tipo", async (req, res) => {
  const tipo = tipoOf(req.params["tipo"] || "");
  const archiveId = archiveIdOf(req.query["archiveId"]);
  if (!tipo || !archiveId) {
    res.status(400).json({ error: "Tipo ou archiveId inválido." });
    return;
  }
  const ws = workspaceFromRequest(req);
  try {
    const pdf =
      await deps.storeLoad(historicoArtifactPath(ws, archiveId, tipo));
    if (!pdf) {
      res.status(404).json({ error: "Arquivo histórico não encontrado." });
      return;
    }
    res
      .type("application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${ws}_${archiveId}_${tipo}.pdf"`,
      )
      .setHeader("Cache-Control", "private, max-age=31536000, immutable")
      .send(pdf);
  } catch (error) {
    req.log.error(
      { err: error, ws, archiveId, tipo },
      "Erro ao baixar PDF histórico",
    );
    res.status(500).json({ error: "Erro ao baixar o material histórico." });
  }
});

  return router;
}

export default createHistoricoRouter();