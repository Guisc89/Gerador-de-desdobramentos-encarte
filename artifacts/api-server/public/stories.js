(function () {
  // Stories are a read-only mirror of the Telas tab: same products, texts,
  // prices and photos — but REGROUPED, because a tela page can hold 4 products
  // while a story holds at most 3. Page 1 (capa) = the first 2 products;
  // every other page gets 2 to 3 products (balanced groups). The only
  // per-product control here is showing/hiding each product's photo.
  const CAPA_PRODUTOS = 2;
  const MIN_PRODUTOS = 2;
  const MAX_PRODUTOS = 3;

  // Empty-state elements
  const emptyState = document.getElementById("storyEmptyState");
  const workspace = document.getElementById("storyWorkspace");
  const planilhaInput = document.getElementById("storyPlanilha");
  const carregarBtn = document.getElementById("storyCarregarBtn");
  const parseInfo = document.getElementById("storyParseInfo");

  // Global info
  const mesInput = document.getElementById("storyMes");
  const nomeArquivoInput = document.getElementById("storyNomeArquivo");
  const validadeInicioInput = document.getElementById("storyValidadeInicio");
  const validadeFimInput = document.getElementById("storyValidadeFim");
  const enderecoInput = document.getElementById("storyEndereco");
  const disclaimerInput = document.getElementById("storyDisclaimer");
  const infoCorInput = document.getElementById("storyInfoCor");

  // Background
  const bgInput = document.getElementById("storyBgInput");
  const bgRemoveBtn = document.getElementById("storyBgRemove");
  const bgThumbWrap = document.getElementById("storyBgThumbWrap");
  const bgThumb = document.getElementById("storyBgThumb");
  const bg2Input = document.getElementById("storyBg2Input");
  const bg2RemoveBtn = document.getElementById("storyBg2Remove");
  const bg2ThumbWrap = document.getElementById("storyBg2ThumbWrap");
  const bg2Thumb = document.getElementById("storyBg2Thumb");

  // Per-page photo list (read-only: only show/hide each product photo)
  const itemsEl = document.getElementById("storyItems");
  const itemsTitle = document.getElementById("storyItemsTitle");
  const itemsHint = document.getElementById("storyItemsHint");

  // Carousel (navigation only — pages come from the Telas tab)
  const prevBtn = document.getElementById("storyPrevBtn");
  const nextBtn = document.getElementById("storyNextBtn");
  const carouselInfo = document.getElementById("storyCarouselInfo");

  // Preview + download
  const previewFrame = document.getElementById("storyPreviewFrame");
  const downloadLink = document.getElementById("storyDownloadLink");
  const downloadAllBtn = document.getElementById("storyDownloadAllBtn");
  const downloadPdfBtn = document.getElementById("storyDownloadPdfBtn");
  const genInfo = document.getElementById("storyGenInfo");
  const allLinks = document.getElementById("storyAllLinks");

  // ---- State ----
  // bgDataUri = fundo da capa (página 1); bg2DataUri = demais páginas
  // (sem o segundo, todas usam o da capa — compatível com estados antigos).
  let bgDataUri = null;
  let bg2DataUri = null;
  let stories = []; // [{ id, produtos: [item, ...] }] regrouped from the Telas tab
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

  function newStory(produtos) {
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

  // Split N products (after the capa) into balanced groups of 2–3.
  // Uses ceil(N/3) groups with sizes as even as possible, so e.g. N=4 → 2+2
  // (never 3+1). N=1 yields a single undersized group — the count validation
  // warns before generation.
  function chunkRest(list) {
    const n = list.length;
    if (n === 0) return [];
    const groups = Math.max(1, Math.ceil(n / MAX_PRODUTOS));
    const base = Math.floor(n / groups);
    const extra = n % groups;
    const out = [];
    let idx = 0;
    for (let g = 0; g < groups; g += 1) {
      const size = base + (g < extra ? 1 : 0);
      out.push(list.slice(idx, idx + size));
      idx += size;
    }
    return out;
  }

  // ---- Mirror the Telas tab ----
  // Consume everything set up in the Telas tab: same products/texts/prices and
  // photos. Pages are REGROUPED (capa = first 2 products, rest in groups of
  // 2–3) because a tela page can hold up to 4 products. No product data is
  // edited here.
  function mirrorTelas(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.telas) || snapshot.telas.length === 0)
      return;

    // Fill global info from the telas, only where the story field is still
    // empty (so a story-specific value the user typed isn't clobbered).
    if (snapshot.mes && !mesInput.value.trim()) mesInput.value = snapshot.mes;
    if (snapshot.validadeInicio && !validadeInicioInput.value.trim())
      validadeInicioInput.value = snapshot.validadeInicio;
    if (snapshot.validadeFim && !validadeFimInput.value.trim())
      validadeFimInput.value = snapshot.validadeFim;
    if (snapshot.endereco && !enderecoInput.value.trim())
      enderecoInput.value = snapshot.endereco;
    if (snapshot.infoCor && !infoCorInput.value.trim())
      infoCorInput.value = snapshot.infoCor;

    // Flatten every product from the telas, in order.
    const todos = [];
    snapshot.telas.forEach((t) => {
      (t.produtos || []).forEach((p) => {
        todos.push(newItem(p));
      });
    });
    if (todos.length === 0) return;

    // Capa = first 2 products; the rest in balanced groups of 2–3.
    const capa = todos.slice(0, CAPA_PRODUTOS);
    const resto = todos.slice(CAPA_PRODUTOS);
    stories = [newStory(capa)].concat(
      chunkRest(resto).map((grupo) => newStory(grupo)),
    );
    if (current >= stories.length) current = stories.length - 1;
    if (current < 0) current = 0;

    emptyState.classList.add("hidden");
    workspace.classList.remove("hidden");
    if (parseInfo) {
      parseInfo.textContent =
        stories.length + " story(ies) montados a partir das Telas.";
      parseInfo.classList.remove("hidden");
    }
    renderAll();
  }

  function currentStory() {
    return stories[current] || null;
  }

  function storyState(story, isCapa) {
    return {
      mes: mesInput.value.trim(),
      validadeInicio: validadeInicioInput.value.trim(),
      validadeFim: validadeFimInput.value.trim(),
      endereco: enderecoInput.value.trim(),
      disclaimer: disclaimerInput.value.trim(),
      infoCor: infoCorInput.value.trim(),
      background: isCapa ? bgDataUri : bg2DataUri || bgDataUri,
      isCapa: !!isCapa,
      produtos: story.produtos.map((it) => ({
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
    const story = currentStory();
    if (!story) return;
    const state = storyState(story, current === 0);

    if (
      window.StoryTemplate &&
      typeof window.StoryTemplate.renderStoryHtml === "function"
    ) {
      previewSeq++;
      previewFrame.srcdoc = window.StoryTemplate.renderStoryHtml(state);
      return;
    }

    const seq = ++previewSeq;
    try {
      const res = await fetch("/api/stories/render", {
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
    const total = stories.length;
    carouselInfo.textContent = "Story " + (current + 1) + " de " + total;
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
  }

  function renderItems() {
    const story = currentStory();
    if (!story) return;

    const isCapa = current === 0;
    itemsTitle.textContent = isCapa ? "Fotos da capa" : "Fotos deste story";
    if (itemsHint)
      itemsHint.textContent =
        "Os produtos e as fotos vêm das Telas. Para alterá-los, edite a aba Telas.";

    itemsEl.innerHTML = "";
    story.produtos.forEach((it, idx) => {
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
    if (index < 0 || index >= stories.length) return;
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

  // ---- Spreadsheet upload (within Stories tab) ----
  // Feed the shared catalog so the Telas tab builds the pages and republishes
  // them; the stories then mirror the result.
  async function uploadPlanilha(file) {
    const fd = new FormData();
    fd.append("planilha", file);
    fd.append("validadeInicio", validadeInicioInput.value.trim());
    fd.append("validadeFim", validadeFimInput.value.trim());
    const res = await fetch("/api/stories/parse", { method: "POST", body: fd });
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
      carregarBtn.textContent = "Montar stories";
    }
  });

  // ---- Background (campaign art — specific to the Stories tab) ----
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

  // ---- Download current story ----
  downloadLink.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const story = currentStory();
    if (!story) return;
    const isCapa = current === 0;
    const validos = story.produtos.filter((it) => it.nome.trim()).length;
    if (isCapa && validos !== CAPA_PRODUTOS) {
      alert("A capa precisa de exatamente 2 produtos preenchidos (com nome).");
      return;
    }
    if (!isCapa && validos < MIN_PRODUTOS) {
      alert("Este story precisa de 2 a 3 produtos preenchidos (com nome).");
      return;
    }
    downloadLink.classList.add("disabled");
    downloadLink.textContent = "Gerando...";
    genInfo.classList.add("hidden");
    try {
      const body = storyState(story, isCapa);
      const base = nomeArquivoInput.value.trim() || "story";
      body.nomeArquivo = base + "_story_" + String(current + 1).padStart(2, "0");
      const res = await fetch("/api/stories/generate", {
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
      downloadLink.textContent = "Baixar este story";
    }
  });

  // Validate the per-page product-count contract before a batch request, using
  // the same rules the server enforces (capa = exactly 2 named products, every
  // other page 2-3). Empty pages are ignored here (they're skipped server-side).
  // Returns an array of human-readable problems (empty array = OK).
  function batchCountErrors() {
    const problems = [];
    stories.forEach((c, i) => {
      const validos = c.produtos.filter((it) => it.nome.trim()).length;
      if (validos === 0) return;
      if (i === 0) {
        if (validos !== CAPA_PRODUTOS) {
          problems.push("story 1 (capa) precisa de exatamente 2 produtos");
        }
      } else if (validos < MIN_PRODUTOS) {
        problems.push("story " + (i + 1) + " precisa de 2 a 3 produtos");
      }
    });
    return problems;
  }

  // ---- Download all stories (PNG) ----
  downloadAllBtn.addEventListener("click", async () => {
    const vazias = stories.filter((c) => c.produtos.length === 0).length;
    const comProdutos = stories.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhum story tem produtos. Adicione produtos antes de gerar.");
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
            " story(ies) estão sem produtos e serão ignorados. Gerar os " +
            comProdutos +
            " restantes?",
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
        nomeArquivo: nomeArquivoInput.value.trim() || "story",
        stories: stories.map((c, i) => storyState(c, i === 0)),
      };
      const res = await fetch("/api/stories/generate-all", {
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
        " story(ies) gerados" +
        (data.vazias ? " (" + data.vazias + " ignorados por estarem vazios)" : "") +
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
      downloadAllBtn.textContent = "Baixar todos (PNG)";
    }
  });

  // ---- Download all stories as a single PDF ----
  downloadPdfBtn.addEventListener("click", async () => {
    const vazias = stories.filter((c) => c.produtos.length === 0).length;
    const comProdutos = stories.length - vazias;
    if (comProdutos === 0) {
      alert("Nenhum story tem produtos. Adicione produtos antes de gerar.");
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
            " story(ies) estão sem produtos e serão ignorados. Gerar o PDF com os " +
            comProdutos +
            " restantes?",
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
        nomeArquivo: nomeArquivoInput.value.trim() || "story",
        stories: stories.map((c, i) => storyState(c, i === 0)),
      };
      const res = await fetch("/api/stories/generate-pdf", {
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
        " story(ies)" +
        (data.vazias ? " (" + data.vazias + " ignorados por estarem vazios)" : "") +
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
      downloadPdfBtn.textContent = "Baixar todos em PDF";
    }
  });

  // ---------- Snapshot / restauração (progresso automático) ----------
  window.__storiesSnapshot = function () {
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

  window.__storiesRestaurar = function (saved) {
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
