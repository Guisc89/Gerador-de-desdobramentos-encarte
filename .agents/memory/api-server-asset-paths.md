---
name: api-server asset paths in HTML/PDF/PNG templates
description: How to load local image files (logo, fundo) for embedding as base64 in Puppeteer templates
---

When a template service (encarteTemplate.ts, telaTemplate.ts) needs to embed a local
image file as a base64 data URI, resolve the path from `process.cwd()`, trying both
`public/<file>` and `artifacts/api-server/public/<file>`.

**Why:** The api-server `dev`/`start` scripts run the esbuild bundle from `dist/`
(`node ./dist/index.mjs`). So `__dirname` (or `import.meta.url`) points at `dist/`, and
a `../../public/...` resolution lands on the wrong directory — the file read fails
silently and the template falls back (e.g. logo renders as plain text instead of the
brand image). `process.cwd()` is the artifact root in the workflow, so cwd-relative
paths are stable across dev and the bundled runtime.

**How to apply:** Reuse the existing pattern in encarteTemplate.ts (array of candidate
cwd-relative paths, first one that reads wins, cache the data URI).
