import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    authed?: boolean;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session?.authed === true) {
    next();
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
