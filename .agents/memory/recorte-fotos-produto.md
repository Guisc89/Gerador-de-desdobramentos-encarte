---
name: Recorte automático de fotos de produto
description: Por que fotos de produto passam por auto-trim de bordas vazias no cliente antes de exibir nos cards
---

# Auto-trim de fotos de produto

- Fotos de fornecedor costumam vir quadradas (ex. 1200×1200) com o produto ocupando só uma faixa e o resto transparente/quase branco — no card com `object-fit: contain` o produto aparece minúsculo.
- **Why:** usuário reportou o Creme de assaduras "pequeno" mesmo com a imagem preenchendo o box; a moldura vazia era parte da imagem.
- **How to apply:** `EncarteImg.comprimirDataUri(..., { recortar: true })` apara bordas com alpha<20 ou RGB>247 — usado em uploads de foto e na migração `comprimirMapaFotos` (que roda em TODAS as fotos, não só nas grandes). Fundos nunca são recortados. Se surgirem fotos com fundo colorido, o trim por quase-branco não atua — comportamento esperado, não bug.
- **Armadilha (já mordeu):** a decisão de recortar tem que usar a caixa BRUTA do conteúdo (< 88% da área), ANTES de somar a margem. Se a margem entra na conta, foto já recortada é re-recortada a cada reload (encolhe 2% por vez) e re-salva TODAS as fotos em loop — a tempestade de saves estoura o rate limit do GCS (1 mutação/s por objeto, 429 em estado.json). O trim deve ser idempotente: segunda passada retorna a imagem intacta.
