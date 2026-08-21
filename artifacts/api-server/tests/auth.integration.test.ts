import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import vm from "node:vm";
import express from "express";
import session from "express-session";
import authRouter from "../src/routes/auth";
import { requireAuth } from "../src/middlewares/auth";
import {
  type Workspace,
  workspaceFromRequest,
} from "../src/services/workspace";
import {
  generatedFilePath,
  generatedObjectPath,
  writeGeneratedFile,
} from "../src/services/generatedFiles";

const OPERATOR_PASSWORD = "encarteassociadas";
const TEST_ADMIN_PASSWORD = "admin-password-used-only-by-tests";
const originalAdminPassword = process.env["ADMIN_PASSWORD"];

process.env["ADMIN_PASSWORD"] = TEST_ADMIN_PASSWORD;

after(() => {
  if (originalAdminPassword === undefined) {
    delete process.env["ADMIN_PASSWORD"];
    return;
  }
  process.env["ADMIN_PASSWORD"] = originalAdminPassword;
});

function createTestApplication(store = new session.MemoryStore()) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      name: "encarte.sid",
      store,
      secret: "session-secret-used-only-by-tests",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    }),
  );
  app.use((req, _res, next) => {
    Object.defineProperty(req, "log", {
      configurable: true,
      value: { error() {} },
    });
    next();
  });

  app.use("/api", authRouter);

  app.post("/api/test/legacy-session", (req, res) => {
    req.session.authed = true;
    delete req.session.perfil;
    req.session.save((error) => {
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.json({ ok: true });
    });
  });

  app.get("/api/test/context", requireAuth, (req, res) => {
    res.json({
      ok: true,
      perfil: req.session.perfil,
      ws: workspaceFromRequest(req),
    });
  });

  return app;
}

async function startServer(store = new session.MemoryStore()) {
  const server = createTestApplication(store).listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor de teste não abriu uma porta TCP.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

type RequestOptions = {
  method?: string;
  cookie?: string;
  json?: Record<string, unknown>;
  headers?: Record<string, string>;
};

async function request(
  baseUrl: string,
  pathname: string,
  options: RequestOptions = {},
) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.json) headers.set("Content-Type", "application/json");

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const body =
    text && contentType.includes("application/json")
      ? (JSON.parse(text) as Record<string, unknown>)
      : text;
  const setCookie = response.headers.get("set-cookie");

  return {
    status: response.status,
    body,
    cookie: setCookie?.split(";", 1)[0],
    location: response.headers.get("location"),
  };
}

async function login(
  baseUrl: string,
  perfil: "operador" | "administrador",
  senha: string,
) {
  return request(baseUrl, "/api/login", {
    method: "POST",
    json: { perfil, senha },
  });
}

async function assertWorkspaceAccess(
  baseUrl: string,
  cookie: string,
  perfil: "operador" | "administrador",
) {
  for (const ws of ["rs", "ms"] as const) {
    const response = await request(baseUrl, "/api/test/context", {
      cookie,
      headers: { "X-Encarte": ws },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, perfil, ws });
  }
}

test("operador entra e acessa RS e MS sem trocar o perfil", async () => {
  const server = await startServer();
  try {
    const response = await login(server.baseUrl, "operador", OPERATOR_PASSWORD);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, redirect: "/api/" });
    assert.ok(response.cookie, "o login deve emitir um cookie de sessão");
    await assertWorkspaceAccess(
      server.baseUrl,
      response.cookie,
      "operador",
    );
  } finally {
    await server.close();
  }
});

test("administrador entra e acessa RS e MS sem trocar o perfil", async () => {
  const server = await startServer();
  try {
    const response = await login(
      server.baseUrl,
      "administrador",
      TEST_ADMIN_PASSWORD,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true, redirect: "/api/" });
    assert.ok(response.cookie, "o login deve emitir um cookie de sessão");
    await assertWorkspaceAccess(
      server.baseUrl,
      response.cookie,
      "administrador",
    );
  } finally {
    await server.close();
  }
});

test("operador escolhe um encarte uma vez por login", async () => {
  const server = await startServer();
  try {
    const authenticated = await login(
      server.baseUrl,
      "operador",
      OPERATOR_PASSWORD,
    );
    assert.ok(authenticated.cookie);

    const beforeChoice = await request(server.baseUrl, "/api/session", {
      cookie: authenticated.cookie,
    });
    assert.deepEqual(beforeChoice.body, {
      ok: true,
      perfil: "operador",
      workspaceConfirmado: false,
      workspace: null,
    });

    const choice = await request(
      server.baseUrl,
      "/api/session/workspace",
      {
        method: "POST",
        cookie: authenticated.cookie,
        json: { workspace: "ms" },
      },
    );
    assert.deepEqual(choice.body, { ok: true, workspace: "ms" });

    const afterChoice = await request(server.baseUrl, "/api/session", {
      cookie: authenticated.cookie,
    });
    assert.deepEqual(afterChoice.body, {
      ok: true,
      perfil: "operador",
      workspaceConfirmado: true,
      workspace: "ms",
    });

    const invalidChoice = await request(
      server.baseUrl,
      "/api/session/workspace",
      {
        method: "POST",
        cookie: authenticated.cookie,
        json: { workspace: "sp" },
      },
    );
    assert.equal(invalidChoice.status, 400);
  } finally {
    await server.close();
  }
});

