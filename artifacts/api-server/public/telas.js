(function () {
  const PRODUTOS_PADRAO = 2;
  const MAX_PRODUTOS = 3;

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
      foto: null,
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

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  // Build telas automatically from the catalog: PRODUTOS_PADRAO products each.
  function buildTelasFromCatalog() {
    telas = [];
    for (let i = 0; i < catalogo.length; i += PRODUTOS_PADRAO) {
      const grupo = catalogo
        .slice(i, i + PRODUTOS_PADRAO)
        .map((p) => newItem(p));
      telas.push(newTela(grupo));
    }
    if (telas.length === 0) telas.push(newTela([newItem(null)]));
    current = 0;
  }

  function currentTela() {
    return telas[current] || null;
  }

  function telaState(tela) {
    return {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      background: bgDataUri,
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
  // Stateless: render the current tela to HTML and inject via srcdoc. A
  // sequence token guards against out-of-order responses overwriting newer ones.
  async function pushPreview() {
    const tela = currentTela();
    if (!tela) return;
    const seq = ++previewSeq;
    try {
      const res = await fetch("/api/telas/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telaState(tela)),
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
    debounceTimer = setTimeout(pushPreview, 400);
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
    delTelaBtn.disabled = total <= 1;
  }

  function renderItems() {
    const tela = currentTela();
    if (!tela) return;

    const isEmpty = tela.produtos.length === 0;
    emptyWarn.classList.toggle("hidden", !isEmpty);
    addBtn.disabled = tela.produtos.length >= MAX_PRODUTOS;

    itemsEl.innerHTML = "";
    tela.produtos.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "tela-item";
      row.innerHTML = `
        <div class="tela-item-head">
          <span class="tela-item-num">Produto ${idx + 1}</span>
          <button type="button" class="product-remove" data-act="remove">Remover</button>
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
      const tela = currentTela();
      tela.produtos = tela.produtos.filter((x) => x.id !== it.id);
      renderItems();
      if (tela.produtos.length === 0) {
        alert(
          "A tela " +
            (current + 1) +
            " ficou sem produtos. Adicione um produto ou exclua a tela — telas vazias não geram PNG.",
        );
      }
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
    if (index < 0 || index >= telas.length) return;
    current = index;
    renderAll();
  }

  // ---- Load catalog (shared between Preçários and Telas tabs) ----
  function loadCatalog(produtos, info) {
    catalogo = Array.isArray(produtos) ? produtos : [];
    if (catalogo.length === 0) return;

    // Auto-fill global info if empty
    if (info) {
      if (info.mes && !mesInput.value.trim()) mesInput.value = info.mes;
      if (info.validadeInicio && !validadeInicioInput.value.trim())
        validadeInicioInput.value = info.validadeInicio;
      if (info.validadeFim && !validadeFimInput.value.trim())
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

  // Listen for spreadsheet parsed in the Preçários tab
  document.addEventListener("encarte:catalogo", (ev) => {
    const d = ev.detail || {};
    loadCatalog(d.produtos, {
      mes: d.mes,
      validadeInicio: d.validadeInicio,
      validadeFim: d.validadeFim,
    });
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
    if (!tela || tela.produtos.length >= MAX_PRODUTOS) return;
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
    telas.splice(current + 1, 0, newTela([newItem(null)]));
    goTo(current + 1);
  });

  delTelaBtn.addEventListener("click", () => {
    if (telas.length <= 1) return;
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
      const body = telaState(tela);
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
        telas: telas.map((t) => telaState(t)),
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
      downloadAllBtn.textContent = "Baixar todas as telas";
    }
  });

  function triggerDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
})();
