import {
  renderProductCard,
  corHexValida,
  DISCLAIMER_PADRAO,
  type TelaProduto,
} from "./telaTemplate";

// A "Story" is a 1080x1920 (portrait 9:16) post. The decorative art (logo,
// title phrase, lettering, hero photo) comes from a campaign BACKGROUND image
// the user uploads; the app only overlays the dynamic parts on top: month +
// validade, address, and the product cards.
//
// Page 1 (capa, isCapa=true): exactly 2 products stacked, upper-middle area,
// with the month/validade + disclaimer + address block above them (the campaign
// lettering lives in the lower half of the background). Page 2+ (isCapa=false):
// 2 to 3 products stacked and vertically centered, plus a bottom footer with
// the disclaimer + address, matching the reference arts.
export interface StoryProduto extends TelaProduto {}

export interface StoryState {
  mes: string;
  validadeInicio: string;
  validadeFim: string;
  endereco: string;
  disclaimer?: string;
  infoCor?: string;
  background?: string | null;
  isCapa?: boolean;
  produtos: StoryProduto[];
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

const DISCLAIMER = DISCLAIMER_PADRAO;

export function renderStoryHtml(state: StoryState): string {
  const produtos = Array.isArray(state.produtos) ? state.produtos : [];
  const count = produtos.length;
  const isCapa = !!state.isCapa;

  const bgStyle = state.background
    ? `style="background-image:url('${esc(state.background)}')"`
    : "";
  const bgClass = state.background ? "story-bg" : "story-bg story-bg-default";

  const endereco = state.endereco ? esc(state.endereco) : "Insira aqui seu endereço";
  const disclaimer =
    state.disclaimer && state.disclaimer.trim()
      ? esc(state.disclaimer.trim())
      : esc(DISCLAIMER);
  const infoCor = corHexValida(state.infoCor);
  const infoCorCss = infoCor
    ? `.si-mesval, .si-endereco, .sf-endereco { color: ${infoCor}; }`
    : "";

  const slots = (p: StoryProduto): string =>
    `<div class="story-slot">${renderProductCard(p)}</div>`;

  let overlay: string;
  if (isCapa) {
    // Capa: month/validade + disclaimer + address block on top, then the 2
    // product cards stacked in the upper-middle (lettering in the background
    // fills the lower half).
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
        : `<div class="story-empty">Adicione produtos para montar o story.</div>`;

    overlay = `
      <div class="story-topinfo">
        ${mesVal ? `<div class="si-mesval">${mesVal}</div>` : ""}
        <div class="si-disclaimer">${disclaimer}</div>
        <div class="si-endereco">${endereco}</div>
      </div>
      <div class="story-stack" data-count="${count}">
        ${cards}
      </div>`;
  } else {
    // Non-capa: 2–3 product cards stacked, vertically centered + bottom footer.
    const layoutClass = count >= 3 ? "layout-3" : "layout-2";
    const cards =
      count > 0
        ? produtos.map(slots).join("\n")
        : `<div class="story-empty story-empty-center">Adicione produtos para montar o story.</div>`;

    overlay = `
      <div class="story-body ${layoutClass}" data-count="${count}">
        ${cards}
      </div>
      <div class="story-footer">
        <div class="sf-rule"></div>
        <div class="sf-disclaimer">${disclaimer}</div>
        <div class="sf-endereco">${endereco}</div>
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
  /* 1080 x 1920 => portrait 9:16 (height = width * 16/9 = 177.7778vw) */
  .story-canvas {
    position: relative;
    width: 100vw;
    height: 177.7778vw;
    overflow: hidden;
  }
  .story-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    z-index: 0;
  }
  .story-bg-default {
    background-image:
      radial-gradient(circle at 78% 12%, rgba(255,255,255,0.5) 0%, transparent 40%),
      linear-gradient(165deg, #eef3dc 0%, #dfeac6 58%, #d2e2b6 100%);
  }
  .story-overlay { position: absolute; inset: 0; z-index: 1; }

  /* ---- Capa (page 1) ---- */
  /* Dynamic month/validade + address block, below the logo area of the
     background art (logo + lettering live in the background). */
  .story-topinfo {
    position: absolute;
    top: 15%;
    left: 5.5%;
    right: 5.5%;
    color: #0f5f56;
    line-height: 1.28;
  }
  .si-mesval { font-size: 3.1vw; font-weight: 900; }
  .si-disclaimer {
    margin-top: 0.6vw;
    font-size: 1.65vw;
    font-weight: 400;
    color: #3d4a3a;
  }
  .si-endereco {
    margin-top: 0.7vw;
    font-size: 2.2vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  /* Product cards stacked in the upper-middle (capa disposition of the
     reference art — lettering fills the lower half of the background). */
  .story-stack {
    position: absolute;
    top: 22.5%;
    left: 7%;
    right: 7%;
    display: flex;
    flex-direction: column;
    gap: 3.6vw;
  }

  /* ---- Non-capa (page 2+) ---- */
  .story-body {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4vw;
    padding: 13% 6% 12% 6%;
  }
  /* 2 & 3 products: full, centered stack (reference dispositions) */
  .story-body.layout-2 .story-slot { width: 86%; }
  .story-body.layout-3 .story-slot { width: 84%; }

  /* Bottom footer (disclaimer + address), matching the non-capa reference art */
  .story-footer {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 3.6%;
    text-align: center;
    color: #0f5f56;
  }
  .sf-rule {
    width: 62%;
    height: 0.3vw;
    background: #0f9e90;
    margin: 0 auto 1.5vw;
    border-radius: 1vw;
  }
  .sf-disclaimer { font-size: 1.7vw; font-weight: 400; color: #3d4a3a; }
  .sf-endereco {
    margin-top: 1vw;
    font-size: 2.2vw;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  /* ---- Shared product card ---- */
  /* Each slot establishes its own inline-size container so the card (sized in
     cqw, single markup shared with telaTemplate via renderProductCard) scales to
     its slot width regardless of how many products the layout holds. */
  .story-slot { container-type: inline-size; }
  .story-stack .story-slot { width: 100%; }

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

  .story-empty {
    text-align: center;
    color: #6c7a64;
    font-size: 2.2vw;
    padding: 3vw;
    border: 0.3vw dashed #c2cbb6;
    border-radius: 1.6vw;
    background: rgba(255,255,255,0.55);
  }
  .story-empty-center {
    position: static;
    width: 82%;
    margin: auto;
  }
  ${infoCorCss}
</style>
</head>
<body>
  <div class="story-canvas">
    <div class="${bgClass}" ${bgStyle}></div>
    <div class="story-overlay">
      ${overlay}
    </div>
  </div>
</body>
</html>`;
}
