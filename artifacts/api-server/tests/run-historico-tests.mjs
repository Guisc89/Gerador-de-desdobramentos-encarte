import { spawn } from "node:child_process";
import path from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const entryPoint = path.join(testsDir, "historico.isolated.test.ts");
const bundlePath = path.join(testsDir, ".historico.isolated.bundle.mjs");

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
      "express",
      "@google-cloud/storage",
      "puppeteer",
      "puppeteer-core",
    ],
    logLevel: "silent",
  });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", bundlePath], {
      cwd: path.resolve(testsDir, ".."),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal) reject(new Error(`Testes interrompidos pelo sinal ${signal}`));
      else resolve(exitCode ?? 1);
    });
  });
  if (code !== 0) process.exitCode = code;
} finally {
  await rm(bundlePath, { force: true });
}