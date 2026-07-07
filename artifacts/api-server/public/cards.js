(function () {
  // Page 1 (capa) = exactly 2 products. Every other page = 2 to 4 products.
  const CAPA_PRODUTOS = 2;
  const MIN_PRODUTOS = 2;
  const MAX_PRODUTOS = 4;
  const MAX_CARDS = 60;

  // Empty-state elements
  const emptyState = document.getElementById("cardEmptyState");
  const workspace = document.getElementById("cardWorkspace");
  const planilhaInput = document.getElementById("cardPlanilha");
  const carregarBtn = document.getElementById("cardCarregarBtn");
  const parseInfo = document.getElementById("cardParseInfo");

  // Global info
  const mesInput = document.getElementById("cardMes");
  const nomeArquivoInput = document.getElementById("cardNomeArquivo");
  const validadeInicioInput = document.getElementById("cardValidadeInicio");
  const validadeFimInput = document.getElementById("cardValidadeFim");
  const enderecoInput = document.getElementById("cardEndereco");

  // Background
  const bgInput = document.getElementById("cardBgInput");
  const bgRemoveBtn = document.getElementById("cardBgRemove");
  const bgThumbWrap = document.getElementById("cardBgThumbWrap");
  const bgThumb = document.getElementById("cardBgThumb");

  // Per-page product editor
  const itemsEl = document.getElementById("cardItems");
  const itemsTitle = document.getElementById("cardItemsTitle");
  const itemsHint = document.getElementById("cardItemsHint");
  const emptyWarn = document.getElementById("cardEmptyWarn");
  const addBtn = document.getElementById("cardAddBtn");
  const reloadBtn = document.getElementById("cardPlanilhaReload");
  const planilhaHidden = document.getElementById("cardPlanilhaHidden");

  // Carousel
  const prevBtn = document.getElementById("cardPrevBtn");
  const nextBtn = document.getElementById("cardNextBtn");
  const carouselInfo = document.getElementById("cardCarouselInfo");
  const addCardBtn = document.getElementById("cardAddCardBtn");
  const delCardBtn = document.getElementById("cardDelCardBtn");

  // Preview + download
  const previewFrame = document.getElementById("cardPreviewFrame");
  const downloadLink = document.getElementById("cardDownloadLink");
  const downloadAllBtn = document.getElementById("cardDownloadAllBtn");
  const downloadPdfBtn = document.getElementById("cardDownloadPdfBtn");
  const genInfo = document.getElementById("cardGenInfo");
  const allLinks = document.getElementById("cardAllLinks");

  // ---- State ----
  let catalogo = [];
  let bgDataUri = null;
  let cards = []; // [{ id, produtos: [item, ...] }]
  let current = 0;
  let nextId = 1;
  let debounceTimer = null;
  let previewSeq = 0;

  function newItem(prefill) {
    return {
      id: nextId++,
      nome: prefill ? prefill.nome : "",
      descricao: prefill ? prefill.descricao : "",
      precoInteiro: prefill ? prefill.precoInteiro : "",
      precoCentavos: prefill ? prefill.precoCentavos : "",
      foto: null,
    };
  }

  function newCard(produtos) {
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

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  // Split the post-capa products into pages of 2–4 as evenly as possible.
  function chunkRest(items) {
    const R = items.length;
    if (R === 0) return [];
    if (R <= MAX_PRODUTOS) return [items];
    const n = Math.ceil(R / MAX_PRODUTOS);
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

  function buildCardsFromCatalog() {
    cards = [];
    const capa = catalogo.slice(0, CAPA_PRODUTOS).map((p) => newItem(p));
    if (capa.length > 0) cards.push(newCard(capa));
    const rest = catalogo.slice(CAPA_PRODUTOS).map((p) => newItem(p));
    chunkRest(rest).forEach((grupo) => cards.push(newCard(grupo)));
    if (cards.length === 0) cards.push(newCard([newItem(null), newItem(null)]));
    current = 0;
  }

  function currentCard() {
    return cards[current] || null;
  }

  function cardState(card, isCapa) {
    return {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      background: bgDataUri,
      isCapa: !!isCapa,
      produtos: card.produtos.map((it) => ({
        nome: it.nome,
        descricao: it.descricao,
        precoInteiro: it.precoInteiro,
        precoCentavos: it.precoCentavos,
        foto: it.foto,
      })),
    };
  }

  // ---- Preview (client-side, same template as the server) ----
  async function pushPreview() {
    const card = currentCard();
    if (!card) return;
    const state = cardState(card, current === 0);

    if (
      window.CardTemplate &&
      typeof window.CardTemplate.renderCardHtml === "function"
    ) {
      previewSeq++;
      previewFrame.srcdoc = window.CardTemplate.renderCardHtml(state);
      return;
    }

    const seq = ++previewSeq;
    try {
      const res = await fetch("/api/cards/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const html = await res.text();
      if (seq !== previewSeq) return;
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
    const total = cards.length;
    carouselInfo.textContent = "Página " + (current + 1) + " de " + total;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    // The capa (page 1) is fixed and cannot be deleted.
    delCardBtn.disabled = total <= 1 || current === 0;
  }

  function renderItems() {
    const card = currentCard();
    if (!card) return;

    const isCapa = current === 0;
    const maxProdutos = isCapa ? CAPA_PRODUTOS : MAX_PRODUTOS;
    const minProdutos = isCapa ? CAPA_PRODUTOS : MIN_PRODUTOS;
    const canRemove = card.produtos.length > minProdutos;

    itemsTitle.textContent = isCapa ? "Produtos da capa" : "Produtos desta página";
    itemsHint.textContent = isCapa
      ? "A capa (página 1) tem exatamente 2 produtos."
      : "Cada página a partir da 2ª tem de 2 a 4 produtos.";

    const isEmpty = card.produtos.length === 0;
    emptyWarn.classList.toggle("hidden", !isEmpty);
    addBtn.disabled = card.produtos.length >= maxProdutos;

    itemsEl.innerHTML = "";
    card.produtos.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "tela-item";
      row.innerHTML = `
        <div class="tela-item-head">
          <span class="tela-item-num">Produto ${idx + 1}</span>
          <button type="button" class="product-remove" data-act="remove"${
            canRemove ? "" : " disabled"
          }>Remover</button>
        </div>
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
          <input type="file" accept="image/*" data-act="foto" />
        </div>
        <div class="tela-item-thumb ${it.foto ? "" : "hidden"}">
          ${it.foto ? `<img src="${it.foto}" alt="" />` : ""}
        </div>
      `;
      bindRow(row, it);
      itemsEl.appendChild(row);
    });
  }

  function bindRow(row, it) {
    row.querySelector('[data-act="remove"]').addEventListener("click", () => {
      const card = currentCard();
      const isCapa = current === 0;
      const minProdutos = isCapa ? CAPA_PRODUTOS : MIN_PRODUTOS;
      if (card.produtos.length <= minProdutos) {
        alert(
          isCapa
            ? "A capa (página 1) precisa ter exatamente 2 produtos."
            : "Cada página a partir da 2ª precisa ter no mínimo 2 produtos.",
        );
        return;
      }
      card.produtos = card.produtos.filter((x) => x.id !== it.id);
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
      renderItems();
      schedulePreview();
    });

    row.querySelectorAll("[data-field]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const f = inp.getAttribute("data-field");
        let v = inp.value;
        if (f === "precoInteiro") v = v.replace(/\D/g, "");
        if (f === "precoCentavos") v = v.replace(/\D/g, "").slice(0, 2);
        it[f] = v;
        schedulePreview();
      });
    });

    row.querySelector('[data-act="foto"]').addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      it.foto = await fileToDataUri(file);
      renderItems();
      schedulePreview();
    });
  }

  function renderAll() {
    renderCarousel();
    renderItems();
    pushPreview();
  }

  function goTo(index) {
    if (index < 0 || index >= cards.length) return;
    current = index;
    renderAll();
  }

  // ---- Load catalog (shared between Preçários, Telas and Cards tabs) ----
  function loadCatalog(produtos, info, forceInfo) {
    catalogo = Array.isArray(produtos) ? produtos : [];
    if (catalogo.length === 0) return;

    if (info) {
      if (info.mes && (forceInfo || !mesInput.value.trim()))
        mesInput.value = info.mes;
      if (info.validadeInicio && (forceInfo || !validadeInicioInput.value.trim()))
        validadeInicioInput.value = info.validadeInicio;
      if (info.validadeFim && (forceInfo || !validadeFimInput.value.trim()))
        validadeFimInput.value = info.validadeFim;
    }

    buildCardsFromCatalog();
    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent =
        catalogo.length + " produtos · " + cards.length + " páginas montadas.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
  }

  // Rebuild the cards from an updated catalog. On a forced re-sync (Preçário
  // save) the pages are rebuilt from the edited catalog, discarding per-page
  // photos (same agreed workflow as the Telas tab).
  function syncCatalog(produtos, info, opts) {
    const list = Array.isArray(produtos) ? produtos : [];
    if (list.length === 0) return;
    const force = opts && opts.force;
    if (force) cards = [];
    loadCatalog(list, info, force);
  }

  document.addEventListener("encarte:catalogo", (ev) => {
    const d = ev.detail || {};
    syncCatalog(d.produtos, {
      mes: d.mes,
      validadeInicio: d.validadeInicio,
      validadeFim: d.validadeFim,
    });
  });
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
  if (window.__encarteCatalogo && Array.isArray(window.__encarteCatalogo.produtos)) {
    const c = window.__encarteCatalogo;
    loadCatalog(c.produtos, {
      mes: c.mes,
      validadeInicio: c.validadeInicio,
      validadeFim: c.validadeFim,
    });
  }

  // ---- Spreadsheet upload (within Cards tab) ----
  async function uploadPlanilha(file) {
    const fd = new FormData();
    fd.append("planilha", file);
    fd.append("validadeInicio", validadeInicioInput.value.trim());
    fd.append("validadeFim", validadeFimInput.value.trim());
    const res = await fetch("/api/cards/parse", { method: "POST", body: fd });
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
      carregarBtn.textContent = "Montar cards";
    }
  });

  reloadBtn.addEventListener("click", () => planilhaHidden.click());
  planilhaHidden.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (
      !confirm(
        "Trocar a planilha vai remontar todas as páginas e descartar os ajustes atuais. Continuar?",
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

  // ---- Per-page product add ----
  addBtn.addEventListener("click", () => {
    const card = currentCard();
    const maxProdutos = current === 0 ? CAPA_PRODUTOS : MAX_PRODUTOS;
    if (!card || card.produtos.length >= maxProdutos) return;
    card.produtos.push(newItem(null));
    renderItems();
    schedulePreview();
  });

  // ---- Carousel nav ----
  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  addCardBtn.addEventListener("click", () => {
    if (cards.length >= MAX_CARDS) {
      alert("Limite de " + MAX_CARDS + " páginas atingido.");
      return;
    }
    cards.splice(current + 1, 0, newCard([newItem(null), newItem(null)]));
    goTo(current + 1);
  });

  delCardBtn.addEventListener("click", () => {
    if (cards.length <= 1) return;
    if (current === 0) {
      alert("A capa (página 1) não pode ser excluída.");
      return;
    }
    if (!confirm("Excluir a página " + (current + 1) + "?")) return;
    cards.splice(current, 1);
    if (current >= cards.length) current = cards.length - 1;
    renderAll();
  });

  // ---- Global info inputs ----
  [mesInput, validadeInicioInput, validadeFimInput, enderecoInput].forEach((inp) => {
    inp.addEventListener("input", schedulePreview);
  });

  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---- Download current page ----
  downloadLink.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const card = currentCard();
    if (!card) return;
    const isCapa = current === 0;
    const validos = card.produtos.filter((it) => it.nome.trim()).length;
    if (isCapa && validos !== CAPA_PRODUTOS) {
      alert("A capa precisa de exatamente 2 produtos preenchidos (com nome).");
      return;
    }
    if (!isCapa && validos < MIN_PRODUTOS) {
      alert("Esta página precisa de 2 a 4 produtos preenchidos (com nome).");
      return;
    }
    downloadLink.classList.add("disabled");
    downloadLink.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    try {
      const body = cardState(card, isCapa);
      const base = nomeArquivoInput.value.trim() || "card";
      body.nomeArquivo = base + "_card_" + String(current + 1).padStart(2, "0");
      const res = await fetch("/api/cards/generate", {
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
      genInfo.textContent =
        "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadLink.classList.remove("disabled");
      downloadLink.textContent = "Baixar esta página";
    }
  });

  // Validate the per-page product-count contract before a batch request, using
  // the same rules the server enforces (capa = exactly 2 named products, every
  // other page 2-4). Empty pages are ignored here (they're skipped server-side).
  // Returns an array of human-readable problems (empty array = OK).
  function batchCountErrors() {
    const problems = [];
    cards.forEach((c, i) => {
      const validos = c.produtos.filter((it) => it.nome.trim()).length;
      if (validos === 0) return;
      if (i === 0) {
        if (validos !== CAPA_PRODUTOS) {
          problems.push("página 1 (capa) precisa de exatamente 2 produtos");
        }
      } else if (validos < MIN_PRODUTOS) {
        problems.push("página " + (i + 1) + " precisa de 2 a 4 produtos");
      }
    });
    return problems;
  }

  // ---- Download all pages (PNG) ----
  downloadAllBtn.addEventListener("click", async () => {
    const vazias = cards.filter((c) => c.produtos.length === 0).length;
    const comProdutos = cards.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhuma página tem produtos. Adicione produtos antes de gerar.");
      return;
    }
    const problemas = batchCountErrors();
    if (problemas.length > 0) {
      alert("Ajuste antes de gerar:\n- " + problemas.join("\n- "));
      return;
    }
    if (vazias > 0) {
      if (
        !confirm(
          vazias +
            " página(s) estão sem produtos e serão ignoradas. Gerar as " +
            comProdutos +
            " página(s) restantes?",
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
        nomeArquivo: nomeArquivoInput.value.trim() || "card",
        cards: cards.map((c, i) => cardState(c, i === 0)),
      };
      const res = await fetch("/api/cards/generate-all", {
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
        " página(s) geradas" +
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
      genInfo.textContent =
        "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadAllBtn.disabled = false;
      downloadAllBtn.textContent = "Baixar todas (PNG)";
    }
  });

  // ---- Download all pages as a single PDF ----
  downloadPdfBtn.addEventListener("click", async () => {
    const vazias = cards.filter((c) => c.produtos.length === 0).length;
    const comProdutos = cards.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhuma página tem produtos. Adicione produtos antes de gerar.");
      return;
    }
    const problemas = batchCountErrors();
    if (problemas.length > 0) {
      alert("Ajuste antes de gerar:\n- " + problemas.join("\n- "));
      return;
    }
    if (vazias > 0) {
      if (
        !confirm(
          vazias +
            " página(s) estão sem produtos e serão ignoradas. Gerar o PDF com as " +
            comProdutos +
            " página(s) restantes?",
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
        nomeArquivo: nomeArquivoInput.value.trim() || "card",
        cards: cards.map((c, i) => cardState(c, i === 0)),
      };
      const res = await fetch("/api/cards/generate-pdf", {
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
        " página(s)" +
        (data.vazias ? " (" + data.vazias + " ignoradas por estarem vazias)" : "") +
        ": " +
        data.filename;
      genInfo.classList.remove("hidden");
      triggerDownload(data.downloadUrl, data.filename);
    } catch (err) {
      genInfo.textContent =
        "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Baixar todas em PDF";
    }
  });
})();
