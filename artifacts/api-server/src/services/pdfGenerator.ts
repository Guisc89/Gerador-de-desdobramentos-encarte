import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { resolveChromiumPath } from "../lib/chromium";
import { logger } from "../lib/logger";

// Generous launch timeout: the FIRST Chromium launch after a server restart can
// cold-start slowly and exceed Puppeteer's default 30s WS-endpoint wait. Endpoints
// like the telas PDF launch the browser more than once, so give it more headroom.
const LAUNCH_TIMEOUT_MS = 120_000;
const IMAGE_LAUNCH_TIMEOUT_MS = 40_000;
const RENDER_TIMEOUT_MS = 45_000;
const IMAGE_RENDER_BUDGET_MS = 55_000;

async function waitForStableLayout(page: import("puppeteer").Page): Promise<void> {
  await page.evaluate(`(async () => {
    if (window.__legalFitReady) await window.__legalFitReady;
    await Promise.all(Array.from(document.images)
      .filter((image) => !image.complete)
      .map((image) => new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
  })()`);
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = resolveChromiumPath();
  logger.info({ executablePath }, "Launching Puppeteer");

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    timeout: LAUNCH_TIMEOUT_MS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await waitForStableLayout(page);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

export interface PngOptions {
  width?: number;
  height?: number;
  scale?: number;
  // "jpeg" gera arquivos muito menores (sem alpha) — usado para montar PDFs
  // que precisam caber no limite de resposta do app publicado (~32MB).
  tipo?: "png" | "jpeg";
  quality?: number; // só para jpeg (0-100)
}

async function launchBrowser() {
  const executablePath = resolveChromiumPath();
  return puppeteer.launch({
    executablePath,
    headless: true,
    timeout: IMAGE_LAUNCH_TIMEOUT_MS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function renderPng(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  html: string,
  width: number,
  height: number,
  scale: number,
  tipo: "png" | "jpeg" = "png",
  quality = 92,
): Promise<Buffer> {
  const page = await browser.newPage();
  const budgetTimer = setTimeout(() => {
    void browser.close().catch(() => {});
  }, IMAGE_RENDER_BUDGET_MS);
  try {
    page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS);
    // Defense in depth: block any outbound request. The tela HTML only embeds
    // local/base64 (data:) assets, so anything else would be an SSRF attempt.
    await page.setRequestInterception(true);
    page.on("request", (reqIntercept) => {
      const url = reqIntercept.url();
      if (
        url.startsWith("data:") ||
        url.startsWith("about:") ||
        url.startsWith("blob:")
      ) {
        void reqIntercept.continue();
      } else {
        void reqIntercept.abort();
      }
    });
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: RENDER_TIMEOUT_MS,
    });
    await waitForStableLayout(page);
    const png = await page.screenshot(
      tipo === "jpeg"
        ? { type: "jpeg", quality, clip: { x: 0, y: 0, width, height } }
        : { type: "png", clip: { x: 0, y: 0, width, height } },
    );
    return Buffer.from(png);
  } finally {
    clearTimeout(budgetTimer);
    await page.close().catch(() => {});
  }
}

export async function htmlToPng(
  html: string,
  opts: PngOptions = {},
): Promise<Buffer> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const scale = opts.scale ?? 2;

  logger.info({ width, height, scale }, "Launching Puppeteer (PNG)");
  const browser = await launchBrowser();
  try {
    return await renderPng(
      browser,
      html,
      width,
      height,
      scale,
      opts.tipo,
      opts.quality,
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

export interface PdfPageSize {
  width: number;
  height: number;
}

// Assemble already-rendered PNGs into a single multi-page PDF (one PNG per
// page, full bleed) using pdf-lib — no browser involved. The previous approach
// embedded every PNG as a base64 <img> in one giant HTML page and asked
// Chromium to print it; with many telas (e.g. 39 pages at 3840×2160) Chromium
// ran out of memory and crashed ("Protocol error ... Target closed"). pdf-lib
// streams the PNGs straight into the PDF, so memory stays proportional to the
// image bytes and the page count no longer matters.
export async function pngsToPdf(
  pngs: Buffer[],
  pageSize: PdfPageSize = { width: 1280, height: 720 },
): Promise<Buffer> {
  const { width, height } = pageSize;
  logger.info({ count: pngs.length, width, height }, "Assembling PDF (pdf-lib)");
  const doc = await PDFDocument.create();
  for (const png of pngs) {
    // Aceita PNG ou JPEG (magic bytes) — JPEGs deixam o PDF várias vezes menor.
    const isJpg = png.length > 2 && png[0] === 0xff && png[1] === 0xd8;
    const img = isJpg ? await doc.embedJpg(png) : await doc.embedPng(png);
    const page = doc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

// Render many HTML pages to PNG reusing a single browser instance (much faster
// than launching Chromium per page when generating several telas at once).
export async function htmlToPngBatch(
  htmls: string[],
  opts: PngOptions = {},
): Promise<Buffer[]> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const scale = opts.scale ?? 2;

  logger.info(
    { width, height, scale, count: htmls.length },
    "Launching Puppeteer (PNG batch)",
  );
  const browser = await launchBrowser();
  try {
    const out: Buffer[] = [];
    for (const html of htmls) {
      out.push(
        await renderPng(browser, html, width, height, scale, opts.tipo, opts.quality),
      );
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}
