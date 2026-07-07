import { renderProductCard, type TelaProduto } from "./telaTemplate";

// A "Card" is a 1080x1440 (portrait 3:4) feed post. The decorative art (title
// phrase, lettering, hero photo, logo) comes from a campaign BACKGROUND image
// the user uploads; the app only overlays the dynamic parts on top: month +
// validade, address, and the product cards.
//
// Page 1 (capa, isCapa=true): exactly 2 products laid out lower-right, matching
// the capa reference art. Page 2+ (isCapa=false): 2 to 4 products, vertically
// centered, following the reference dispositions:
//   - 2 products: stacked, centered
//   - 3 products: stacked, centered
//   - 4 products: staggered zig-zag (1 left, 2 right, 3 left, 4 right)
// Non-capa pages also carry a bottom footer with the disclaimer + address.
export interface CardProduto extends TelaProduto {}

export interface CardState {
  mes: string;
  validadeInicio: string;
  validadeFim: string;
  endereco: string;
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

const DISCLAIMER =
  "Os preços e produtos anunciados são válidos exclusivamente para esta loja.";

export function renderCardHtml(state: CardState): string {
  const produtos = Array.isArray(state.produtos) ? state.produtos : [];
  const count = produtos.length;
  const isCapa = !!state.isCapa;

  const bgStyle = state.background
    ? `style="background-image:url('${esc(state.background)}')"`
    : "";
  const bgClass = state.background ? "card-bg" : "card-bg card-bg-default";

  const endereco = state.endereco ? esc(state.endereco) : "Insira aqui seu endereço";

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
        <div class="ci-disclaimer">${DISCLAIMER}</div>
        <div class="ci-endereco">${endereco}</div>
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
        <div class="cf-disclaimer">${DISCLAIMER}</div>
        <div class="cf-endereco">${endereco}</div>
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
  /* Dynamic month/validade + address, top-left (logo lives in the background) */
  .card-topinfo {
    position: absolute;
    top: 14.5%;
    left: 4.5%;
    right: 38%;
    color: #0f5f56;
    line-height: 1.28;
  }
  .ci-mesval { font-size: 2.6vw; font-weight: 900; }
  .ci-disclaimer {
    margin-top: 0.5vw;
    font-size: 1.35vw;
    font-weight: 400;
    color: #3d4a3a;
  }
  .ci-endereco {
    margin-top: 0.6vw;
    font-size: 1.9vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
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
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 3vw;
    padding: 13% 5% 13% 5%;
  }
  /* 2 & 3 products: full, centered stack */
  .card-body.layout-2 .card-slot { width: 78%; }
  .card-body.layout-3 .card-slot { width: 72%; }
  /* 4 products: narrower cards, zig-zag alternating left/right */
  .card-body.layout-4 { align-items: stretch; }
  .card-body.layout-4 .card-slot { width: 62%; }
  .card-body.layout-4 .card-slot:nth-child(odd) { align-self: flex-start; }
  .card-body.layout-4 .card-slot:nth-child(even) { align-self: flex-end; }

  /* Bottom footer (disclaimer + address), matching the non-capa reference art */
  .card-footer {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 4.5%;
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
  .cf-disclaimer { font-size: 1.5vw; font-weight: 400; color: #3d4a3a; }
  .cf-endereco {
    margin-top: 1vw;
    font-size: 2vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
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
  }
  .card-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
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
    background: linear-gradient(150deg, #06b6a6 0%, #029e93 100%);
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
</html>`;
}
