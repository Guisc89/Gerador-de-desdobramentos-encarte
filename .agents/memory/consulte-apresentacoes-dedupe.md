---
name: Dedupe "Consulte apresentações"
description: Regra de agrupamento automático de variantes de sabor no preçário
---
Variantes de sabor ("Nome - Sabor") viram UM item "Consulte apresentações" automaticamente quando 2+ produtos compartilham fabricante + nome-base + preço.

**Why:** o usuário tentou preencher a coluna E manualmente na planilha, mas as edições nunca chegavam no arquivo enviado (arquivos idênticos byte a byte). Ele então aprovou o agrupamento automático (2026-07-27). A chave inclui fabricante para evitar juntar marcas diferentes com preço coincidente (achado do code review).

**How to apply:** qualquer mudança no parser deve preservar esse pós-processamento (roda no fim do parse, após splitApresentacao). O gatilho explícito via coluna E também continua válido. Não confiar que o usuário editará planilhas — preferir lógica automática no servidor.
