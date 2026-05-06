(function () {
  const form = document.getElementById("form");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");
  const submitBtn = document.getElementById("submit");

  const editorSection = document.getElementById("editor");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const downloadLink = document.getElementById("downloadLink");
  const previewFrame = document.getElementById("previewFrame");
  const previewCount = document.getElementById("previewCount");
  const dirtyBadge = document.getElementById("dirtyBadge");
  const savedBadge = document.getElementById("savedBadge");

  let produtos = [];
  let currentMes = "";
  let currentNome = "encarte";
  let currentDownloadUrl = "";
  let dirty = false;

  function log(line) {
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function reset() {
    statusEl.classList.remove("hidden");
    logEl.textContent = "";
  }

  function updateCount() {
    previewCount.textContent = `· ${produtos.length} produtos · ${Math.ceil(produtos.length / 14)} páginas`;
  }

  function setDirty(isDirty) {
    dirty = isDirty;
    if (isDirty) {
      dirtyBadge.classList.remove("hidden");
      savedBadge.classList.add("hidden");
      downloadLink.classList.add("disabled");
      downloadLink.setAttribute("aria-disabled", "true");
    } else {
      dirtyBadge.classList.add("hidden");
      downloadLink.classList.remove("disabled");
      downloadLink.removeAttribute("aria-disabled");
    }
  }

  function flashSaved() {
    savedBadge.classList.remove("hidden");
    setTimeout(() => savedBadge.classList.add("hidden"), 2500);
  }

  function loadEditablePreview() {
    previewFrame.src = "/api/preview?edit=1&v=" + Date.now();
  }

  // Receive edits from the inline editable preview
  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.type !== "encarte-edit" || !Array.isArray(data.changes)) return;
    let changedAny = false;
    data.changes.forEach((c) => {
      if (typeof c.idx !== "number" || !c.field || !produtos[c.idx]) return;
      let value = String(c.value || "").trim();
      if (c.field === "precoCentavos") {
        value = value.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
      } else if (c.field === "precoInteiro") {
        value = value.replace(/\D/g, "") || "0";
      }
      if (produtos[c.idx][c.field] !== value) {
        produtos[c.idx][c.field] = value;
        changedAny = true;
      }
    });
    if (changedAny) setDirty(true);
  });

  // Block download link when there are unsaved edits
  downloadLink.addEventListener("click", (ev) => {
    if (dirty) {
      ev.preventDefault();
      const ok = confirm(
        "Você tem edições não salvas. Clique em 'Atualizar PDF' antes de baixar.\n\nBaixar mesmo assim a versão anterior?",
      );
      if (!ok) return;
      // allow download of stale version
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    reset();
    submitBtn.disabled = true;
    submitBtn.textContent = "Processando...";

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
      log("PDF pronto: " + data.filename);
      log("Edite os produtos diretamente na prévia abaixo.");

      produtos = Array.isArray(data.produtos) ? data.produtos : [];
      currentDownloadUrl = data.downloadUrl;
      downloadLink.href = data.downloadUrl;
      updateCount();
      editorSection.classList.remove("hidden");
      setDirty(false);
      loadEditablePreview();
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
    log("Aplicando edições e regerando PDF...");

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
      log("PDF atualizado: " + data.filename + " (" + data.stats.validos + " produtos)");
      updateCount();
      currentDownloadUrl = data.downloadUrl;
      downloadLink.href = data.downloadUrl;
      setDirty(false);
      flashSaved();
      // refresh the editable preview to confirm server-side state matches edits
      loadEditablePreview();
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = "Atualizar PDF";
    }
  });
})();
