(function () {
  const form = document.getElementById("form");
  const statusEl = document.getElementById("status");
  const logEl = document.getElementById("log");
  const downloadLink = document.getElementById("downloadLink");
  const previewLink = document.getElementById("previewLink");
  const submitBtn = document.getElementById("submit");

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

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    reset();
    submitBtn.disabled = true;
    submitBtn.textContent = "Gerando...";

    const fd = new FormData(form);
    log("Enviando planilha...");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!res.ok) {
        log("Erro: " + (data && data.error ? data.error : res.statusText));
        return;
      }

      log("Planilha processada com sucesso.");
      if (data.stats) {
        log("Aba utilizada: " + data.stats.abaUtilizada);
        log("Abas encontradas: " + (data.stats.abasEncontradas || []).join(", "));
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

      downloadLink.href = data.downloadUrl;
      downloadLink.classList.remove("hidden");
      previewLink.href = data.previewUrl;
      previewLink.classList.remove("hidden");
    } catch (err) {
      log("Erro inesperado: " + (err && err.message ? err.message : String(err)));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Gerar PDF";
    }
  });
})();
