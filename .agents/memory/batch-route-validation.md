---
name: Batch route validation parity
description: Batch generation routes must enforce the same per-item business rules as their single-item counterparts, not just skip empty items.
---

# Batch route validation parity

When a single-item generation route (e.g. `/cards/generate`, `/telas/generate`)
enforces a business contract (product-count limits, required fields), the batch
routes (`/generate-all`, `/generate-pdf`) MUST apply the exact same validation —
skipping only empty items is not enough.

**Why:** In the encarte api-server, the Cards batch routes originally only skipped
pages with 0 products and accepted everything else, so a page with 1 valid product
(non-capa requires 2–4) would silently render a broken layout. The single-item route
rejected it but the batch path did not. Caught in code review.

**How to apply:** Extract one shared validator (server: `cardCountError(state)`)
and call it in every generation route. Mirror it on the client before batch requests
(`batchCountErrors()`). Batch routes should skip empties (report count) but return
400 listing any non-empty item that violates the contract.
