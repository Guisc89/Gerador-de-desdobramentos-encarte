---
name: Health check must precede DB-touching middleware
description: Why the autoscale deploy got stuck "in progress" with healthcheck 500, and the ordering rule that fixes it
---

# Deployment startup probe must not depend on the database

**Rule:** Mount the health/liveness route (the deployment startup probe target) BEFORE any middleware that touches the database — especially the `express-session` store (connect-pg-simple / PgStore). The probe must be a pure in-memory check.

**Why:** On Replit autoscale, a republish got stuck showing "Deploy already in progress with build id #..." and could not be cancelled/queried via the deployment API. Production logs showed the new build failing repeatedly: `healthcheck failed error=healthcheck /api returned status 500`, then `artifact process exited with error signal: terminated`. Root cause: the session middleware (PgStore with `createTableIfMissing`) was registered before the health route, so the probe's rapid concurrent requests hit Postgres on a cold start — before the `session` table existed / while racing to create it — and returned 500. A failing startup probe blocks promotion and leaves the deploy wedged. The previous successful deploy only worked because it still used the in-memory MemoryStore (no DB on the probe path).

**How to apply:** In `app.ts`, order is: logger/cors/body-parsers → `app.use("/api", healthRouter)` → `trust proxy` + `session(...)` → auth router → `requireAuth` → protected routes. Keep the health handler free of DB/session access. This is also why a 500 (not a connection-refused) on the probe points at app-level middleware throwing, not the process being down.
