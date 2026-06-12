# Gerador Automático de Encarte

Aplicação web (Express + XLSX + Puppeteer) que recebe uma planilha Excel `.xlsx` com produtos e gera dois tipos de material a partir da MESMA planilha:
- **Preçários**: PDF de encarte (14 ofertas por página, 2 colunas × 7 linhas) no estilo amarelo de referência.
- **Telas**: conjunto de banners 16:9 em PNG de alta resolução (3840×2160) para TVs/redes sociais, no estilo verde Farmácias Associadas. As telas são montadas **automaticamente** a partir da MESMA planilha (2 produtos por tela por padrão) e navegadas em **carrossel** (prev/next + "Tela X de N"). Por tela é possível ter de 1 a 3 produtos (adicionar/remover); ao remover o último produto a UI alerta o usuário (telas vazias não geram PNG). Subir a planilha em QUALQUER aba (Preçários ou Telas) alimenta as telas. Fundo trocável e foto manual por produto. Botões "Baixar esta tela" e "Baixar todas as telas".

A interface tem uma barra superior com logo e abas (Preçários | Telas).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `SESSION_SECRET` — segredo da sessão de login.
- Senha de acesso (hardcoded em `src/routes/auth.ts`): `encarteassociadas`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Redirect raiz: `artifacts/web/` é um artefato React+Vite minúsculo cujo único papel é redirecionar `/` para `/api/` (via `<meta http-equiv="refresh">` + `window.location.replace` em `src/App.tsx`). Existe só para que o publicador da Replit reconheça o projeto como "web app" deployável (o api-server tem `kind = "api"` e sozinho não aparecia no fluxo de publicação).
- Frontend (upload form): `artifacts/api-server/public/{index.html,style.css,app.js}` — servido em `/api/` (protegido por login).
- Tela de login: `artifacts/api-server/public/{login.html,login.css,login.js}` + logo em `public/logo.png`.
- Auth: `src/routes/auth.ts` (`GET/POST /api/login`, `POST /api/logout`) + middleware `src/middlewares/auth.ts`. Sessão via `express-session` (cookie `encarte.sid`, 8h).
- Rotas do encarte: `artifacts/api-server/src/routes/encarte.ts` (`POST /api/upload`, `POST /api/generate`, `GET /api/download/:filename`, `GET /api/preview?edit=1`)
- Rotas das telas: `artifacts/api-server/src/routes/telas.ts` (`POST /api/telas/parse`, `POST /api/telas/render` (stateless, devolve HTML p/ `srcdoc`), `POST /api/telas/generate` (1 tela), `POST /api/telas/generate-all` (várias telas, reaproveita 1 navegador via `htmlToPngBatch`, pula telas vazias, numera pelo índice original `<base>_tela_NN.png`)). Reutiliza `GET /api/download/:filename` (mesmo `output/`). Limites: `MAX_PRODUTOS=3` por tela, `MAX_TELAS=60`.
- Frontend das telas: `artifacts/api-server/public/telas.js` (modelo carrossel: `catalogo[]` + `telas[]` cada `{id, produtos:[...]}`; monta telas em grupos de 2; navega prev/next; editar/adicionar/remover produtos (1–3); alerta tela vazia; prévia ao vivo via `srcdoc` com guarda de sequência; baixar 1 ou todas). Catálogo compartilhado com a aba Preçários via `CustomEvent('encarte:catalogo')` + `window.__encarteCatalogo` (disparado em `app.js` após `/api/upload`). Painel `#panel-telas` em `index.html` (empty-state `#telaEmptyState` + workspace `#telaWorkspace`).
- Leitura do Excel: `artifacts/api-server/src/services/excelParser.ts` (compartilhado entre preçário e telas)
- Formatação de preço: `artifacts/api-server/src/services/priceFormatter.ts`
- Template HTML/CSS do PDF (preçário): `artifacts/api-server/src/services/encarteTemplate.ts`
- Template HTML/CSS da tela (PNG): `artifacts/api-server/src/services/telaTemplate.ts` (layout 16:9 em unidades `vw`; logo embutido como data URI lido de `public/logo.png`)
- Geração de PDF e PNG (Puppeteer): `artifacts/api-server/src/services/pdfGenerator.ts` (`htmlToPdf` + `htmlToPng` via `page.screenshot`)
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
