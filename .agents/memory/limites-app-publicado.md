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
  - Stories e futuras operações que ainda possam demorar dentro de uma parte usam protocolo assíncrono consultável: a chamada retorna `202`, o trabalho continua sob lease no bucket e o cliente repete até encontrar o artefato/resultado persistido. **Why:** retries curtos ainda abandonam trabalho válido quando a resposta original se perde; polling idempotente sobre estado durável atravessa proxy e troca de instância.
  - Montagem de PDF multi-página usa pdf-lib direto dos PNGs — embutir dezenas de PNGs 3840×2160 num HTML e imprimir via Chromium causa OOM (`TargetCloseError`).
  - O testador precisa de imagem realista: PNG de ruído não comprime e dá falso negativo no teste de compressão.
  - ZIP de todas as PNGs deve ser montado no navegador a partir dos downloads individuais autenticados, mantendo a geração em lotes. **Why:** um arquivo único servido pelo backend pode ultrapassar o limite de resposta do proxy, mesmo que cada imagem caiba. Não substituir isso por uma resposta gigante sem reavaliar os limites.
  - Não revogar URLs de Blob em `beforeunload`. **Why:** iniciar um download pode disparar esse evento sem sair da página e invalidar o arquivo antes de o navegador consumi-lo. Limpar por substituição do arquivo ou `pagehide` sem BFCache; testar o clique real, não só a validade do ZIP.
  - **Disco local NÃO é compartilhado no autoscale:** cada requisição pode cair em máquina diferente; arquivo salvo em `output/` numa máquina não existe na outra → download "site não disponível". Arquivos gerados (partes de lote e resultado final) vão SEMPRE também para o Object Storage (`lotes/<jobId>/`, `arquivos/<nome>`); `GET /download` tenta disco e cai para o bucket. Jobs de lote são recuperáveis via `lotes/<jobId>/job.json` e o `/fim` é idempotente (`resultado.json` persistido).
  - **PDF multi-página usa JPEG (q82), não PNG:** 39 telas em PNG deram PDF de 116MB (estourou o limite); com JPEG ficou ~17MB. `pngsToPdf` detecta magic bytes e usa embedJpg/embedPng.
