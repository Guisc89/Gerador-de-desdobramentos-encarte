import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseExcel, type Produto } from "../services/excelParser";
import {
  getAuditadoStatus,
  saveAuditado,
  downloadAuditado,
  removeAuditado,
} from "../services/auditadoStorage";
import {
  parseWorkspace,
  storeLoad,
  type Workspace,
} from "../services/objectStore";
import {
  getEstado,
  mergeEstado,
  mergeEstadoFrontend,
  savePrecarioPdf,
  loadPrecarioPdf,
  finalizarMes,
  getHistorico,
  downloadHistorico,
  type EstadoServidor,
  type Etapa,
} from "../services/estadoStorage";
import { renderEncarteHtml, type EncarteBg } from "../services/encarteTemplate";
import { htmlToPdf } from "../services/pdfGenerator";

const router: IRouter = Router();

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
if (!existsSync(OUTPUT_DIR)) {
  // synchronous mkdir is fine at startup
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fs.mkdir(OUTPUT_DIR, { recursive: true });
}

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
}

const mem = new Map<Workspace, MemState>();

function wsOf(req: {
  headers: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Workspace {
  // Query param takes precedence (iframes and <a> links can't set headers).
  return parseWorkspace(req.query?.["ws"] ?? req.headers["x-encarte"]);
}

function memOf(ws: Workspace): MemState {
  let st = mem.get(ws);
  if (!st) {
    st = { html: null, produtos: [], mes: "", bg: "white", filename: "" };
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
  if (st.produtos.length > 0) return st;
  try {
    const estado = await getEstado(ws);
    const sv = estado.servidor;
    if (sv && Array.isArray(sv.produtos) && sv.produtos.length > 0) {
      st.produtos = sv.produtos;
      st.mes = sv.mes || "";
      st.bg = sv.bg === "color" ? "color" : "white";
      st.filename = sv.filename || "";
      st.html = renderEncarteHtml(st.produtos, { mes: st.mes, bg: st.bg });
    }
  } catch {
    // storage unavailable — behave as empty state
  }
  return st;
}

/** Persist the server-side part of the state (fire-and-forget friendly). */
async function persistServidor(ws: Workspace, st: MemState, nomeArquivo: string) {
  const servidor: EstadoServidor = {
    produtos: st.produtos,
    mes: st.mes,
    bg: st.bg,
    nomeArquivo,
    filename: st.filename,
    atualizadoEm: new Date().toISOString(),
  };
  await mergeEstado(ws, { servidor });
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
        .json({ error: "Nenhum produto válido encontrado na planilha." });
      return;
    }

    const bg = parseBg(req.body?.bg);
    const html = renderEncarteHtml(parsed.produtos, { mes, bg });
    const st = memOf(ws);
    st.html = html;
    st.produtos = parsed.produtos;
    st.mes = mes;
    st.bg = bg;
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    st.filename = filename;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, pdf);

    // Persist so the session survives restarts/republish (non-blocking).
    void persistServidor(ws, st, nomeArquivoRaw).catch((err) =>
      req.log.warn({ err }, "Falha ao persistir estado"),
    );
    void savePrecarioPdf(ws, pdf).catch((err) =>
      req.log.warn({ err }, "Falha ao persistir PDF do preçário"),
    );

    req.log.info({ filepath, sizeBytes: pdf.length }, "PDF gerado");

    res.json({
      ok: true,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      previewUrl: `/api/preview`,
      produtos: parsed.produtos,
      stats: {
        abaUtilizada: parsed.abaUtilizada,
        abasEncontradas: parsed.abasEncontradas,
        totalLidos: parsed.total,
        validos: parsed.validos,
        invalidos: parsed.invalidos,
        pendentes: parsed.pendentes,
        paginas: Math.ceil(parsed.validos / 14),
      },
    });
  } catch (err: unknown) {
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

    const html = renderEncarteHtml(produtos, { mes, bg });
    const st = memOf(ws);
    st.html = html;
    st.produtos = produtos;
    st.mes = mes;
    st.bg = bg;
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    st.filename = filename;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, pdf);

    void persistServidor(ws, st, nomeArquivoRaw).catch((err) =>
      req.log.warn({ err }, "Falha ao persistir estado"),
    );
    void savePrecarioPdf(ws, pdf).catch((err) =>
      req.log.warn({ err }, "Falha ao persistir PDF do preçário"),
    );

    req.log.info(
      { ws, filepath, sizeBytes: pdf.length, produtos: produtos.length },
      "PDF regenerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      previewUrl: `/api/preview`,
      stats: {
        validos: produtos.length,
        paginas: Math.ceil(produtos.length / 14),
      },
    });
  } catch (err: unknown) {
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

  // The audited preçário replaces the generated one for downloads — but ONLY
  // for the preçário PDF itself (telas/cards PNGs and PDFs also use this
  // route and must never be hijacked). `?original=1` forces the generated one.
  const isPrecario = st.filename !== "" && safe === st.filename;
  if (isPrecario && req.query["original"] !== "1") {
    try {
      const auditado = await downloadAuditado(ws, "atual");
      if (auditado) {
        res
          .type("application/pdf")
          .setHeader(
            "Content-Disposition",
            `attachment; filename="${safe.replace(/\.pdf$/i, "")}_auditado.pdf"`,
          )
          .send(auditado.pdf);
        return;
      }
    } catch (err) {
      req.log.warn({ err }, "Falha ao buscar preçário auditado; servindo o gerado");
    }
  }

  const filepath = path.join(OUTPUT_DIR, safe);
  if (existsSync(filepath)) {
    res.download(filepath, safe);
    return;
  }

  // Arquivo fora do disco local: no app publicado (autoscale) a geração e o
  // download podem cair em máquinas diferentes — o disco não é compartilhado.
  // Os arquivos gerados em lote ficam também no bucket, em arquivos/<nome>.
  try {
    const fromStore = await storeLoad(`arquivos/${safe}`);
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

  // Disk file gone (e.g. server restarted in production) — recover the
  // persisted preçário PDF from storage.
  if (isPrecario) {
    try {
      const pdf = await loadPrecarioPdf(ws);
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
    const [estado, st, historico] = await Promise.all([
      getEstado(ws),
      hydrate(ws),
      getHistorico(ws).catch(() => null),
    ]);
    res.json({
      ws,
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
        : st.produtos.length > 0
          ? { mes: st.mes, produtos: st.produtos, bg: st.bg, filename: st.filename }
          : null,
      frontend: estado.frontend || null,
      historico,
    });
  } catch (err) {
    req.log.error({ err }, "Erro ao carregar estado");
    res.status(500).json({ error: "Erro ao carregar o progresso salvo." });
  }
});

router.post("/estado", async (req, res) => {
  const ws = wsOf(req);
  try {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};
    const etapa = parseEtapa(body.etapa);
    if (etapa) patch["etapa"] = etapa;
    const temFrontend = body.frontend !== undefined;
    if (Object.keys(patch).length === 0 && !temFrontend) {
      res.json({ ok: true });
      return;
    }
    if (temFrontend) {
      await mergeEstadoFrontend(ws, patch, body.frontend);
      res.json({ ok: true });
      return;
    }
    await mergeEstado(ws, patch);
    res.json({ ok: true });
  } catch (err) {
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
    const { key, foto } = (req.body ?? {}) as { key?: unknown; foto?: unknown };
    if (typeof key !== "string" || !key.trim()) {
      res.status(400).json({ error: "key obrigatória" });
      return;
    }
    if (foto !== null && typeof foto !== "string") {
      res.status(400).json({ error: "foto deve ser string (data URI) ou null" });
      return;
    }
    await mergeEstadoFrontend(ws, {}, { fotos: { [key]: foto } });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erro ao salvar foto");
    res.status(500).json({ error: "Erro ao salvar a foto." });
  }
});

