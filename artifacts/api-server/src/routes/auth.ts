import { Router, type IRouter } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const PASSWORD = "encarteassociadas";

const router: IRouter = Router();

router.get("/login", (req, res) => {
  if (req.session?.authed === true) {
    res.redirect("/api/");
    return;
  }
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

router.post("/login", (req, res) => {
  const senha = String(req.body?.senha ?? "").trim();
  if (senha !== PASSWORD) {
    res.status(401).json({ ok: false, error: "Senha incorreta." });
    return;
  }
  req.session.authed = true;
  res.json({ ok: true, redirect: "/api/" });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, redirect: "/api/login" });
  });
});

export default router;
