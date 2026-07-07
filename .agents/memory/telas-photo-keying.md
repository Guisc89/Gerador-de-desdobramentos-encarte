---
name: Telas/Cards product photo keying
description: Why product photos are keyed by name + apresentação, not name alone.
---

# Product photo store key must include the apresentação

Product photos in the encarte app (Telas + Cards tabs) are stored in the shared
`window.__encarteFotos` map and must be keyed by **name + apresentação**, using
`fotoKey(nome, descricao) = trim(nome) + "||" + trim(descricao)` — never by name
alone.

**Why:** the spreadsheet frequently has multiple rows sharing the SAME product
name but differing only by "apresentação" (the variant), which lives in the
`descricao` field (e.g. one base product "Desodorante Aerossol Above Extreme
200ml" with rows "Black 72h", "Invisible 72h", "Movement 72h"). Each apresentação
is a different SKU and needs its own photo. Keying by name alone made every
apresentação pull the same image.

**How to apply:** any code that reads/writes/mirrors a per-product photo (the
shared store, the `encarte:fotos` event payload, the Cards `hiddenFotos`
show/hide map, rebuild rehydration in `newItem`) must build/compare the key with
`fotoKey(nome, descricao)`, consistently across `telas.js` and `cards.js`. The
`encarte:fotos` event carries `detail.key` (the composite key), not the bare
name. When a product's name/apresentação is edited in place after a photo is
attached, re-key the store (`rekeyFoto`) quietly — no event dispatch — so the row
input doesn't lose focus mid-typing.
