const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../public/telasQueue.js");
const Queue = globalThis.TelasQueue;

const item = (id) => ({ id, nome: id, foto: "foto-" + id, detalhes: { id } });
const layout = (sizes) => {
  let n = 0;
  return sizes.map((size, i) => ({
    id: "t" + i,
    produtos: Array.from({ length: size }, () => item("p" + ++n)),
  }));
};
const ids = (telas) => telas.flatMap((t) => t.produtos.map((p) => p.id));
const expectValid = (result, before) => {
  assert.equal(result.ok, true, result.error);
  assert.equal(Queue.validar(result.telas), null);
  assert.deepEqual(ids(result.telas).sort(), ids(before).sort());
  assert.deepEqual(result.telas.map((t) => t.id).slice(0, before.length), before.map((t) => t.id));
};

test("reordena na mesma tela sem duplicar", () => {
  const before = layout([2, 4]);
  const result = Queue.mover(before, 1, "p3", 1, 4);
  expectValid(result, before);
  assert.deepEqual(result.telas[1].produtos.map((p) => p.id), ["p4", "p5", "p6", "p3"]);
});

test("mesma tela rejeita posição além da contagem sem clamp silencioso", () => {
  const before = layout([2, 3]);
  const snapshot = JSON.stringify(before);
  const result = Queue.mover(before, 1, "p3", 1, 4);
  assert.equal(result.ok, false);
  assert.match(result.error, /posição escolhida não existe/i);
  assert.equal(JSON.stringify(before), snapshot);
});

test("move para frente, preenche origem e preserva posição", () => {
  const before = layout([2, 3, 3]);
  const result = Queue.mover(before, 1, "p3", 2, 2);
  expectValid(result, before);
  assert.equal(result.telas[2].produtos[1].id, "p3");
});

test("movimento para frente entre telas cheias propaga o buraco sem criar cauda", () => {
  const before = layout([2, 4, 4]);
  const result = Queue.mover(before, 1, "p3", 2, 1);
  expectValid(result, before);
  assert.equal(result.telas.length, 3);
  assert.deepEqual(result.telas.map((t) => t.produtos.length), [2, 4, 4]);
  assert.equal(result.telas[2].produtos[0].id, "p3");
});

test("move para trás com cascata de último para frente da próxima", () => {
  const before = layout([2, 4, 4]);
  const result = Queue.mover(before, 2, "p8", 1, 2);
  expectValid(result, before);
  assert.equal(result.telas[1].produtos[1].id, "p8");
  assert.equal(result.telas[2].produtos[0].id, "p6");
});

test("cascata atravessa múltiplas telas cheias", () => {
  const before = layout([2, 4, 4, 4]);
  const result = Queue.mover(before, 3, "p11", 1, 2);
  expectValid(result, before);
  assert.equal(result.telas[1].produtos[1].id, "p11");
});

test("movimento envolvendo capa mantém exatamente dois", () => {
  const before = layout([2, 3, 4]);
  const result = Queue.mover(before, 0, "p1", 2, 3);
  expectValid(result, before);
  assert.equal(result.telas[0].produtos.length, 2);
  assert.equal(result.telas[2].produtos[2].id, "p1");
});

test("mantém referência e todos os campos do item", () => {
  const before = layout([2, 4, 3]);
  const original = before[1].produtos[1];
  const result = Queue.mover(before, 1, original.id, 2, 1);
  expectValid(result, before);
  assert.equal(result.telas[2].produtos[0], original);
  assert.equal(result.telas[2].produtos[0].foto, original.foto);
  assert.deepEqual(result.telas[2].produtos[0].detalhes, original.detalhes);
});

test("movimentação preserva metadados legais das telas", () => {
  const before = layout([2, 4, 4]);
  before[1].disclaimer = "Legal da tela 2";
  before[2].disclaimer = "";
  const result = Queue.mover(before, 1, "p3", 2, 1);
  expectValid(result, before);
  assert.equal(result.telas[1].disclaimer, "Legal da tela 2");
  assert.equal(result.telas[2].disclaimer, "");
});

test("novo esquema restaura vazios explícitos e legado somente como opção", () => {
  const modern = Queue.restaurarLegais({
    schemaVersion: 2,
    legacyDisclaimer: "Texto anterior",
    disclaimer: "não usar",
    telas: [{ disclaimer: "A" }, { disclaimer: "B" }, { disclaimer: "" }],
  });
  assert.deepEqual(modern, {
    legacyDisclaimer: "Texto anterior",
    disclaimers: ["A", "B", ""],
  });
  const legacy = Queue.restaurarLegais({
    disclaimer: "Texto global antigo",
    telas: [{}, {}],
  });
  assert.deepEqual(legacy, {
    legacyDisclaimer: "Texto global antigo",
    disclaimers: ["", ""],
  });
});

test("cards são 1:1 por tela e nunca colocam legal na capa", () => {
  assert.deepEqual(
    Queue.legaisCards([
      { disclaimer: "capa" },
      { disclaimer: "dois" },
      { disclaimer: "" },
    ]),
    ["", "dois", ""],
  );
});

test("stories seguem a posição da tela, mantendo vazios e extras sem texto", () => {
  const result = Queue.legaisStories(
    [
      { disclaimer: "capa" },
      { disclaimer: "A" },
      { disclaimer: "" },
      { disclaimer: "B" },
      { disclaimer: "A" },
    ],
    7,
  );
  assert.deepEqual(result, ["", "A", "", "B", "A", "", ""]);
  assert.deepEqual(Queue.legaisStories([{ disclaimer: "capa" }], 1), [""]);
  assert.deepEqual(Queue.legaisStories([], 0), []);
});

test("falha atomicamente quando posição exigida torna cauda impossível", () => {
  const before = layout([2, 3, 3]);
  const snapshot = JSON.stringify(before);
  const result = Queue.mover(before, 2, "p6", 1, 4);
  assert.equal(result.ok, false);
  assert.match(result.error, /Nada foi alterado|preservar a posição/);
  assert.equal(JSON.stringify(before), snapshot);
});

test("rejeita layout esparso preexistente e entrada inválida", () => {
  const sparse = layout([2, 2]);
  assert.equal(Queue.mover(sparse, 1, "p3", 0, 1).ok, false);
  const valid = layout([2, 3]);
  assert.equal(Queue.mover(valid, 9, "p3", 0, 1).ok, false);
  assert.equal(Queue.mover(valid, 1, "inexistente", 0, 1).ok, false);
});

test("rejeita duplicados e limite acima de 60", () => {
  const duplicate = layout([2, 3]);
  duplicate[1].produtos[0].id = duplicate[0].produtos[0].id;
  assert.equal(Queue.mover(duplicate, 1, duplicate[1].produtos[1].id, 0, 1).ok, false);
  const tooMany = layout([2, ...Array(60).fill(3)]);
  assert.equal(Queue.mover(tooMany, 1, tooMany[1].produtos[0].id, 2, 1).ok, false);
});

test("limite exato de 60 aceita movimento para frente sem criar tela desnecessária", () => {
  const before = layout([2, ...Array(59).fill(4)]);
  const result = Queue.mover(before, 1, before[1].produtos[0].id, 59, 1);
  expectValid(result, before);
  assert.equal(result.telas.length, 60);
  assert.equal(result.telas[59].produtos[0].id, before[1].produtos[0].id);
});