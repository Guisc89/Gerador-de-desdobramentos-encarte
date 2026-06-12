import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import { requireAuth } from "./middlewares/auth";
import { logger } from "./lib/logger";

const app: Express = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
// Larger limit: tela state carries base64 data URIs (product photos + background)
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Health check (deployment startup probe) is mounted FIRST, before the session
// middleware, so the probe never touches Postgres. Otherwise the autoscale
// probe's concurrent requests hit the connect-pg-simple store on a cold start
// (before its "session" table exists / while it races to create it) and return
// 500, which fails the health check and leaves the deploy stuck "in progress".
app.use("/api", healthRouter);

app.set("trust proxy", 1);
// Persist sessions in Postgres (connect-pg-simple). The default MemoryStore is
// wiped on every server restart/redeploy, which logged everyone out (existing
// cookie -> 401 on POST /api/generate). The pg-backed store survives restarts
// and auto-creates its "session" table on boot.
const PgSession = connectPgSimple(session);
app.use(
  session({
    name: "encarte.sid",
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env["SESSION_SECRET"] || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // The app is served inside an HTTPS iframe (Replit preview/canvas and the
      // published app). Browsers treat that as a third-party context and only
      // store/send the cookie when it is SameSite=None + Secure. "trust proxy"
      // above lets express-session honor X-Forwarded-Proto=https from the proxy.
      sameSite: "none",
      secure: true,
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  }),
);

// Public assets (login page + logo) — accessible without auth
const PUBLIC_FILES = new Set([
  "/login.html",
  "/login.css",
  "/login.js",
  "/logo.png",
  "/favicon.ico",
]);

// Public route: auth (login/logout) — needs the session middleware above
app.use("/api", authRouter);

// Allow public asset files used by the login page
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (PUBLIC_FILES.has(req.path)) {
    express.static(PUBLIC_DIR)(req, res, next);
    return;
  }
  next();
});

// Everything below requires auth
app.use("/api", requireAuth);
app.use("/api", router);
app.use("/api", express.static(PUBLIC_DIR, { index: "index.html" }));

logger.info({ PUBLIC_DIR }, "Static frontend mounted at /api");

export default app;