// ---------- Finalizar mês + histórico ----------

router.post("/finalizar", async (req, res) => {
  const ws = wsOf(req);
  try {
    const meta = await finalizarMes(ws);
    mem.delete(ws); // clear in-memory state for a fresh month
    req.log.info({ ws, meta }, "Mês finalizado");
    res.json({ ok: true, historico: meta });
  } catch (err) {
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

router.get("/historico/download/:qual", async (req, res) => {
  const ws = wsOf(req);
  const qual = req.params["qual"] === "auditado" ? "auditado" : "precario";
  try {
    const pdf = await downloadHistorico(ws, qual);
    if (!pdf) {
      res.status(404).json({ error: "Arquivo não encontrado no histórico." });
      return;
    }
    res
      .type("application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${ws}_mes_anterior_${qual}.pdf"`,
      )
      .send(pdf);
  } catch (err) {
    req.log.error({ err }, "Erro ao baixar histórico");
    res.status(500).json({ error: "Erro ao baixar o arquivo do histórico." });
  }
});

// ---------- Preçário auditado (PDF conferido fora da plataforma) ----------

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith(".pdf") ||
      file.mimetype === "application/pdf";
    if (!ok) {
      cb(new Error("Apenas arquivos .pdf são aceitos"));
      return;
    }
    cb(null, true);
  },
});

router.get("/auditado/status", async (req, res) => {
  try {
    res.json(await getAuditadoStatus(wsOf(req)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao consultar preçário auditado");
    res.status(500).json({ error: message });
  }
});

router.post("/auditado/upload", uploadPdf.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado." });
      return;
    }
    // Basic sanity check: PDF magic bytes.
    if (!req.file.buffer.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
      res.status(400).json({ error: "O arquivo não parece ser um PDF válido." });
      return;
    }
    const ws = wsOf(req);
    const mes = String(req.body?.mes ?? "").trim();
    const status = await saveAuditado(ws, req.file.buffer, {
      mes,
      nomeOriginal: req.file.originalname,
    });
    req.log.info(
      { ws, mes, size: req.file.size, nome: req.file.originalname },
      "Preçário auditado salvo",
    );
    res.json({ ok: true, ...status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao salvar preçário auditado");
    res.status(500).json({ error: message });
  }
});

router.get("/auditado/download/:slot", async (req, res) => {
  const slot = req.params["slot"] === "anterior" ? "anterior" : "atual";
  try {
    const result = await downloadAuditado(wsOf(req), slot);
    if (!result) {
      res.status(404).json({ error: "Nenhum preçário auditado encontrado." });
      return;
    }
    const mesSafe = (result.meta.mes || "")
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_");
    const nome = mesSafe
      ? `precario_auditado_${mesSafe}.pdf`
      : `precario_auditado_${slot}.pdf`;
    res
      .type("application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${nome}"`)
      .send(result.pdf);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao baixar preçário auditado");
    res.status(500).json({ error: message });
  }
});

router.delete("/auditado/:slot", async (req, res) => {
  const slot = req.params["slot"] === "anterior" ? "anterior" : "atual";
  const ws = wsOf(req);
  try {
    await removeAuditado(ws, slot);
    res.json({ ok: true, ...(await getAuditadoStatus(ws)) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao remover preçário auditado");
    res.status(500).json({ error: message });
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
