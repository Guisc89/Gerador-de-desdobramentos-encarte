(function () {
  const form = document.getElementById("form");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");
  const downloadLink = document.getElementById("downloadLink");
  const submitBtn = document.getElementById("submit");

  const editorSection = document.getElementById("editor");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const previewFrame = document.getElementById("previewFrame");
  const previewCount = document.getElementById("previewCount");
  const modeEditBtn = document.getElementById("modeEdit");
  const modePdfBtn = document.getElementById("modePdf");

  let produtos = [];
  let currentMes = "";
  let currentNome = "encarte";
  let currentDownloadUrl = "";
  let mode = "edit"; // "edit" or "pdf"

  function log(line) {
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function reset() {
    statusEl.classList.remove("hidden");
    logEl.textContent = "";
    downloadLink.classList.add("hidden");
  }

  function updateCount() {
    previewCount.textContent = `· ${produtos.length} produtos · ${Math.ceil(produtos.length / 14)} páginas`;
  }

  function setMode(newMode) {
    mode = newMode;
    if (mode === "edit") {
      modeEditBtn.classList.add("active");
      modePdfBtn.classList.remove("active");
      previewFrame.src = "/api/preview?edit=1&v=" + Date.now();
    } else {
      modePdfBtn.classList.add("active");
      modeEditBtn.classList.remove("active");
      if (currentDownloadUrl) {
        previewFrame.src = currentDownloadUrl + "?t=" + Date.now();
      }
    }
  }

  modeEditBtn.addEventListener("click", () => setMode("edit"));
  modePdfBtn.addEventListener("click", () => setMode("pdf"));

  // Receive edits from the inline editable preview
  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.type !== "encarte-edit" || !Array.isArray(data.changes)) return;
    data.changes.forEach((c) => {
      if (typeof c.idx !== "number" || !c.field || !produtos[c.idx]) return;
      let value = String(c.value || "").trim();
      if (c.field === "precoCentavos") {
        value = value.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
      } else if (c.field === "precoInteiro") {
        value = value.replace(/\D/g, "") || "0";
      }
      produtos[c.idx][c.field] = value;
    });
  });

  function showInitialPreview(downloadUrl) {
    currentDownloadUrl = downloadUrl;
    downloadLink.href = downloadUrl;
    downloadLink.classList.remove("hidden");
    setMode("edit"); // default to editable HTML preview
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
      updateCount();
      editorSection.classList.remove("hidden");
      showInitialPreview(data.downloadUrl);
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
      updateCount();
      currentDownloadUrl = data.downloadUrl;
      downloadLink.href = data.downloadUrl;
      // refresh the current view with new data
      setMode(mode);
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = "Atualizar PDF";
    }
  });
})();
