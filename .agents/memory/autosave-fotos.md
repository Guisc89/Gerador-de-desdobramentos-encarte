---
name: Autosave de fotos — regras anti-perda
description: Regras duráveis do pipeline de autosave/restauração do Encarte (fotos base64, limites do navegador, merge no servidor)
---

# Regras anti-perda no autosave

- **sendBeacon/keepalive têm limite de ~64KB** no Chromium — nunca confiar no save de saída (unload) para payloads com fotos base64. A proteção real: (1) salvar cada foto individualmente na hora do upload (`POST /api/estado/foto`, pacote pequeno) e (2) autosave completo com dirty-flag + retentativa com backoff que NUNCA descarta falhas em silêncio.
- **O merge do frontend no servidor é aditivo por design** (`mergeEstadoFrontend`): sub-blocos null/ausentes nunca apagam dados existentes; o mapa de fotos é mesclado chave a chave. Exclusões só acontecem por pedido explícito — tombstones (`fotosRemovidas: [keys]`) ou valor `null` na chave. Qualquer novo dado no blob frontend deve seguir esse contrato.
- **Renomear produto = tombstone obrigatório**: `rekeyFoto` registra a chave antiga em `window.__encarteFotosRemovidas`; sem isso, chaves velhas "ressuscitam" fotos erradas quando um produto reusa nome+descrição.
- **Why:** operador do MS perdeu todas as fotos exceto a capa após queda — os autosaves falhavam em silêncio (sem retry/aviso) e o beacon de saída estourava 64KB.
- **How to apply:** ao mexer em progresso.js/telas.js/estadoStorage.ts, preservar: dirty-flag/retry, save por-foto imediato, dedupe da foto no snapshot (restauração cai para `fotoFor()`), e semântica de tombstone no servidor.
