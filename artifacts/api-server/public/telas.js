(function () {
  const planilhaInput = document.getElementById("telaPlanilha");
  const carregarBtn = document.getElementById("telaCarregarBtn");
  const parseInfo = document.getElementById("telaParseInfo");

  const mesInput = document.getElementById("telaMes");
  const nomeArquivoInput = document.getElementById("telaNomeArquivo");
  const validadeInicioInput = document.getElementById("telaValidadeInicio");
  const validadeFimInput = document.getElementById("telaValidadeFim");
  const enderecoInput = document.getElementById("telaEndereco");

  const bgInput = document.getElementById("telaBgInput");
  const bgRemoveBtn = document.getElementById("telaBgRemove");
  const bgThumbWrap = document.getElementById("telaBgThumbWrap");
  const bgThumb = document.getElementById("telaBgThumb");

  const itemsEl = document.getElementById("telaItems");
  const itemsEmpty = document.getElementById("telaItemsEmpty");
  const addBtn = document.getElementById("telaAddBtn");

  const refreshBtn = document.getElementById("telaRefreshBtn");
  const downloadLink = document.getElementById("telaDownloadLink");
  const previewFrame = document.getElementById("telaPreviewFrame");
  const genInfo = document.getElementById("telaGenInfo");

  // Available products parsed from the spreadsheet
  let catalogo = [];
  // Background data URI (null = default green)
  let bgDataUri = null;
  // Tela items: { id, nome, descricao, precoInteiro, precoCentavos, foto }
  let items = [];
  let nextId = 1;
  let debounceTimer = null;

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function buildState() {
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

  async function pushState() {
    try {
      await fetch("/api/telas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildState()),
      });
      previewFrame.src = "/api/telas/preview?v=" + Date.now();
    } catch (err) {
      // silent — preview refresh failure is non-blocking
    }
  }

  function schedulePreview() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(pushState, 450);
  }

  function catalogOptions(selectedNome) {
    let html = '<option value="">— escolher da planilha —</option>';
    catalogo.forEach((p, i) => {
      const sel = p.nome === selectedNome ? " selected" : "";
      html += `<option value="${i}"${sel}>${escapeHtml(p.nome)}</option>`;
    });
    return html;
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

  function renderItems() {
    itemsEmpty.classList.toggle("hidden", items.length > 0);
    itemsEl.innerHTML = "";
    items.forEach((it, idx) => {
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
      items = items.filter((x) => x.id !== it.id);
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

  function addItem(prefill) {
    items.push({
      id: nextId++,
      nome: prefill ? prefill.nome : "",
      descricao: prefill ? prefill.descricao : "",
      precoInteiro: prefill ? prefill.precoInteiro : "",
      precoCentavos: prefill ? prefill.precoCentavos : "",
      foto: null,
    });
    renderItems();
    schedulePreview();
  }

  // ---- Events ----
  carregarBtn.addEventListener("click", async () => {
    const file = planilhaInput.files && planilhaInput.files[0];
    if (!file) {
      alert("Selecione uma planilha .xlsx primeiro.");
      return;
    }
    carregarBtn.disabled = true;
    carregarBtn.textContent = "Carregando...";
    try {
      const fd = new FormData();
      fd.append("planilha", file);
      fd.append("validadeInicio", validadeInicioInput.value.trim());
      fd.append("validadeFim", validadeFimInput.value.trim());
      const res = await fetch("/api/telas/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        parseInfo.textContent = "Erro: " + (data.error || res.statusText);
        parseInfo.classList.remove("hidden");
        return;
      }
      catalogo = Array.isArray(data.produtos) ? data.produtos : [];
      parseInfo.textContent =
        catalogo.length +
        " produtos disponíveis (aba: " +
        (data.stats ? data.stats.abaUtilizada : "?") +
        "). Adicione produtos à tela e selecione cada um na lista.";
      parseInfo.classList.remove("hidden");
      if (items.length === 0) addItem(catalogo[0]);
      else renderItems();
    } catch (err) {
      parseInfo.textContent = "Erro inesperado: " + (err && err.message ? err.message : err);
      parseInfo.classList.remove("hidden");
    } finally {
      carregarBtn.disabled = false;
      carregarBtn.textContent = "Carregar produtos";
    }
  });

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

  addBtn.addEventListener("click", () => addItem(null));

  [mesInput, validadeInicioInput, validadeFimInput, enderecoInput].forEach((inp) => {
    inp.addEventListener("input", schedulePreview);
  });

  refreshBtn.addEventListener("click", pushState);

  downloadLink.addEventListener("click", async (ev) => {
    ev.preventDefault();
    if (items.length === 0) {
      alert("Adicione ao menos um produto à tela.");
      return;
    }
    downloadLink.classList.add("disabled");
    downloadLink.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    try {
      const body = buildState();
      body.nomeArquivo = nomeArquivoInput.value.trim() || "tela";
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
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      genInfo.textContent = "Erro inesperado: " + (err && err.message ? err.message : err);
      genInfo.classList.remove("hidden");
    } finally {
      downloadLink.classList.remove("disabled");
      downloadLink.textContent = "Baixar PNG";
    }
  });

  // Initial empty preview
  previewFrame.src = "/api/telas/preview?v=" + Date.now();
})();
