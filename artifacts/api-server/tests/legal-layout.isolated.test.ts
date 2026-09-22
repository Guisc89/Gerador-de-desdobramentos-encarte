import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { resolveChromiumPath } from "../src/lib/chromium";
import { renderTelaHtml } from "../src/services/telaTemplate";
import { renderCardHtml } from "../src/services/cardTemplate";
import { renderStoryHtml } from "../src/services/storyTemplate";

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
        produtos: products.slice(0, 3),
        isCapa: false,
        disclaimer: "",
      }),
      long: renderStoryHtml({
        ...base,
        produtos: products.slice(0, 3),
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