import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { existsSync } from "node:fs";
import { parseExcel, importStats, type Produto } from "../services/excelParser";
import {
  storeLoad,
  type Workspace,
} from "../services/objectStore";
import { workspaceFromRequest } from "../services/workspace";
import {
  generatedFilePath,
  generatedObjectPath,
  writeGeneratedFile,
} from "../services/generatedFiles";
import {
  getEstadoVersion,
  getEstadoVersionado,
  mergeEstado,
  mergeEstadoFrontend,
  savePrecarioPdfVersioned,
  removePrecarioPdfVersioned,
  loadPrecarioPdf,
  finalizarMes,
  getHistorico,
  downloadHistorico,
  type EstadoServidor,
  type Etapa,
  EstadoConflictError,
} from "../services/estadoStorage";
import { renderEncarteHtml, type EncarteBg } from "../services/encarteTemplate";
import { htmlToPdf } from "../services/pdfGenerator";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.mimetype.includes("spreadsheet") ||
      file.mimetype.includes("excel");
    if (!ok) {
      cb(new Error("Apenas arquivos .xlsx são aceitos"));
      return;
    }
    cb(null, true);
  },
});

// ---------- Per-workspace (RS / MS) in-memory state ----------

interface MemState {
  html: string | null;
  produtos: Produto[];
  mes: string;
  bg: EncarteBg;
  filename: string; // last generated preçário PDF filename
  precarioObject: string | null;
  version: string | null;
}

const mem = new Map<Workspace, MemState>();

const wsOf = workspaceFromRequest;

function memOf(ws: Workspace): MemState {
  let st = mem.get(ws);
  if (!st) {
    st = {
      html: null,
      produtos: [],
      mes: "",
      bg: "white",
      filename: "",
      precarioObject: null,
      version: null,
    };
    mem.set(ws, st);
  }
  return st;
}

/**
 * Hydrate the in-memory state from persisted storage (used after a server
 * restart / republish so the user resumes where they stopped).
 */
async function hydrate(ws: Workspace): Promise<MemState> {
  const st = memOf(ws);
  try {
    const currentVersion = await getEstadoVersion(ws);
    if (st.version === currentVersion) return st;

    const loaded = await getEstadoVersionado(ws);
    const sv = loaded.estado.servidor;
    const next: MemState = {
      html: null,
      produtos: [],
      mes: "",
      bg: "white",
      filename: "",
      precarioObject: null,
      version: loaded.version,
    };
    if (sv && Array.isArray(sv.produtos) && sv.produtos.length > 0) {
      next.produtos = sv.produtos;
      next.mes = sv.mes || "";
      next.bg = sv.bg === "color" ? "color" : "white";
      next.filename = sv.filename || "";
      next.precarioObject = sv.precarioObject || null;
      next.html = renderEncarteHtml(next.produtos, {
        mes: next.mes,
        bg: next.bg,
      });
    }
    mem.set(ws, next);
    return next;
  } catch {
    // Storage unavailable: keep the last known local state.
  }
  return st;
}

/** Persist the server-side part of the state with collaboration protection. */
async function persistServidor(
  ws: Workspace,
  st: MemState,
  nomeArquivo: string,
  expectedVersion: string,
  precarioObject: string,
) {
  const servidor: EstadoServidor = {
    produtos: st.produtos,
    mes: st.mes,
    bg: st.bg,
    nomeArquivo,
    filename: st.filename,
    precarioObject,
    atualizadoEm: new Date().toISOString(),
  };
  return mergeEstado(ws, { servidor }, expectedVersion);
}

function parseBg(value: unknown): EncarteBg {
  return value === "color" ? "color" : "white";
}

function safeName(input: string): string {
  const cleaned = input
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned || `encarte_${Date.now()}`;
}

