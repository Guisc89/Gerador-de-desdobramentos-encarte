(function () {
  // Page 1 (capa) of the feed = exactly 2 products (per the reference art).
  const CARD_PRODUTOS = 2;

  const emptyState = document.getElementById("cardEmptyState");
  const workspace = document.getElementById("cardWorkspace");
  const planilhaInput = document.getElementById("cardPlanilha");
  const carregarBtn = document.getElementById("cardCarregarBtn");
  const parseInfo = document.getElementById("cardParseInfo");

  const mesInput = document.getElementById("cardMes");
  const nomeArquivoInput = document.getElementById("cardNomeArquivo");
  const validadeInicioInput = document.getElementById("cardValidadeInicio");
  const validadeFimInput = document.getElementById("cardValidadeFim");
  const enderecoInput = document.getElementById("cardEndereco");

  const bgInput = document.getElementById("cardBgInput");
  const bgRemoveBtn = document.getElementById("cardBgRemove");
  const bgThumbWrap = document.getElementById("cardBgThumbWrap");
  const bgThumb = document.getElementById("cardBgThumb");

  const itemsEl = document.getElementById("cardItems");
  const reloadBtn = document.getElementById("cardPlanilhaReload");
  const planilhaHidden = document.getElementById("cardPlanilhaHidden");

  const previewFrame = document.getElementById("cardPreviewFrame");
  const downloadLink = document.getElementById("cardDownloadLink");
  const genInfo = document.getElementById("cardGenInfo");

  // ---- State ----
  let catalogo = [];
  let bgDataUri = null;
  let items = []; // exactly 2 product items
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

  function buildItemsFromCatalog() {
    items = [];
    for (let i = 0; i < CARD_PRODUTOS; i += 1) {
      items.push(newItem(catalogo[i] || null));
    }
  }

  function cardState() {
    return {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      background: bgDataUri,
      produtos: items.map((it) => ({
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
    const state = cardState();
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

  function renderItems() {
    itemsEl.innerHTML = "";
    items.forEach((it, idx) => {
      const row = document.createElement("div");
      row.className = "tela-item";
      row.innerHTML = `
        <div class="tela-item-head">
          <span class="tela-item-num">Produto ${idx + 1}</span>
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
    renderItems();
    pushPreview();
  }

  // ---- Load catalog (shared with Preçários/Telas) ----
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

    buildItemsFromCatalog();
    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent =
        catalogo.length + " produtos · capa com 2 produtos.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
  }

  // Rebuild the capa from an updated catalog. On a forced re-sync (Preçário
  // save) the 2 capa products are rebuilt from the edited catalog, discarding
  // per-card photos (same agreed workflow as the Telas tab).
  function syncCatalog(produtos, info, opts) {
    const list = Array.isArray(produtos) ? produtos : [];
    if (list.length === 0) return;
    const force = opts && opts.force;
    if (force) items = [];
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
      carregarBtn.textContent = "Montar card";
    }
  });

  reloadBtn.addEventListener("click", () => planilhaHidden.click());
  planilhaHidden.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (
      !confirm(
        "Trocar a planilha vai remontar o card e descartar os ajustes atuais. Continuar?",
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

  // ---- Global info inputs ----
  [mesInput, validadeInicioInput, validadeFimInput, enderecoInput].forEach((inp) => {
    inp.addEventListener("input", schedulePreview);
  });

  // ---- Download the card ----
  downloadLink.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const preenchidos = items.filter((it) => it.nome.trim()).length;
    if (preenchidos < CARD_PRODUTOS) {
      alert("A capa precisa de exatamente 2 produtos preenchidos (com nome).");
      return;
    }
    downloadLink.classList.add("disabled");
    downloadLink.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    try {
      const body = cardState();
      body.nomeArquivo = nomeArquivoInput.value.trim() || "card";
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
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      genInfo.textContent =
        "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadLink.classList.remove("disabled");
      downloadLink.textContent = "Baixar card (PNG)";
    }
  });
})();
