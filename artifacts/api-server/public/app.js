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
  let currentBg = "white";
  let dirty = false;

  const bgToggle = document.getElementById("bgToggle");
  const bgToggleState = document.getElementById("bgToggleState");

  function syncBgToggle() {
    if (bgToggle) bgToggle.setAttribute("aria-checked", String(currentBg === "color"));
    if (bgToggleState) bgToggleState.textContent =
      currentBg === "color" ? "Ligado · colorido" : "Desligado · branco";
  }

  function log(line) {
    logEl.appendChild(document.createTextNode(line + "\n"));
    logEl.scrollTop = logEl.scrollHeight;
  }

  function reset() {
    statusEl.classList.remove("hidden");
    logEl.textContent = "";
  }

  function logImportStats(stats) {
    if (!stats) return;
    log("Aba utilizada: " + stats.abaUtilizada);
    log("Linhas de produtos lidas: " + stats.totalLidos);
    log("Produtos prontos para o encarte: " + stats.validos);
    log("Linhas com erro: " + stats.invalidos);
    log("Linhas agrupadas em outro produto: " + stats.agrupados);
    log("Outras linhas ignoradas: " + stats.ignorados + " (fora da contagem de produtos lidos)");
    if (stats.paginas !== undefined) log("Páginas geradas: " + stats.paginas);
    if (Array.isArray(stats.ocorrencias) && stats.ocorrencias.length) {
      log("Confira estas linhas na aba indicada:");
      const missingDescriptions = [];
      function occurrenceText(item) {
        const label = item.tipo === "erro" ? "Erro" :
          item.tipo === "agrupado" ? "Agrupada" : "Ignorada";
        const name = item.nome ? " — " + item.nome.replace(/\s+/g, " ") : "";
        const destination = item.linhaDestino ? " (junto à linha " + item.linhaDestino + ")" : "";
        return "  Linha " + item.linha + name + ": " + label + " — " + item.motivo + destination;
      }
      stats.ocorrencias.forEach((item) => {
        if (item.tipo === "ignorado" && item.motivo === "Descrição ausente") {
          missingDescriptions.push(item);
        } else {
          log(occurrenceText(item));
        }
      });
      if (missingDescriptions.length) {
        const details = document.createElement("details");
        details.className = "log-details";
        const summary = document.createElement("summary");
        summary.textContent = "Descrição ausente: " + missingDescriptions.length + " linhas — clique para ver";
        details.appendChild(summary);
        const content = document.createElement("div");
        content.textContent = missingDescriptions.map(occurrenceText).join("\n");
        details.appendChild(content);
        logEl.appendChild(details);
      }
    }
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
    previewFrame.src =
      "/api/preview?edit=1&bg=" +
      encodeURIComponent(currentBg) +
      (window.EncarteWS ? "&ws=" + window.EncarteWS.ws : "") +
      "&v=" +
      Date.now();
  }

  // Restaura o preçário salvo no servidor (usado pelo progresso.js ao abrir).
  window.__precarioRestaurar = function (sv) {
    produtos = Array.isArray(sv.produtos) ? sv.produtos : [];
    if (produtos.length === 0) return;
    currentMes = sv.mes || "";
    currentNome = sv.nomeArquivo || "encarte";
    currentBg = sv.bg === "color" ? "color" : "white";
    syncBgToggle();
    const mesInput = document.getElementById("mes");
    const nomeInput = document.getElementById("nomeArquivo");
    if (mesInput) mesInput.value = currentMes;
    if (nomeInput) nomeInput.value = sv.nomeArquivo || "";
    if (sv.filename) {
      currentDownloadUrl = "/api/download/" + encodeURIComponent(sv.filename);
      downloadLink.href = currentDownloadUrl;
    }
    updateCount();
    editorSection.classList.remove("hidden");
    setDirty(false);
    loadEditablePreview();
  };

  function setBg(next) {
    if (next !== "white" && next !== "color") return;
    if (currentBg === next) return;
    currentBg = next;
    syncBgToggle();
    setDirty(true);
    loadEditablePreview();
  }

  if (bgToggle) {
    bgToggle.addEventListener("click", () => setBg(currentBg === "color" ? "white" : "color"));
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
        "Você tem edições não salvas. Clique em 'Salvar e atualizar PDF' antes de baixar.\n\nBaixar mesmo assim a versão anterior?",
      );
      if (!ok) return;
      // allow download of stale version
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    reset();
    const estadoVersion = window.__encarteEstadoVersao;
    if (typeof estadoVersion !== "string") {
      log("Aguarde o encarte terminar de carregar antes de gerar.");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Processando...";

    const fd = new FormData(form);
    currentMes = String(fd.get("mes") || "").trim();
    currentNome = String(fd.get("nomeArquivo") || "encarte").trim() || "encarte";
    fd.set("bg", currentBg);
    fd.set("version", estadoVersion);

    log("Enviando planilha...");

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 || res.status === 428) {
          document.dispatchEvent(new CustomEvent("encarte:estado-conflito"));
        }
        log("Erro: " + (data && data.error ? data.error : res.statusText));
        logImportStats(data && data.stats);
        return;
      }
      if (typeof data.version === "string") {
        document.dispatchEvent(
          new CustomEvent("encarte:estado-versao", { detail: data.version }),
        );
      }

      log("Planilha processada com sucesso.");
      logImportStats(data.stats);
      log("PDF pronto: " + data.filename);
      log("Edite os produtos diretamente na prévia abaixo.");

      produtos = Array.isArray(data.produtos) ? data.produtos : [];
      currentDownloadUrl = data.downloadUrl;
      downloadLink.href = data.downloadUrl;

      // Share the parsed catalog with the Telas tab so it auto-fills.
      const sharedInfo = {
        produtos: produtos,
        mes: currentMes,
        validadeInicio: String(fd.get("validadeInicio") || "").trim(),
        validadeFim: String(fd.get("validadeFim") || "").trim(),
      };
      window.__encarteCatalogo = sharedInfo;
      document.dispatchEvent(
        new CustomEvent("encarte:catalogo", { detail: sharedInfo }),
      );

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
    const estadoVersion = window.__encarteEstadoVersao;
    if (typeof estadoVersion !== "string") {
      alert("Aguarde o encarte terminar de carregar antes de atualizar o PDF.");
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
          bg: currentBg,
          version: estadoVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || res.status === 428) {
          document.dispatchEvent(new CustomEvent("encarte:estado-conflito"));
        }
        log("Erro: " + (data && data.error ? data.error : res.statusText));
        return;
      }
      if (typeof data.version === "string") {
        document.dispatchEvent(
          new CustomEvent("encarte:estado-versao", { detail: data.version }),
        );
      }
      log("PDF atualizado: " + data.filename + " (" + data.stats.validos + " produtos)");
      updateCount();
      currentDownloadUrl = data.downloadUrl;
      downloadLink.href = data.downloadUrl;
      setDirty(false);
      flashSaved();
      // refresh the editable preview to confirm server-side state matches edits
      loadEditablePreview();

      // Smart-sync the Telas tab: update price/description of products that
      // already exist there, WITHOUT touching photos or the tela organization.
      const fd2 = new FormData(form);
      const sharedInfo = {
        produtos: produtos,
        mes: currentMes,
        validadeInicio: String(fd2.get("validadeInicio") || "").trim(),
        validadeFim: String(fd2.get("validadeFim") || "").trim(),
      };
      window.__encarteCatalogo = sharedInfo;
      document.dispatchEvent(
        new CustomEvent("encarte:catalogo-update", { detail: sharedInfo }),
      );
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      regenerateBtn.disabled = false;
      regenerateBtn.textContent = "Salvar e atualizar PDF";
    }
  });
})();
