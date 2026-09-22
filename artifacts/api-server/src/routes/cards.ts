import { Router, type IRouter } from "express";
import multer from "multer";
import { parseExcel } from "../services/excelParser";
import {
  renderCardHtml,
  type CardState,
  type CardProduto,
} from "../services/cardTemplate";
import { htmlToPng, htmlToPngBatch, pngsToPdf } from "../services/pdfGenerator";
import { writeGeneratedFile } from "../services/generatedFiles";
import { workspaceFromRequest } from "../services/workspace";

const router: IRouter = Router();

// Cards are portrait 3:4 (1080x1440). One PNG page per feed card; the PDF binds
// all non-empty pages, one card per portrait page.
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;
const CARD_SCALE = 2;

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
// Page 1 (capa) holds exactly 2 products; every other page holds 2 to 4.
const CAPA_MAX_PRODUTOS = 2;
const CARD_MAX_PRODUTOS = 4;
const CARD_MIN_PRODUTOS = 2;
const MAX_CARDS = 60;

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

function sanitizeState(body: unknown, forcedIsCapa?: boolean): CardState {
  const obj = (body ?? {}) as Record<string, unknown>;
  const isCapa =
    forcedIsCapa !== undefined ? forcedIsCapa : obj["isCapa"] === true;
  const maxProdutos = isCapa ? CAPA_MAX_PRODUTOS : CARD_MAX_PRODUTOS;
  const rawProdutos = Array.isArray(obj["produtos"]) ? obj["produtos"] : [];
  const produtos = rawProdutos
    .slice(0, maxProdutos)
    .map(sanitizeProduto)
    .filter((p): p is CardProduto => p !== null);
  return {
    mes: str(obj["mes"]),
    validadeInicio: str(obj["validadeInicio"]),
    validadeFim: str(obj["validadeFim"]),
    ...(Object.prototype.hasOwnProperty.call(obj, "disclaimer")
      ? { disclaimer: str(obj["disclaimer"]) }
      : {}),
    infoCor: str(obj["infoCor"]),
    background: dataImage(obj["background"]),
    isCapa,
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

// Enforce the per-position product-count contract uniformly across every
// generation route: the capa (page 1) has exactly 2 products, every other page
// has 2 to 4. Returns an error message or null when the count is valid. (The max
// is already guaranteed by sanitizeState's slice; this catches the low end and
// the wrong capa count.) An empty page is handled separately (skipped) by the
// batch routes, so callers pass only non-empty pages here.
function cardCountError(state: CardState): string | null {
  const n = state.produtos.length;
  if (state.isCapa) {
    if (n !== CAPA_MAX_PRODUTOS) {
      return "A capa exige exatamente 2 produtos válidos (com nome).";
    }
  } else if (n < CARD_MIN_PRODUTOS) {
    return "Cada página (a partir da 2ª) exige de 2 a 4 produtos válidos.";
  }
  return null;
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

// Generate a single high-resolution PNG (1080x1440, 2x) and return a download URL
router.post("/cards/generate", async (req, res) => {
  try {
    const state = sanitizeState(req.body);

    const countError = cardCountError(state);
    if (countError) {
      res.status(400).json({ error: countError });
      return;
    }

    const html = renderCardHtml(state);
    const png = await htmlToPng(html, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: CARD_SCALE,
    });

    const nomeArquivo = str(
      (req.body as Record<string, unknown>)?.["nomeArquivo"],
    );
    const filename = `${safeName(nomeArquivo || "card")}.png`;
    const filepath = await writeGeneratedFile(
      workspaceFromRequest(req),
      filename,
      png,
    );

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

// Generate one PNG per card page, reusing a single browser instance. Empty pages
// (no valid products) are skipped and reported back to the client. Page 1 is the
// capa (forced isCapa) with its own 2-product disposition.
router.post("/cards/generate-all", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawCards = Array.isArray(body["cards"]) ? body["cards"] : [];
    if (rawCards.length === 0) {
      res.status(400).json({ error: "Nenhuma página enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "card");

    const states = rawCards
      .slice(0, MAX_CARDS)
      .map((c, index) => sanitizeState(c, index === 0));

    const valid: { index: number; state: CardState }[] = [];
    const invalid: string[] = [];
    let vazias = 0;
    states.forEach((state, index) => {
      if (state.produtos.length === 0) {
        vazias += 1;
        return;
      }
      const countError = cardCountError(state);
      if (countError) {
        invalid.push(`página ${index + 1} (${countError})`);
      } else {
        valid.push({ index, state });
      }
    });

    if (invalid.length > 0) {
      res.status(400).json({
        error: `Ajuste antes de gerar — ${invalid.join("; ")}.`,
      });
      return;
    }

    if (valid.length === 0) {
      res.status(400).json({
        error:
          "Todas as páginas estão sem produtos. Adicione produtos antes de gerar.",
      });
      return;
    }

    const htmls = valid.map((v) => renderCardHtml(v.state));
    const pngs = await htmlToPngBatch(htmls, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: CARD_SCALE,
    });

    const arquivos: { filename: string; downloadUrl: string }[] = [];
    const ws = workspaceFromRequest(req);
    for (let i = 0; i < valid.length; i += 1) {
      const num = String(valid[i].index + 1).padStart(2, "0");
      const filename = `${baseName}_card_${num}.png`;
      await writeGeneratedFile(ws, filename, pngs[i]);
      arquivos.push({
        filename,
        downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
      });
    }

    req.log.info(
      { total: states.length, geradas: arquivos.length, vazias },
      "PNGs dos cards gerados (lote)",
    );

    res.json({ ok: true, arquivos, vazias });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNGs dos cards (lote)");
    res.status(500).json({ error: message });
  }
});

// Generate a single multi-page PDF with every (non-empty) card page. JPEG keeps
// the final response below the published app's download limit without changing
// the rendered dimensions or the saved card state.
router.post("/cards/generate-pdf", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawCards = Array.isArray(body["cards"]) ? body["cards"] : [];
    if (rawCards.length === 0) {
      res.status(400).json({ error: "Nenhuma página enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "card");

    const states = rawCards
      .slice(0, MAX_CARDS)
      .map((c, index) => sanitizeState(c, index === 0));
    const naoVazias = states.filter((s) => s.produtos.length > 0);
    const vazias = states.length - naoVazias.length;

    const invalid: string[] = [];
    const valid: CardState[] = [];
    states.forEach((state, index) => {
      if (state.produtos.length === 0) return;
      const countError = cardCountError(state);
      if (countError) invalid.push(`página ${index + 1} (${countError})`);
      else valid.push(state);
    });

    if (invalid.length > 0) {
      res.status(400).json({
        error: `Ajuste antes de gerar — ${invalid.join("; ")}.`,
      });
      return;
    }

    if (valid.length === 0) {
      res.status(400).json({
        error:
          "Todas as páginas estão sem produtos. Adicione produtos antes de gerar.",
      });
      return;
    }

    const htmls = valid.map((s) => renderCardHtml(s));
    const pages = await htmlToPngBatch(htmls, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      scale: CARD_SCALE,
      tipo: "jpeg",
      quality: 82,
    });
    const pdf = await pngsToPdf(pages, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });

    const filename = `${baseName}_cards.pdf`;
    await writeGeneratedFile(workspaceFromRequest(req), filename, pdf);

    req.log.info(
      { filename, cards: valid.length, vazias, sizeBytes: pdf.length },
      "PDF dos cards gerado",
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
    req.log.error({ err }, "Erro ao gerar PDF dos cards");
    res.status(500).json({ error: message });
  }
});

export default router;
