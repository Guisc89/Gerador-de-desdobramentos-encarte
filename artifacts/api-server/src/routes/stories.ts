import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { parseExcel } from "../services/excelParser";
import {
  renderStoryHtml,
  type StoryState,
  type StoryProduto,
} from "../services/storyTemplate";
import { htmlToPng, htmlToPngBatch, pngsToPdf } from "../services/pdfGenerator";
import {
  storeDelete,
  storeDeleteConditional,
  isStorePreconditionFailed,
  storeListPrefix,
  storeLoad,
  storeLoadJson,
  storeLoadJsonVersioned,
  storeSave,
  storeSaveJson,
  storeSaveJsonConditional,
} from "../services/objectStore";
import {
  generatedDownloadUrl,
  generatedObjectPath,
  writeGeneratedFile,
} from "../services/generatedFiles";
import {
  parseWorkspace,
  type Workspace,
  workspaceFromRequest,
} from "../services/workspace";

const router: IRouter = Router();

// Stories are portrait 9:16 (1080x1920). One PNG page per story; the PDF binds
// all non-empty pages, one story per portrait page.
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const STORY_SCALE = 2;

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
// Page 1 (capa) holds exactly 2 products; every other page holds 2 to 3.
const CAPA_MAX_PRODUTOS = 2;
const STORY_MAX_PRODUTOS = 3;
const STORY_MIN_PRODUTOS = 2;
const MAX_STORIES = 60;
const STORY_BATCH_TTL_MS = 30 * 60 * 1000;
const STORY_BATCH_MAX_PART = 1;
const STORY_FINALIZE_LEASE_MS = 5 * 60 * 1000;
const STORY_PART_LEASE_MS = 2 * 60 * 1000;
const STORY_LEASE_RENEW_MS = 60 * 1000;

interface StoryBatchMeta {
  criadoEm: number;
  baseName: string;
  modo: "pdf" | "png";
  ws: Workspace;
}

interface StoryFinalizeLease {
  owner: string;
  kind: "parte" | "fim";
  expiresAt: number;
}

function dataImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!ALLOWED_IMG.test(value)) return null;
  const b64 = value.slice(value.indexOf(",") + 1);
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_IMG_BYTES) return null;
  return value;
}

