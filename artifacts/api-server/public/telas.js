(function () {
  // Capa (tela 1) = exactly 2 products. Every other tela = 3 to 4 products.
  const CAPA_PRODUTOS = 2;
  const MIN_PRODUTOS_TELA = 3;
  const MAX_PRODUTOS_TELA = 4;

  // Empty-state elements
  const emptyState = document.getElementById("telaEmptyState");
  const workspace = document.getElementById("telaWorkspace");
  const planilhaInput = document.getElementById("telaPlanilha");
  const carregarBtn = document.getElementById("telaCarregarBtn");
  const parseInfo = document.getElementById("telaParseInfo");

  // Global info
  const mesInput = document.getElementById("telaMes");
  const nomeArquivoInput = document.getElementById("telaNomeArquivo");
  const validadeInicioInput = document.getElementById("telaValidadeInicio");
  const validadeFimInput = document.getElementById("telaValidadeFim");
  const enderecoInput = document.getElementById("telaEndereco");

  // Background
  const bgInput = document.getElementById("telaBgInput");
  const bgRemoveBtn = document.getElementById("telaBgRemove");
  const bgThumbWrap = document.getElementById("telaBgThumbWrap");
  const bgThumb = document.getElementById("telaBgThumb");

  // Per-tela product editor
  const itemsEl = document.getElementById("telaItems");
  const emptyWarn = document.getElementById("telaEmptyWarn");
  const addBtn = document.getElementById("telaAddBtn");
  const reloadBtn = document.getElementById("telaPlanilhaReload");
  const planilhaHidden = document.getElementById("telaPlanilhaHidden");

  // Carousel
  const prevBtn = document.getElementById("telaPrevBtn");
  const nextBtn = document.getElementById("telaNextBtn");
  const carouselInfo = document.getElementById("telaCarouselInfo");
  const addTelaBtn = document.getElementById("telaAddTelaBtn");
  const delTelaBtn = document.getElementById("telaDelTelaBtn");

  // Preview + download
  const previewFrame = document.getElementById("telaPreviewFrame");
  const downloadLink = document.getElementById("telaDownloadLink");
  const downloadAllBtn = document.getElementById("telaDownloadAllBtn");
  const downloadPdfBtn = document.getElementById("telaDownloadPdfBtn");
  const genInfo = document.getElementById("telaGenInfo");
  const allLinks = document.getElementById("telaAllLinks");

  // ---- State ----
  let catalogo = []; // produtos from spreadsheet
  let bgDataUri = null;
  let telas = []; // [{ id, produtos: [item, ...] }]
  let current = 0;
  let nextId = 1;
  let debounceTimer = null;
  let previewSeq = 0;

  const MAX_TELAS = 60;

  function newItem(prefill) {
    return {
      id: nextId++,
      nome: prefill ? prefill.nome : "",
      descricao: prefill ? prefill.descricao : "",
      precoInteiro: prefill ? prefill.precoInteiro : "",
      precoCentavos: prefill ? prefill.precoCentavos : "",
      foto: prefill ? fotoFor(prefill.nome, prefill.descricao) : null,
    };
  }

  function newTela(produtos) {
    return { id: nextId++, produtos: produtos || [] };
  }

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---- Shared product photos (synced across the Telas and Cards tabs) ----
  // Photos are keyed by product name + apresentação (descrição) in a shared
  // window store, so products that share the same name but differ by
  // apresentação (e.g. "Black 72h" vs "Invisible 72h") each keep their own
  // photo. A photo applied in one tab is consumed by the other and survives
  // catalog rebuilds. Publishes/consumes the `encarte:fotos` event.
  function fotoKey(nome, descricao) {
    return (nome || "").trim() + "||" + (descricao || "").trim();
  }
  function sharedFotos() {
    if (!window.__encarteFotos) window.__encarteFotos = {};
    return window.__encarteFotos;
  }
  function fotoFor(nome, descricao) {
    if (!(nome || "").trim()) return null;
    return sharedFotos()[fotoKey(nome, descricao)] || null;
  }
  function publishFoto(nome, descricao, foto) {
    if (!(nome || "").trim()) return;
    const key = fotoKey(nome, descricao);
    const store = sharedFotos();
    if (foto) {
      store[key] = foto;
      delete tombstones()[key];
    } else {
      delete store[key];
      tombstones()[key] = true;
    }
    document.dispatchEvent(
      new CustomEvent("encarte:fotos", {
        detail: { key, foto: foto || null },
      }),
    );
  }
  // Move a photo's entry to a new key when its product name/apresentação is
  // edited in place, so the shared store stays keyed by the current values.
  // Done quietly (no event) to avoid re-rendering the row while typing.
  // Chaves de foto removidas/renomeadas nesta sessão. O autosave envia esta
  // lista para o servidor apagar explicitamente (o merge do servidor é
  // propositalmente aditivo e nunca apaga por ausência — ver estadoStorage.ts).
  function tombstones() {
    if (!window.__encarteFotosRemovidas) window.__encarteFotosRemovidas = {};
    return window.__encarteFotosRemovidas;
  }

  function rekeyFoto(oldNome, oldDescricao, novoNome, novoDescricao, foto) {
    const oldKey = fotoKey(oldNome, oldDescricao);
    const newKey = fotoKey(novoNome, novoDescricao);
    if (oldKey === newKey) return;
    const store = sharedFotos();
    delete store[oldKey];
    tombstones()[oldKey] = true;
    if (foto && (novoNome || "").trim()) {
      store[newKey] = foto;
      delete tombstones()[newKey];
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  // Split the post-capa products into telas of 3–4 as evenly as possible, so we
  // don't leave a tela with 1–2 products whenever the count allows it. (Counts
  // of 1, 2 and 5 cannot be split into pure 3–4 groups; the leftover tela is
  // then underfilled and the user tops it up manually.)
  function chunkRest(items) {
    const R = items.length;
    if (R === 0) return [];
    if (R <= MAX_PRODUTOS_TELA) return [items];
    const n = Math.ceil(R / MAX_PRODUTOS_TELA);
    const base = Math.floor(R / n);
    let rem = R % n;
    const groups = [];
    let idx = 0;
    for (let g = 0; g < n; g += 1) {
      const size = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      groups.push(items.slice(idx, idx + size));
      idx += size;
    }
    return groups;
  }

  function buildTelasFromCatalog() {
    telas = [];
    const capa = catalogo.slice(0, CAPA_PRODUTOS).map((p) => newItem(p));
    if (capa.length > 0) telas.push(newTela(capa));
    const rest = catalogo.slice(CAPA_PRODUTOS).map((p) => newItem(p));
    chunkRest(rest).forEach((grupo) => telas.push(newTela(grupo)));
    if (telas.length === 0)
      telas.push(newTela([newItem(null), newItem(null)]));
    current = 0;
  }

  function currentTela() {
    return telas[current] || null;
  }

  function telaState(tela, isCapa) {
    return {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      background: bgDataUri,
      isCapa: !!isCapa,
      produtos: tela.produtos.map((it) => ({
        nome: it.nome,
        descricao: it.descricao,
        precoInteiro: it.precoInteiro,
        precoCentavos: it.precoCentavos,
        foto: it.foto,
      })),
    };
  }

  // ---- Preview ----
  // Render the current tela entirely in the browser using the SAME template the
  // server uses for PNG output (window.TelaTemplate, built from telaTemplate.ts).
  // This avoids a network round-trip and re-sending the base64 photos/background
  // on every keystroke, so the preview updates instantly. Falls back to the
  // stateless /api/telas/render endpoint if the browser template failed to load.
  // Publish the full telas state so the Cards tab can consume it (same pages,
  // products, texts/prices/photos). Cards mirror this read-only; they never
  // edit product data. Called on every preview refresh so all edits propagate.
  function publishTelas() {
    const snapshot = {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      telas: telas.map((t) => ({
        produtos: t.produtos.map((it) => ({
          nome: it.nome,
          descricao: it.descricao,
          precoInteiro: it.precoInteiro,
          precoCentavos: it.precoCentavos,
          foto: it.foto,
        })),
      })),
    };
    window.__encarteTelas = snapshot;
    document.dispatchEvent(new CustomEvent("encarte:telas", { detail: snapshot }));
  }

  async function pushPreview() {
    const tela = currentTela();
    if (!tela) return;
    const state = telaState(tela, current === 0);
    publishTelas();

    if (window.TelaTemplate && typeof window.TelaTemplate.renderTelaHtml === "function") {
      previewSeq++; // invalidate any in-flight fallback request
      previewFrame.srcdoc = window.TelaTemplate.renderTelaHtml(state);
      return;
    }

    const seq = ++previewSeq;
    try {
      const res = await fetch("/api/telas/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const html = await res.text();
      if (seq !== previewSeq) return; // a newer request already started
      previewFrame.srcdoc = html;
    } catch (err) {
      // silent — preview refresh failure is non-blocking
    }
  }

  function schedulePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(pushPreview, 120);
  }

  // ---- Rendering ----
  function catalogOptions(selectedNome) {
    let html = '<option value="">— escolher da planilha —</option>';
    catalogo.forEach((p, i) => {
      const sel = p.nome === selectedNome ? " selected" : "";
      html += `<option value="${i}"${sel}>${escapeHtml(p.nome)}</option>`;
    });
    return html;
  }

  function renderCarousel() {
    const total = telas.length;
    carouselInfo.textContent = "Tela " + (current + 1) + " de " + total;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    // The capa (tela 1) is fixed and cannot be deleted — deleting it would
    // promote a 3–4 product tela into the capa slot and break the invariant.
    delTelaBtn.disabled = total <= 1 || current === 0;
  }

  function renderItems() {
    const tela = currentTela();
    if (!tela) return;

    const isCapa = current === 0;
    const maxProdutos = isCapa ? CAPA_PRODUTOS : MAX_PRODUTOS_TELA;
    const minProdutos = isCapa ? CAPA_PRODUTOS : MIN_PRODUTOS_TELA;
    const canRemove = tela.produtos.length > minProdutos;

    const isEmpty = tela.produtos.length === 0;
    emptyWarn.classList.toggle("hidden", !isEmpty);
    addBtn.disabled = tela.produtos.length >= maxProdutos;

    itemsEl.innerHTML = "";
    tela.produtos.forEach((it, idx) => {
      // Accordion: fechado mostra só um resumo (foto, nome, preço); clicar abre
      // o formulário completo. Itens sem nome abrem sozinhos (precisam de atenção).
      const aberto = it.aberto === undefined ? !it.nome : !!it.aberto;
      const preco =
        it.precoInteiro || it.precoCentavos
          ? "R$ " + (it.precoInteiro || "0") + "," + (it.precoCentavos || "00")
          : "";
      const row = document.createElement("div");
      row.className = "tela-item acc-item" + (aberto ? " acc-open" : "");
      row.innerHTML = `
        <button type="button" class="acc-head" data-act="toggle">
          <span class="acc-thumb">${
            it.foto ? `<img src="${it.foto}" alt="" />` : `<span class="acc-thumb-vazio">sem<br>foto</span>`
          }</span>
          <span class="acc-title">
            <strong>${escapeHtml(it.nome) || "Produto " + (idx + 1) + " — preencher"}</strong>
            <small>${escapeHtml(it.descricao) || ""}</small>
          </span>
          <span class="acc-preco">${preco}</span>
          <span class="acc-chevron">›</span>
        </button>
        <div class="acc-body${aberto ? "" : " hidden"}">
          <div class="field">
            <label>Selecionar da planilha</label>
            <select data-act="pick">${catalogOptions(it.nome)}</select>
          </div>
          <div class="row">
            <div class="field">
              <label>Nome</label>
              <input type="text" data-field="nome" value="${escapeHtml(it.nome)}" />
            </div>
            <div class="field">
              <label>Descrição</label>
              <input type="text" data-field="descricao" value="${escapeHtml(it.descricao)}" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label>Preço (reais)</label>
              <input type="text" inputmode="numeric" data-field="precoInteiro" value="${escapeHtml(it.precoInteiro)}" />
            </div>
            <div class="field">
              <label>Centavos</label>
              <input type="text" inputmode="numeric" data-field="precoCentavos" value="${escapeHtml(it.precoCentavos)}" />
            </div>
          </div>
          <div class="field">
            <label>Foto do produto</label>
            <div class="foto-input-row">
              <input type="file" accept="image/*" data-act="foto" />
              <button type="button" class="btn-colar" data-act="colar" title="Copie uma imagem na internet (botão direito → Copiar imagem) e clique aqui">Colar imagem</button>
            </div>
          </div>
          <div class="acc-foot">
            <button type="button" class="product-remove" data-act="remove"${
              canRemove ? "" : " disabled"
            }>Remover produto</button>
          </div>
        </div>
      `;
      bindRow(row, it);
      itemsEl.appendChild(row);
    });
  }

  function bindRow(row, it) {
    row.querySelector('[data-act="toggle"]').addEventListener("click", () => {
      it.aberto = !(it.aberto === undefined ? !it.nome : !!it.aberto);
      row.classList.toggle("acc-open", it.aberto);
      row.querySelector(".acc-body").classList.toggle("hidden", !it.aberto);
    });

    row.querySelector('[data-act="remove"]').addEventListener("click", () => {
      const tela = currentTela();
      const isCapa = current === 0;
      const minProdutos = isCapa ? CAPA_PRODUTOS : MIN_PRODUTOS_TELA;
      if (tela.produtos.length <= minProdutos) {
        alert(
          isCapa
            ? "A capa (tela 1) precisa ter exatamente 2 produtos."
            : "Cada tela a partir da 2 precisa ter no mínimo 3 produtos.",
        );
        return;
      }
      tela.produtos = tela.produtos.filter((x) => x.id !== it.id);
      renderItems();
      schedulePreview();
    });

    row.querySelector('[data-act="pick"]').addEventListener("change", (e) => {
      const i = e.target.value;
      if (i === "") return;
      const p = catalogo[Number(i)];
      if (!p) return;
      it.nome = p.nome;
      it.descricao = p.descricao;
      it.precoInteiro = p.precoInteiro;
      it.precoCentavos = p.precoCentavos;
      it.foto = fotoFor(p.nome, p.descricao);
      renderItems();
      schedulePreview();
    });

    row.querySelectorAll("[data-field]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const f = inp.getAttribute("data-field");
        let v = inp.value;
        if (f === "precoInteiro") v = v.replace(/\D/g, "");
        if (f === "precoCentavos") v = v.replace(/\D/g, "").slice(0, 2);
        if ((f === "nome" || f === "descricao") && it.foto) {
          const oldNome = it.nome;
          const oldDescricao = it.descricao;
          it[f] = v;
          rekeyFoto(oldNome, oldDescricao, it.nome, it.descricao, it.foto);
        } else {
          it[f] = v;
        }
        schedulePreview();
      });
    });

    row.querySelector('[data-act="foto"]').addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      it.foto = await fileToDataUri(file);
      publishFoto(it.nome, it.descricao, it.foto);
      renderItems();
      schedulePreview();
    });

    function applyFotoBlob(blob) {
      return fileToDataUri(blob).then((uri) => {
        it.foto = uri;
        publishFoto(it.nome, it.descricao, it.foto);
        renderItems();
        schedulePreview();
      });
    }

    // "Colar imagem": reads an image copied to the clipboard (e.g. right-click
    // → "Copiar imagem" on a website) and uses it as the product photo.
    row.querySelector('[data-act="colar"]').addEventListener("click", async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
          throw new Error("sem suporte");
        }
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const type = item.types.find((t) => t.startsWith("image/"));
          if (type) {
            await applyFotoBlob(await item.getType(type));
            return;
          }
        }
        alert(
          "Nenhuma imagem encontrada na área de transferência.\n\n" +
            "Na internet, clique com o botão direito na imagem e escolha " +
            '"Copiar imagem". Depois clique em "Colar imagem" aqui.',
        );
      } catch (_) {
        alert(
          "Não consegui acessar a área de transferência.\n\n" +
            "Tente clicar no produto e pressionar Ctrl+V, ou use " +
            '"Escolher arquivo" para enviar a imagem salva no computador.',
        );
      }
    });

    // Ctrl+V anywhere inside the product row also pastes the image.
    row.addEventListener("paste", (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (!files || !files.length) return;
      const img = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      applyFotoBlob(img);
    });
  }

  function renderAll() {
    renderCarousel();
    renderItems();
    pushPreview();
  }

  function goTo(index) {
    if (index < 0 || index >= telas.length) return;
    current = index;
    renderAll();
  }

  // ---- Load catalog (shared between Preçários and Telas tabs) ----
  function loadCatalog(produtos, info, forceInfo) {
    catalogo = Array.isArray(produtos) ? produtos : [];
    if (catalogo.length === 0) return;

    // Fill global info. On a forced re-sync (save) overwrite even if already set,
    // so month/validade edited in the Preçário propagate; otherwise only fill
    // empty fields so we don't clobber values the user typed in the Telas tab.
    if (info) {
      if (info.mes && (forceInfo || !mesInput.value.trim()))
        mesInput.value = info.mes;
      if (info.validadeInicio && (forceInfo || !validadeInicioInput.value.trim()))
        validadeInicioInput.value = info.validadeInicio;
      if (info.validadeFim && (forceInfo || !validadeFimInput.value.trim()))
        validadeFimInput.value = info.validadeFim;
    }

    buildTelasFromCatalog();
    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent =
        catalogo.length + " produtos · " + telas.length + " telas montadas.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
  }

  // Rebuild the telas from an updated catalog. Used both for the first
  // spreadsheet load and when the user saves edits in the Preçário
  // ("Salvar e atualizar PDF"). The rebuild reflects ALL price/description
  // edits and discards the manual per-tela organization (grouping), but photos
  // are preserved: newItem re-hydrates each product's photo by name from the
  // shared window.__encarteFotos store.
  function syncCatalog(produtos, info, opts) {
    const list = Array.isArray(produtos) ? produtos : [];
    if (list.length === 0) return;
    const force = opts && opts.force;
    // On a re-sync (save), always rebuild even if telas were already built and
    // overwrite global info (mes/validade) so Preçário edits propagate.
    if (force) telas = [];
    loadCatalog(list, info, force);
  }

  // Mirror a product photo (published via publishFoto) onto any matching product
  // already placed in the telas (skip if unchanged to avoid a needless
  // re-render). The Cards tab is a read-only mirror and never publishes photos.
  document.addEventListener("encarte:fotos", (ev) => {
    const d = ev.detail || {};
    const key = d.key;
    if (!key) return;
    let changed = false;
    telas.forEach((t) =>
      t.produtos.forEach((it) => {
        if (fotoKey(it.nome, it.descricao) === key && (it.foto || null) !== (d.foto || null)) {
          it.foto = d.foto || null;
          changed = true;
        }
      }),
    );
    if (changed) renderAll();
  });

  // Listen for spreadsheet parsed in the Preçários tab (initial load)
  document.addEventListener("encarte:catalogo", (ev) => {
    const d = ev.detail || {};
    syncCatalog(d.produtos, {
      mes: d.mes,
      validadeInicio: d.validadeInicio,
      validadeFim: d.validadeFim,
    });
  });
  // Listen for edits saved in the Preçários tab — full rebuild of the telas
  document.addEventListener("encarte:catalogo-update", (ev) => {
    const d = ev.detail || {};
    syncCatalog(
      d.produtos,
      {
        mes: d.mes,
        validadeInicio: d.validadeInicio,
        validadeFim: d.validadeFim,
      },
      { force: true },
    );
  });
  // If Preçários already loaded a catalog before this tab initialized
  if (window.__encarteCatalogo && Array.isArray(window.__encarteCatalogo.produtos)) {
    const c = window.__encarteCatalogo;
    loadCatalog(c.produtos, {
      mes: c.mes,
      validadeInicio: c.validadeInicio,
      validadeFim: c.validadeFim,
    });
  }

  // ---- Spreadsheet upload (within Telas tab) ----
  async function uploadPlanilha(file) {
    const fd = new FormData();
    fd.append("planilha", file);
    fd.append("validadeInicio", validadeInicioInput.value.trim());
    fd.append("validadeFim", validadeFimInput.value.trim());
    const res = await fetch("/api/telas/parse", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  carregarBtn.addEventListener("click", async () => {
    const file = planilhaInput.files && planilhaInput.files[0];
    if (!file) {
      alert("Selecione uma planilha .xlsx primeiro.");
      return;
    }
    carregarBtn.disabled = true;
    carregarBtn.textContent = "Montando...";
    try {
      const data = await uploadPlanilha(file);
      loadCatalog(data.produtos, null);
    } catch (err) {
      parseInfo.textContent = "Erro: " + (err && err.message ? err.message : err);
      parseInfo.classList.remove("hidden");
    } finally {
      carregarBtn.disabled = false;
      carregarBtn.textContent = "Montar telas";
    }
  });

  reloadBtn.addEventListener("click", () => planilhaHidden.click());
  planilhaHidden.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (
      !confirm(
        "Trocar a planilha vai remontar todas as telas e descartar os ajustes atuais. Continuar?",
      )
    ) {
      planilhaHidden.value = "";
      return;
    }
    try {
      const data = await uploadPlanilha(file);
      loadCatalog(data.produtos, null);
    } catch (err) {
      alert("Erro: " + (err && err.message ? err.message : err));
    } finally {
      planilhaHidden.value = "";
    }
  });

  // ---- Background ----
  bgInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    bgDataUri = await fileToDataUri(file);
    bgThumb.src = bgDataUri;
    bgThumbWrap.classList.remove("hidden");
    bgRemoveBtn.classList.remove("hidden");
    schedulePreview();
  });

  bgRemoveBtn.addEventListener("click", () => {
    bgDataUri = null;
    bgInput.value = "";
    bgThumbWrap.classList.add("hidden");
    bgRemoveBtn.classList.add("hidden");
    schedulePreview();
  });

  // ---- Per-tela product add ----
  addBtn.addEventListener("click", () => {
    const tela = currentTela();
    const maxProdutos = current === 0 ? CAPA_PRODUTOS : MAX_PRODUTOS_TELA;
    if (!tela || tela.produtos.length >= maxProdutos) return;
    tela.produtos.push(newItem(null));
    renderItems();
    schedulePreview();
  });

  // ---- Carousel nav ----
  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  addTelaBtn.addEventListener("click", () => {
    if (telas.length >= MAX_TELAS) {
      alert("Limite de " + MAX_TELAS + " telas atingido.");
      return;
    }
    telas.splice(
      current + 1,
      0,
      newTela([newItem(null), newItem(null), newItem(null)]),
    );
    goTo(current + 1);
  });

  delTelaBtn.addEventListener("click", () => {
    if (telas.length <= 1) return;
    if (current === 0) {
      alert("A capa (tela 1) não pode ser excluída.");
      return;
    }
    if (!confirm("Excluir a tela " + (current + 1) + "?")) return;
    telas.splice(current, 1);
    if (current >= telas.length) current = telas.length - 1;
    renderAll();
  });

  // ---- Global info inputs ----
  [mesInput, validadeInicioInput, validadeFimInput, enderecoInput].forEach((inp) => {
    inp.addEventListener("input", schedulePreview);
  });

  // ---- Download current tela ----
  downloadLink.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const tela = currentTela();
    if (!tela || tela.produtos.length === 0) {
      alert("Esta tela está sem produtos. Adicione ao menos um produto.");
      return;
    }
    downloadLink.classList.add("disabled");
    downloadLink.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    try {
      const body = telaState(tela, current === 0);
      const base = nomeArquivoInput.value.trim() || "tela";
      body.nomeArquivo = base + "_tela_" + String(current + 1).padStart(2, "0");
      const res = await fetch("/api/telas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        genInfo.textContent = "Erro: " + (data.error || res.statusText);
        genInfo.classList.remove("hidden");
        return;
      }
      genInfo.textContent = "PNG gerado: " + data.filename;
      genInfo.classList.remove("hidden");
      triggerDownload(data.downloadUrl, data.filename);
    } catch (err) {
      genInfo.textContent = "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadLink.classList.remove("disabled");
      downloadLink.textContent = "Baixar esta tela";
    }
  });

  // ---- Download all telas ----
  downloadAllBtn.addEventListener("click", async () => {
    const vazias = telas.filter((t) => t.produtos.length === 0).length;
    const comProdutos = telas.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhuma tela tem produtos. Adicione produtos antes de gerar.");
      return;
    }
    if (vazias > 0) {
      if (
        !confirm(
          vazias +
            " tela(s) estão sem produtos e serão ignoradas. Gerar as " +
            comProdutos +
            " tela(s) restantes?",
        )
      ) {
        return;
      }
    }
    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    allLinks.classList.add("hidden");
    allLinks.innerHTML = "";
    try {
      const body = {
        nomeArquivo: nomeArquivoInput.value.trim() || "tela",
        telas: telas.map((t, i) => telaState(t, i === 0)),
      };
      const res = await fetch("/api/telas/generate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        genInfo.textContent = "Erro: " + (data.error || res.statusText);
        genInfo.classList.remove("hidden");
        return;
      }
      genInfo.textContent =
        data.arquivos.length +
        " tela(s) geradas" +
        (data.vazias ? " (" + data.vazias + " ignoradas por estarem vazias)" : "") +
        ". Clique para baixar:";
      genInfo.classList.remove("hidden");
      allLinks.innerHTML = data.arquivos
        .map(
          (a) =>
            `<a class="tela-link" href="${a.downloadUrl}" download="${escapeHtml(
              a.filename,
            )}">${escapeHtml(a.filename)}</a>`,
        )
        .join("");
      allLinks.classList.remove("hidden");
    } catch (err) {
      genInfo.textContent = "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = "Baixar todas (PNG)";
    }
  });

  // ---- Download all telas as a single PDF ----
  downloadPdfBtn.addEventListener("click", async () => {
    const vazias = telas.filter((t) => t.produtos.length === 0).length;
    const comProdutos = telas.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhuma tela tem produtos. Adicione produtos antes de gerar.");
      return;
    }
    if (vazias > 0) {
      if (
        !confirm(
          vazias +
            " tela(s) estão sem produtos e serão ignoradas. Gerar o PDF com as " +
            comProdutos +
            " tela(s) restantes?",
        )
      ) {
        return;
      }
    }
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = "Gerando PDF...";
    genInfo.classList.add("hidden");
    allLinks.classList.add("hidden");
    allLinks.innerHTML = "";
    try {
      const body = {
        nomeArquivo: nomeArquivoInput.value.trim() || "tela",
        telas: telas.map((t, i) => telaState(t, i === 0)),
      };
      const res = await fetch("/api/telas/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        genInfo.textContent = "Erro: " + (data.error || res.statusText);
        genInfo.classList.remove("hidden");
        return;
      }
      genInfo.textContent =
        "PDF gerado com " +
        data.total +
        " tela(s)" +
        (data.vazias ? " (" + data.vazias + " ignoradas por estarem vazias)" : "") +
        ": " +
        data.filename;
      genInfo.classList.remove("hidden");
      triggerDownload(data.downloadUrl, data.filename);
    } catch (err) {
      genInfo.textContent = "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Baixar todas em PDF";
    }
  });

  // ---------- Snapshot / restauração (progresso automático) ----------
  window.__telasSnapshot = function () {
    if (!telas.length || (telas.length === 1 && telas[0].produtos.every((p) => !p.nome))) {
      return null;
    }
    return {
      mes: mesInput.value,
      nomeArquivo: nomeArquivoInput.value,
      validadeInicio: validadeInicioInput.value,
      validadeFim: validadeFimInput.value,
      endereco: enderecoInput.value,
      bgDataUri: bgDataUri,
      current: current,
      telas: telas.map((t) => ({
        produtos: t.produtos.map((it) => ({
          nome: it.nome,
          descricao: it.descricao,
          precoInteiro: it.precoInteiro,
          precoCentavos: it.precoCentavos,
          // A foto já vive no mapa global (window.__encarteFotos, salvo como
          // frontend.fotos). Só duplica aqui quando divergir do mapa — na
          // restauração o fallback fotoFor() recupera pelo nome+descrição.
          // Isso corta o tamanho do autosave quase pela metade.
          foto: it.foto && fotoFor(it.nome, it.descricao) === it.foto ? null : it.foto,
        })),
      })),
    };
  };

  window.__telasRestaurar = function (saved) {
    if (!saved || !Array.isArray(saved.telas) || saved.telas.length === 0) return;
    if (saved.mes) mesInput.value = saved.mes;
    if (saved.nomeArquivo) nomeArquivoInput.value = saved.nomeArquivo;
    if (saved.validadeInicio) validadeInicioInput.value = saved.validadeInicio;
    if (saved.validadeFim) validadeFimInput.value = saved.validadeFim;
    if (saved.endereco) enderecoInput.value = saved.endereco;
    if (saved.bgDataUri) {
      bgDataUri = saved.bgDataUri;
      bgThumb.src = bgDataUri;
      bgThumbWrap.classList.remove("hidden");
      bgRemoveBtn.classList.remove("hidden");
    }
    if (window.__encarteCatalogo && Array.isArray(window.__encarteCatalogo.produtos)) {
      catalogo = window.__encarteCatalogo.produtos;
    }
    telas = saved.telas.map((t) =>
      newTela((t.produtos || []).map((p) => {
        const it = newItem(null);
        it.nome = p.nome || "";
        it.descricao = p.descricao || "";
        it.precoInteiro = p.precoInteiro || "";
        it.precoCentavos = p.precoCentavos || "";
        it.foto = p.foto || fotoFor(it.nome, it.descricao);
        return it;
      })),
    );
    current = Math.min(Math.max(0, saved.current || 0), telas.length - 1);
    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent =
        (catalogo.length ? catalogo.length + " produtos · " : "") +
        telas.length + " telas restauradas.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
  };

  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
})();
