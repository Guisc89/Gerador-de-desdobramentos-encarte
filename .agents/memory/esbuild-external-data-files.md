---
name: esbuild bundling breaks __dirname data-file lookups
description: Packages that read sibling data files via __dirname must be esbuild-externalized or they fail at runtime.
---

# esbuild + packages that read data files relative to `__dirname`

Any npm package that does `fs.readFileSync(path.join(__dirname, 'something'))` at
runtime breaks when bundled by esbuild, because after bundling `__dirname` points
at the output `dist/` folder, not the package's own folder in `node_modules` — the
sibling data file isn't there, so it throws `ENOENT`.

**Rule:** add such packages to the `external` list in the esbuild config so they stay
required from `node_modules` (where their data files live).

**Why:** `connect-pg-simple` reads its `table.sql` via `__dirname`. When bundled,
`createTableIfMissing: true` failed with `ENOENT: .../dist/table.sql`, so the
`session` table was never created and login silently stopped persisting (every
request after login returned 401). Externalizing it fixed it. Same class of issue
as packages already externalized for path-traversal reasons (e.g. proto/.node files).

**How to apply:** when adding a server-side dependency that loads `.sql`, `.proto`,
`.node`, templates, or other sibling assets at runtime, externalize it AND keep it in
`dependencies` (not just bundled). Note the build runs in dev too (dev = build the
bundle then run `dist/`), so this affects local dev, not only production.
