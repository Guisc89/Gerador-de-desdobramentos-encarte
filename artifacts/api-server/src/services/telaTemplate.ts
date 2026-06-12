import fs from "node:fs";
import path from "node:path";

const LOGO_PATHS = [
  path.resolve(process.cwd(), "public/logo.png"),
  path.resolve(process.cwd(), "artifacts/api-server/public/logo.png"),
];

let logoDataUri: string | null = null;
function getLogo(): string {
  if (logoDataUri !== null) return logoDataUri;
  for (const p of LOGO_PATHS) {
    try {
      const buf = fs.readFileSync(p);
      logoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
      return logoDataUri;
    } catch {
      // try next path
    }
  }
  logoDataUri = "";
  return logoDataUri;
}

export interface TelaProduto {
  nome: string;
  descricao: string;
  precoInteiro: string;
  precoCentavos: string;
  foto?: string | null;
}

export interface TelaState {
  mes: string;
  validadeInicio: string;
  validadeFim: string;
  endereco: string;
  background?: string | null;
  produtos: TelaProduto[];
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

function renderCard(p: TelaProduto): string {
  const cent = (p.precoCentavos || "00").padStart(2, "0").slice(0, 2);
  const photo = p.foto
    ? `<img src="${esc(p.foto)}" alt="" />`
    : `<span class="card-photo-empty">Sem foto</span>`;
  const desc = p.descricao
    ? `<div class="card-desc">${esc(p.descricao)}</div>`
    : "";
  return `
    <div class="card">
      <div class="card-photo">${photo}</div>
      <div class="card-info">
        <div class="card-nome">${esc(p.nome)}</div>
        ${desc}
        <div class="card-price">
          <span class="rs">R$</span><span class="int">${esc(
            p.precoInteiro || "0",
          )}</span><span class="cent">,${esc(cent)}</span><span class="cada">cada</span>
        </div>
      </div>
    </div>`;
}

export function renderTelaHtml(state: TelaState): string {
  const produtos = Array.isArray(state.produtos) ? state.produtos : [];
  const count = produtos.length;
  const cols = count <= 2 ? 1 : 2;

  const bgStyle = state.background
    ? `style="background-image:url('${esc(state.background)}')"`
    : "";
  const bgClass = state.background ? "tela-bg" : "tela-bg tela-bg-default";

  const headerParts: string[] = [];
  if (state.mes) headerParts.push(esc(state.mes));
  if (state.validadeInicio || state.validadeFim) {
    headerParts.push(
      `Validade: ${esc(state.validadeInicio)} a ${esc(state.validadeFim)}`,
    );
  }
  const headerLine = headerParts.join(" | ");

  const logo = getLogo();
  const logoTag = logo
    ? `<img class="tela-logo" src="${logo}" alt="Farmácias Associadas" />`
    : `<div class="tela-logo-fallback">Farmácias Associadas</div>`;

  const cards =
    count > 0
      ? produtos.map(renderCard).join("\n")
      : `<div class="tela-empty">Adicione produtos para montar a tela.</div>`;

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
  .tela {
    position: relative;
    width: 100vw;
    height: 56.25vw;
    overflow: hidden;
  }
  .tela-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    z-index: 0;
  }
  .tela-bg-default {
    background-image:
      radial-gradient(circle at 80% 20%, rgba(255,255,255,0.55) 0%, transparent 45%),
      linear-gradient(135deg, #eef3dc 0%, #dde9c4 55%, #cfe0b3 100%);
  }
  .tela-content {
    position: relative;
    z-index: 1;
    display: flex;
    width: 100%;
    height: 100%;
    padding: 3.2vw;
    gap: 2.2vw;
  }
  .tela-left {
    width: 42%;
    display: flex;
    flex-direction: column;
  }
  .tela-logo { width: 28vw; max-width: 100%; height: auto; display: block; }
  .tela-logo-fallback {
    font-size: 3.2vw; font-weight: 900; color: #ef7d22; line-height: 1;
  }
  .tela-header {
    margin-top: 1.4vw;
    font-size: 1.55vw;
    font-weight: 800;
    color: #0f5f56;
  }
  .tela-disclaimer {
    margin-top: 0.7vw;
    font-size: 0.92vw;
    color: #3d4a3a;
    max-width: 32vw;
  }
  .tela-endereco {
    margin-top: 0.4vw;
    font-size: 1vw;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #0f5f56;
  }
  .tela-right {
    width: 58%;
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    gap: 1.6vw;
    align-content: center;
  }
  .card {
    background: #ffffff;
    border-radius: 1.6vw;
    display: flex;
    overflow: hidden;
    box-shadow: 0 1vw 2.4vw rgba(15, 95, 86, 0.18);
    min-height: 0;
  }
  .card-photo {
    width: 40%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1vw;
    background: #fff;
  }
  .card-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .card-photo-empty {
    font-size: 0.95vw;
    color: #b4bcae;
    text-align: center;
    border: 0.15vw dashed #cfd6c6;
    border-radius: 0.8vw;
    padding: 1.2vw;
    width: 100%;
  }
  .card-info {
    width: 60%;
    background: linear-gradient(150deg, #06b6a6 0%, #029e93 100%);
    color: #ffffff;
    padding: 1.4vw 1.5vw;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .card-nome { font-size: 1.55vw; font-weight: 900; line-height: 1.05; }
  .card-desc {
    margin-top: 0.3vw;
    font-size: 1.02vw;
    font-weight: 500;
    color: rgba(255,255,255,0.92);
  }
  .card-price {
    margin-top: 1vw;
    display: flex;
    align-items: baseline;
    gap: 0.3vw;
    line-height: 1;
  }
  .card-price .rs { font-size: 1.5vw; font-weight: 800; }
  .card-price .int { font-size: 4vw; font-weight: 900; letter-spacing: -0.05vw; }
  .card-price .cent { font-size: 2vw; font-weight: 900; align-self: flex-start; margin-top: 0.4vw; }
  .card-price .cada { font-size: 1vw; font-weight: 700; align-self: flex-end; margin-left: 0.2vw; }
  .tela-empty {
    grid-column: 1 / -1;
    align-self: center;
    text-align: center;
    color: #6c7a64;
    font-size: 1.3vw;
    padding: 3vw;
    border: 0.2vw dashed #c2cbb6;
    border-radius: 1.2vw;
    background: rgba(255,255,255,0.5);
  }
</style>
</head>
<body>
  <div class="tela">
    <div class="${bgClass}" ${bgStyle}></div>
    <div class="tela-content">
      <div class="tela-left">
        ${logoTag}
        ${headerLine ? `<div class="tela-header">${headerLine}</div>` : ""}
        <div class="tela-disclaimer">Os preços e produtos anunciados são válidos exclusivamente para esta loja.</div>
        ${
          state.endereco
            ? `<div class="tela-endereco">${esc(state.endereco)}</div>`
            : `<div class="tela-endereco">Insira aqui seu endereço</div>`
        }
      </div>
      <div class="tela-right" data-count="${count}">
        ${cards}
      </div>
    </div>
  </div>
</body>
</html>`;
}