function sanitizeProduto(input: unknown): StoryProduto | null {
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

function sanitizeState(body: unknown, forcedIsCapa?: boolean): StoryState {
  const obj = (body ?? {}) as Record<string, unknown>;
  const isCapa =
    forcedIsCapa !== undefined ? forcedIsCapa : obj["isCapa"] === true;
  const maxProdutos = isCapa ? CAPA_MAX_PRODUTOS : STORY_MAX_PRODUTOS;
  const rawProdutos = Array.isArray(obj["produtos"]) ? obj["produtos"] : [];
  const produtos = rawProdutos
    .slice(0, maxProdutos)
    .map(sanitizeProduto)
    .filter((p): p is StoryProduto => p !== null);
  return {
    mes: str(obj["mes"]),
    validadeInicio: str(obj["validadeInicio"]),
    validadeFim: str(obj["validadeFim"]),
    endereco: str(obj["endereco"]),
    disclaimer: str(obj["disclaimer"]),
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
  return cleaned || `story_${Date.now()}`;
}

async function saveStoryOutput(
  ws: Workspace,
  filename: string,
  contents: Buffer,
  contentType: "image/png" | "application/pdf",
): Promise<string> {
  await storeSave(
    generatedObjectPath(ws, filename),
    contents,
    contentType,
  );
  return writeGeneratedFile(ws, filename, contents);
}

function storyBatchPrefix(jobId: string): string {
  return `story-lotes/${jobId}`;
}

function storyBatchImagePath(
  jobId: string,
  index: number,
  modo: "pdf" | "png",
): string {
  return `${storyBatchPrefix(jobId)}/${index}.${modo === "pdf" ? "jpg" : "png"}`;
}

function validStoryBatchId(jobId: string): boolean {
  return /^[a-z0-9]{12,32}$/.test(jobId);
}

function storyBatchAge(jobId: string): number {
  const timestamp = Number.parseInt(jobId.slice(0, 8), 36);
  return Number.isFinite(timestamp) ? Date.now() - timestamp : Infinity;
}

async function cleanOldStoryBatches(): Promise<void> {
  try {
    for (const objectPath of await storeListPrefix("story-lotes/")) {
      const match = /^story-lotes\/([a-z0-9]{12,32})\//.exec(objectPath);
      if (match && storyBatchAge(match[1]) > STORY_BATCH_TTL_MS) {
        await storeDelete(objectPath).catch(() => {});
      }
    }
  } catch {
    // Best effort: a later timer/start request tries again.
  }
}

setInterval(() => void cleanOldStoryBatches(), 5 * 60 * 1000).unref();

async function loadStoryBatch(
  jobId: string,
): Promise<StoryBatchMeta | null> {
  if (!validStoryBatchId(jobId)) return null;
  const meta = await storeLoadJson<StoryBatchMeta>(
    `${storyBatchPrefix(jobId)}/job.json`,
  );
  if (!meta) return null;
  if (Date.now() - meta.criadoEm > STORY_BATCH_TTL_MS) {
    for (const objectPath of await storeListPrefix(`${storyBatchPrefix(jobId)}/`)) {
      await storeDelete(objectPath).catch(() => {});
    }
    return null;
  }
  return {
    criadoEm: meta.criadoEm,
    baseName: safeName(meta.baseName),
    modo: meta.modo === "png" ? "png" : "pdf",
    ws: parseWorkspace(meta.ws),
  };
}

async function removeStoryBatchImages(jobId: string): Promise<void> {
  for (const objectPath of await storeListPrefix(`${storyBatchPrefix(jobId)}/`)) {
    if (/\.(?:png|jpg)$/.test(objectPath)) {
      await storeDelete(objectPath).catch(() => {});
    }
  }
}

function storyFinalizeLeasePath(jobId: string): string {
  return `${storyBatchPrefix(jobId)}/finalizando.json`;
}

async function acquireStoryJobLease(
  jobId: string,
  kind: StoryFinalizeLease["kind"],
  leaseMs: number,
): Promise<StoryFinalizeLease | null> {
  const objectPath = storyFinalizeLeasePath(jobId);
  const owner = randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current =
      await storeLoadJsonVersioned<StoryFinalizeLease>(objectPath);
    if (current.value && current.value.expiresAt > Date.now()) return null;
    const lease = {
      owner,
      kind,
      expiresAt: Date.now() + leaseMs,
    };
    try {
      await storeSaveJsonConditional(
        objectPath,
        lease,
        current.version.generation,
      );
      return lease;
    } catch (error) {
      if (!isStorePreconditionFailed(error)) throw error;
    }
  }
  return null;
}

async function releaseStoryFinalizeLease(
  jobId: string,
  owner: string,
): Promise<void> {
  const objectPath = storyFinalizeLeasePath(jobId);
  const current =
    await storeLoadJsonVersioned<StoryFinalizeLease>(objectPath);
  if (current.value?.owner !== owner) return;
  await storeDeleteConditional(
    objectPath,
    current.version.generation,
  ).catch(() => {});
}

function startStoryFinalizeHeartbeat(
  jobId: string,
  lease: StoryFinalizeLease,
): { assertOwned(): void; stop(): void } {
  let lost = false;
  let renewing = false;
  const timer = setInterval(() => {
    if (renewing || lost) return;
    renewing = true;
    void (async () => {
      const objectPath = storyFinalizeLeasePath(jobId);
      const current =
        await storeLoadJsonVersioned<StoryFinalizeLease>(objectPath);
      if (current.value?.owner !== lease.owner) {
        lost = true;
        return;
      }
      try {
        await storeSaveJsonConditional(
          objectPath,
          {
            ...current.value,
            expiresAt: Date.now() + STORY_FINALIZE_LEASE_MS,
          },
          current.version.generation,
        );
      } catch (error) {
        if (isStorePreconditionFailed(error)) {
          lost = true;
          return;
        }
        throw error;
      }
    })()
      .catch(() => {
        lost = true;
      })
      .finally(() => {
        renewing = false;
      });
  }, STORY_LEASE_RENEW_MS);
  timer.unref();
  return {
    assertOwned() {
      if (lost) {
        throw new Error(
          "A geração perdeu a reserva de finalização. Tente novamente.",
        );
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}

async function saveStoryBatchResult(
  resultPath: string,
  result: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    await storeSaveJsonConditional(resultPath, result, "0");
    return result;
  } catch (error) {
    if (!isStorePreconditionFailed(error)) throw error;
    const previous = await storeLoadJson<Record<string, unknown>>(resultPath);
    if (!previous) throw error;
    return previous;
  }
}

// Enforce the per-position product-count contract uniformly across every
// generation route: the capa (page 1) has exactly 2 products, every other page
// has 2 to 3. Returns an error message or null when the count is valid. (The max
// is already guaranteed by sanitizeState's slice; this catches the low end and
// the wrong capa count.) An empty page is handled separately (skipped) by the
// batch routes, so callers pass only non-empty pages here.
function storyCountError(state: StoryState): string | null {
  const n = state.produtos.length;
  if (state.isCapa) {
    if (n !== CAPA_MAX_PRODUTOS) {
      return "A capa exige exatamente 2 produtos válidos (com nome).";
    }
  } else if (n < STORY_MIN_PRODUTOS) {
    return "Cada story (a partir do 2º) exige de 2 a 3 produtos válidos.";
  }
  return null;
}

// Parse the Excel and return products for story composition
router.post("/stories/parse", upload.single("planilha"), async (req, res) => {
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
      "Planilha processada (stories)",
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
    req.log.error({ err }, "Erro ao processar planilha (stories)");
    res.status(500).json({ error: message });
  }
});

// Stateless live preview: render the posted story state to HTML and return it.
// The client injects it via iframe srcdoc (fallback path — the browser bundle
// renders the preview client-side).
router.post("/stories/render", (req, res) => {
  const state = sanitizeState(req.body);
  res.type("html").send(renderStoryHtml(state));
});

// Generate a single high-resolution PNG (1080x1920, 2x) and return a download URL
router.post("/stories/generate", async (req, res) => {
  try {
    const state = sanitizeState(req.body);

    const countError = storyCountError(state);
    if (countError) {
      res.status(400).json({ error: countError });
      return;
    }

    const html = renderStoryHtml(state);
    const png = await htmlToPng(html, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      scale: STORY_SCALE,
    });

    const nomeArquivo = str(
      (req.body as Record<string, unknown>)?.["nomeArquivo"],
    );
    const filename = `${safeName(nomeArquivo || "story")}.png`;
    const ws = workspaceFromRequest(req);
    const filepath = await saveStoryOutput(
      ws,
      filename,
      png,
      "image/png",
    );

    req.log.info(
      { filepath, sizeBytes: png.length, produtos: state.produtos.length },
      "PNG do story gerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: generatedDownloadUrl(ws, filename),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNG do story");
    res.status(500).json({ error: message });
  }
});

// Generate one PNG per story page, reusing a single browser instance. Empty
// pages (no valid products) are skipped and reported back to the client. Page 1
// is the capa (forced isCapa) with its own 2-product disposition.
router.post("/stories/generate-all", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawStories = Array.isArray(body["stories"]) ? body["stories"] : [];
    if (rawStories.length === 0) {
      res.status(400).json({ error: "Nenhuma página enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "story");

    const states = rawStories
      .slice(0, MAX_STORIES)
      .map((c, index) => sanitizeState(c, index === 0));

    const valid: { index: number; state: StoryState }[] = [];
    const invalid: string[] = [];
    let vazias = 0;
    states.forEach((state, index) => {
      if (state.produtos.length === 0) {
        vazias += 1;
        return;
      }
      const countError = storyCountError(state);
      if (countError) {
        invalid.push(`story ${index + 1} (${countError})`);
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

    const htmls = valid.map((v) => renderStoryHtml(v.state));
    const pngs = await htmlToPngBatch(htmls, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      scale: STORY_SCALE,
    });

    const arquivos: { filename: string; downloadUrl: string }[] = [];
    const ws = workspaceFromRequest(req);
    for (let i = 0; i < valid.length; i += 1) {
      const num = String(valid[i].index + 1).padStart(2, "0");
      const filename = `${baseName}_story_${num}.png`;
      await saveStoryOutput(ws, filename, pngs[i], "image/png");
      arquivos.push({
        filename,
        downloadUrl: generatedDownloadUrl(ws, filename),
      });
    }

    req.log.info(
      { total: states.length, geradas: arquivos.length, vazias },
      "PNGs dos stories gerados (lote)",
    );

    res.json({ ok: true, arquivos, vazias });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PNGs dos stories (lote)");
    res.status(500).json({ error: message });
  }
});

// Backwards-compatible single-request endpoint. The browser uses the chunked
// routes below for larger jobs so the published proxy never waits on every page
// in one request.
router.post("/stories/generate-pdf", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawStories = Array.isArray(body["stories"]) ? body["stories"] : [];
    if (rawStories.length === 0) {
      res.status(400).json({ error: "Nenhuma página enviada." });
      return;
    }

    const baseName = safeName(str(body["nomeArquivo"]) || "story");

    const states = rawStories
      .slice(0, MAX_STORIES)
      .map((c, index) => sanitizeState(c, index === 0));
    const naoVazias = states.filter((s) => s.produtos.length > 0);
    const vazias = states.length - naoVazias.length;

    const invalid: string[] = [];
    const valid: StoryState[] = [];
    states.forEach((state, index) => {
      if (state.produtos.length === 0) return;
      const countError = storyCountError(state);
      if (countError) invalid.push(`story ${index + 1} (${countError})`);
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

    const htmls = valid.map((s) => renderStoryHtml(s));
    const pages = await htmlToPngBatch(htmls, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      scale: STORY_SCALE,
      tipo: "jpeg",
      quality: 82,
    });
    const pdf = await pngsToPdf(pages, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
    });

    const filename = `${baseName}_stories.pdf`;
    const ws = workspaceFromRequest(req);
    await saveStoryOutput(ws, filename, pdf, "application/pdf");

    req.log.info(
      { filename, stories: valid.length, vazias, sizeBytes: pdf.length },
      "PDF dos stories gerado",
    );

    res.json({
      ok: true,
      filename,
      downloadUrl: generatedDownloadUrl(ws, filename),
      total: valid.length,
      vazias,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar PDF dos stories");
    res.status(500).json({ error: message });
  }
});

router.post("/stories/lote/inicio", async (req, res) => {
  try {
    void cleanOldStoryBatches();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const meta: StoryBatchMeta = {
      criadoEm: Date.now(),
      baseName: safeName(str(body["nomeArquivo"]) || "story"),
      modo: str(body["modo"]) === "png" ? "png" : "pdf",
      ws: workspaceFromRequest(req),
    };
    await storeSaveJson(`${storyBatchPrefix(jobId)}/job.json`, meta);
    res.json({ ok: true, jobId });
  } catch (err: unknown) {
    req.log.error({ err }, "Erro ao iniciar lote de stories");
    res.status(500).json({ error: "Erro ao iniciar a geração." });
  }
});

router.post("/stories/lote/parte", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = str(body["jobId"]);
    const job = await loadStoryBatch(jobId);
    if (!job || job.ws !== workspaceFromRequest(req)) {
      res.status(404).json({ error: "Geração expirada. Tente novamente." });
      return;
    }
    const resultPath = `${storyBatchPrefix(jobId)}/resultado.json`;
    if (await storeLoadJson<Record<string, unknown>>(resultPath)) {
      res.status(409).json({ error: "Esta geração já foi finalizada." });
      return;
    }

    const raw = Array.isArray(body["stories"]) ? body["stories"] : [];
    if (raw.length === 0 || raw.length > STORY_BATCH_MAX_PART) {
      res.status(400).json({ error: "Parte inválida." });
      return;
    }

    const entry = (raw[0] ?? {}) as Record<string, unknown>;
    const index = Number(entry["index"]);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_STORIES) {
      res.status(400).json({ error: "Story com índice inválido." });
      return;
    }
    const state = sanitizeState(entry["story"], index === 0);
    if (state.produtos.length === 0) {
      res.status(400).json({
        error: `O story ${index + 1} está sem produtos válidos.`,
      });
      return;
    }
    const countError = storyCountError(state);
    if (countError) {
      res.status(400).json({ error: `Story ${index + 1}: ${countError}` });
      return;
    }

    const imagePath = storyBatchImagePath(jobId, index, job.modo);
    if (await storeLoad(imagePath)) {
      res.json({ ok: true, geradas: 1 });
      return;
    }

    const lease = await acquireStoryJobLease(
      jobId,
      "parte",
      STORY_PART_LEASE_MS,
    );
    if (!lease) {
      res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
      return;
    }

    // A renderização continua fora da requisição. Se a conexão/proxy sumir, a
    // próxima chamada com o mesmo índice observa a imagem pronta ou aguarda a
    // reserva; nunca abandona um trabalho que ainda está progredindo.
    void (async () => {
      try {
        if (await storeLoadJson<Record<string, unknown>>(resultPath)) return;
        if (await storeLoad(imagePath)) return;
        const [image] = await htmlToPngBatch(
          [renderStoryHtml(state)],
          job.modo === "pdf"
            ? {
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                scale: STORY_SCALE,
                tipo: "jpeg",
                quality: 82,
              }
            : {
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                scale: STORY_SCALE,
              },
        );
        await storeSave(
          imagePath,
          image,
          job.modo === "pdf" ? "image/jpeg" : "image/png",
        );
      } catch (err) {
        req.log.error(
          { err, jobId, index },
          "Erro assíncrono ao gerar parte do lote de stories",
        );
      } finally {
        await releaseStoryFinalizeLease(jobId, lease.owner);
      }
    })();
    res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao consultar parte do lote de stories");
    res.status(500).json({ error: message });
  }
});

router.post("/stories/lote/fim", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const jobId = str(body["jobId"]);
  try {
    const job = await loadStoryBatch(jobId);
    if (!job || job.ws !== workspaceFromRequest(req)) {
      res.status(404).json({ error: "Geração expirada. Tente novamente." });
      return;
    }

    const resultPath = `${storyBatchPrefix(jobId)}/resultado.json`;
    const previousResult =
      await storeLoadJson<Record<string, unknown>>(resultPath);
    if (previousResult) {
      res.json(previousResult);
      return;
    }
    const lease = await acquireStoryJobLease(
      jobId,
      "fim",
      STORY_FINALIZE_LEASE_MS,
    );
    if (!lease) {
      res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
      return;
    }

    const vazias = Math.max(0, Number(body["vazias"]) || 0);
    void (async () => {
      const heartbeat = startStoryFinalizeHeartbeat(jobId, lease);
      try {
        const extension = job.modo === "pdf" ? "jpg" : "png";
        const indices: number[] = [];
        for (const objectPath of await storeListPrefix(`${storyBatchPrefix(jobId)}/`)) {
          const match = new RegExp(`/(\\d+)\\.${extension}$`).exec(objectPath);
          if (match) indices.push(Number(match[1]));
        }
        indices.sort((left, right) => left - right);
        if (indices.length === 0) {
          throw new Error("Nenhum story foi gerado.");
        }

        const loadImage = async (index: number): Promise<Buffer> => {
          const image = await storeLoad(
            storyBatchImagePath(jobId, index, job.modo),
          );
          if (!image) throw new Error(`Story ${index + 1} não encontrado.`);
          return image;
        };

        if (job.modo === "png") {
          const arquivos: { filename: string; downloadUrl: string }[] = [];
          for (const index of indices) {
            heartbeat.assertOwned();
            const filename = `${job.baseName}_story_${String(index + 1).padStart(2, "0")}.png`;
            const image = await loadImage(index);
            await saveStoryOutput(job.ws, filename, image, "image/png");
            arquivos.push({
              filename,
              downloadUrl: generatedDownloadUrl(job.ws, filename),
            });
          }
          await saveStoryBatchResult(resultPath, {
            ok: true,
            arquivos,
            vazias,
          });
          await removeStoryBatchImages(jobId);
          req.log.info(
            { ws: job.ws, geradas: arquivos.length, vazias },
            "PNGs dos stories gerados (lote resiliente)",
          );
          return;
        }

        const images: Buffer[] = [];
        for (const index of indices) {
          heartbeat.assertOwned();
          images.push(await loadImage(index));
        }
        const pdf = await pngsToPdf(images, {
          width: STORY_WIDTH,
          height: STORY_HEIGHT,
        });
        const filename = `${job.baseName}_stories.pdf`;
        heartbeat.assertOwned();
        await saveStoryOutput(job.ws, filename, pdf, "application/pdf");
        heartbeat.assertOwned();
        await saveStoryBatchResult(resultPath, {
          ok: true,
          filename,
          downloadUrl: generatedDownloadUrl(job.ws, filename),
          total: indices.length,
          vazias,
        });
        await removeStoryBatchImages(jobId);
        req.log.info(
          {
            ws: job.ws,
            filename,
            stories: indices.length,
            vazias,
            sizeBytes: pdf.length,
          },
          "PDF dos stories gerado (lote resiliente)",
        );
      } catch (err) {
        req.log.error(
          { err, jobId },
          "Erro assíncrono ao finalizar lote de stories",
        );
      } finally {
        heartbeat.stop();
        await releaseStoryFinalizeLease(jobId, lease.owner);
      }
    })();
    res.status(202).json({ ok: true, pending: true, retryAfterMs: 2000 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao finalizar lote de stories");
    res.status(500).json({ error: message });
  }
});

export default router;