test("administrador recebe o perfil usado pelo seletor permanente", async () => {
  const server = await startServer();
  try {
    const authenticated = await login(
      server.baseUrl,
      "administrador",
      TEST_ADMIN_PASSWORD,
    );
    assert.ok(authenticated.cookie);

    const sessionInfo = await request(server.baseUrl, "/api/session", {
      cookie: authenticated.cookie,
    });
    assert.deepEqual(sessionInfo.body, {
      ok: true,
      perfil: "administrador",
      workspaceConfirmado: true,
      workspace: null,
    });
  } finally {
    await server.close();
  }
});

test("senhas inválidas e perfis desconhecidos são recusados", async () => {
  const server = await startServer();
  try {
    const operador = await login(server.baseUrl, "operador", "senha-incorreta");
    assert.equal(operador.status, 401);
    assert.deepEqual(operador.body, { ok: false, error: "Senha incorreta." });
    assert.equal(operador.cookie, undefined);

    const administrador = await login(
      server.baseUrl,
      "administrador",
      "senha-incorreta",
    );
    assert.equal(administrador.status, 401);
    assert.deepEqual(administrador.body, {
      ok: false,
      error: "Senha incorreta.",
    });
    assert.equal(administrador.cookie, undefined);

    const perfilInvalido = await request(server.baseUrl, "/api/login", {
      method: "POST",
      json: { perfil: "superusuario", senha: TEST_ADMIN_PASSWORD },
    });
    assert.equal(perfilInvalido.status, 400);
    assert.equal(perfilInvalido.cookie, undefined);
  } finally {
    await server.close();
  }
});

async function submittedProfileFromLoginScript(
  perfil: "operador" | "administrador",
) {
  let submitHandler:
    | ((event: { preventDefault(): void }) => Promise<void>)
    | undefined;
  let submittedBody = "";
  const form = {
    elements: {
      perfil: { value: perfil },
    },
    addEventListener(
      event: string,
      handler: (event: { preventDefault(): void }) => Promise<void>,
    ) {
      if (event === "submit") submitHandler = handler;
    },
  };
  const senhaInput = {
    value: "senha-de-teste",
    focus() {},
    select() {},
  };
  const errorElement = {
    textContent: "",
    classList: {
      add() {},
      remove() {},
    },
  };
  const submitButton = {
    disabled: false,
    textContent: "Entrar",
  };
  const source = await readFile(
    path.resolve(process.cwd(), "public/login.js"),
    "utf8",
  );

  vm.runInNewContext(source, {
    window: { location: { href: "" } },
    document: {
      getElementById(id: string) {
        if (id === "loginForm") return form;
        if (id === "senha") return senhaInput;
        if (id === "error") return errorElement;
        if (id === "submit") return submitButton;
        return null;
      },
      querySelectorAll() {
        return [{ addEventListener() {} }, { addEventListener() {} }];
      },
    },
    fetch: async (_url: string, init: { body?: string }) => {
      submittedBody = init.body ?? "";
      return {
        ok: true,
        async json() {
          return { ok: true, redirect: "/api/" };
        },
      };
    },
  });

  assert.ok(submitHandler, "o formulário deve registrar o envio do login");
  await submitHandler({ preventDefault() {} });
  return (JSON.parse(submittedBody) as { perfil: string }).perfil;
}

test("a tela de login envia corretamente Operador e Administrador", async () => {
  assert.equal(await submittedProfileFromLoginScript("operador"), "operador");
  assert.equal(
    await submittedProfileFromLoginScript("administrador"),
    "administrador",
  );
});

test("logout invalida imediatamente as sessões dos dois perfis", async () => {
  const server = await startServer();
  try {
    const credentials = [
      ["operador", OPERATOR_PASSWORD],
      ["administrador", TEST_ADMIN_PASSWORD],
    ] as const;

    for (const [perfil, senha] of credentials) {
      const authenticated = await login(server.baseUrl, perfil, senha);
      assert.ok(authenticated.cookie);

      const logout = await request(server.baseUrl, "/api/logout", {
        method: "POST",
        cookie: authenticated.cookie,
      });
      assert.equal(logout.status, 200);
      assert.deepEqual(logout.body, {
        ok: true,
        redirect: "/api/login",
      });

      const blocked = await request(server.baseUrl, "/api/test/context", {
        cookie: authenticated.cookie,
        headers: { "X-Encarte": "rs" },
      });
      assert.equal(blocked.status, 401);
      assert.deepEqual(blocked.body, { error: "Não autenticado" });
    }
  } finally {
    await server.close();
  }
});

