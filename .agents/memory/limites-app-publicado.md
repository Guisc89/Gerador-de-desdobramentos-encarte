---
name: Limites de requisição no app publicado
description: Tetos de tamanho/tempo de requisição em produção (autoscale) e como o Encarte contorna — compressão WebP no cliente e geração em lotes
---

# Limites do app publicado (autoscale)

- **~32MB por requisição e ~120s por resposta.** Estourou qualquer um → o proxy devolve uma **página HTML** de erro; no cliente vira `Unexpected token '<' ... is not valid JSON`. Esse sintoma = pedido grande/lento demais, não bug de JSON.
- **Why:** operadores viram exatamente esse erro ao subir fotos (payload base64 sem compressão) e ao gerar PDF de 39 telas (>2min numa requisição).
- **How to apply:**
  - Imagens sempre passam por `window.EncarteImg` (public/imagem.js): redimensiona + WebP (PNG com transparência quase não encolhe; WebP levou 1,6MB→105KB). Fallback PNG/JPEG se o toDataURL não suportar WebP.
  - Operações longas (renderizar muitas telas) são divididas em lotes de requisições curtas (`/telas/lote/inicio|parte|fim`), serializadas por job, com progresso no cliente. Nunca voltar ao modelo "tudo numa requisição".
  - Montagem de PDF multi-página usa pdf-lib direto dos PNGs — embutir dezenas de PNGs 3840×2160 num HTML e imprimir via Chromium causa OOM (`TargetCloseError`).
  - O testador precisa de imagem realista: PNG de ruído não comprime e dá falso negativo no teste de compressão.
