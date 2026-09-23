import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, test } from "node:test";
import express from "express";
import encarteRouter from "../src/routes/encarte";
import {
  generatedDownloadUrl,
  generatedFilePath,
  persistGeneratedFile,
} from "../src/services/generatedFiles";
import { storageClient } from "../src/services/objectStore";

const objects = new Map<string, Buffer>();
const originalPrivateObjectDir = process.env["PRIVATE_OBJECT_DIR"];
const originalBucket = storageClient.bucket.bind(storageClient);

function notFound(): Error & { code: number } {
  return Object.assign(new Error("not found"), { code: 404 });
}

before(() => {
  process.env["PRIVATE_OBJECT_DIR"] = "test-bucket/generated-files-tests";
  Object.defineProperty(storageClient, "bucket", {
    configurable: true,
    value: () => ({
      file(name: string) {
        return {
          async save(data: Buffer | string) {
            objects.set(name, Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data));
          },
          async exists() {
            return [objects.has(name)];
          },
          async download() {
            const contents = objects.get(name);
            if (!contents) throw notFound();
            return [Buffer.from(contents)];
          },
          async getMetadata() {
            if (!objects.has(name)) throw notFound();
            return [{ generation: "1" }];
          },
        };
      },
    }),
  });
});

after(() => {
  Object.defineProperty(storageClient, "bucket", {
    configurable: true,
    value: originalBucket,
  });
  if (originalPrivateObjectDir === undefined) {
    delete process.env["PRIVATE_OBJECT_DIR"];
  } else {
    process.env["PRIVATE_OBJECT_DIR"] = originalPrivateObjectDir;
  }
});

async function startDownloadServer() {
  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req, "log", {
      configurable: true,
      value: { info() {}, warn() {}, error() {} },
    });
    next();
  });
  app.use(encarteRouter);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor de teste sem porta TCP.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("download recupera PNG e PDF do object store quando outra instância não tem o disco", async () => {
  const nonce = `${process.pid}-${Date.now()}`;
  const outputs = [
    {
      filename: `cross-instance-${nonce}.png`,
      contents: Buffer.from("png compartilhado"),
      contentType: "image/png" as const,
    },
    {
      filename: `cross-instance-${nonce}.pdf`,
      contents: Buffer.from("pdf compartilhado"),
      contentType: "application/pdf" as const,
    },
  ];
  for (const output of outputs) {
    await persistGeneratedFile(
      "ms",
      output.filename,
      output.contents,
      output.contentType,
    );
    await rm(generatedFilePath("ms", output.filename), { force: true });
  }
  const server = await startDownloadServer();
  try {
    for (const output of outputs) {
      const response = await fetch(
        `${server.baseUrl}/download/${encodeURIComponent(output.filename)}?ws=ms`,
        { headers: { "X-Encarte": "rs" } },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), output.contentType);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        output.contents,
      );
    }
  } finally {
    await server.close();
    await Promise.all(
      outputs.map((output) =>
        rm(generatedFilePath("ms", output.filename), { force: true }),
      ),
    );
  }
});

test("URLs diretas de download preservam explicitamente o workspace", () => {
  assert.equal(
    generatedDownloadUrl("ms", "Card oferta 01.png"),
    "/api/download/Card%20oferta%2001.png?ws=ms",
  );
  assert.equal(
    generatedDownloadUrl("rs", "telas outubro.pdf"),
    "/api/download/telas%20outubro.pdf?ws=rs",
  );
});