import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { createServer, type Server } from "node:http";
import {
  estadosMateriaisDoSnapshot,
  materiaisDisponiveisNoSnapshot,
  snapshotPointerFromPrecario,
} from "../src/services/historicoSnapshot";
import {
  createHistoricoRouter,
  type HistoricoRouteDeps,
} from "../src/routes/historico";
import { historicoArtifactPath } from "../src/services/historicoMateriais";

test("snapshot preserves explicit empty extras and archived composition", () => {
  const image = "data:image/png;base64,AA==";
  const estado = {
    frontend: {
      fotos: { "A||1": image },
      telas: {
        mes: "Maio",
        endereco: "Endereço das telas",
        disclaimer: "Aviso das telas",
        infoCor: "#123456",
        telas: [
          { produtos: [
            { nome: "A", descricao: "1", precoInteiro: "10", precoCentavos: "5" },
            { nome: "B", descricao: "2", precoInteiro: "20", precoCentavos: "00" },
          ] },
          { produtos: [
            { nome: "C", descricao: "3", precoInteiro: "30", precoCentavos: "00" },
            { nome: "D", descricao: "4", precoInteiro: "40", precoCentavos: "00" },
          ] },
        ],
      },
      cardsExtras: { endereco: "", disclaimer: "", infoCor: "" },
      storiesExtras: {},
    },
  };

  assert.deepEqual(materiaisDisponiveisNoSnapshot(estado), [
    "telas",
    "cards",
    "stories",
  ]);
  const states = estadosMateriaisDoSnapshot(estado);
  assert.ok(states);
  assert.equal(states.cards[0]?.endereco, "");
  assert.equal(states.cards[0]?.disclaimer, "");
  assert.equal(states.cards[0]?.infoCor, "");
  assert.equal(states.stories[0]?.endereco, "Endereço das telas");
  assert.deepEqual(states.stories.map((story) => story.produtos.length), [2, 2]);
  assert.equal(states.telas[0]?.produtos[0]?.foto, image);
  assert.equal(states.telas[0]?.produtos[0]?.precoCentavos, "05");
});

test("legacy pointer derives only from immutable archive in same workspace", () => {
  assert.deepEqual(
    snapshotPointerFromPrecario(
      "ms",
      "encartes/ms/historico/rotacoes/old-id/precario.pdf",
    ),
    {
      archiveId: "old-id",
      snapshotObject: "encartes/ms/historico/rotacoes/old-id/estado.json",
    },
  );
  assert.equal(
    snapshotPointerFromPrecario(
      "ms",
      "encartes/rs/historico/rotacoes/old-id/precario.pdf",
    ),
    null,
  );
  assert.equal(
    snapshotPointerFromPrecario("ms", "encartes/ms/precario.pdf"),
    null,
  );
});

const archiveId = "isolated-archive";
const objects = new Map<string, Buffer>();
const statuses = new Map<string, { value: unknown; generation: string }>();
let generationCalls = 0;
let server: Server;
let baseUrl = "";

const deps: HistoricoRouteDeps = {
  async getHistorico() {
    return {
      mes: "Teste",
      finalizadoEm: "2026-01-01T00:00:00.000Z",
      temPrecario: false,
      archiveId,
      materiais: ["telas", "cards", "stories"],
    };
  },
  async getHistoricoArchive(_ws, requested) {
    return requested === archiveId
      ? {
          archiveId,
          snapshotObject: `isolated/${archiveId}/estado.json`,
          materiais: ["telas", "cards", "stories"],
        }
      : null;
  },
  async storeLoad(path) {
    return objects.get(path) || null;
  },
  async storeLoadJsonVersioned<T>(path: string) {
    const found = statuses.get(path);
    return {
      value: (found?.value as T | undefined) || null,
      version: {
        generation: found?.generation || "0",
        revision: found?.generation || "0",
      },
    };
  },
  async storeSaveJson(path, value) {
    const current = Number(statuses.get(path)?.generation || "0");
    statuses.set(path, { value, generation: String(current + 1) });
  },
  async storeSaveJsonConditional(path, value, generation) {
    const current = statuses.get(path)?.generation || "0";
    if (current !== generation) throw Object.assign(new Error("conflict"), { code: 412 });
    const next = String(Number(current) + 1);
    statuses.set(path, { value, generation: next });
    return next;
  },
  isStorePreconditionFailed(error) {
    return (error as { code?: number })?.code === 412;
  },
  async gerarHistoricoPdf(ws, _snapshot, id, tipo) {
    generationCalls += 1;
    objects.set(historicoArtifactPath(ws, id, tipo), Buffer.from(`pdf:${tipo}`));
  },
};

before(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as typeof req & { log: { error(): void } }).log = { error() {} };
    next();
  });
  app.use(createHistoricoRouter(deps));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

test("route fences archive and polls persistent fake artifact", async () => {
  const mismatch = await fetch(
    `${baseUrl}/historico/pdf/telas?ws=ms&archiveId=replaced`,
    { method: "POST" },
  );
  assert.equal(mismatch.status, 409);

  const first = await fetch(
    `${baseUrl}/historico/pdf/telas?ws=ms&archiveId=${archiveId}`,
    { method: "POST" },
  );
  assert.equal(first.status, 202);
  await new Promise((resolve) => setImmediate(resolve));

  const poll = await fetch(
    `${baseUrl}/historico/pdf/telas?ws=ms&archiveId=${archiveId}`,
    { method: "POST" },
  );
  assert.equal(poll.status, 200);
  const result = await poll.json() as { downloadUrl: string };
  assert.match(result.downloadUrl, /archiveId=isolated-archive/);
  assert.equal(generationCalls, 1);

  const download = await fetch(`${baseUrl}${result.downloadUrl.replace("/api", "")}`);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "pdf:telas");
});

test("failed generation requires explicit retry", async () => {
  const statusPath =
    `encartes/ms/historico/rotacoes/${archiveId}/materiais/cards.status.json`;
  statuses.set(statusPath, {
    generation: "4",
    value: {
      status: "failed",
      owner: "old",
      startedAt: "2026-01-01T00:00:00.000Z",
      error: "render failed",
    },
  });

  const blocked = await fetch(
    `${baseUrl}/historico/pdf/cards?ws=ms&archiveId=${archiveId}`,
    { method: "POST" },
  );
  assert.equal(blocked.status, 500);

  const retried = await fetch(
    `${baseUrl}/historico/pdf/cards?ws=ms&archiveId=${archiveId}&retry=1`,
    { method: "POST" },
  );
  assert.equal(retried.status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(generationCalls, 2);
});