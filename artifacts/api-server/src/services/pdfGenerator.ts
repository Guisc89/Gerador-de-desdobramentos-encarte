import puppeteer from "puppeteer";
import { resolveChromiumPath } from "../lib/chromium";
import { logger } from "../lib/logger";

// Generous launch timeout: the FIRST Chromium launch after a server restart can
// cold-start slowly and exceed Puppeteer's default 30s WS-endpoint wait. Endpoints
// like the telas PDF launch the browser more than once, so give it more headroom.
const LAUNCH_TIMEOUT_MS = 120_000;

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
}

async function launchBrowser() {
  const executablePath = resolveChromiumPath();
  return puppeteer.launch({
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
}

async function renderPng(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  html: string,
  width: number,
  height: number,
  scale: number,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
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
    await page.setContent(html, { waitUntil: "networkidle0" });
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });
    return Buffer.from(png);
  } finally {
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
    return await renderPng(browser, html, width, height, scale);
  } finally {
    await browser.close().catch(() => {});
  }
}

// Assemble already-rendered tela PNGs into a single multi-page PDF (one tela
// per landscape 16:9 page). Each PNG is embedded as a full-bleed data URI so the
// PDF is pixel-identical to the downloadable PNGs. preferCSSPageSize honors the
// @page size below over the default A4.
export async function pngsToPdf(pngs: Buffer[]): Promise<Buffer> {
  logger.info({ count: pngs.length }, "Launching Puppeteer (telas PDF)");
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const pagesHtml = pngs
      .map(
        (b) =>
          `<div class="page"><img src="data:image/png;base64,${b.toString(
            "base64",
          )}"></div>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: 1280px 720px; margin: 0; }
html, body { background: #fff; }
.page { width: 1280px; height: 720px; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }
img { width: 1280px; height: 720px; display: block; }
</style></head><body>${pagesHtml}</body></html>`;
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
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
      out.push(await renderPng(browser, html, width, height, scale));
    }
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}
