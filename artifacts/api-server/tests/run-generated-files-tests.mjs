import { spawn } from "node:child_process";
import path from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(testsDir, "generated-files.isolated.test.ts");
const bundlePath = path.join(testsDir, ".generated-files.isolated.bundle.mjs");

try {
  await build({
    entryPoints: [entryPoint],
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    external: [
      "@google-cloud/storage",
      "express",
      "multer",
      "pino",
      "puppeteer",
      "xlsx",
    ],
    logLevel: "silent",
  });

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", bundlePath], {
      cwd: path.resolve(testsDir, ".."),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Testes interrompidos pelo sinal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(bundlePath, { force: true });
}