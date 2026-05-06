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

    const descricao = cell(row, header.descricaoComplementar);

    produtos.push({
      espaco: cell(row, header.espaco),
      fabricante: cell(row, header.fabricante),
      ean: cell(row, header.ean),
      nome,
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
