# Gerador Automático de Encarte

Aplicação web que recebe uma planilha Excel `.xlsx` com produtos e gera um PDF de encarte (14 ofertas por página, 2 colunas × 7 linhas) no estilo amarelo de referência, usando Express + XLSX + Puppeteer.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend (upload form): `artifacts/api-server/public/{index.html,style.css,app.js}` — servido em `/api/`
- Rotas do encarte: `artifacts/api-server/src/routes/encarte.ts` (`POST /api/upload`, `GET /api/download/:filename`, `GET /api/preview`)
- Leitura do Excel: `artifacts/api-server/src/services/excelParser.ts`
- Formatação de preço: `artifacts/api-server/src/services/priceFormatter.ts`
- Template HTML/CSS do PDF: `artifacts/api-server/src/services/encarteTemplate.ts`
- Geração de PDF (Puppeteer): `artifacts/api-server/src/services/pdfGenerator.ts`
- Resolver do Chromium: `artifacts/api-server/src/lib/chromium.ts`
- PDFs gerados são salvos em `artifacts/api-server/output/` (cwd do processo).

## Architecture decisions

- O servidor api-server original foi estendido em vez de criar um novo artifact: roda em TypeScript/ESM com bundle esbuild, mas o frontend é HTML/CSS/JS estático servido via `express.static`.
- Puppeteer usa o Chromium do sistema (instalado via Nix). O caminho é resolvido em runtime por `which chromium`, com fallback para `PUPPETEER_EXECUTABLE_PATH`.
- O parser do Excel detecta automaticamente a aba que começa com "ENCARTE", localiza o cabeçalho buscando por "Descrição" e "Venda Encarte" (tolerante a colunas vazias entre eles), e usa a coluna seguinte à descrição como descrição complementar.
- O template do PDF usa CSS Grid (2×7) com `@page A4` e divisórias pontilhadas (vertical entre colunas, horizontal entre linhas via `border-bottom` dos cards).

## Product

- Tela `/api/` com upload de planilha `.xlsx`, campos de mês, validade inicial/final e nome do arquivo.
- Geração automática do PDF e link de download; prévia HTML disponível em `/api/preview`.
- Logs detalhados (abas encontradas, aba usada, total/válidos/inválidos, pendentes sem preço).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- O Chromium precisa estar disponível como dependência de sistema (já instalada via Nix). Se faltar, `htmlToPdf` lança erro pedindo `PUPPETEER_EXECUTABLE_PATH`.
- `puppeteer` está na lista `external` do `build.mjs` — não é bundleado. Mantenha-o em `node_modules`.
- Toda a aplicação fica sob o prefixo `/api` (proxy do workspace). A UI é `/api/` e o upload é `POST /api/upload`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
