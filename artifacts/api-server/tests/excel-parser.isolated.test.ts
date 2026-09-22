import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseExcel } from "../src/services/excelParser";

const options = { validadeInicio: "01/01/2026", validadeFim: "31/01/2026" };

function workbookBuffer(
  rows: unknown[][],
  origin: string | number = "A1",
): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(worksheet, rows, { origin });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ENCARTE Teste");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("reports physical rows across !ref offsets and blank rows", () => {
  const result = parseExcel(
    workbookBuffer(
      [
        ["Descrição", "Venda Encarte"],
        ["Produto válido A", 10],
        [],
        ["", 5],
        ["Descrição", "Venda Encarte"],
        ["Produto sem preço", ""],
        ["Produto preço ruim", "não é preço"],
        ["Produto válido B", "12,50"],
      ],
      "B4",
    ),
    options,
  );

  assert.equal(result.total, 4);
  assert.equal(result.validos, 2);
  assert.equal(result.invalidos, 2);
  assert.equal(result.agrupados, 0);
  assert.equal(result.ignorados, 2);
  assert.equal(result.total, result.validos + result.invalidos + result.agrupados);
  assert.deepEqual(
    result.ocorrencias.map(({ linha, tipo, motivo }) => ({
      linha,
      tipo,
      motivo,
    })),
    [
      { linha: 7, tipo: "ignorado", motivo: "Descrição ausente" },
      { linha: 8, tipo: "ignorado", motivo: "Cabeçalho repetido" },
      { linha: 9, tipo: "erro", motivo: "Preço ausente" },
      { linha: 10, tipo: "erro", motivo: "Preço inválido" },
    ],
  );
});

test("searches the first 30 nonempty rows while retaining physical row numbers", () => {
  const result = parseExcel(
    workbookBuffer(
      [
        ["Descrição", "Venda Encarte"],
        ["Produto sem preço", ""],
      ],
      "A40",
    ),
    options,
  );

  assert.equal(result.invalidos, 1);
  assert.equal(result.ocorrencias[0]?.linha, 41);
  assert.equal(result.ocorrencias[0]?.motivo, "Preço ausente");
});

test("tracks explicit, hyphen and prefix grouping through chained merges", () => {
  const result = parseExcel(
    workbookBuffer([
      ["Fabricante", "Descrição", "Apresentação", "Venda Encarte"],
      ["Marca", "Esmalte Risque Color - Azul", "", 9.9],
      ["Marca", "Esmalte Risque Color - Rosa", "", 9.9],
      ["Marca", "Esmalte Risque Color Natural", "", 9.9],
      ["Outra", "Shampoo Alfa", "Consulte apresentações", 15],
      ["Outra", "Shampoo Alfa", "Consulte apresentações", 15],
      ["Terceira", "Creme Facial Marca Dia", "", 20],
      ["Terceira", "Creme Facial Marca Noite", "", 20],
    ]),
    options,
  );

  assert.equal(result.total, 7);
  assert.equal(result.validos, 3);
  assert.equal(result.invalidos, 0);
  assert.equal(result.agrupados, 4);
  assert.equal(result.total, result.validos + result.invalidos + result.agrupados);
  assert.deepEqual(
    result.produtos.map(({ nome, descricao }) => ({ nome, descricao })),
    [
      {
        nome: "Esmalte Risque Color",
        descricao: "Consulte apresentações",
      },
      { nome: "Shampoo Alfa", descricao: "Consulte apresentações" },
      { nome: "Creme Facial Marca", descricao: "Consulte apresentações" },
    ],
  );
  assert.deepEqual(
    result.ocorrencias.map(({ linha, nome, tipo, linhaDestino }) => ({
      linha,
      nome,
      tipo,
      linhaDestino,
    })),
    [
      {
        linha: 3,
        nome: "Esmalte Risque Color - Rosa",
        tipo: "agrupado",
        linhaDestino: 2,
      },
      {
        linha: 4,
        nome: "Esmalte Risque Color Natural",
        tipo: "agrupado",
        linhaDestino: 2,
      },
      {
        linha: 6,
        nome: "Shampoo Alfa",
        tipo: "agrupado",
        linhaDestino: 5,
      },
      {
        linha: 8,
        nome: "Creme Facial Marca Noite",
        tipo: "agrupado",
        linhaDestino: 7,
      },
    ],
  );
});