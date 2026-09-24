import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { resolveChromiumPath } from "../src/lib/chromium";
import { renderTelaHtml } from "../src/services/telaTemplate";
import { renderCardHtml } from "../src/services/cardTemplate";
import { renderStoryHtml } from "../src/services/storyTemplate";
import {
  htmlToPngBatch,
  pngsToPdf,
  type PngOptions,
} from "../src/services/pdfGenerator";
import { PDFDocument } from "pdf-lib";

const products = Array.from({ length: 4 }, (_, index) => ({
  nome: `Produto ${index + 1}`,
  descricao: "Descrição",
  precoInteiro: String(10 + index),
  precoCentavos: "90",
}));
const longLegal = Array.from(
  { length: 90 },
  (_, index) => `condição legal completa ${index + 1}`,
).join(" ");
const base = {
  mes: "MAIO",
  validadeInicio: "01/05",
  validadeFim: "31/05",
  produtos: products,
};

test("Telas: capa stays inside the frame and custom color only paints product information", async () => {
  for (const width of [495, 1920]) {
    await page.setViewport({ width, height: Math.ceil(width * 9 / 16) });
    await page.setContent(renderTelaHtml({
      ...base, isCapa: true, produtos: products.slice(0, 2),
      produtoCor: "#7435ab", infoCor: "#123456",
    }));
    const result = await page.evaluate(() => ({
      cards: [...document.querySelectorAll(".card")].map(el => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
      info: getComputedStyle(document.querySelector(".card-info")!).backgroundColor,
      photo: getComputedStyle(document.querySelector(".card-photo")!).backgroundColor,
      legal: getComputedStyle(document.querySelector(".tela-info-mes")!).color,
    }));
    assert.equal(result.cards.length, 2);
    assert.ok(result.cards.every(card => card.left >= 0 && card.right <= width * 0.968 + 1));
    assert.equal(result.info, "rgb(116, 53, 171)");
    assert.equal(result.photo, "rgb(255, 255, 255)");
    assert.equal(result.legal, "rgb(18, 52, 86)");
  }
  for (const render of [renderTelaHtml, renderCardHtml, renderStoryHtml]) {
    await page.setContent(render({ ...base, produtoCor: "#7435ab" }));
    const colors = await page.evaluate(() => ({
      info: getComputedStyle(document.querySelector(".card-info")!).backgroundColor,
      photo: getComputedStyle(document.querySelector(".card-photo")!).backgroundColor,
    }));
    assert.equal(colors.info, "rgb(116, 53, 171)");
    assert.equal(colors.photo, "rgb(255, 255, 255)");
    for (const produtoCor of [undefined, "", "red; color:black"]) {
      const html = render({ ...base, produtoCor });
      assert.ok(html.includes("background: linear-gradient(150deg, #06b6a6 0%, #029e93 100%)"));
      assert.ok(!html.includes("red; color:black"));
    }
  }
});

let browser: Browser;
let page: Page;

before(async () => {
  browser = await puppeteer.launch({
    executablePath: resolveChromiumPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
});

async function boxes(
  html: string,
  viewport: { width: number; height: number },
  productSelector: string,
  footerSelector: string,
) {
  await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await (window as typeof window & { __legalFitReady?: Promise<void> })
      .__legalFitReady;
  });
  return page.evaluate((product, footer) => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const legal = document.querySelector<HTMLElement>("[data-fit-legal]");
    const legalBox = legal?.parentElement;
    return {
      products: Array.from(document.querySelectorAll(product)).map(rect),
      footer: rect(document.querySelector(footer)!),
      legalFits:
        !legal ||
        (!!legalBox &&
          legal.scrollHeight <= legalBox.clientHeight + 1 &&
          legal.scrollWidth <= legalBox.clientWidth + 1),
    };
  }, productSelector, footerSelector);
}

function assertSameProducts(
  empty: Awaited<ReturnType<typeof boxes>>,
  long: Awaited<ReturnType<typeof boxes>>,
) {
  assert.deepEqual(long.products, empty.products);
  assert.equal(long.legalFits, true);
  for (const product of long.products) {
    assert.ok(
      product.bottom <= long.footer.top,
      `product bottom ${product.bottom} intersects footer top ${long.footer.top}`,
    );
  }
}

async function changedRasterPixels(
  withoutLegal: Buffer,
  withLegal: Buffer,
  bottomFraction: number,
  threshold: number,
) {
  return page.evaluate(
    async (emptyUrl, legalUrl, from, channelThreshold) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
      const [empty, legal] = await Promise.all([load(emptyUrl), load(legalUrl)]);
      assertSameSize(empty, legal);
      const canvas = document.createElement("canvas");
      canvas.width = empty.naturalWidth;
      canvas.height = empty.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(empty, 0, 0);
      const emptyPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(legal, 0, 0);
      const legalPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let total = 0;
      let bottom = 0;
      const bottomStart = Math.floor(canvas.height * from);
      for (let offset = 0; offset < emptyPixels.length; offset += 4) {
        const changed =
          Math.abs(emptyPixels[offset] - legalPixels[offset]) > channelThreshold ||
          Math.abs(emptyPixels[offset + 1] - legalPixels[offset + 1]) > channelThreshold ||
          Math.abs(emptyPixels[offset + 2] - legalPixels[offset + 2]) > channelThreshold;
        if (!changed) continue;
        total += 1;
        const pixelIndex = offset / 4;
        if (Math.floor(pixelIndex / canvas.width) >= bottomStart) bottom += 1;
      }
      return { total, bottom };

      function assertSameSize(first: HTMLImageElement, second: HTMLImageElement) {
        if (
          first.naturalWidth !== second.naturalWidth ||
          first.naturalHeight !== second.naturalHeight
        ) {
          throw new Error("Raster dimensions differ");
        }
      }
    },
    `data:image/${withoutLegal[0] === 0xff ? "jpeg" : "png"};base64,${withoutLegal.toString("base64")}`,
    `data:image/${withLegal[0] === 0xff ? "jpeg" : "png"};base64,${withLegal.toString("base64")}`,
    bottomFraction,
    threshold,
  );
}

