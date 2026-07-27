import * as XLSX from "xlsx";
import { formatPrice } from "./priceFormatter";
import { logger } from "../lib/logger";

export interface Produto {
  espaco: string;
  fabricante: string;
  ean: string;
  nome: string;
  descricao: string;
  precoOriginal: string;
  precoInteiro: string;
  precoCentavos: string;
  validadeInicio: string;
  validadeFim: string;
}

export interface ParseResult {
  produtos: Produto[];
  total: number;
  validos: number;
  invalidos: number;
  abaUtilizada: string;
  abasEncontradas: string[];
  pendentes: string[];
}

const PREFERRED_SHEET_REGEX = /^encarte/i;

function pickSheet(wb: XLSX.WorkBook): string {
  // Prefer a sheet whose name starts with "ENCARTE"
  const preferred = wb.SheetNames.find((n) => PREFERRED_SHEET_REGEX.test(n));
  return preferred ?? wb.SheetNames[0]!;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

interface HeaderMap {
  rowIndex: number;
  espaco?: number;
  fabricante?: number;
  ean?: number;
  descricao?: number;
  descricaoComplementar?: number;
  preco?: number;
}

function findHeader(rows: unknown[][]): HeaderMap | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] ?? [];
    const headers = row.map(normalizeHeader);
    const espacoIdx = headers.findIndex((h) => h === "espaco" || h === "espaço");
    const descIdx = headers.findIndex((h) => h === "descricao");
    const precoIdx = headers.findIndex(
      (h) => h.includes("venda") || h === "preco" || h.includes("preco"),
    );
    if (descIdx >= 0 && precoIdx >= 0) {
      const fabIdx = headers.findIndex((h) => h === "fabricante");
      const eanIdx = headers.findIndex((h) => h === "ean");
      // descricao complementar: next non-empty header right after descricao but before preco,
      // or just the column right after descricao if blank header
      let descCompl: number | undefined;
      for (let c = descIdx + 1; c < precoIdx; c++) {
        if (headers[c] === "" || headers[c] === "apresentacao") {
          descCompl = c;
          break;
        }
      }
      return {
        rowIndex: r,
        espaco: espacoIdx >= 0 ? espacoIdx : undefined,
        fabricante: fabIdx >= 0 ? fabIdx : undefined,
        ean: eanIdx >= 0 ? eanIdx : undefined,
        descricao: descIdx,
        descricaoComplementar: descCompl,
        preco: precoIdx,
      };
    }
  }
  return null;
}

// Units that identify a trailing "apresentação" token (quantity/size) at the
// end of a product name, e.g. "140Unds", "50 Unds", "30 comprimidos", "200ml".
const APRESENTACAO_UNIT =
  /^(uns?|unds?|unid(?:ades?)?|comprimidos?|dr[aá]geas?|c[aá]ps(?:ulas?)?\.?|s(?:a)ch[eê]s?|envelopes?|tiras?|fraldas?|len[cç]os?|ml|mg|mcg|g|kg|l|lts?|litros?|m|mts?|metros?)$/i;

export function splitApresentacao(
  nome: string,
): { nome: string; apresentacao: string } | null {
  // Match a trailing "<number><unit>" or "<number> <unit>" token.
  const m = nome.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ.]+)$/);
  if (!m) return null;
  const [, resto, numero, unidade] = m;
  if (!resto || !numero || !unidade) return null;
  if (!APRESENTACAO_UNIT.test(unidade)) return null;
  // Keep at least two words in the product name so we never strip it bare.
  if (resto.trim().split(/\s+/).length < 2) return null;
  // Metric measures stay compact ("250g", "30ml"); count units get a space
  // ("140 Unds", "30 comprimidos") like the reference art.
  const compact = /^(ml|mg|mcg|g|kg|l)$/i.test(unidade);
  const sep = compact ? "" : " ";
  return { nome: resto.trim(), apresentacao: `${numero}${sep}${unidade}` };
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export interface ParseOptions {
  validadeInicio: string;
  validadeFim: string;
}

export function parseExcel(buffer: Buffer, opts: ParseOptions): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const abasEncontradas = wb.SheetNames;
  logger.info({ sheets: abasEncontradas }, "Excel sheets found");

  const sheetName = pickSheet(wb);
  logger.info({ sheet: sheetName }, "Using sheet");

  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const header = findHeader(rows);
  if (!header) {
    throw new Error(
      "Não foi possível localizar as colunas obrigatórias (Descrição e Venda Encarte) na planilha.",
    );
  }

  const produtos: Produto[] = [];
  const pendentes: string[] = [];
  let total = 0;
  let invalidos = 0;

  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row || row.every((v) => String(v ?? "").trim() === "")) continue;

    const nome = cell(row, header.descricao);
    if (!nome) {
      // skip rows without a product name (subsection headers etc.)
      continue;
    }
    // skip if the "name" looks like a header repeated
    if (normalizeHeader(nome) === "descricao") continue;

    total++;

    const precoRaw = header.preco !== undefined ? row[header.preco] : "";
    const price = formatPrice(precoRaw);
    if (!price) {
      invalidos++;
      pendentes.push(nome);
      continue;
    }

    let descricao = cell(row, header.descricaoComplementar);
    let nomeFinal = nome;
    if (!descricao) {
      // Fallback: apresentação embedded at the end of the Descrição cell
      // (e.g. "Toalha Umedecida Crescendo 140Unds") — split it out so the
      // preçário shows it smaller, without bold, like the reference art.
      const split = splitApresentacao(nome);
      if (split) {
        nomeFinal = split.nome;
        descricao = split.apresentacao;
      }
    }

    produtos.push({
      espaco: cell(row, header.espaco),
      fabricante: cell(row, header.fabricante),
      ean: cell(row, header.ean),
      nome: nomeFinal,
      descricao,
      precoOriginal: price.precoOriginal,
      precoInteiro: price.precoInteiro,
      precoCentavos: price.precoCentavos,
      validadeInicio: opts.validadeInicio,
      validadeFim: opts.validadeFim,
    });
  }

  return {
    produtos,
    total,
    validos: produtos.length,
    invalidos,
    abaUtilizada: sheetName,
    abasEncontradas,
    pendentes,
  };
}
