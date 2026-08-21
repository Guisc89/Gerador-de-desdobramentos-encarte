import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import {
  downloadHistorico,
  finalizarMes,
  getEstado,
  getEstadoVersion,
  getHistorico,
  mergeEstado,
  savePrecarioPdfVersioned,
} from "../src/services/estadoStorage";
import {
  storeDelete,
  storeDeleteConditional,
  storeExists,
  storeListPrefix,
  storeLoadJsonVersioned,
  storeSaveJson,
} from "../src/services/objectStore";

const workerBundle = path.resolve(
  process.cwd(),
  "tests/.collaboration-storage.worker.bundle.mjs",
);

function isolatedWorkspace(label: string): string {
  return `test-${label}-${randomUUID()}`;
}

async function cleanupWorkspace(workspace: string): Promise<void> {
  for (const objectPath of await storeListPrefix(`encartes/${workspace}`)) {
    await storeDelete(objectPath);
  }
}

async function runMutationWorker(
  workspace: string,
  version: string,
  etapa: "cards" | "stories",
): Promise<{ status: number; version?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerBundle], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TEST_WORKSPACE: workspace,
        TEST_VERSION: version,
        TEST_STAGE: etapa,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal || code !== 0) {
        reject(
          new Error(
            `Worker terminou com ${signal || code}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      const line = stdout.trim().split("\n").at(-1);
      if (!line) {
        reject(new Error("Worker não devolveu resultado."));
        return;
      }
      resolve(JSON.parse(line) as { status: number; version?: string });
    });
  });
}

test("duas instâncias aceitam somente uma gravação da mesma versão", async () => {
  const workspace = isolatedWorkspace("concorrencia");
  try {
    const initial = await mergeEstado(
      workspace as never,
      { etapa: "precarios" },
      "0",
    );
    const results = await Promise.all([
      runMutationWorker(workspace, initial.version, "cards"),
      runMutationWorker(workspace, initial.version, "stories"),
    ]);

    assert.deepEqual(
      results.map((result) => result.status).sort((a, b) => a - b),
      [200, 409],
    );
    assert.notEqual(await getEstadoVersion(workspace as never), initial.version);
    assert.ok(["cards", "stories"].includes((await getEstado(workspace as never)).etapa || ""));
  } finally {
    await cleanupWorkspace(workspace);
  }
});

test("finalização arquiva o PDF exato e não o vaza no ciclo seguinte", async () => {
  const workspace = isolatedWorkspace("rotacao");
  try {
    const initial = await mergeEstado(
      workspace as never,
      {
        etapa: "precarios",
        servidor: {
          produtos: [],
          filename: "isolated.pdf",
          pdfUpload: false,
          mes: "agosto",
        },
      },
      "0",
    );
    const pdf = Buffer.from("%PDF-1.4\ncollaboration-test\n%%EOF");
    const precarioObject = await savePrecarioPdfVersioned(
      workspace as never,
      pdf,
    );
    const withPdf = await mergeEstado(
      workspace as never,
      {
        servidor: {
          produtos: [],
          filename: "isolated.pdf",
          pdfUpload: false,
          mes: "agosto",
          precarioObject,
        },
      },
      initial.version,
    );

    const archived = await finalizarMes(
      workspace as never,
      withPdf.version,
    );
    assert.equal(archived.temPrecario, true);
    assert.deepEqual(await downloadHistorico(workspace as never), pdf);
    assert.equal(await getEstadoVersion(workspace as never), "0");

    const next = await mergeEstado(
      workspace as never,
      {
        etapa: "precarios",
        servidor: {
          produtos: [],
          filename: "",
          pdfUpload: false,
          mes: "setembro",
        },
      },
      "0",
    );
    const withoutPdf = await finalizarMes(workspace as never, next.version);
    assert.equal(withoutPdf.temPrecario, false);
    assert.equal(await downloadHistorico(workspace as never), null);
  } finally {
    await cleanupWorkspace(workspace);
  }
});

test("uma finalização interrompida é recuperada antes do próximo ciclo", async () => {
  const workspace = isolatedWorkspace("recuperacao");
  const prefix = `encartes/${workspace}`;
  try {
    const current = await mergeEstado(
      workspace as never,
      {
        etapa: "precarios",
        servidor: {
          produtos: [],
          filename: "",
          pdfUpload: false,
          mes: "outubro",
        },
      },
      "0",
    );
    const statePath = `${prefix}/estado.json`;
    const loaded = await storeLoadJsonVersioned<unknown>(statePath);
    const archiveEstado =
      `${prefix}/historico/rotacoes/${current.version}/estado.json`;
    await storeSaveJson(archiveEstado, loaded.value);
    await storeSaveJson(`${prefix}/finalizacao-pendente.json`, {
      fence: "1",
      expectedVersion: current.version,
      expectedGeneration: loaded.version.generation,
      archiveEstado,
      meta: {
        mes: "outubro",
        finalizadoEm: "2026-08-21T13:00:00.000Z",
        temPrecario: false,
      },
    });
    await storeDeleteConditional(statePath, loaded.version.generation);

    const next = await mergeEstado(
      workspace as never,
      {
        etapa: "cards",
        servidor: {
          produtos: [],
          filename: "",
          pdfUpload: false,
          mes: "novembro",
        },
      },
      "0",
    );

    assert.notEqual(next.version, "0");
    assert.equal((await getHistorico(workspace as never))?.mes, "outubro");
    assert.equal(
      await storeExists(`${prefix}/finalizacao-pendente.json`),
      false,
    );
  } finally {
    await cleanupWorkspace(workspace);
  }
});

test("um fence antigo não substitui um histórico mais novo", async () => {
  const workspace = isolatedWorkspace("fencing");
  const prefix = `encartes/${workspace}`;
  try {
    const archiveEstado = `${prefix}/historico/rotacoes/antiga/estado.json`;
    await storeSaveJson(archiveEstado, { etapa: "precarios" });
    await storeSaveJson(`${prefix}/historico/meta.json`, {
      mes: "mais novo",
      finalizadoEm: "2026-08-21T14:00:00.000Z",
      temPrecario: false,
      fence: "999999999999999999999999999999",
    });
    await storeSaveJson(`${prefix}/finalizacao-pendente.json`, {
      fence: "1",
      expectedVersion: "versao-antiga",
      expectedGeneration: "1",
      archiveEstado,
      meta: {
        mes: "mais antigo",
        finalizadoEm: "2026-08-21T13:00:00.000Z",
        temPrecario: false,
      },
    });

    await mergeEstado(
      workspace as never,
      { etapa: "precarios" },
      "0",
    );

    assert.equal((await getHistorico(workspace as never))?.mes, "mais novo");
    assert.equal(
      await storeExists(`${prefix}/finalizacao-pendente.json`),
      false,
    );
  } finally {
    await cleanupWorkspace(workspace);
  }
});