import { spawn } from "node:child_process";
import path from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const authEntryPoint = path.join(testsDir, "auth.integration.test.ts");
const authBundlePath = path.join(testsDir, ".auth.integration.bundle.mjs");
const storageEntryPoint = path.join(
  testsDir,
  "collaboration-storage.integration.test.ts",
);
const storageBundlePath = path.join(
  testsDir,
  ".collaboration-storage.integration.bundle.mjs",
);
const workerEntryPoint = path.join(
  testsDir,
  "collaboration-storage.worker.ts",
);
const workerBundlePath = path.join(
  testsDir,
  ".collaboration-storage.worker.bundle.mjs",
);

try {
  await Promise.all([
    build({
      entryPoints: [authEntryPoint],
      outfile: authBundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      sourcemap: "inline",
      external: ["express", "express-session"],
      logLevel: "silent",
    }),
    build({
      entryPoints: [storageEntryPoint],
      outfile: storageBundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      sourcemap: "inline",
      external: ["@google-cloud/storage"],
      logLevel: "silent",
    }),
    build({
      entryPoints: [workerEntryPoint],
      outfile: workerBundlePath,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      sourcemap: "inline",
      external: ["@google-cloud/storage"],
      logLevel: "silent",
    }),
  ]);

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", authBundlePath, storageBundlePath],
      {
        cwd: path.resolve(testsDir, ".."),
        env: process.env,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Testes interrompidos pelo sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
} finally {
  await Promise.all([
    rm(authBundlePath, { force: true }),
    rm(storageBundlePath, { force: true }),
    rm(workerBundlePath, { force: true }),
  ]);
}