test("sessões antigas de operador continuam válidas após reiniciar o app", async () => {
  const store = new session.MemoryStore();
  const firstServer = await startServer(store);
  let middlewareCookie: string;
  let loginPageCookie: string;

  try {
    const firstLegacySession = await request(
      firstServer.baseUrl,
      "/api/test/legacy-session",
      { method: "POST" },
    );
    const secondLegacySession = await request(
      firstServer.baseUrl,
      "/api/test/legacy-session",
      { method: "POST" },
    );
    assert.ok(firstLegacySession.cookie);
    assert.ok(secondLegacySession.cookie);
    middlewareCookie = firstLegacySession.cookie;
    loginPageCookie = secondLegacySession.cookie;
  } finally {
    await firstServer.close();
  }

  const restartedServer = await startServer(store);
  try {
    const protectedRoute = await request(
      restartedServer.baseUrl,
      "/api/test/context",
      {
        cookie: middlewareCookie,
        headers: { "X-Encarte": "ms" },
      },
    );
    assert.equal(protectedRoute.status, 200);
    assert.deepEqual(protectedRoute.body, {
      ok: true,
      perfil: "operador",
      ws: "ms",
    });

    const loginPage = await request(restartedServer.baseUrl, "/api/login", {
      cookie: loginPageCookie,
    });
    assert.equal(loginPage.status, 302);
    assert.equal(loginPage.location, "/api/");

    const persistedMigration = await request(
      restartedServer.baseUrl,
      "/api/test/context",
      {
        cookie: loginPageCookie,
        headers: { "X-Encarte": "rs" },
      },
    );
    assert.equal(persistedMigration.status, 200);
    assert.deepEqual(persistedMigration.body, {
      ok: true,
      perfil: "operador",
      ws: "rs",
    });
  } finally {
    await restartedServer.close();
  }
});

async function workspaceHeaderFromBrowserScript(ws: Workspace) {
  let capturedHeaders: Headers | undefined;
  const browserWindow = {
    fetch: async (_input: unknown, init?: { headers?: Headers }) => {
      capturedHeaders = init?.headers;
      return { ok: true };
    },
  };
  const browserDocument = {
    addEventListener() {},
    body: { appendChild() {} },
  };
  const source = await readFile(
    path.resolve(process.cwd(), "public/workspace.js"),
    "utf8",
  );

  vm.runInNewContext(source, {
    window: browserWindow,
    document: browserDocument,
    localStorage: {
      getItem(key: string) {
        return key === "encarteWS" ? ws : null;
      },
      setItem() {},
    },
    sessionStorage: {
      getItem() {
        return "1";
      },
      setItem() {},
    },
    Headers,
    CustomEvent: class {},
  });

  await browserWindow.fetch("/api/estado");
  return {
    header: capturedHeaders?.get("X-Encarte"),
    source,
  };
}

test("a seleção no navegador mantém RS e MS separados em cada requisição", async () => {
  assert.equal(
    workspaceFromRequest({
      headers: { "x-encarte": "rs" },
    }),
    "rs",
  );
  assert.equal(
    workspaceFromRequest({
      headers: { "x-encarte": "ms" },
    }),
    "ms",
  );
  assert.equal(
    workspaceFromRequest({
      headers: { "x-encarte": "rs" },
      query: { ws: "ms" },
    }),
    "ms",
    "o parâmetro de downloads deve prevalecer sobre o cabeçalho",
  );

  const rs = await workspaceHeaderFromBrowserScript("rs");
  const ms = await workspaceHeaderFromBrowserScript("ms");
  assert.equal(rs.header, "rs");
  assert.equal(ms.header, "ms");
  assert.match(rs.source, /data-ws="rs"/);
  assert.match(rs.source, /data-ws="ms"/);
  assert.match(rs.source, /fetch\("\/api\/session"/);
  assert.doesNotMatch(
    rs.source,
    /encarteWSPronto/,
    "a escolha não pode depender de sessionStorage antigo",
  );
});

test("arquivos com o mesmo nome permanecem separados entre RS e MS", async () => {
  const filename = `isolamento-${process.pid}-${Date.now()}.txt`;
  const rsPath = generatedFilePath("rs", filename);
  const msPath = generatedFilePath("ms", filename);

  try {
    await writeGeneratedFile("rs", filename, Buffer.from("conteudo-rs"));
    await writeGeneratedFile("ms", filename, Buffer.from("conteudo-ms"));

    assert.notEqual(rsPath, msPath);
    assert.equal(await readFile(rsPath, "utf8"), "conteudo-rs");
    assert.equal(await readFile(msPath, "utf8"), "conteudo-ms");
    assert.equal(
      generatedObjectPath("rs", filename),
      `arquivos/rs/${filename}`,
    );
    assert.equal(
      generatedObjectPath("ms", filename),
      `arquivos/ms/${filename}`,
    );
  } finally {
    await Promise.all([
      rm(rsPath, { force: true }),
      rm(msPath, { force: true }),
    ]);
  }
});