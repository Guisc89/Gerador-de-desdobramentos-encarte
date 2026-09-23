import {
  renderProductCard,
  corHexValida,
  type TelaProduto,
} from "./telaTemplate";
import {
  formatLegalTextLines,
  LEGAL_FIT_SCRIPT,
} from "./legalText";

// A "Card" is a 1080x1440 (portrait 3:4) feed post. The decorative art (title
// phrase, lettering, hero photo, logo) comes from a campaign BACKGROUND image
// the user uploads; the app only overlays month, validity, legal copy and cards.
//
// Page 1 (capa, isCapa=true): exactly 2 products laid out lower-right, matching
// the capa reference art. Page 2+ (isCapa=false): 2 to 4 products, vertically
// centered, following the reference dispositions:
//   - 2 products: stacked, centered
//   - 3 products: stacked, centered
//   - 4 products: staggered zig-zag (1 left, 2 right, 3 left, 4 right)
// Non-capa pages also carry a bottom footer with the legal copy.
export interface CardProduto extends TelaProduto {}

export interface CardState {
  mes: string;
  validadeInicio: string;
  validadeFim: string;
  disclaimer?: string;
  infoCor?: string;
  produtoCor?: string;
  background?: string | null;
  isCapa?: boolean;
  produtos: CardProduto[];
}

