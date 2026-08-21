import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    authed?: boolean;
    perfil?: "operador" | "administrador";
    workspaceConfirmado?: boolean;
    workspace?: "rs" | "ms";
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session?.authed === true) {
    if (
      req.session.perfil === "operador" ||
      req.session.perfil === "administrador"
    ) {
      next();
      return;
    }

    // Sessões criadas antes da existência dos perfis só podiam pertencer ao
    // operador. Migra sem derrubar o acesso e passa a identificá-las de forma
    // explícita nas requisições seguintes.
    if (req.session.perfil === undefined) {
      req.session.perfil = "operador";
      req.session.save((error) => {
        if (error) {
          req.log.error({ err: error }, "Falha ao atualizar sessão antiga");
          res.status(500).json({ error: "Não foi possível validar a sessão" });
          return;
        }
        next();
      });
      return;
    }

    res.status(401).json({ error: "Sessão inválida" });
    return;
  }
  // For API/JSON requests return 401; for HTML navigation redirect to login.
  const accepts = req.get("accept") || "";
  if (accepts.includes("text/html")) {
    res.redirect("/api/login");
    return;
  }
  res.status(401).json({ error: "Não autenticado" });
}