router.post("/upload", upload.single("planilha"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado." });
      return;
    }

    const ws = wsOf(req);
    const validadeInicio = String(req.body?.validadeInicio ?? "").trim();
    const validadeFim = String(req.body?.validadeFim ?? "").trim();
    const mes = String(req.body?.mes ?? "").trim();
    const nomeArquivoRaw = String(req.body?.nomeArquivo ?? "").trim() || "encarte";
    const expectedVersion =
      typeof req.body?.version === "string" ? req.body.version : null;
    if (expectedVersion === null) {
      res.status(428).json({
        error: "Recarregue a página antes de gerar o preçário.",
        version: await getEstadoVersion(ws),
      });
      return;
    }

    req.log.info(
      {
        ws,
        filename: req.file.originalname,
        size: req.file.size,
        validadeInicio,
        validadeFim,
        mes,
      },
      "Upload recebido",
    );

    const parsed = parseExcel(req.file.buffer, { validadeInicio, validadeFim });

    req.log.info(
      {
        sheetsFound: parsed.abasEncontradas,
        sheetUsed: parsed.abaUtilizada,
        total: parsed.total,
        validos: parsed.validos,
        invalidos: parsed.invalidos,
      },
      "Planilha processada",
    );

    if (parsed.validos === 0) {
      res
        .status(400)
        .json({ error: "Nenhum produto válido encontrado na planilha.", stats: importStats(parsed) });
      return;
    }

    const bg = parseBg(req.body?.bg);
    const html = renderEncarteHtml(parsed.produtos, { mes, bg });
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    const nextState: MemState = {
      html,
      produtos: parsed.produtos,
      mes,
      bg,
      filename,
      precarioObject: null,
      version: null,
    };
    const precarioObject = await savePrecarioPdfVersioned(ws, pdf);
    let persisted;
    try {
      persisted = await persistServidor(
        ws,
        nextState,
        nomeArquivoRaw,
        expectedVersion,
        precarioObject,
      );
    } catch (error) {
      await removePrecarioPdfVersioned(precarioObject).catch(() => undefined);
      throw error;
    }
    nextState.precarioObject = precarioObject;
    nextState.version = persisted.version;
    const filepath = await writeGeneratedFile(ws, filename, pdf).catch((error) => {
      req.log.warn({ error }, "Falha ao gravar cópia local do preçário");
      return "armazenamento persistente";
    });
    mem.set(ws, nextState);
    const previousObject = persisted.anterior?.servidor?.precarioObject;
    if (previousObject && previousObject !== precarioObject) {
      await removePrecarioPdfVersioned(previousObject).catch((error) =>
        req.log.warn({ error }, "Falha ao remover PDF persistido anterior"),
      );
    }

    req.log.info({ filepath, sizeBytes: pdf.length }, "PDF gerado");

    res.json({
      ok: true,
      version: persisted.version,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      previewUrl: `/api/preview`,
      produtos: parsed.produtos,
      stats: {
        ...importStats(parsed),
        paginas: Math.ceil(parsed.validos / 14),
      },
    });
  } catch (err: unknown) {
    if (err instanceof EstadoConflictError) {
      res.status(409).json({
        error: "O encarte foi atualizado em outra sessão.",
        version: err.version,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao processar upload");
    res.status(500).json({ error: message });
  }
});

function sanitizeProduto(input: unknown): Produto | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const str = (k: string): string =>
    obj[k] === undefined || obj[k] === null ? "" : String(obj[k]).trim();
  const nome = str("nome");
  const precoInteiro = str("precoInteiro");
  const precoCentavos = str("precoCentavos");
  if (!nome || !precoInteiro) return null;
  const cents = precoCentavos.padStart(2, "0").slice(0, 2) || "00";
  return {
    espaco: str("espaco"),
    fabricante: str("fabricante"),
    ean: str("ean"),
    nome,
    descricao: str("descricao"),
    precoOriginal: `R$ ${precoInteiro},${cents}`,
    precoInteiro,
    precoCentavos: cents,
    validadeInicio: str("validadeInicio"),
    validadeFim: str("validadeFim"),
  };
}

