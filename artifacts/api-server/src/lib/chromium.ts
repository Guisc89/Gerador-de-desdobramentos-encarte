import { execSync } from "node:child_process";

let cached: string | null = null;

export function resolveChromiumPath(): string {
  if (cached) return cached;
  if (process.env["PUPPETEER_EXECUTABLE_PATH"]) {
    cached = process.env["PUPPETEER_EXECUTABLE_PATH"];
    return cached;
  }
  try {
    const out = execSync("which chromium", { encoding: "utf8" }).trim();
    if (out) {
      cached = out;
      return cached;
    }
  } catch {
    // ignore
  }
  try {
    const out = execSync("which chromium-browser", { encoding: "utf8" }).trim();
    if (out) {
      cached = out;
      return cached;
    }
  } catch {
    // ignore
  }
  throw new Error(
    "Could not locate chromium executable. Install chromium or set PUPPETEER_EXECUTABLE_PATH.",
  );
}