test("actual PNG and PDF raster pipelines paint per-page legal text", async () => {
  const marker = "CONDIÇÃO LEGAL RS MS 12345";
  const cases = [
    {
      empty: renderTelaHtml({ ...base, disclaimer: "" }),
      legal: renderTelaHtml({ ...base, disclaimer: marker }),
      opts: { width: 1280, height: 720, scale: 1 },
      bottom: 0.84,
    },
    {
      empty: renderCardHtml({ ...base, isCapa: false, disclaimer: "" }),
      legal: renderCardHtml({ ...base, isCapa: false, disclaimer: marker }),
      opts: { width: 1080, height: 1440, scale: 1 },
      bottom: 0.84,
    },
    {
      empty: renderStoryHtml({
        ...base,
        produtos: products.slice(0, 3),
        isCapa: false,
        disclaimer: "",
      }),
      legal: renderStoryHtml({
        ...base,
        produtos: products.slice(0, 3),
        isCapa: false,
        disclaimer: marker,
      }),
      opts: { width: 1080, height: 1920, scale: 1 },
      bottom: 0.84,
    },
  ];

  for (const item of cases) {
    const pngs = await htmlToPngBatch(
      [item.empty, item.legal],
      item.opts as PngOptions,
    );
    const pngDifference = await changedRasterPixels(
      pngs[0],
      pngs[1],
      item.bottom,
      0,
    );
    assert.ok(pngDifference.total > 100, "legal text made no PNG raster change");
    assert.ok(
      pngDifference.bottom / pngDifference.total > 0.98,
      "PNG changes escaped the reserved legal footer",
    );

    const jpegs = await htmlToPngBatch(
      [item.empty, item.legal],
      { ...item.opts, tipo: "jpeg", quality: 82 } as PngOptions,
    );
    const jpegDifference = await changedRasterPixels(
      jpegs[0],
      jpegs[1],
      item.bottom,
      8,
    );
    assert.ok(jpegDifference.total > 100, "legal text made no PDF raster change");
    assert.ok(
      jpegDifference.bottom / jpegDifference.total > 0.9,
      "PDF/JPEG changes escaped the reserved legal footer",
    );
    const pdf = await pngsToPdf([jpegs[1]], {
      width: item.opts.width,
      height: item.opts.height,
    });
    const parsed = await PDFDocument.load(pdf);
    assert.equal(parsed.getPageCount(), 1);
  }
});

test("Cards and Stories capa contain no legal markup or legal text", () => {
  const disclaimer = "LEGAL-NEVER-ON-CAPA";
  for (const html of [
    renderCardHtml({ ...base, isCapa: true, disclaimer }),
    renderStoryHtml({ ...base, produtos: products.slice(0, 3), isCapa: true, disclaimer }),
  ]) {
    assert.doesNotMatch(html, /data-fit-legal/);
    assert.doesNotMatch(html, /LEGAL-NEVER-ON-CAPA/);
  }
});

test("Tela long legal uses fixed full-width footer without moving products", async () => {
  const empty = await boxes(
    renderTelaHtml({ ...base, disclaimer: "" }),
    { width: 1280, height: 720 },
    ".tela-cards .card",
    ".tela-info",
  );
  const long = await boxes(
    renderTelaHtml({ ...base, disclaimer: longLegal }),
    { width: 1280, height: 720 },
    ".tela-cards .card",
    ".tela-info",
  );
  assertSameProducts(empty, long);
});

test("Card and Story interiors reserve non-overlapping fixed legal footers", async () => {
  const cases = [
    {
      empty: renderCardHtml({ ...base, isCapa: false, disclaimer: "" }),
      long: renderCardHtml({ ...base, isCapa: false, disclaimer: longLegal }),
      viewport: { width: 1080, height: 1440 },
      product: ".card-body .card",
      footer: ".card-footer",
    },
    {
      empty: renderStoryHtml({
        ...base,
        produtos: products,
        isCapa: false,
        disclaimer: "",
      }),
      long: renderStoryHtml({
        ...base,
        produtos: products,
        isCapa: false,
        disclaimer: longLegal,
      }),
      viewport: { width: 1080, height: 1920 },
      product: ".story-body .card",
      footer: ".story-footer",
    },
  ];
  for (const item of cases) {
    const empty = await boxes(
      item.empty,
      item.viewport,
      item.product,
      item.footer,
    );
    const long = await boxes(
      item.long,
      item.viewport,
      item.product,
      item.footer,
    );
    assertSameProducts(empty, long);
  }
});