import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseExcel } from "../services/excelParser";
import {
  renderCardHtml,
  type CardState,
  type CardProduto,
} from "../services/cardTemplate";
import { htmlToPng } from "../services/pdfGenerator";

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
// Page 1 (capa) holds exactly 2 products (per the reference disposition).
const CARD_MAX_PRODUTOS = 2;

function dataImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!ALLOWED_IMG.test(value)) return null;
  const b64 = value.slice(value.indexOf(",") + 1);
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_IMG_BYTES) return null;
  return value;
}

function sanitizeProduto(input: unknown): CardProduto | null {
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

function sanitizeState(body: unknown): CardState {
  const obj = (body ?? {}) as Record<string, unknown>;
  const rawProdutos = Array.isArray(obj["produtos"]) ? obj["produtos"] : [];
  const produtos = rawProdutos
    .slice(0, CARD_MAX_PRODUTOS)
    .map(sanitizeProduto)
    .filter((p): p is CardProduto => p !== null);
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
  return cleaned || `card_${Date.now()}`;
}

// Parse the Excel and return products for card composition
router.post("/cards/parse", upload.single("planilha"), async (req, res) => {
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
      "Planilha processada (cards)",
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
    req.log.error({ err }, "Erro ao processar planilha (cards)");
    res.status(500).json({ error: message });
  }
});

// Stateless live preview: render the posted card state to HTML and return it.
// The client injects it via iframe srcdoc (fallback path — the browser bundle
// renders the preview client-side).
router.post("/cards/render", (req, res) => {
  const state = sanitizeState(req.body);
  res.type("html").send(renderCardHtml(state));
});

// Generate the high-resolution PNG (1080x1440, 2x) and return a download URL
router.post("/cards/generate", async (req, res) => {
  try {
    const state = sanitizeState(req.body);

    if (state.produtos.length !== CARD_MAX_PRODUTOS) {
      res.status(400).json({
        error: "A capa de Cards exige exatamente 2 produtos válidos (com nome).",
      });
      return;
    }

    const html = renderCardHtml(state);
    const png = await htmlToPng(html, { width: 1080, height: 1440, scale: 2 });

    const nomeArquivo = str(
      (req.body as Record<string, unknown>)?.["nomeArquivo"],
    );
    const filename = `${safeName(nomeArquivo || "card")}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, png);

    req.log.info(
      { filepath, sizeBytes: png.length, produtos: state.produtos.length },
      "PNG do card gerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNG do card");
    res.status(500).json({ error: message });
  }
});

export default router;
