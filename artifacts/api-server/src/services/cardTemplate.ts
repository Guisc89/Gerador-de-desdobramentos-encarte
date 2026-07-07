import { renderProductCard, type TelaProduto } from "./telaTemplate";

// A "Card" is a 1080x1440 (portrait 3:4) feed post. The decorative art (title
// phrase, lettering, hero photo, logo) comes from a campaign BACKGROUND image
// the user uploads; the app only overlays the dynamic parts on top: month +
// validade, address, and the product cards. Page 1 (capa) holds exactly 2
// products laid out lower-right, matching the reference art.
export interface CardProduto extends TelaProduto {}

export interface CardState {
  mes: string;
  validadeInicio: string;
  validadeFim: string;
  endereco: string;
  background?: string | null;
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

  const bgStyle = state.background
    ? `style="background-image:url('${esc(state.background)}')"`
    : "";
  const bgClass = state.background ? "card-bg" : "card-bg card-bg-default";

  const mesVal = [
    state.mes ? esc(state.mes) : "",
    state.validadeInicio || state.validadeFim
      ? `Validade: ${esc(state.validadeInicio)} a ${esc(state.validadeFim)}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const infoBlock = `
      <div class="card-topinfo">
        ${mesVal ? `<div class="ci-mesval">${mesVal}</div>` : ""}
        <div class="ci-disclaimer">Os preços e produtos anunciados são válidos exclusivamente para esta loja.</div>
        <div class="ci-endereco">${
          state.endereco ? esc(state.endereco) : "Insira aqui seu endereço"
        }</div>
      </div>`;

  const cards =
    count > 0
      ? produtos.map(renderProductCard).join("\n")
      : `<div class="card-empty">Adicione produtos para montar o card.</div>`;

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
    gap: 4cqw;
    container-type: inline-size;
  }
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
  /* Card visual matches the Telas card, but sized in cqw so it scales to its
     own width regardless of the portrait canvas (single markup, shared with
     telaTemplate via renderProductCard). */
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
</style>
</head>
<body>
  <div class="card-canvas">
    <div class="${bgClass}" ${bgStyle}></div>
    <div class="card-overlay">
      ${infoBlock}
      <div class="card-stack" data-count="${count}">
        ${cards}
      </div>
    </div>
  </div>
</body>
</html>`;
}
