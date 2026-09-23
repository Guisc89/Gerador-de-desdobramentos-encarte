import { Router, type IRouter } from "express";
import multer from "multer";
import { parseExcel, importStats } from "../services/excelParser";
import {
  renderTelaHtml,
  corHexValida,
  type TelaState,
  type TelaProduto,
} from "../services/telaTemplate";
import { htmlToPng, htmlToPngBatch, pngsToPdf } from "../services/pdfGenerator";
import {
  storeSave,
  storeSaveJson,
  storeLoad,
  storeLoadJson,
  storeDelete,
  storeListPrefix,
} from "../services/objectStore";
import {
  generatedObjectPath,
  writeGeneratedFile,
} from "../services/generatedFiles";
import {
  parseWorkspace,
  type Workspace,
  workspaceFromRequest,
} from "../services/workspace";

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


function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

// Only raster image data URIs are accepted (no SVG — it can reference external
// resources and become an SSRF gadget when rendered by the headless browser).
const ALLOWED_IMG = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_IMG_BYTES = 8 * 1024 * 1024;
// Capa (tela 1) holds exactly 2 products; every other tela holds up to 4.
const CAPA_MAX_PRODUTOS = 2;
const TELA_MAX_PRODUTOS = 4;
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

function sanitizeState(body: unknown, forcedIsCapa?: boolean): TelaState {
  const obj = (body ?? {}) as Record<string, unknown>;
  const isCapa =
    forcedIsCapa !== undefined ? forcedIsCapa : obj["isCapa"] === true;
  const maxProdutos = isCapa ? CAPA_MAX_PRODUTOS : TELA_MAX_PRODUTOS;
  const rawProdutos = Array.isArray(obj["produtos"]) ? obj["produtos"] : [];
  const produtos = rawProdutos
    .slice(0, maxProdutos)
    .map(sanitizeProduto)
    .filter((p): p is TelaProduto => p !== null);
  return {
    mes: str(obj["mes"]),
    validadeInicio: str(obj["validadeInicio"]),
    validadeFim: str(obj["validadeFim"]),
    ...(Object.prototype.hasOwnProperty.call(obj, "disclaimer")
      ? { disclaimer: str(obj["disclaimer"]) }
      : {}),
    infoCor: str(obj["infoCor"]),
    produtoCor: corHexValida(obj["produtoCor"]),
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
        .json({ error: "Nenhum produto válido encontrado na planilha.", stats: importStats(parsed) });
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
        ...importStats(parsed),
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
    const filepath = await writeGeneratedFile(
      workspaceFromRequest(req),
      filename,
      png,
    );

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
      .map((t, index) => sanitizeState(t, index === 0));

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
    const ws = workspaceFromRequest(req);
    for (let i = 0; i < valid.length; i += 1) {
      const num = String(valid[i].index + 1).padStart(2, "0");
      const filename = `${baseName}_tela_${num}.png`;
      await writeGeneratedFile(ws, filename, pngs[i]);
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

    const states = rawTelas
      .slice(0, MAX_TELAS)
      .map((t, index) => sanitizeState(t, index === 0));
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
    await writeGeneratedFile(workspaceFromRequest(req), filename, pdf);

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

// ---------------------------------------------------------------------------
// Geração em lotes ("lote"): o cliente envia as telas em partes pequenas e o
// servidor renderiza cada parte numa requisição curta. Motivo: gerar 30+ telas
// numa requisição só passa de 2 minutos e o proxy (dev e produção) corta a
// conexão em ~120s devolvendo uma página HTML — era o "Unexpected token '<'"
// no navegador. Com lotes, cada requisição fica bem abaixo do limite e o
// cliente mostra progresso. Os PNGs de cada parte ficam em disco até o /fim,
// que monta o PDF (pdf-lib) ou publica os PNGs individuais.
interface LoteJob {
  id: string;
  criadoEm: number;
  baseName: string;
  modo: "pdf" | "png";
  ws: Workspace;
  // Estado + fila: as rotas do mesmo job rodam uma por vez (o cliente envia
  // as partes em sequência, mas retentativas/replays podem chegar em paralelo)
  // e depois que o /fim começa nenhuma /parte tardia é aceita.
  finalizado: boolean;
  fila: Promise<unknown>;
}
interface LoteJobMeta {
  criadoEm: number;
  baseName: string;
  modo: "pdf" | "png";
  ws: Workspace;
}
const loteJobs = new Map<string, LoteJob>();
const LOTE_TTL_MS = 30 * 60 * 1000;
const LOTE_MAX_PARTE = 8;

// IMPORTANTE (produção/autoscale): cada requisição pode cair numa máquina
// diferente, e o disco local não é compartilhado. Por isso as imagens de cada
// parte e o resultado final vão para o Object Storage — o mapa em memória é
// só um atalho para a fila/serialização quando as requisições caem na mesma
// máquina. O jobId começa com o timestamp em base36, o que permite descartar
// lixo antigo no bucket sem precisar de metadados.
function loteImgPath(jobId: string, index: number, modo: "pdf" | "png") {
  return `lotes/${jobId}/${index}.${modo === "pdf" ? "jpg" : "png"}`;
}

function idadeDoJobId(jobId: string): number {
  const ts = parseInt(jobId.slice(0, 8), 36);
  return Number.isFinite(ts) ? Date.now() - ts : Infinity;
}

// Serializa o trabalho de um job: cada rota encadeia na fila do job.
function naFilaDoJob<T>(job: LoteJob, fn: () => Promise<T>): Promise<T> {
  const p = job.fila.then(fn, fn);
  job.fila = p.catch(() => {});
  return p;
}

async function apagarLoteStorage(jobId: string) {
  try {
    for (const f of await storeListPrefix(`lotes/${jobId}/`)) {
      // job.json e resultado.json ficam até o TTL: permitem que uma
      // retentativa do /fim (em outra máquina) devolva o mesmo resultado em
      // vez de falhar. O sweeper por idade apaga depois.
      if (f.endsWith("/job.json") || f.endsWith("/resultado.json")) continue;
      await storeDelete(f).catch(() => {});
    }
  } catch {
    /* melhor esforço */
  }
}

function descartarJob(job: LoteJob) {
  loteJobs.delete(job.id);
  void apagarLoteStorage(job.id);
}

function limparLotesVelhos() {
  const agora = Date.now();
  for (const job of Array.from(loteJobs.values())) {
    if (agora - job.criadoEm > LOTE_TTL_MS) descartarJob(job);
  }
  // Lixo de outras máquinas/execuções: apaga pastas de lote expiradas.
  void (async () => {
    try {
      for (const f of await storeListPrefix("lotes/")) {
        const m = /^lotes\/([a-z0-9]+)\//.exec(f);
        if (m && idadeDoJobId(m[1]!) > LOTE_TTL_MS) {
          await storeDelete(f).catch(() => {});
        }
      }
    } catch {
      /* melhor esforço */
    }
  })();
}
setInterval(limparLotesVelhos, 5 * 60 * 1000).unref();

// Recupera um job vindo de outra máquina (autoscale): recria a entrada local a
// partir do job.json persistido no bucket.
async function obterJob(jobId: string): Promise<LoteJob | null> {
  if (!/^[a-z0-9]{6,32}$/.test(jobId)) return null;
  const local = loteJobs.get(jobId);
  if (local) return local;
  if (idadeDoJobId(jobId) > LOTE_TTL_MS) return null;
  const meta = await storeLoadJson<LoteJobMeta>(`lotes/${jobId}/job.json`);
  if (!meta) return null;
  const job: LoteJob = {
    id: jobId,
    criadoEm: meta.criadoEm,
    baseName: meta.baseName,
    modo: meta.modo === "png" ? "png" : "pdf",
    ws: parseWorkspace(meta.ws),
    finalizado: false,
    fila: Promise.resolve(),
  };
  loteJobs.set(jobId, job);
  return job;
}

router.post("/telas/lote/inicio", async (req, res) => {
  try {
    limparLotesVelhos();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const meta: LoteJobMeta = {
      criadoEm: Date.now(),
      baseName: safeName(str(body["nomeArquivo"]) || "tela"),
      modo: str(body["modo"]) === "png" ? "png" : "pdf",
      ws: workspaceFromRequest(req),
    };
    loteJobs.set(jobId, {
      id: jobId,
      ...meta,
      finalizado: false,
      fila: Promise.resolve(),
    });
    await storeSaveJson(`lotes/${jobId}/job.json`, meta);
    res.json({ ok: true, jobId });
  } catch (err: unknown) {
    req.log.error({ err }, "Erro ao iniciar lote de telas");
    res.status(500).json({ error: "Erro ao iniciar a geração." });
  }
});

router.post("/telas/lote/parte", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const job = await obterJob(str(body["jobId"]));
    if (
      !job ||
      job.finalizado ||
      job.ws !== workspaceFromRequest(req)
    ) {
      res.status(404).json({ error: "Geração expirada. Tente novamente." });
      return;
    }
    const raw = Array.isArray(body["telas"]) ? body["telas"] : [];
    if (raw.length === 0 || raw.length > LOTE_MAX_PARTE) {
      res.status(400).json({ error: "Parte inválida." });
      return;
    }
    // Mesmo contrato por item das rotas unitárias: cada tela enviada precisa
    // ter índice válido e ao menos um produto (vazias são filtradas no cliente
    // e contabilizadas no /fim).
    const itens: { index: number; state: TelaState }[] = [];
    for (const entry of raw) {
      const obj = (entry ?? {}) as Record<string, unknown>;
      const index = Number(obj["index"]);
      if (!Number.isInteger(index) || index < 0 || index >= MAX_TELAS) {
        res.status(400).json({ error: "Tela com índice inválido." });
        return;
      }
      const state = sanitizeState(obj["tela"], index === 0);
      if (state.produtos.length === 0) {
        res.status(400).json({
          error: `A tela ${index + 1} está sem produtos válidos.`,
        });
        return;
      }
      itens.push({ index, state });
    }

    await naFilaDoJob(job, async () => {
      if (job.finalizado || !loteJobs.has(job.id)) {
        throw new Error("Geração já finalizada. Tente novamente.");
      }
      // PDF: renderiza JPEG (sem alpha) — o PDF final fica várias vezes menor
      // e cabe no limite de resposta do app publicado. PNG: mantém PNG.
      const imgs = await htmlToPngBatch(
        itens.map((i) => renderTelaHtml(i.state)),
        job.modo === "pdf"
          ? { width: 1280, height: 720, scale: 3, tipo: "jpeg", quality: 82 }
          : { width: 1280, height: 720, scale: 3 },
      );
      for (let i = 0; i < itens.length; i += 1) {
        await storeSave(
          loteImgPath(job.id, itens[i].index, job.modo),
          imgs[i],
          job.modo === "pdf" ? "image/jpeg" : "image/png",
        );
      }
    });
    res.json({ ok: true, geradas: itens.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao gerar parte do lote de telas");
    res.status(500).json({ error: message });
  }
});

router.post("/telas/lote/fim", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const jobId = str(body["jobId"]);
  const job = await obterJob(jobId);
  if (!job || job.ws !== workspaceFromRequest(req)) {
    res.status(404).json({ error: "Geração expirada. Tente novamente." });
    return;
  }
  // Idempotência entre máquinas: se este job já foi finalizado (por esta ou
  // outra instância) devolve o mesmo resultado — cobre o caso de a resposta
  // original se perder na rede e o cliente repetir o /fim.
  if (/^[a-z0-9]{6,32}$/.test(jobId) && idadeDoJobId(jobId) <= LOTE_TTL_MS) {
    const pronto = await storeLoadJson<Record<string, unknown>>(
      `lotes/${jobId}/resultado.json`,
    ).catch(() => null);
    if (pronto) {
      res.json(pronto);
      return;
    }
  }
  if (job.finalizado) {
    res.status(404).json({ error: "Geração expirada. Tente novamente." });
    return;
  }
  // Marca já aqui: um segundo /fim ou uma /parte atrasada são rejeitados
  // mesmo enquanto este ainda está na fila do job.
  job.finalizado = true;
  try {
    await naFilaDoJob(job, async () => {
      // Junta as imagens pelo bucket (funciona mesmo quando as partes foram
      // geradas por outras máquinas do app publicado).
      const ext = job.modo === "pdf" ? "jpg" : "png";
      const indices: number[] = [];
      for (const f of await storeListPrefix(`lotes/${job.id}/`)) {
        const m = new RegExp(`/(\\d+)\\.${ext}$`).exec(f);
        if (m) indices.push(Number(m[1]));
      }
      indices.sort((a, b) => a - b);
      if (indices.length === 0) {
        res.status(400).json({ error: "Nenhuma tela foi gerada." });
        return;
      }
      const vazias = Math.max(0, Number(body["vazias"]) || 0);

      const carregar = async (index: number): Promise<Buffer> => {
        const buf = await storeLoad(loteImgPath(job.id, index, job.modo));
        if (!buf) throw new Error(`Tela ${index + 1} não encontrada.`);
        return buf;
      };

      if (job.modo === "png") {
        const arquivos: { filename: string; downloadUrl: string }[] = [];
        for (const index of indices) {
          const num = String(index + 1).padStart(2, "0");
          const filename = `${job.baseName}_tela_${num}.png`;
          const buf = await carregar(index);
          // Persiste onde o download consegue achar de qualquer máquina, e
          // também no disco local (atalho para o dev/mesma máquina).
          await storeSave(
            generatedObjectPath(job.ws, filename),
            buf,
            "image/png",
          );
          await writeGeneratedFile(job.ws, filename, buf);
          arquivos.push({
            filename,
            downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
          });
        }
        req.log.info({ geradas: arquivos.length, vazias }, "PNGs das telas gerados (lote)");
        const resposta = { ok: true, arquivos, vazias };
        await storeSaveJson(`lotes/${job.id}/resultado.json`, resposta).catch(() => {});
        res.json(resposta);
        return;
      }

      const imgs: Buffer[] = [];
      for (const index of indices) imgs.push(await carregar(index));
      const pdf = await pngsToPdf(imgs);
      const filename = `${job.baseName}_telas.pdf`;
      await storeSave(
        generatedObjectPath(job.ws, filename),
        pdf,
        "application/pdf",
      );
      await writeGeneratedFile(job.ws, filename, pdf);
      req.log.info(
        { filename, telas: indices.length, vazias, sizeBytes: pdf.length },
        "PDF das telas gerado (lote)",
      );
      const resposta = {
        ok: true,
        filename,
        downloadUrl: `/api/download/${encodeURIComponent(filename)}`,
        total: indices.length,
        vazias,
      };
      await storeSaveJson(`lotes/${job.id}/resultado.json`, resposta).catch(() => {});
      res.json(resposta);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    req.log.error({ err }, "Erro ao finalizar lote de telas");
    res.status(500).json({ error: message });
  } finally {
    descartarJob(job);
  }
});

export default router;
