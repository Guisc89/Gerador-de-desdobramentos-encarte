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
    if (req.session.perfil === undefined) {
      req.session.perfil = "operador";
      req.session.save((error) => {
        if (error) {
          req.log.error({ err: error }, "Falha ao atualizar sessão antiga");
          res.status(500).send("Não foi possível validar a sessão.");
          return;
        }
        res.redirect("/api/");
      });
      return;
    }

    if (
      req.session.perfil !== "operador" &&
      req.session.perfil !== "administrador"
    ) {
      req.session.destroy(() => {
        res.redirect("/api/login");
      });
      return;
    }

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
    req.session.workspaceConfirmado = perfil === "administrador";
    delete req.session.workspace;
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

router.get("/session", (req, res) => {
  if (
    req.session?.authed !== true ||
    (req.session.perfil !== "operador" &&
      req.session.perfil !== "administrador")
  ) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  res.json({
    ok: true,
    perfil: req.session.perfil,
    workspaceConfirmado:
      req.session.perfil === "administrador" ||
      req.session.workspaceConfirmado === true,
    workspace:
      req.session.workspace === "rs" || req.session.workspace === "ms"
        ? req.session.workspace
        : null,
  });
});

router.post("/session/workspace", (req, res) => {
  if (
    req.session?.authed !== true ||
    (req.session.perfil !== "operador" &&
      req.session.perfil !== "administrador")
  ) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const workspace = req.body?.workspace;
  if (workspace !== "rs" && workspace !== "ms") {
    res.status(400).json({ error: "Encarte inválido." });
    return;
  }

  req.session.workspace = workspace;
  req.session.workspaceConfirmado = true;
  req.session.save((error) => {
    if (error) {
      req.log.error({ err: error }, "Falha ao confirmar encarte da sessão");
      res.status(500).json({ error: "Não foi possível abrir o encarte." });
      return;
    }
    res.json({ ok: true, workspace });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      req.log.error({ err: error }, "Falha ao encerrar sessão");
      res.status(500).json({
        ok: false,
        error: "Não foi possível sair. Tente novamente.",
      });
      return;
    }
    res.clearCookie("encarte.sid", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
    });
    res.json({ ok: true, redirect: "/api/login" });
  });
});

export default router;
