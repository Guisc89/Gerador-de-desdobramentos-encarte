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
  agrupados: number;
  ignorados: number;
  ocorrencias: Array<{
    linha: number;
    nome: string;
    tipo: "erro" | "ignorado" | "agrupado";
    motivo: string;
    linhaDestino?: number;
  }>;
  abaUtilizada: string;
  abasEncontradas: string[];
  pendentes: string[];
}

const PREFERRED_SHEET_REGEX = /^encarte/i;

export function importStats(parsed: ParseResult) {
  return {
    abaUtilizada: parsed.abaUtilizada,
    abasEncontradas: parsed.abasEncontradas,
    totalLidos: parsed.total,
    validos: parsed.validos,
    invalidos: parsed.invalidos,
    agrupados: parsed.agrupados,
    ignorados: parsed.ignorados,
    ocorrencias: parsed.ocorrencias,
    pendentes: parsed.pendentes,
  };
}

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
  let nonEmptyRowsExamined = 0;
  for (let r = 0; r < rows.length && nonEmptyRowsExamined < 30; r++) {
    const row = rows[r] ?? [];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    nonEmptyRowsExamined++;
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

const CONSULTE_REGEX = /^consulte\s+apresenta/i;
const SOURCE_ROWS = Symbol("excelSourceRows");
const SOURCE_NAMES = Symbol("excelSourceNames");
type TrackedProduto = Produto & {
  [SOURCE_ROWS]?: number[];
  [SOURCE_NAMES]?: Map<number, string>;
};

function absorbSources(target: Produto, source: Produto): void {
  const targetTracked = target as TrackedProduto;
  const sourceTracked = source as TrackedProduto;
  targetTracked[SOURCE_ROWS] = [
    ...(targetTracked[SOURCE_ROWS] ?? []),
    ...(sourceTracked[SOURCE_ROWS] ?? []),
  ];
  const names = new Map(targetTracked[SOURCE_NAMES] ?? []);
  for (const [line, name] of sourceTracked[SOURCE_NAMES] ?? []) {
    names.set(line, name);
  }
  targetTracked[SOURCE_NAMES] = names;
}

// When column E says "Consulte apresentações", variants of the same product
// (same base name and price, differing only by flavor/variant suffix) collapse
// into a single entry. The base name is everything before the " - variant"
// suffix; the single entry keeps "Consulte apresentações" as its descrição.
// Variants of the same product that differ only by flavor ("Nome - Sabor")
// collapse into a single item with "Consulte apresentações" as descrição.
// Triggers automatically when 2+ products share the same base name (part
// before the " - variant" suffix) and the same price, or explicitly when
// column E contains "Consulte apresentações".
export function dedupeConsulteApresentacoes(produtos: Produto[]): Produto[] {
  const VARIANT_SEP = /\s+[-–]\s+/;
  const keyOf = (p: Produto, baseNome: string) =>
    `${normalizeHeader(p.fabricante)}||${normalizeHeader(baseNome)}||${p.precoInteiro},${p.precoCentavos}`;

  // Count how many products with a variant suffix share each base-name+price.
  const counts = new Map<string, number>();
  for (const p of produtos) {
    if (!VARIANT_SEP.test(p.nome)) continue;
    const baseNome = p.nome.split(VARIANT_SEP)[0]!.trim();
    if (!baseNome) continue;
    const key = keyOf(p, baseNome);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const emitted = new Set<string>();
  const retainedByKey = new Map<string, Produto>();
  const result: Produto[] = [];
  for (const p of produtos) {
    const hasVariant = VARIANT_SEP.test(p.nome);
    const baseNome = hasVariant ? p.nome.split(VARIANT_SEP)[0]!.trim() : p.nome;
    const key = keyOf(p, baseNome);
    const explicit = CONSULTE_REGEX.test(p.descricao.trim());
    const auto = hasVariant && (counts.get(key) ?? 0) >= 2;
    if (!explicit && !auto) {
      result.push(p);
      continue;
    }
    if (emitted.has(key)) {
      const retained = retainedByKey.get(key);
      if (retained) absorbSources(retained, p);
      continue;
    }
    emitted.add(key);
    const retained = {
      ...p,
      nome: baseNome,
      descricao: "Consulte apresentações",
    };
    retainedByKey.set(key, retained);
    result.push(retained);
  }
  return mergeRunsByPrefix(result);
}

// Second pass: variants WITHOUT a " - " separator (e.g. "Esmalte Risque 8ml
// Cremoso Amar", "Esmalte Risque 8ml Natural Duna"). Consecutive rows with the
// same fabricante + price whose names share a common word prefix of 3+ words
// collapse into one item named after that common prefix.
const MIN_PREFIX_WORDS = 3;

// Shade/tone numbers like "1.0", "12.11", "1.110" (hair dye codes). When the
// word right after the common prefix is a shade number on both names, a
// 2-word prefix is enough (e.g. "Tintura Natucor 1.0 Chá Preto" vs
// "Tintura Natucor 6.0 Louro Escuro" → base "Tintura Natucor").
const SHADE_TOKEN = /^\d+(?:[.,]\d+)*$/;

function prefixAccepted(candidate: string[], a: string[], b: string[]): boolean {
  if (candidate.length >= MIN_PREFIX_WORDS) return true;
  if (candidate.length >= 2) {
    const na = a[candidate.length];
    const nb = b[candidate.length];
    // "a" may already be the shrunken prefix (no word after it) — then only
    // "b" needs a shade token right after the common prefix.
    if (nb && SHADE_TOKEN.test(nb) && (na === undefined || SHADE_TOKEN.test(na)))
      return true;
  }
  return false;
}

function commonWordPrefix(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (normalizeHeader(a[i]) !== normalizeHeader(b[i])) break;
    out.push(a[i]!);
  }
  return out;
}

function mergeRunsByPrefix(produtos: Produto[]): Produto[] {
  const result: Produto[] = [];
  let i = 0;
  while (i < produtos.length) {
    const start = produtos[i]!;
    const mergeable = (p: Produto) =>
      p.descricao.trim() === "" || CONSULTE_REGEX.test(p.descricao.trim());
    if (!mergeable(start)) {
      result.push(start);
      i++;
      continue;
    }
    let prefix = start.nome.trim().split(/\s+/);
    let j = i + 1;
    while (j < produtos.length) {
      const next = produtos[j]!;
      if (
        normalizeHeader(next.fabricante) !== normalizeHeader(start.fabricante) ||
        next.precoInteiro !== start.precoInteiro ||
        next.precoCentavos !== start.precoCentavos ||
        !mergeable(next)
      )
        break;
      const nextWords = next.nome.trim().split(/\s+/);
      const candidate = commonWordPrefix(prefix, nextWords);
      if (!prefixAccepted(candidate, prefix, nextWords)) break;
      prefix = candidate;
      j++;
    }
    if (j - i >= 2) {
      const retained = {
        ...start,
        nome: prefix.join(" "),
        descricao: "Consulte apresentações",
      };
      for (let k = i + 1; k < j; k++) {
        absorbSources(retained, produtos[k]!);
      }
      result.push(retained);
      i = j;
    } else {
      result.push(start);
      i++;
    }
  }
  return result;
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
    range: 0,
    blankrows: true,
  });

  const header = findHeader(rows);
  if (!header) {
    throw new Error(
      "Não foi possível localizar as colunas obrigatórias (Descrição e Venda Encarte) na planilha.",
    );
  }

  const produtos: Produto[] = [];
  const pendentes: string[] = [];
  const ocorrencias: ParseResult["ocorrencias"] = [];
  let total = 0;
  let invalidos = 0;
  let ignorados = 0;

  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row || row.every((v) => String(v ?? "").trim() === "")) continue;

    const nome = cell(row, header.descricao);
    if (!nome) {
      // skip rows without a product name (subsection headers etc.)
      ignorados++;
      ocorrencias.push({
        linha: r + 1,
        nome: "",
        tipo: "ignorado",
        motivo: "Descrição ausente",
      });
      continue;
    }
    // skip if the "name" looks like a header repeated
    if (normalizeHeader(nome) === "descricao") {
      ignorados++;
      ocorrencias.push({
        linha: r + 1,
        nome,
        tipo: "ignorado",
        motivo: "Cabeçalho repetido",
      });
      continue;
    }

    total++;

    const precoRaw = header.preco !== undefined ? row[header.preco] : "";
    const price = formatPrice(precoRaw);
    if (!price) {
      invalidos++;
      pendentes.push(nome);
      const precoAusente =
        precoRaw === null ||
        precoRaw === undefined ||
        String(precoRaw).trim() === "";
      ocorrencias.push({
        linha: r + 1,
        nome,
        tipo: "erro",
        motivo: precoAusente ? "Preço ausente" : "Preço inválido",
      });
      continue;
    }

    let descricao = cell(row, header.descricaoComplementar);
    let nomeFinal = nome;
    if (!descricao && header.preco !== undefined) {
      // "Consulte Apresentações" may be typed in any column between the
      // Descrição and the price (users place it loosely in the sheet).
      for (let c = header.descricao! + 1; c < header.preco; c++) {
        const v = cell(row, c);
        if (v && CONSULTE_REGEX.test(v)) {
          descricao = "Consulte apresentações";
          break;
        }
      }
    }
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

    const produto: TrackedProduto = {
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
      [SOURCE_ROWS]: [r + 1],
      [SOURCE_NAMES]: new Map([[r + 1, nome]]),
    };
    produtos.push(produto);
  }

  const dedupados = dedupeConsulteApresentacoes(produtos);
  for (const produto of dedupados) {
    const tracked = produto as TrackedProduto;
    const sourceRows = tracked[SOURCE_ROWS] ?? [];
    const linhaDestino = sourceRows[0];
    if (linhaDestino === undefined) continue;
    for (const linha of sourceRows.slice(1)) {
      ocorrencias.push({
        linha,
        nome: tracked[SOURCE_NAMES]?.get(linha) ?? produto.nome,
        tipo: "agrupado",
        motivo: "Agrupado com produto equivalente",
        linhaDestino,
      });
    }
  }
  ocorrencias.sort((a, b) => a.linha - b.linha);
  const agrupados = produtos.length - dedupados.length;

  return {
    produtos: dedupados,
    total,
    validos: dedupados.length,
    invalidos,
    agrupados,
    ignorados,
    ocorrencias,
    abaUtilizada: sheetName,
    abasEncontradas,
    pendentes,
  };
}
