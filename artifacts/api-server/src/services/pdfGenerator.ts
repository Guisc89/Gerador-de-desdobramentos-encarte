import puppeteer from "puppeteer";
import { resolveChromiumPath } from "../lib/chromium";
import { logger } from "../lib/logger";

export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = resolveChromiumPath();
  logger.info({ executablePath }, "Launching Puppeteer");

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
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
