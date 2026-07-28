// Progresso automático por encarte (RS/MS): salva no servidor a etapa em que o
// usuário parou e todo o trabalho em andamento, e restaura ao abrir. Também
// injeta o seletor de encarte na barra lateral, o botão "Finalizar mês" e o
// histórico discreto do mês anterior. Carregado DEPOIS dos demais scripts.
(function () {
  var saveTimer = null;
  var etapaAtual = "precarios";
  var restaurando = false;
  var indicador = null;

  // ---------- Sidebar: chip do encarte + finalizar + histórico ----------
  function injectSidebar() {
    var brand = document.querySelector(".sidebar-brand");
    if (brand) {
      var chip = document.createElement("div");
      chip.className = "ws-chip";
      chip.innerHTML =
        '<span class="ws-chip-label">Encarte <strong>' +
        window.EncarteWS.nome() +
        "</strong></span>" +
        '<button type="button" class="ws-chip-trocar">Trocar</button>';
      chip.querySelector(".ws-chip-trocar").addEventListener("click", function () {
        window.EncarteWS.trocar();
      });
      brand.insertAdjacentElement("afterend", chip);
    }

    var foot = document.querySelector(".sidebar-foot");
    if (foot) {
      indicador = document.createElement("div");
      indicador.className = "ws-save-indicator";
      indicador.textContent = "";
      foot.insertAdjacentElement("beforebegin", indicador);
    }

    // Etapa 5 — Finalizar: botão + histórico dentro do painel.
    var acoes = document.getElementById("finAcoes");
    if (acoes) {
      var fin = document.createElement("button");
      fin.type = "button";
      fin.className = "ws-finalizar";
      fin.textContent = "Finalizar mês do Encarte " + window.EncarteWS.nome();
      fin.addEventListener("click", finalizarMes);
      acoes.appendChild(fin);
      var aviso = document.createElement("p");
      aviso.className = "fin-aviso";
      aviso.textContent =
        "Ao finalizar, o preçário e o PDF auditado atuais são guardados como \"Mês anterior\" e a área fica limpa para a nova campanha.";
      acoes.appendChild(aviso);
    }

    document.addEventListener("encarte:abriu-finalizar", atualizarResumoFinal);
  }

  function atualizarResumoFinal() {
    var resumo = document.getElementById("finResumo");
    if (!resumo) return;
    resumo.innerHTML = '<p class="fin-carregando">Conferindo o que já foi feito…</p>';
    Promise.all([
      fetch("/api/estado").then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("/api/auditado/status").then(function (r) { return r.json(); }).catch(function () { return null; }),
    ]).then(function (res) {
      var estado = res[0] || {};
      var aud = res[1] || {};
      var sv = estado.servidor || null;
      var f = estado.frontend || {};
      var telas = f.telas && Array.isArray(f.telas.telas) ? f.telas.telas.length : 0;
      function item(ok, textoOk, textoFalta) {
        return (
          '<div class="fin-item ' + (ok ? "fin-ok" : "fin-falta") + '">' +
          '<span class="fin-check">' + (ok ? "✓" : "•") + "</span>" +
          "<span>" + (ok ? textoOk : textoFalta) + "</span></div>"
        );
      }
      resumo.innerHTML =
        '<h3>Resumo do Encarte ' + window.EncarteWS.nome() + "</h3>" +
        item(
          sv && sv.produtos && sv.produtos.length,
          "Preçário gerado" + (sv && sv.mes ? " — " + escapeHtml(sv.mes) : "") +
            (sv && sv.produtos ? " (" + sv.produtos.length + " produtos)" : ""),
          "Preçário ainda não gerado (etapa 1)",
        ) +
        item(!!aud.atual, "PDF auditado enviado", "PDF auditado ainda não enviado (etapa 1 — opcional)") +
        item(telas > 0, telas + " telas organizadas", "Telas ainda não organizadas (etapa 2)");
      renderHistorico(estado.historico);
    });
  }

  function renderHistorico(meta) {
    var body = document.getElementById("finHistorico");
    if (!body) return;
    if (!meta) {
      body.innerHTML = "";
      return;
    }
    var quando = "";
    try {
      quando = new Date(meta.finalizadoEm).toLocaleDateString("pt-BR");
    } catch (_) {}
    var html =
      "<h3>Mês anterior</h3>" +
      '<div class="ws-hist-meta">' +
      (meta.mes ? "<strong>" + escapeHtml(meta.mes) + "</strong> · " : "") +
      "finalizado em " + quando +
      "</div><div class='ws-hist-links'>";
    if (meta.temPrecario)
      html += '<a class="btn-download" href="/api/historico/download/precario">Baixar preçário</a>';
    if (meta.temAuditado)
      html += '<a class="btn-download" href="/api/historico/download/auditado">Baixar auditado</a>';
    if (!meta.temPrecario && !meta.temAuditado)
      html += '<span class="ws-hist-vazio">Sem arquivos guardados.</span>';
    body.innerHTML = html + "</div>";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function finalizarMes() {
    var ok = confirm(
      "Finalizar o mês do Encarte " + window.EncarteWS.nome() + "?\n\n" +
        "O material atual (preçário e PDF auditado) vira o \"Mês anterior\" e a área fica limpa para a nova campanha.\n\n" +
        "Atenção: o histórico guarda apenas UM mês — o anterior atual será substituído.",
    );
    if (!ok) return;
    fetch("/api/finalizar", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          alert("Mês finalizado! A página vai recarregar para começar o novo ciclo.");
          window.location.reload();
        } else {
          alert("Erro ao finalizar: " + ((data && data.error) || "desconhecido"));
        }
      })
      .catch(function (err) {
        alert("Erro ao finalizar: " + (err && err.message ? err.message : err));
      });
  }

  // ---------- Autosave ----------
  function collectFrontend() {
    return {
      catalogo: window.__encarteCatalogo || null,
      fotos: window.__encarteFotos || {},
      telas: typeof window.__telasSnapshot === "function" ? window.__telasSnapshot() : null,
      cardsExtras: typeof window.__cardsSnapshot === "function" ? window.__cardsSnapshot() : null,
      storiesExtras: typeof window.__storiesSnapshot === "function" ? window.__storiesSnapshot() : null,
    };
  }

  function markSaved() {
    if (!indicador) return;
    var agora = new Date();
    indicador.textContent =
      "Progresso salvo às " +
      String(agora.getHours()).padStart(2, "0") + ":" +
      String(agora.getMinutes()).padStart(2, "0");
  }

  function saveNow(includeFrontend) {
    var body = { etapa: etapaAtual };
    if (includeFrontend) body.frontend = collectFrontend();
    return fetch("/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (r.ok) markSaved();
      })
      .catch(function () {});
  }

  function scheduleSave() {
    if (restaurando) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveNow(true);
    }, 3000);
  }

  ["encarte:telas", "encarte:fotos", "encarte:catalogo", "encarte:catalogo-update", "encarte:extras"].forEach(
    function (evt) {
      document.addEventListener(evt, scheduleSave);
    },
  );

  // Etapa: acompanha a troca de abas.
  var tabs = document.getElementById("tabs");
  if (tabs) {
    tabs.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest(".nav-item[data-panel]") : null;
      if (!btn) return;
      var painel = btn.getAttribute("data-panel");
      if (painel && painel !== etapaAtual) {
        etapaAtual = painel;
        saveNow(false);
      }
    });
  }

  // Última chance de salvar ao fechar a página.
  window.addEventListener("beforeunload", function () {
    if (!saveTimer) return; // nada pendente
    clearTimeout(saveTimer);
    try {
      var blob = new Blob(
        [JSON.stringify({ etapa: etapaAtual, frontend: collectFrontend() })],
        { type: "application/json" },
      );
      navigator.sendBeacon("/api/estado?ws=" + window.EncarteWS.ws, blob);
    } catch (_) {}
  });

  // ---------- Restauração ----------
  function abrirEtapa(painel) {
    if (typeof window.__irParaPainel === "function") {
      window.__irParaPainel(painel);
    } else {
      var btn = document.querySelector('.nav-item[data-panel="' + painel + '"]');
      if (btn) btn.click();
    }
  }

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "ws-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("show"); }, 30);
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 400);
    }, 4500);
  }

  function restaurar() {
    fetch("/api/estado")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderHistorico(data && data.historico);
        if (!data) return;
        var f = data.frontend || {};
        var temAlgo = false;
        restaurando = true;
        try {
          if (f.fotos && typeof f.fotos === "object") window.__encarteFotos = f.fotos;
          if (f.catalogo && Array.isArray(f.catalogo.produtos)) {
            window.__encarteCatalogo = f.catalogo;
          }
          if (data.servidor && Array.isArray(data.servidor.produtos) && data.servidor.produtos.length > 0) {
            temAlgo = true;
            if (typeof window.__precarioRestaurar === "function") {
              window.__precarioRestaurar(data.servidor);
            }
          }
          if (f.telas && typeof window.__telasRestaurar === "function") {
            temAlgo = true;
            window.__telasRestaurar(f.telas);
          } else if (window.__encarteCatalogo && Array.isArray(window.__encarteCatalogo.produtos)) {
            // Sem organização de telas salva: remonta a partir do catálogo.
            document.dispatchEvent(
              new CustomEvent("encarte:catalogo", { detail: window.__encarteCatalogo }),
            );
          }
          if (f.cardsExtras && typeof window.__cardsRestaurar === "function")
            window.__cardsRestaurar(f.cardsExtras);
          if (f.storiesExtras && typeof window.__storiesRestaurar === "function")
            window.__storiesRestaurar(f.storiesExtras);
        } finally {
          restaurando = false;
        }
        if (data.etapa && data.etapa !== "precarios") {
          etapaAtual = data.etapa;
          abrirEtapa(data.etapa);
        }
        if (temAlgo) {
          var nomes = { precarios: "Preçário", telas: "Telas", cards: "Cards", stories: "Stories", finalizar: "Finalizar" };
          toast(
            "Encarte " + window.EncarteWS.nome() + ": retomando de onde você parou (" +
              (nomes[data.etapa] || "Preçários") + ").",
          );
        }
      })
      .catch(function () {});
  }

  function iniciar() {
    injectSidebar();
    restaurar();
  }

  if (window.EncarteWS.escolhido) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", iniciar);
    } else {
      iniciar();
    }
  } else {
    document.addEventListener("encarte:ws-escolhido", iniciar);
  }
})();