router.post("/generate", async (req, res) => {
  try {
    const ws = wsOf(req);
    const body = req.body ?? {};
    const rawProdutos = Array.isArray(body.produtos) ? body.produtos : [];
    const produtos: Produto[] = rawProdutos
      .map(sanitizeProduto)
      .filter((p: Produto | null): p is Produto => p !== null);

    if (produtos.length === 0) {
      res.status(400).json({ error: "Nenhum produto válido enviado." });
      return;
    }

    const mes = String(body.mes ?? "").trim();
    const nomeArquivoRaw = String(body.nomeArquivo ?? "").trim() || "encarte";
    const bg = parseBg(body.bg);
    const expectedVersion =
      typeof body.version === "string" ? body.version : null;
    if (expectedVersion === null) {
      res.status(428).json({
        error: "Recarregue a página antes de gerar o preçário.",
        version: await getEstadoVersion(ws),
      });
      return;
    }

    const html = renderEncarteHtml(produtos, { mes, bg });
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    const nextState: MemState = {
      html,
      produtos,
      mes,
      bg,
      filename,
      precarioObject: null,
      version: null,
    };
    const precarioObject = await savePrecarioPdfVersioned(ws, pdf);
    let persisted;
    try {
      persisted = await persistServidor(
        ws,
        nextState,
        nomeArquivoRaw,
        expectedVersion,
        precarioObject,
      );
    } catch (error) {
      await removePrecarioPdfVersioned(precarioObject).catch(() => undefined);
      throw error;
    }
    nextState.precarioObject = precarioObject;
    nextState.version = persisted.version;
    const filepath = await writeGeneratedFile(ws, filename, pdf).catch((error) => {
      req.log.warn({ error }, "Falha ao gravar cópia local do preçário");
      return "armazenamento persistente";
    });
    mem.set(ws, nextState);
    const previousObject = persisted.anterior?.servidor?.precarioObject;
    if (previousObject && previousObject !== precarioObject) {
      await removePrecarioPdfVersioned(previousObject).catch((error) =>
        req.log.warn({ error }, "Falha ao remover PDF persistido anterior"),
      );
    }

    req.log.info(
      { ws, filepath, sizeBytes: pdf.length, produtos: produtos.length },
      "PDF regenerado",
    );

    res.json({
      ok: true,
      version: persisted.version,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      previewUrl: `/api/preview`,
      stats: {
        validos: produtos.length,
        paginas: Math.ceil(produtos.length / 14),
      },
    });
  } catch (err: unknown) {
    if (err instanceof EstadoConflictError) {
      res.status(409).json({
        error: "O encarte foi atualizado em outra sessão.",
        version: err.version,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao regenerar PDF");
    res.status(500).json({ error: message });
  }
});

router.get("/download/:filename", async (req, res) => {
  const { filename } = req.params;
  const safe = path.basename(filename);
  const ws = wsOf(req);
  const st = await hydrate(ws);

  const isPrecario = st.filename !== "" && safe === st.filename;

  // The current preçário always comes from the immutable object referenced by
  // the persisted state. A same-named local file may belong to an older cycle
  // or another app instance.
  if (isPrecario) {
    try {
      const pdf = await loadPrecarioPdf(ws, st.precarioObject);
      if (pdf) {
        res
          .type("application/pdf")
          .setHeader("Content-Disposition", `attachment; filename="${safe}"`)
          .send(pdf);
        return;
      }
    } catch (err) {
      req.log.warn({ err }, "Falha ao recuperar preçário persistido");
    }
  }

  const filepath = generatedFilePath(ws, safe);
  if (existsSync(filepath)) {
    res.download(filepath, safe);
    return;
  }

  // Arquivo fora do disco local: no app publicado (autoscale) a geração e o
  // download podem cair em máquinas diferentes — o disco não é compartilhado.
  // Os arquivos gerados em lote ficam também no bucket, em arquivos/<nome>.
  try {
    const fromStore = await storeLoad(generatedObjectPath(ws, safe));
    if (fromStore) {
      const tipos: Record<string, string> = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
      };
      res
        .type(tipos[path.extname(safe).toLowerCase()] ?? "application/octet-stream")
        .setHeader("Content-Disposition", `attachment; filename="${safe}"`)
        .send(fromStore);
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "Falha ao buscar arquivo gerado no bucket");
  }

  res.status(404).json({ error: "Arquivo não encontrado." });
});

// ---------- Estado da sessão (retomar de onde parou) ----------

function parseEtapa(v: unknown): Etapa | undefined {
  return v === "precarios" || v === "telas" || v === "cards" || v === "stories"
    ? v
    : undefined;
}

router.get("/estado", async (req, res) => {
  const ws = wsOf(req);
  try {
    const [versionado, historico] = await Promise.all([
      getEstadoVersionado(ws),
      getHistorico(ws).catch(() => null),
    ]);
    const { estado, version } = versionado;
    res.json({
      ws,
      version,
      etapa: estado.etapa || "precarios",
      servidor: estado.servidor
        ? {
            mes: estado.servidor.mes,
            nomeArquivo: estado.servidor.nomeArquivo,
            filename: estado.servidor.filename,
            produtos: estado.servidor.produtos,
            bg: estado.servidor.bg,
            atualizadoEm: estado.servidor.atualizadoEm,
          }
        : null,
      frontend: estado.frontend || null,
      historico,
    });
  } catch (err) {
    req.log.error({ err }, "Erro ao carregar estado");
    res.status(500).json({ error: "Erro ao carregar o progresso salvo." });
  }
});

router.get("/estado/versao", async (req, res) => {
  const ws = wsOf(req);
  try {
    res.json({ ws, version: await getEstadoVersion(ws) });
  } catch (err) {
    req.log.error({ err }, "Erro ao consultar versão do encarte");
    res.status(500).json({ error: "Erro ao consultar atualizações." });
  }
});

router.post("/estado", async (req, res) => {
  const ws = wsOf(req);
  try {
    const body = req.body ?? {};
    const expectedVersion =
      typeof body.version === "string" ? body.version : null;
    if (expectedVersion === null) {
      res.status(428).json({
        error: "Recarregue a página antes de salvar.",
        version: await getEstadoVersion(ws),
      });
      return;
    }
    const patch: Record<string, unknown> = {};
    const etapa = parseEtapa(body.etapa);
    if (etapa) patch["etapa"] = etapa;
    const temFrontend = body.frontend !== undefined;
    if (Object.keys(patch).length === 0 && !temFrontend) {
      res.json({ ok: true, version: await getEstadoVersion(ws) });
      return;
    }
    if (temFrontend) {
      const saved = await mergeEstadoFrontend(
        ws,
        patch,
        body.frontend,
        expectedVersion,
      );
      res.json({ ok: true, version: saved.version });
      return;
    }
    const saved = await mergeEstado(ws, patch, expectedVersion);
    res.json({ ok: true, version: saved.version });
  } catch (err) {
    if (err instanceof EstadoConflictError) {
      res.status(409).json({
        error: "O encarte foi atualizado em outra sessão.",
        version: err.version,
      });
      return;
    }
    req.log.error({ err }, "Erro ao salvar estado");
    res.status(500).json({ error: "Erro ao salvar o progresso." });
  }
});

// Salva UMA foto imediatamente (pacote pequeno). É a proteção principal contra
// perda de fotos: o autosave completo pode ser grande/lento e morrer junto com
// a página; este endpoint mescla só a chave enviada no mapa frontend.fotos.
router.post("/estado/foto", async (req, res) => {
  const ws = wsOf(req);
  try {
    const { key, foto, version } = (req.body ?? {}) as {
      key?: unknown;
      foto?: unknown;
      version?: unknown;
    };
    if (typeof version !== "string") {
      res.status(428).json({
        error: "Recarregue a página antes de salvar.",
        version: await getEstadoVersion(ws),
      });
      return;
    }
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ error: "key obrigatória" });
      return;
    }
    if (foto !== null && typeof foto !== "string") {
      res.status(400).json({ error: "foto deve ser string (data URI) ou null" });
      return;
    }
    const saved = await mergeEstadoFrontend(
      ws,
      {},
      { fotos: { [key]: foto } },
      version,
    );
    res.json({ ok: true, version: saved.version });
  } catch (err) {
    if (err instanceof EstadoConflictError) {
      res.status(409).json({
        error: "O encarte foi atualizado em outra sessão.",
        version: err.version,
      });
      return;
    }
    req.log.error({ err }, "Erro ao salvar foto");
    res.status(500).json({ error: "Erro ao salvar a foto." });
  }
});

