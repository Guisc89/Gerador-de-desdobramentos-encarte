/** Workspaces (encartes) supported by the app. */
export type Workspace = "rs" | "ms";

export function parseWorkspace(value: unknown): Workspace {
  return value === "ms" ? "ms" : "rs";
}

export function workspaceFromRequest(req: {
  headers: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Workspace {
  // Query param takes precedence because iframes and download links cannot set
  // custom headers. Invalid or missing values intentionally fall back to RS.
  return parseWorkspace(req.query?.["ws"] ?? req.headers["x-encarte"]);
}