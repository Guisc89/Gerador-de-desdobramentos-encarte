(function () {
  const form = document.getElementById("form");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");
  const downloadLink = document.getElementById("downloadLink");
  const previewLink = document.getElementById("previewLink");
  const submitBtn = document.getElementById("submit");

  const editorSection = document.getElementById("editor");
  const productListEl = document.getElementById("productList");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const pdfFrame = document.getElementById("pdfFrame");
  const previewCount = document.getElementById("previewCount");

  let produtos = [];
  let currentMes = "";
  let currentNome = "encarte";

  function log(line) {
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function reset() {
    statusEl.classList.remove("hidden");
    logEl.textContent = "";
    downloadLink.classList.add("hidden");
    previewLink.classList.add("hidden");
  }

  function renderProducts() {
    productListEl.innerHTML = "";
    previewCount.textContent = `(${produtos.length} produtos · ${Math.ceil(produtos.length / 14)} páginas)`;

    produtos.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "product-item";
      item.innerHTML = `
        <div class="product-item-header">
          <span class="product-index">#${idx + 1}</span>
          <button type="button" class="product-remove" data-idx="${idx}">Remover</button>
        </div>
        <div class="product-grid">
          <div class="field">
            <label>Nome</label>
            <input type="text" data-field="nome" data-idx="${idx}" value="${escapeAttr(p.nome)}" />
          </div>
          <div class="field">
            <label>Descrição</label>
            <input type="text" data-field="descricao" data-idx="${idx}" value="${escapeAttr(p.descricao || "")}" />
          </div>
          <div class="field">
            <label>R$ Inteiro</label>
            <input type="text" data-field="precoInteiro" data-idx="${idx}" value="${escapeAttr(p.precoInteiro)}" />
          </div>
          <div class="field">
            <label>Centavos</label>
            <input type="text" data-field="precoCentavos" data-idx="${idx}" value="${escapeAttr(p.precoCentavos)}" />
          </div>
          <div class="field">
            <label>Validade início</label>
            <input type="text" data-field="validadeInicio" data-idx="${idx}" value="${escapeAttr(p.validadeInicio || "")}" />
          </div>
          <div class="field">
            <label>Validade fim</label>
            <input type="text" data-field="validadeFim" data-idx="${idx}" value="${escapeAttr(p.validadeFim || "")}" />
          </div>
          <div class="field">
            <label>Fabricante</label>
            <input type="text" data-field="fabricante" data-idx="${idx}" value="${escapeAttr(p.fabricante || "")}" />
          </div>
          <div class="field">
            <label>EAN</label>
            <input type="text" data-field="ean" data-idx="${idx}" value="${escapeAttr(p.ean || "")}" />
          </div>
        </div>
      `;
      productListEl.appendChild(item);
    });
  }

  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  productListEl.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    const idx = Number(t.getAttribute("data-idx"));
    const field = t.getAttribute("data-field");
    if (!field || Number.isNaN(idx) || !produtos[idx]) return;
    produtos[idx][field] = t.value;
  });

  productListEl.addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.classList.contains("product-remove")) return;
    const idx = Number(t.getAttribute("data-idx"));
    if (Number.isNaN(idx)) return;
    produtos.splice(idx, 1);
    renderProducts();
  });

  function showPdf(downloadUrl) {
    // bust the iframe cache so the updated PDF shows
    const cacheBuster = "?t=" + Date.now();
    pdfFrame.src = downloadUrl + cacheBuster;
    downloadLink.href = downloadUrl;
    downloadLink.classList.remove("hidden");
    previewLink.href = "/api/preview";
    previewLink.classList.remove("hidden");
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    reset();
    submitBtn.disabled = true;
    submitBtn.textContent = "Gerando...";

    const fd = new FormData(form);
    currentMes = String(fd.get("mes") || "").trim();
    currentNome = String(fd.get("nomeArquivo") || "encarte").trim() || "encarte";

    log("Enviando planilha...");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        log("Erro: " + (data && data.error ? data.error : res.statusText));
        return;
      }

      log("Planilha processada com sucesso.");
      if (data.stats) {
        log("Aba utilizada: " + data.stats.abaUtilizada);
        log("Produtos lidos: " + data.stats.totalLidos);
        log("Produtos válidos: " + data.stats.validos);
        log("Produtos com erro: " + data.stats.invalidos);
        log("Páginas geradas: " + data.stats.paginas);
        if (data.stats.pendentes && data.stats.pendentes.length > 0) {
          log("Pendentes (preço ausente):");
          data.stats.pendentes.forEach((p) => log("  - " + p));
        }
      }
      log("PDF gerado: " + data.filename);

      produtos = Array.isArray(data.produtos) ? data.produtos : [];
      renderProducts();
      editorSection.classList.remove("hidden");
      showPdf(data.downloadUrl);
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Gerar PDF";
    }
  });

  regenerateBtn.addEventListener("click", async () => {
    if (produtos.length === 0) {
      alert("Não há produtos para gerar o PDF.");
      return;
    }
    regenerateBtn.disabled = true;
    regenerateBtn.textContent = "Atualizando...";
    log("Regerando PDF com edições...");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtos,
          nomeArquivo: currentNome,
          mes: currentMes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        log("Erro: " + (data && data.error ? data.error : res.statusText));
        return;
      }
      log("PDF atualizado: " + data.filename);
      previewCount.textContent = `(${produtos.length} produtos · ${Math.ceil(produtos.length / 14)} páginas)`;
      showPdf(data.downloadUrl);
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = "Atualizar PDF";
    }
  });
})();