function esc(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

export function renderCardHtml(state: CardState): string {
  const produtos = Array.isArray(state.produtos) ? state.produtos : [];
  const count = produtos.length;
  const isCapa = !!state.isCapa;

  const bgStyle = state.background
    ? `style="background-image:url('${esc(state.background)}')"`
    : "";
  const bgClass = state.background ? "card-bg" : "card-bg card-bg-default";

  const disclaimer = formatLegalTextLines(state.disclaimer)
    .map(esc)
    .join("<br />");
  const infoCor = corHexValida(state.infoCor);
  const infoCorCss = infoCor
    ? `.ci-mesval, .cf-disclaimer { color: ${infoCor}; }`
    : "";

  const slots = (p: CardProduto): string =>
    `<div class="card-slot">${renderProductCard(p)}</div>`;

  let overlay: string;
  if (isCapa) {
    // Capa: month/validade top-left, 2 product cards lower-right.
    const mesVal = [
      state.mes ? esc(state.mes) : "",
      state.validadeInicio || state.validadeFim
        ? `Validade: ${esc(state.validadeInicio)} a ${esc(state.validadeFim)}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const cards =
      count > 0
        ? produtos.map(slots).join("\n")
        : `<div class="card-empty">Adicione produtos para montar o card.</div>`;

    overlay = `
      <div class="card-topinfo">
        ${mesVal ? `<div class="ci-mesval">${mesVal}</div>` : ""}
      </div>
      <div class="card-stack" data-count="${count}">
        ${cards}
      </div>`;
  } else {
    // Non-capa: 2–4 product cards vertically centered + a bottom footer.
    const layoutClass =
      count >= 4 ? "layout-4" : count === 3 ? "layout-3" : "layout-2";
    const cards =
      count > 0
        ? produtos.map(slots).join("\n")
        : `<div class="card-empty card-empty-center">Adicione produtos para montar o card.</div>`;

    overlay = `
      <div class="card-body ${layoutClass}" data-count="${count}">
        ${cards}
      </div>
      <div class="card-footer">
        <div class="cf-rule"></div>
        <div class="cf-legal-box">
          ${disclaimer ? `<div class="cf-disclaimer" data-fit-legal data-min-font="1">${disclaimer}</div>` : ""}
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #fff;
  }
  /* 1080 x 1440 => portrait 3:4 (height = width * 4/3 = 133.3333vw) */
  .card-canvas {
    position: relative;
    width: 100vw;
    height: 133.3333vw;
    overflow: hidden;
  }
  .card-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    z-index: 0;
  }
  .card-bg-default {
    background-image:
      radial-gradient(circle at 78% 16%, rgba(255,255,255,0.5) 0%, transparent 42%),
      linear-gradient(160deg, #eef3dc 0%, #dfeac6 58%, #d2e2b6 100%);
  }
  .card-overlay { position: absolute; inset: 0; z-index: 1; }

  /* ---- Capa (page 1) ---- */
  /* Dynamic month/validade only: legal copy is forbidden on capa. */
  .card-topinfo {
    position: absolute;
    top: 14.5%;
    left: 4.5%;
    right: 38%;
    color: #0f5f56;
    line-height: 1.28;
  }
  .ci-mesval { font-size: 2.6vw; font-weight: 900; }
  /* Product cards stacked, lower-right (capa disposition of the reference) */
  .card-stack {
    position: absolute;
    right: 3.5%;
    bottom: 4%;
    width: 55%;
    display: flex;
    flex-direction: column;
    gap: 3vw;
  }

  /* ---- Non-capa (page 2+) ---- */
  .card-body {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 16%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3vw;
    padding: 13% 5% 5% 5%;
  }
  /* 2 & 3 products: full, centered stack */
  .card-body.layout-2 .card-slot { width: 78%; }
  .card-body.layout-3 .card-slot { width: 72%; }
  /* 4 products: narrower cards, zig-zag alternating left/right */
  .card-body.layout-4 { align-items: stretch; }
  .card-body.layout-4 .card-slot { width: 62%; }
  .card-body.layout-4 .card-slot:nth-child(odd) { align-self: flex-start; }
  .card-body.layout-4 .card-slot:nth-child(even) { align-self: flex-end; }

  /* Bottom legal footer */
  .card-footer {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 4.5%;
    height: 9.5%;
    text-align: center;
    color: #0f5f56;
  }
  .cf-rule {
    width: 62%;
    height: 0.28vw;
    background: #0f9e90;
    margin: 0 auto 1.4vw;
    border-radius: 1vw;
  }
  .cf-legal-box {
    width: 100%;
    height: calc(100% - 1.68vw);
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .cf-disclaimer {
    width: 100%;
    margin: 0 auto;
    font-size: 1.75vw;
    line-height: 1.3;
    font-weight: 400;
    color: #3d4a3a;
    overflow-wrap: anywhere;
  }

  /* ---- Shared product card ---- */
  /* Each slot establishes its own inline-size container so the card (sized in
     cqw, single markup shared with telaTemplate via renderProductCard) scales to
     its slot width regardless of how many products the layout holds. */
  .card-slot { container-type: inline-size; }
  .card-stack .card-slot { width: 100%; }

  .card {
    background: #ffffff;
    border-radius: 4cqw;
    display: flex;
    overflow: hidden;
    box-shadow: 0 2.5cqw 6cqw rgba(15, 95, 86, 0.20);
  }
  .card-photo {
    width: 40%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.5cqw;
    background: #fff;
    /* Mesma regra das telas: a foto não participa do layout — o card tem
       sempre o mesmo tamanho e a imagem se ajusta ao espaço branco (amplia a
       pequena, reduz a grande), mantendo a proporção. */
    position: relative;
    min-height: 29cqw;
  }
  .card-photo img {
    position: absolute;
    top: 1cqw;
    left: 1cqw;
    width: calc(100% - 2cqw);
    height: calc(100% - 2cqw);
    object-fit: contain;
  }
  .card-photo-empty {
    font-size: 2.4cqw;
    color: #b4bcae;
    text-align: center;
    border: 0.4cqw dashed #cfd6c6;
    border-radius: 2cqw;
    padding: 3cqw;
    width: 100%;
  }
  .card-info {
    width: 60%;
    background: ${corHexValida(state.produtoCor) || "linear-gradient(150deg, #06b6a6 0%, #029e93 100%)"};
    color: #ffffff;
    padding: 3.5cqw 3.75cqw;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .card-nome { font-size: 3.9cqw; font-weight: 900; line-height: 1.05; }
  .card-desc {
    margin-top: 0.75cqw;
    font-size: 2.55cqw;
    font-weight: 500;
    color: rgba(255,255,255,0.92);
  }
  .card-price {
    margin-top: 2.5cqw;
    display: flex;
    align-items: baseline;
    gap: 0.75cqw;
    line-height: 1;
  }
  .card-price .rs { font-size: 3.75cqw; font-weight: 800; }
  .card-price .int { font-size: 10cqw; font-weight: 900; letter-spacing: -0.12cqw; }
  .card-price .cent-group {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    align-self: flex-start;
    margin-top: 1cqw;
    line-height: 1;
  }
  .card-price .cent { font-size: 5cqw; font-weight: 900; }
  .card-price .cada { font-size: 2.5cqw; font-weight: 700; margin-top: 0.6cqw; }

  .card-empty {
    position: absolute;
    right: 3.5%;
    bottom: 6%;
    width: 55%;
    text-align: center;
    color: #6c7a64;
    font-size: 2vw;
    padding: 3vw;
    border: 0.3vw dashed #c2cbb6;
    border-radius: 1.6vw;
    background: rgba(255,255,255,0.55);
  }
  .card-empty-center {
    position: static;
    width: 78%;
    margin: auto;
  }
  ${infoCorCss}
</style>
</head>
<body>
  <div class="card-canvas">
    <div class="${bgClass}" ${bgStyle}></div>
    <div class="card-overlay">
      ${overlay}
    </div>
  </div>
</body>
${isCapa ? "" : LEGAL_FIT_SCRIPT}
</html>`;
}
