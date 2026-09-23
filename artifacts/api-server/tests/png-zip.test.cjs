const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(overrides = {}) {
  const context = {
    Blob,
    TextEncoder,
    URL,
    Uint8Array,
    Uint32Array,
    DataView,
    console,
    ...overrides,
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../public/pngZip.js"), "utf8"),
    context,
  );
  return context.PngZip;
}

function parseStoredZip(bytes) {
  const result = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 30);
    const size = view.getUint32(18, true);
    const nameSize = view.getUint16(26, true);
    const extraSize = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameSize + extraSize;
    result.push({
      name: decoder.decode(bytes.subarray(nameStart, nameStart + nameSize)),
      data: bytes.slice(dataStart, dataStart + size),
    });
    offset = dataStart + size;
  }
  return result;
}

test("creates a readable STORE zip preserving UTF-8 names and binary bytes", async () => {
  const zip = load();
  const blob = zip.build([
    { filename: "promoção.png", data: Uint8Array.from([0, 255, 1, 2]) },
    { filename: "segunda.png", data: Uint8Array.from([137, 80, 78, 71]) },
  ]);
  const entries = parseStoredZip(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(entries.map((entry) => entry.name), ["promoção.png", "segunda.png"]);
  assert.deepEqual([...entries[0].data], [0, 255, 1, 2]);
  assert.deepEqual([...entries[1].data], [137, 80, 78, 71]);
});

test("does not produce a partial zip when one authenticated fetch fails", async () => {
  let objectUrls = 0;
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const zip = load({
    fetch: async (url) => url.endsWith("two.png")
      ? { ok: false, status: 500 }
      : { ok: true, arrayBuffer: async () => png.buffer },
    URL: Object.assign(URL, {
      createObjectURL() { objectUrls += 1; return "blob:test"; },
      revokeObjectURL() {},
    }),
  });
  await assert.rejects(
    zip.create([
      { filename: "one.png", downloadUrl: "/api/one.png" },
      { filename: "two.png", downloadUrl: "/api/two.png" },
    ], "all.zip"),
    /two\.png.*HTTP 500/,
  );
  assert.equal(objectUrls, 0);
});

test("rejects an HTTP 200 login page instead of adding it as a PNG", async () => {
  let objectUrls = 0;
  const html = new TextEncoder().encode("<!doctype html><title>Login</title>");
  const zip = load({
    fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => html.buffer }),
    URL: Object.assign(URL, {
      createObjectURL() { objectUrls += 1; return "blob:test"; },
      revokeObjectURL() {},
    }),
  });
  await assert.rejects(
    zip.create([{ filename: "promo.png", downloadUrl: "/api/promo.png" }], "all.zip"),
    /não retornou um PNG válido.*sessão pode ter expirado/i,
  );
  assert.equal(objectUrls, 0);
});

test("adds the selected workspace to API download URLs only", () => {
  const zip = load({
    location: { href: "https://example.test/app", origin: "https://example.test" },
    EncarteWS: { ws: "ms" },
  });
  assert.equal(zip.workspaceUrl("/api/download?id=1"), "/api/download?id=1&ws=ms");
  assert.equal(zip.workspaceUrl("/api/download?id=1&ws=rs"), "/api/download?id=1&ws=ms");
  assert.equal(zip.workspaceUrl("https://cdn.example/file.png"), "https://cdn.example/file.png");
});

test("captures workspace once and revokes downloads only within the same caller slot", async () => {
  const requested = [];
  const revoked = [];
  const events = {};
  let nextUrl = 0;
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const encarte = { ws: "rs" };
  const TestURL = class extends URL {};
  TestURL.createObjectURL = () => "blob:" + (++nextUrl);
  TestURL.revokeObjectURL = (url) => revoked.push(url);
  const zip = load({
    EncarteWS: encarte,
    location: { href: "https://example.test/app", origin: "https://example.test" },
    fetch: async (url) => {
      requested.push(url);
      encarte.ws = "ms";
      return { ok: true, arrayBuffer: async () => png.buffer };
    },
    addEventListener: (name, handler) => { events[name] = handler; },
    URL: TestURL,
  });

  await zip.create([
    { filename: "one.png", downloadUrl: "/api/one.png" },
    { filename: "two.png", downloadUrl: "/api/two.png" },
  ], "telas.zip", { slot: "telas" });
  await zip.create([{ filename: "card.png", downloadUrl: "/api/card.png" }], "cards.zip", { slot: "cards" });
  assert.deepEqual(requested.slice(0, 2), ["/api/one.png?ws=rs", "/api/two.png?ws=rs"]);
  assert.deepEqual(revoked, []);

  await zip.create([{ filename: "new.png", downloadUrl: "/api/new.png" }], "telas.zip", { slot: "telas" });
  assert.deepEqual(revoked, ["blob:1"]);
  assert.equal(events.beforeunload, undefined, "starting a download must not revoke its blob");
  events.pagehide({ persisted: true });
  assert.equal(revoked.length, 1, "back-forward cache must retain download links");
  events.pagehide({ persisted: false });
  assert.deepEqual(revoked, ["blob:1", "blob:2", "blob:3"]);
});