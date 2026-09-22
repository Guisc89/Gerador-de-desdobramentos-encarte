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

test("preserves the legacy Descrição layout and prefers explicit Apresentação", () => {
  const result = parseExcel(
    workbookBuffer([
      ["INDÚSTRIA", "Descrição", "", "APRESENTAÇÃO", "Venda Encarte"],
      ["Marca A", "Sabonete Tradicional", "valor intermediário", "90g", 4.5],
      ["Marca A", "Produto sem apresentação", "", "", 5],
    ]),
    options,
  );

  assert.equal(result.validos, 2);
  assert.deepEqual(
    result.produtos.map(({ nome, descricao, fabricante }) => ({
      nome,
      descricao,
      fabricante,
    })),
    [
      {
        nome: "Sabonete Tradicional",
        descricao: "90g",
        fabricante: "Marca A",
      },
      {
        nome: "Produto sem apresentação",
        descricao: "",
        fabricante: "Marca A",
      },
    ],
  );
});

test("uses PRODUTOS as name and Descrição as presentation in the new layout", () => {
  const result = parseExcel(
    workbookBuffer([
      ["ESPAÇO", "indústria", "EAN", "PRODUTOS", "descrição", "VENDA ENCARTE"],
      ["AVULSO", "ABOVE", "1", "Desodorante Above Feminino", "150ml", 8.99],
      ["AVULSO", "ABOVE", "2", "Desodorante Above Masculino", "150ml", 8.99],
      ["AVULSO", "OUTRA MARCA", "3", "Creme Facial Marca Dia", "", 10],
      ["AVULSO", "TERCEIRA", "4", "Creme Facial Marca Noite", "", 10],
    ]),
    options,
  );

  assert.equal(result.total, 4);
  assert.equal(result.validos, 4);
  assert.equal(result.invalidos, 0);
  assert.equal(result.agrupados, 0);
  assert.deepEqual(
    result.produtos.map(({ nome, descricao, fabricante }) => ({
      nome,
      descricao,
      fabricante,
    })),
    [
      {
        nome: "Desodorante Above Feminino",
        descricao: "150ml",
        fabricante: "ABOVE",
      },
      {
        nome: "Desodorante Above Masculino",
        descricao: "150ml",
        fabricante: "ABOVE",
      },
      {
        nome: "Creme Facial Marca Dia",
        descricao: "",
        fabricante: "OUTRA MARCA",
      },
      {
        nome: "Creme Facial Marca Noite",
        descricao: "",
        fabricante: "TERCEIRA",
      },
    ],
  );
});


test("accepts singular PRODUTO and FABRICANTE aliases with normalized case", () => {
  const result = parseExcel(
    workbookBuffer([
      ["FaBrIcAnTe", "produto", "DESCRIÇÃO", "Preço"],
      ["Marca", "Produto Correto", "30ml", "12,50"],
    ]),
    options,
  );

  assert.equal(result.validos, 1);
  assert.equal(result.produtos[0]?.nome, "Produto Correto");
  assert.equal(result.produtos[0]?.descricao, "30ml");
  assert.equal(result.produtos[0]?.fabricante, "Marca");
});

test("ignores repeated PRODUTOS headers before validating their price", () => {
  const result = parseExcel(
    workbookBuffer([
      ["ESPAÇO", "INDÚSTRIA", "EAN", "PRODUTOS", "descrição", "VENDA ENCARTE"],
      ["AVULSO", "Marca", "1", "Produto válido", "", 10],
      ["", "INDÚSTRIA", "EAN", "PRODUTOS", "Preço Encarte (DE)", "Preço Encarte (POR)"],
      ["", "Marca", "2", "", "", 11],
    ]),
    options,
  );

  assert.equal(result.total, 1);
  assert.equal(result.validos, 1);
  assert.equal(result.invalidos, 0);
  assert.equal(result.ignorados, 2);
  assert.deepEqual(
    result.ocorrencias.map(({ linha, tipo, motivo }) => ({
      linha,
      tipo,
      motivo,
    })),
    [
      { linha: 3, tipo: "ignorado", motivo: "Cabeçalho repetido" },
      { linha: 4, tipo: "ignorado", motivo: "Descrição ausente" },
    ],
  );
});

test("ignores a standalone section title only before a repeated table header", () => {
  const result = parseExcel(
    workbookBuffer([
      ["ESPAÇO", "INDÚSTRIA", "EAN", "PRODUTOS", "descrição", "VENDA ENCARTE"],
      ["", "", "", "MEDICAMENTOS", "", ""],
      [],
      ["", "INDÚSTRIA", "EAN", "PRODUTOS", "Preço Encarte (DE)", "Preço Encarte (POR)"],
      ["", "", "", "Produto genuíno sem preço", "", ""],
    ]),
    options,
  );

  assert.equal(result.total, 1);
  assert.equal(result.validos, 0);
  assert.equal(result.invalidos, 1);
  assert.equal(result.ignorados, 2);
  assert.deepEqual(
    result.ocorrencias.map(({ linha, nome, tipo, motivo }) => ({
      linha,
      nome,
      tipo,
      motivo,
    })),
    [
      {
        linha: 2,
        nome: "MEDICAMENTOS",
        tipo: "ignorado",
        motivo: "Título de seção",
      },
      {
        linha: 4,
        nome: "PRODUTOS",
        tipo: "ignorado",
        motivo: "Cabeçalho repetido",
      },
      {
        linha: 5,
        nome: "Produto genuíno sem preço",
        tipo: "erro",
        motivo: "Preço ausente",
      },
    ],
  );
});