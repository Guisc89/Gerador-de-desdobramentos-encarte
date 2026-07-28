---
name: RS/MS workspaces & progresso automático
description: How the two encartes (RS/MS) are routed and persisted; constraints to respect when touching /api routes or frontend state.
---

- Every `/api` call must carry the workspace: `X-Encarte` header (fetch is monkeypatched in `workspace.js`) or `?ws=` query (iframes/`<a>` links — headers impossible there). Server: `wsOf(req)` with query precedence.
  **Why:** iframes and download links can't set headers; forgetting `ws` silently falls back to "rs" and mixes the two encartes' data.
  **How to apply:** any new route or frontend URL touching per-encarte data must go through `wsOf()` and, for non-fetch URLs, append `?ws=`.
- Persisted per-ws state lives in App Storage under `encartes/<ws>/` (estado.json, precario.pdf, auditados/, historico/). Production disk is ephemeral — never rely on `output/` surviving a republish.
- The auditado override in `/download/:filename` must only apply to the preçário's own filename (stored per ws) — telas/cards PNGs and PDFs share the same download route and must never be hijacked.
- Frontend restore relies on script order: `workspace.js` first (fetch patch), tab scripts define `__*Snapshot/__*Restaurar` hooks, `progresso.js` last consumes them.
