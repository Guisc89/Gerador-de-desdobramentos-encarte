(function () {
  // Cards are a read-only mirror of the Telas tab: same pages, same products,
  // same texts/prices/photos. Page 1 (capa) = 2 products; every other page 2–4.
  // The only per-product control here is showing/hiding each product's photo.
  const CAPA_PRODUTOS = 2;
  const MIN_PRODUTOS = 2;

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
  const disclaimerInput = document.getElementById("cardDisclaimer");
  const infoCorInput = document.getElementById("cardInfoCor");

  // Background
  const bgInput = document.getElementById("cardBgInput");
  const bgRemoveBtn = document.getElementById("cardBgRemove");
  const bgThumbWrap = document.getElementById("cardBgThumbWrap");
  const bgThumb = document.getElementById("cardBgThumb");
  const bg2Input = document.getElementById("cardBg2Input");
  const bg2RemoveBtn = document.getElementById("cardBg2Remove");
  const bg2ThumbWrap = document.getElementById("cardBg2ThumbWrap");
  const bg2Thumb = document.getElementById("cardBg2Thumb");

  // Per-page photo list (read-only: only show/hide each product photo)
  const itemsEl = document.getElementById("cardItems");
  const itemsTitle = document.getElementById("cardItemsTitle");
  const itemsHint = document.getElementById("cardItemsHint");

  // Carousel (navigation only — pages come from the Telas tab)
  const prevBtn = document.getElementById("cardPrevBtn");
  const nextBtn = document.getElementById("cardNextBtn");
  const carouselInfo = document.getElementById("cardCarouselInfo");

  // Preview + download
  const previewFrame = document.getElementById("cardPreviewFrame");
  const downloadLink = document.getElementById("cardDownloadLink");
  const downloadAllBtn = document.getElementById("cardDownloadAllBtn");
  const downloadPdfBtn = document.getElementById("cardDownloadPdfBtn");
  const genInfo = document.getElementById("cardGenInfo");
  const allLinks = document.getElementById("cardAllLinks");

  // ---- State ----
  // bgDataUri = fundo da capa (página 1); bg2DataUri = demais páginas
  // (sem o segundo, todas usam o da capa — compatível com estados antigos).
  let bgDataUri = null;
  let bg2DataUri = null;
  let cards = []; // [{ id, produtos: [item, ...] }] mirrored from the Telas tab
  let current = 0;
  let nextId = 1;
  let debounceTimer = null;
  let previewSeq = 0;
  function newItem(prefill) {
    const foto = prefill ? prefill.foto || null : null;
    return {
      id: nextId++,
      nome: prefill ? prefill.nome : "",
      descricao: prefill ? prefill.descricao : "",
      precoInteiro: prefill ? prefill.precoInteiro : "",
      precoCentavos: prefill ? prefill.precoCentavos : "",
      foto: foto,
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

  // ---- Mirror the Telas tab ----
  // Consume everything set up in the Telas tab: same pages/products/texts/prices
  // and photos. No product data is edited here.
  function mirrorTelas(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.telas) || snapshot.telas.length === 0)
      return;

    // Fill global info from the telas, only where the card field is still empty
    // (so a card-specific value the user typed isn't clobbered on re-sync).
    if (snapshot.mes && !mesInput.value.trim()) mesInput.value = snapshot.mes;
    if (snapshot.validadeInicio && !validadeInicioInput.value.trim())
      validadeInicioInput.value = snapshot.validadeInicio;
    if (snapshot.validadeFim && !validadeFimInput.value.trim())
      validadeFimInput.value = snapshot.validadeFim;
    if (snapshot.endereco && !enderecoInput.value.trim())
      enderecoInput.value = snapshot.endereco;

    cards = snapshot.telas.map((t) =>
      newCard((t.produtos || []).map((p) => newItem(p))),
    );
    if (current >= cards.length) current = cards.length - 1;
    if (current < 0) current = 0;

    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent = cards.length + " página(s) espelhadas das Telas.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
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
      disclaimer: disclaimerInput.value.trim(),
      infoCor: infoCorInput.value.trim(),
      background: isCapa ? bgDataUri : bg2DataUri || bgDataUri,
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
  function renderCarousel() {
    const total = cards.length;
    carouselInfo.textContent = "Página " + (current + 1) + " de " + total;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
  }

  function renderItems() {
    const card = currentCard();
    if (!card) return;

    const isCapa = current === 0;
    itemsTitle.textContent = isCapa ? "Fotos da capa" : "Fotos desta página";
    if (itemsHint)
      itemsHint.textContent =
        "Os produtos e as fotos vêm das Telas. Para alterá-los, edite a aba Telas.";

    itemsEl.innerHTML = "";
    card.produtos.forEach((it, idx) => {
      const tile = document.createElement("div");
      tile.className = "foto-tile" + (it.foto ? "" : " foto-tile-vazia");
      tile.innerHTML = `
        <span class="foto-tile-img">${
          it.foto ? `<img src="${it.foto}" alt="" />` : "<span>sem foto</span>"
        }</span>
        <span class="foto-tile-nome">${escapeHtml(it.nome) || "Produto " + (idx + 1)}</span>
      `;
      itemsEl.appendChild(tile);
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

  // ---- Consume the Telas tab ----
  // Re-mirror whenever the telas change; also mirror any snapshot the Telas tab
  // already published before this tab initialized (scripts load telas.js first).
  document.addEventListener("encarte:telas", (ev) => {
    mirrorTelas(ev.detail || window.__encarteTelas);
  });
  if (window.__encarteTelas) mirrorTelas(window.__encarteTelas);

  // ---- Spreadsheet upload (within Cards tab) ----
  // Feed the shared catalog so the Telas tab builds the pages and republishes
  // them; the cards then mirror the result.
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
      const shared = {
        produtos: data.produtos,
        mes: mesInput.value.trim(),
        validadeInicio: validadeInicioInput.value.trim(),
        validadeFim: validadeFimInput.value.trim(),
      };
      window.__encarteCatalogo = shared;
      document.dispatchEvent(
        new CustomEvent("encarte:catalogo", { detail: shared }),
      );
    } catch (err) {
      parseInfo.textContent = "Erro: " + (err && err.message ? err.message : err);
      parseInfo.classList.remove("hidden");
    } finally {
      carregarBtn.disabled = false;
      carregarBtn.textContent = "Montar cards";
    }
  });

  // ---- Background (campaign art — specific to the Cards tab) ----
  bgInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    bgDataUri = await window.EncarteImg.comprimirBlob(file, { maxDim: 2600, quality: 0.9 });
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

  bg2Input.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    bg2DataUri = await window.EncarteImg.comprimirBlob(file, { maxDim: 2600, quality: 0.9 });
    bg2Thumb.src = bg2DataUri;
    bg2ThumbWrap.classList.remove("hidden");
    bg2RemoveBtn.classList.remove("hidden");
    schedulePreview();
  });

  bg2RemoveBtn.addEventListener("click", () => {
    bg2DataUri = null;
    bg2Input.value = "";
    bg2ThumbWrap.classList.add("hidden");
    bg2RemoveBtn.classList.add("hidden");
    schedulePreview();
  });

  // ---- Carousel nav ----
  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  // ---- Global info inputs ----
  [mesInput, validadeInicioInput, validadeFimInput, enderecoInput, disclaimerInput, infoCorInput].forEach(
    (inp) => {
      inp.addEventListener("input", schedulePreview);
    },
  );

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

  // ---------- Snapshot / restauração (progresso automático) ----------
  window.__cardsSnapshot = function () {
    if (!bgDataUri && !bg2DataUri && !enderecoInput.value.trim() && !nomeArquivoInput.value.trim() && !disclaimerInput.value.trim() && !infoCorInput.value.trim()) return null;
    return {
      bgDataUri: bgDataUri,
      bg2DataUri: bg2DataUri,
      endereco: enderecoInput.value,
      disclaimer: disclaimerInput.value,
      infoCor: infoCorInput.value,
      nomeArquivo: nomeArquivoInput.value,
    };
  };

  window.__cardsRestaurar = function (saved) {
    if (!saved) return;
    if (saved.endereco && !enderecoInput.value.trim()) enderecoInput.value = saved.endereco;
    if (saved.disclaimer && !disclaimerInput.value.trim()) disclaimerInput.value = saved.disclaimer;
    if (saved.infoCor && !infoCorInput.value.trim()) infoCorInput.value = saved.infoCor;
    if (saved.nomeArquivo && !nomeArquivoInput.value.trim()) nomeArquivoInput.value = saved.nomeArquivo;
    if (saved.bgDataUri) {
      bgDataUri = saved.bgDataUri;
      bgThumb.src = bgDataUri;
      bgThumbWrap.classList.remove("hidden");
      bgRemoveBtn.classList.remove("hidden");
    }
    if (saved.bg2DataUri) {
      bg2DataUri = saved.bg2DataUri;
      bg2Thumb.src = bg2DataUri;
      bg2ThumbWrap.classList.remove("hidden");
      bg2RemoveBtn.classList.remove("hidden");
    }
    if (window.__encarteTelas) mirrorTelas(window.__encarteTelas);
  };

  // Avisa o progresso automático quando fundo/endereço mudam nesta aba.
  [bgInput, bgRemoveBtn, bg2Input, bg2RemoveBtn].forEach(function (el) {
    el.addEventListener("click", function () {
      setTimeout(function () {
        document.dispatchEvent(new CustomEvent("encarte:extras"));
      }, 300);
    });
  });
  [bgInput, bg2Input].forEach(function (el) {
    el.addEventListener("change", function () {
      setTimeout(function () {
        document.dispatchEvent(new CustomEvent("encarte:extras"));
      }, 300);
    });
  });
  [enderecoInput, disclaimerInput, infoCorInput].forEach(function (el) {
    el.addEventListener("input", function () {
      document.dispatchEvent(new CustomEvent("encarte:extras"));
    });
  });

})();
