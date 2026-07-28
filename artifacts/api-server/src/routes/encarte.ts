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

let lastHtml: string | null = null;
let lastProdutos: Produto[] = [];
let lastMes = "";
let lastBg: EncarteBg = "white";

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

    const validadeInicio = String(req.body?.validadeInicio ?? "").trim();
    const validadeFim = String(req.body?.validadeFim ?? "").trim();
    const mes = String(req.body?.mes ?? "").trim();
    const nomeArquivoRaw = String(req.body?.nomeArquivo ?? "").trim() || "encarte";

    req.log.info(
      {
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
    lastHtml = html;
    lastProdutos = parsed.produtos;
    lastMes = mes;
    lastBg = bg;
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, pdf);

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
    lastHtml = html;
    lastProdutos = produtos;
    lastMes = mes;
    lastBg = bg;
    const pdf = await htmlToPdf(html);

    const filename = `${safeName(nomeArquivoRaw)}.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, pdf);

    req.log.info(
      { filepath, sizeBytes: pdf.length, produtos: produtos.length },
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

  // If an audited preçário was uploaded, it replaces the generated PDF for
  // downloads (unless ?original=1 explicitly asks for the generated one).
  if (req.query["original"] !== "1") {
    try {
      const auditado = await downloadAuditado("atual");
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
  if (!existsSync(filepath)) {
    res.status(404).json({ error: "Arquivo não encontrado." });
    return;
  }
  res.download(filepath, safe);
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
    res.json(await getAuditadoStatus());
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
    const mes = String(req.body?.mes ?? "").trim();
    const status = await saveAuditado(req.file.buffer, {
      mes,
      nomeOriginal: req.file.originalname,
    });
    req.log.info(
      { mes, size: req.file.size, nome: req.file.originalname },
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
    const result = await downloadAuditado(slot);
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
  try {
    await removeAuditado(slot);
    res.json({ ok: true, ...(await getAuditadoStatus()) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao remover preçário auditado");
    res.status(500).json({ error: message });
  }
});

router.get("/preview", (req, res) => {
  if (!lastProdutos || lastProdutos.length === 0) {
    res.status(404).send("<h1>Nenhum encarte gerado ainda.</h1>");
    return;
  }
  const editable = req.query["edit"] === "1";
  const bg = req.query["bg"] !== undefined ? parseBg(req.query["bg"]) : lastBg;
  const html = renderEncarteHtml(lastProdutos, {
    mes: lastMes,
    editable,
    bg,
  });
  res.type("html").send(html);
});

export default router;