// ---------- Finalizar mês + histórico ----------

router.post("/finalizar", async (req, res) => {
  const ws = wsOf(req);
  try {
    const expectedVersion =
      typeof req.body?.version === "string" ? req.body.version : null;
    if (expectedVersion === null) {
      res.status(428).json({
        error: "Recarregue a página antes de finalizar.",
        version: await getEstadoVersion(ws),
      });
      return;
    }
    const meta = await finalizarMes(ws, expectedVersion);
    mem.delete(ws); // clear in-memory state for a fresh month
    req.log.info({ ws, meta }, "Mês finalizado");
    res.json({ ok: true, historico: meta });
  } catch (err) {
    if (err instanceof EstadoConflictError) {
      res.status(409).json({
        error: "O encarte foi atualizado em outra sessão.",
        version: err.version,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao finalizar mês");
    res.status(500).json({ error: message });
  }
});

router.get("/historico", async (req, res) => {
  const ws = wsOf(req);
  try {
    res.json({ historico: await getHistorico(ws) });
  } catch (err) {
    req.log.error({ err }, "Erro ao consultar histórico");
    res.status(500).json({ error: "Erro ao consultar o histórico." });
  }
});

router.get("/historico/download/precario", async (req, res) => {
  const ws = wsOf(req);
  try {
    const pdf = await downloadHistorico(ws);
    if (!pdf) {
      res.status(404).json({ error: "Arquivo não encontrado no histórico." });
      return;
    }
    res
      .type("application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${ws}_mes_anterior_precario.pdf"`,
      )
      .send(pdf);
  } catch (err) {
    req.log.error({ err }, "Erro ao baixar histórico");
    res.status(500).json({ error: "Erro ao baixar o arquivo do histórico." });
  }
});

router.get("/preview", async (req, res) => {
  const st = await hydrate(wsOf(req));
  if (!st.produtos || st.produtos.length === 0) {
    res.status(404).send("<h1>Nenhum encarte gerado ainda.</h1>");
    return;
  }
  const editable = req.query["edit"] === "1";
  const bg = req.query["bg"] !== undefined ? parseBg(req.query["bg"]) : st.bg;
  const html = renderEncarteHtml(st.produtos, {
    mes: st.mes,
    editable,
    bg,
  });
  res.type("html").send(html);
});

export default router;
