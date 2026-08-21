import { Router, type IRouter } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const PASSWORD = "encarteassociadas";
const PERFIS = new Set(["operador", "administrador"]);

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
  const perfilRecebido = String(req.body?.perfil ?? "operador").trim().toLowerCase();
  if (!PERFIS.has(perfilRecebido)) {
    res.status(400).json({ ok: false, error: "Perfil de acesso inválido." });
    return;
  }

  const perfil = perfilRecebido as "operador" | "administrador";
  const senhaEsperada =
    perfil === "administrador"
      ? process.env["ADMIN_PASSWORD"]?.trim()
      : PASSWORD;

  if (perfil === "administrador" && !senhaEsperada) {
    req.log.error("ADMIN_PASSWORD não está configurada");
    res.status(503).json({
      ok: false,
      error: "O acesso administrativo ainda não foi configurado.",
    });
    return;
  }

  if (senha !== senhaEsperada) {
    res.status(401).json({ ok: false, error: "Senha incorreta." });
    return;
  }

  // Regenera o identificador ao autenticar para não reaproveitar uma sessão
  // anônima. Somente o perfil é guardado — a senha nunca entra na sessão.
  req.session.regenerate((regenerateError) => {
    if (regenerateError) {
      req.log.error({ err: regenerateError }, "Falha ao iniciar sessão");
      res.status(500).json({ ok: false, error: "Não foi possível entrar." });
      return;
    }

    req.session.authed = true;
    req.session.perfil = perfil;
    req.session.save((saveError) => {
      if (saveError) {
        req.log.error({ err: saveError }, "Falha ao salvar sessão");
        res.status(500).json({ ok: false, error: "Não foi possível entrar." });
        return;
      }
      res.json({ ok: true, redirect: "/api/" });
    });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, redirect: "/api/login" });
  });
});

export default router;
