import type { Produto } from "./excelParser";

const PRODUTOS_POR_PAGINA = 14;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function renderCard(p: Produto | null, idx: number, editable: boolean): string {
  if (!p) return `<div class="card empty"></div>`;
  const ed = editable ? ` contenteditable="true" spellcheck="false"` : "";
  const dataIdx = ` data-idx="${idx}"`;
  return `
    <div class="card" data-card-idx="${idx}">
      <div class="card-top">
        <div class="nome"${ed}${dataIdx} data-field="nome">${escapeHtml(p.nome)}</div>
        <div class="descricao"${ed}${dataIdx} data-field="descricao">${escapeHtml(p.descricao || "")}</div>
      </div>
      <div class="card-bottom">
        <div class="validade">
          <div class="validade-label">Validade:</div>
          <div class="validade-data">
            <span${ed}${dataIdx} data-field="validadeInicio">${escapeHtml(p.validadeInicio || "")}</span>
            <span class="validade-sep"> a </span>
            <span${ed}${dataIdx} data-field="validadeFim">${escapeHtml(p.validadeFim || "")}</span>
          </div>
        </div>
        <div class="preco">
          <span class="preco-rs">R$</span>
          <span class="preco-int"${ed}${dataIdx} data-field="precoInteiro">${escapeHtml(p.precoInteiro)}</span><span class="preco-virgula">,</span>
          <span class="preco-cent-wrap">
            <span class="preco-cent"${ed}${dataIdx} data-field="precoCentavos">${escapeHtml(p.precoCentavos)}</span>
            <span class="preco-cada">cada</span>
          </span>
        </div>
      </div>
    </div>`;
}

function renderPage(
  produtos: (Produto | null)[],
  pageOffset: number,
  editable: boolean,
): string {
  const cells: string[] = [];
  for (let i = 0; i < PRODUTOS_POR_PAGINA; i++) {
    cells.push(renderCard(produtos[i] ?? null, pageOffset + i, editable));
  }
  return `<section class="page"><div class="grid">${cells.join("")}</div></section>`;
}

export interface RenderOptions {
  mes?: string;
  editable?: boolean;
}

export function renderEncarteHtml(
  produtos: Produto[],
  opts: RenderOptions = {},
): string {
  const editable = opts.editable === true;
  const pages = chunk(produtos, PRODUTOS_POR_PAGINA);
  if (pages.length === 0) {
    pages.push([]);
  }

  const body = pages
    .map((p, pageIdx) =>
      renderPage(p, pageIdx * PRODUTOS_POR_PAGINA, editable),
    )
    .join("\n");

  const editorScript = editable
    ? `<script>
      (function(){
        function send(){
          var changes = [];
          document.querySelectorAll('[contenteditable="true"][data-idx][data-field]').forEach(function(el){
            changes.push({ idx: Number(el.getAttribute('data-idx')), field: el.getAttribute('data-field'), value: el.innerText.trim() });
          });
          parent.postMessage({ type: 'encarte-edit', changes: changes }, '*');
        }
        document.addEventListener('input', function(ev){
          if (ev.target && ev.target.hasAttribute('contenteditable')) send();
        });
        document.addEventListener('blur', function(ev){
          if (ev.target && ev.target.hasAttribute && ev.target.hasAttribute('contenteditable')) send();
        }, true);
        document.addEventListener('keydown', function(ev){
          if (ev.key === 'Enter' && ev.target && ev.target.hasAttribute && ev.target.hasAttribute('contenteditable')) {
            ev.preventDefault();
            ev.target.blur();
          }
        });
      })();
    </script>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Encarte</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 8mm 8mm 8mm 8mm;
    background: #ffffff;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(7, 1fr);
    width: 100%;
    height: 100%;
    column-gap: 6mm;
    row-gap: 0;
    position: relative;
  }
  /* Vertical dotted divider between columns */
  .grid::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    border-left: 2px dotted #444;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .card {
    position: relative;
    padding: 3mm 3mm 3mm 3mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-bottom: 2px dotted #444;
    overflow: hidden;
  }
  /* Remove bottom dotted line on the last row */
  .card:nth-child(13),
  .card:nth-child(14) {
    border-bottom: none;
  }
  .card.empty { background: transparent; }
  /* Subtle watermark circle in the background */
  .card::after {
    content: "";
    position: absolute;
    right: 6mm;
    top: 50%;
    transform: translateY(-50%);
    width: 28mm;
    height: 28mm;
    border-radius: 50%;
    background: radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 70%);
    pointer-events: none;
    z-index: 0;
  }
  .card-top {
    position: relative;
    z-index: 1;
    max-width: 100%;
  }
  .nome {
    font-weight: 800;
    font-size: 11pt;
    line-height: 1.15;
    color: #111;
    margin-bottom: 1mm;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .descricao {
    font-size: 8.5pt;
    line-height: 1.2;
    color: #2a2a2a;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .card-bottom {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-top: 2mm;
    gap: 2mm;
  }
  .validade {
    font-size: 7pt;
    line-height: 1.1;
    color: #1a1a1a;
    align-self: flex-end;
    padding-bottom: 1mm;
  }
  .validade-label { font-weight: 700; }
  .validade-data { font-weight: 600; }
  .preco {
    display: flex;
    align-items: flex-end;
    line-height: 0.9;
    color: #111;
    white-space: nowrap;
  }
  .preco-rs {
    font-size: 11pt;
    font-weight: 700;
    margin-right: 1mm;
    margin-bottom: 4mm;
  }
  .preco-int {
    font-size: 44pt;
    font-weight: 900;
    letter-spacing: -2px;
  }
  .preco-virgula {
    font-size: 44pt;
    font-weight: 900;
    margin: 0 0 0 0;
  }
  .preco-cent-wrap {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 6mm;
    margin-left: 0.5mm;
  }
  .preco-cent {
    font-size: 18pt;
    font-weight: 900;
    line-height: 1;
  }
  .preco-cada {
    font-size: 9pt;
    font-weight: 700;
    line-height: 1;
    margin-top: 0.5mm;
  }
  /* ----- Editable mode hints ----- */
  [contenteditable="true"] {
    outline: none;
    transition: background 0.15s ease, box-shadow 0.15s ease;
    border-radius: 3px;
  }
  [contenteditable="true"]:hover {
    background: rgba(1,171,168,0.10);
    box-shadow: 0 0 0 2px rgba(1,171,168,0.25);
    cursor: text;
  }
  [contenteditable="true"]:focus {
    background: rgba(1,171,168,0.18);
    box-shadow: 0 0 0 2px #01aba8;
  }
</style>
</head>
<body>
${body}
${editorScript}
</body>
</html>`;
}
