import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseExcel } from "../services/excelParser";
import {
  renderTelaHtml,
  type TelaState,
  type TelaProduto,
} from "../services/telaTemplate";
import { htmlToPng, htmlToPngBatch, pngsToPdf } from "../services/pdfGenerator";

const router: IRouter = Router();

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
if (!existsSync(OUTPUT_DIR)) {
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


function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

// Only raster image data URIs are accepted (no SVG — it can reference external
// resources and become an SSRF gadget when rendered by the headless browser).
const ALLOWED_IMG = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_IMG_BYTES = 8 * 1024 * 1024;
// Each tela holds at most 3 products (default 2, up to 3).
const MAX_PRODUTOS = 3;
const MAX_TELAS = 60;

function dataImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!ALLOWED_IMG.test(value)) return null;
  const b64 = value.slice(value.indexOf(",") + 1);
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_IMG_BYTES) return null;
  return value;
}

function sanitizeProduto(input: unknown): TelaProduto | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const nome = str(obj["nome"]);
  const precoInteiro = str(obj["precoInteiro"]).replace(/\D/g, "");
  if (!nome) return null;
  const cent = str(obj["precoCentavos"]).replace(/\D/g, "").slice(0, 2);
  return {
    nome,
    descricao: str(obj["descricao"]),
    precoInteiro: precoInteiro || "0",
    precoCentavos: cent.padStart(2, "0") || "00",
    foto: dataImage(obj["foto"]),
  };
}

function sanitizeState(body: unknown): TelaState {
  const obj = (body ?? {}) as Record<string, unknown>;
  const rawProdutos = Array.isArray(obj["produtos"]) ? obj["produtos"] : [];
  const produtos = rawProdutos
    .slice(0, MAX_PRODUTOS)
    .map(sanitizeProduto)
    .filter((p): p is TelaProduto => p !== null);
  return {
    mes: str(obj["mes"]),
    validadeInicio: str(obj["validadeInicio"]),
    validadeFim: str(obj["validadeFim"]),
    endereco: str(obj["endereco"]),
    background: dataImage(obj["background"]),
    produtos,
  };
}

function safeName(input: string): string {
  const cleaned = input
    .replace(/\.png$/i, "")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return cleaned || `tela_${Date.now()}`;
}

// Parse the Excel and return products (name/description/price) for tela composition
router.post("/telas/parse", upload.single("planilha"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado." });
      return;
    }
    const validadeInicio = str(req.body?.validadeInicio);
    const validadeFim = str(req.body?.validadeFim);

    const parsed = parseExcel(req.file.buffer, { validadeInicio, validadeFim });

    req.log.info(
      {
        sheetUsed: parsed.abaUtilizada,
        total: parsed.total,
        validos: parsed.validos,
      },
      "Planilha processada (telas)",
    );

    if (parsed.validos === 0) {
      res
        .status(400)
        .json({ error: "Nenhum produto válido encontrado na planilha." });
      return;
    }

    res.json({
      ok: true,
      produtos: parsed.produtos.map((p) => ({
        nome: p.nome,
        descricao: p.descricao,
        precoInteiro: p.precoInteiro,
        precoCentavos: p.precoCentavos,
      })),
      stats: {
        abaUtilizada: parsed.abaUtilizada,
        validos: parsed.validos,
        invalidos: parsed.invalidos,
        pendentes: parsed.pendentes,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao processar planilha (telas)");
    res.status(500).json({ error: message });
  }
});

// Stateless live preview: render the posted tela state to HTML and return it.
// The client injects it via iframe srcdoc, so there is no shared server state
// (avoids cross-session leakage and out-of-order overwrite races).
router.post("/telas/render", (req, res) => {
  const state = sanitizeState(req.body);
  res.type("html").send(renderTelaHtml(state));
});

// Generate the high-resolution PNG and return a download URL
router.post("/telas/generate", async (req, res) => {
  try {
    const state = sanitizeState(req.body);

    if (state.produtos.length === 0) {
      res.status(400).json({ error: "Adicione ao menos um produto à tela." });
      return;
    }

    const html = renderTelaHtml(state);
    const png = await htmlToPng(html, { width: 1280, height: 720, scale: 3 });

    const nomeArquivo = str((req.body as Record<string, unknown>)?.["nomeArquivo"]);
    const filename = `${safeName(nomeArquivo || "tela")}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, png);

    req.log.info(
      { filepath, sizeBytes: png.length, produtos: state.produtos.length },
      "PNG da tela gerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      previewUrl: `/api/telas/preview`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNG da tela");
    res.status(500).json({ error: message });
  }
});

// Generate one PNG per tela, reusing a single browser instance. Empty telas
// (no valid products) are skipped and reported back to the client.
router.post("/telas/generate-all", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTelas = Array.isArray(body["telas"]) ? body["telas"] : [];
    if (rawTelas.length === 0) {
      res.status(400).json({ error: "Nenhuma tela enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "tela");

    const states = rawTelas
      .slice(0, MAX_TELAS)
      .map((t) => sanitizeState(t));

    const valid: { index: number; state: TelaState }[] = [];
    let vazias = 0;
    states.forEach((state, index) => {
      if (state.produtos.length === 0) {
        vazias += 1;
      } else {
        valid.push({ index, state });
      }
    });

    if (valid.length === 0) {
      res.status(400).json({
        error:
          "Todas as telas estão sem produtos. Adicione produtos antes de gerar.",
      });
      return;
    }

    const htmls = valid.map((v) => renderTelaHtml(v.state));
    const pngs = await htmlToPngBatch(htmls, {
      width: 1280,
      height: 720,
      scale: 3,
    });

    const arquivos: { filename: string; downloadUrl: string }[] = [];
    for (let i = 0; i < valid.length; i += 1) {
      const num = String(valid[i].index + 1).padStart(2, "0");
      const filename = `${baseName}_tela_${num}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);
      await fs.writeFile(filepath, pngs[i]);
      arquivos.push({
        filename,
        downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      });
    }

    req.log.info(
      { total: states.length, geradas: arquivos.length, vazias },
      "PNGs das telas gerados (lote)",
    );

    res.json({ ok: true, arquivos, vazias });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNGs das telas (lote)");
    res.status(500).json({ error: message });
  }
});

// Generate a single multi-page PDF with every (non-empty) tela. Reuses the same
// high-res PNG rendering, then assembles the PNGs into one landscape 16:9 PDF.
router.post("/telas/generate-pdf", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawTelas = Array.isArray(body["telas"]) ? body["telas"] : [];
    if (rawTelas.length === 0) {
      res.status(400).json({ error: "Nenhuma tela enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "tela");

    const states = rawTelas.slice(0, MAX_TELAS).map((t) => sanitizeState(t));
    const valid = states.filter((s) => s.produtos.length > 0);
    const vazias = states.length - valid.length;

    if (valid.length === 0) {
      res.status(400).json({
        error:
          "Todas as telas estão sem produtos. Adicione produtos antes de gerar.",
      });
      return;
    }

    const htmls = valid.map((s) => renderTelaHtml(s));
    const pngs = await htmlToPngBatch(htmls, {
      width: 1280,
      height: 720,
      scale: 3,
    });
    const pdf = await pngsToPdf(pngs);

    const filename = `${baseName}_telas.pdf`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, pdf);

    req.log.info(
      { filename, telas: valid.length, vazias, sizeBytes: pdf.length },
      "PDF das telas gerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      total: valid.length,
      vazias,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PDF das telas");
    res.status(500).json({ error: message });
  }
});

export default router;
