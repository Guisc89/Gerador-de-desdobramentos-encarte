// Progresso automático por encarte (RS/MS): salva no servidor a etapa em que o
// usuário parou e todo o trabalho em andamento, e restaura ao abrir. Também
// injeta o seletor de encarte na barra lateral, o botão "Finalizar mês" e o
// histórico discreto do mês anterior. Carregado DEPOIS dos demais scripts.
(function () {
  var saveTimer = null;
  var etapaAtual = "precarios";
  var restaurando = false;
  var indicador = null;
  var estadoVersao = null;
  var polling = false;
  var atualizacaoPendente = false;
  var iniciado = false;
  window.__encarteEstadoVersao = null;

  function setEstadoVersao(version) {
    estadoVersao = version;
    window.__encarteEstadoVersao = version;
  }

  // ---------- Sidebar: seletor administrativo + finalizar + histórico ----------
  function injectSidebar() {
    var brand = document.querySelector(".sidebar-brand");
    if (brand && window.EncarteWS.perfil === "administrador") {
      var switcher = document.createElement("div");
      switcher.className = "ws-admin-switch";
      switcher.setAttribute("aria-label", "Alternar encarte");
      switcher.innerHTML =
        '<span class="ws-admin-label">' +
        '<span class="ws-admin-kicker">Encarte ativo</span>' +
        "<strong>Trocar região</strong>" +
        "</span>" +
        '<div class="ws-admin-options">' +
        '<button type="button" data-ws="rs">RS</button>' +
        '<button type="button" data-ws="ms">MS</button>' +
        "</div>";
      switcher.querySelectorAll("button").forEach(function (button) {
        var selecionado = button.getAttribute("data-ws") === window.EncarteWS.ws;
        button.classList.toggle("active", selecionado);
        button.setAttribute("aria-pressed", selecionado ? "true" : "false");
        button.addEventListener("click", function () {
          var novo = button.getAttribute("data-ws");
          if (novo === window.EncarteWS.ws) return;
          switcher.querySelectorAll("button").forEach(function (item) {
            item.disabled = true;
          });
          window.EncarteWS.selecionar(novo, true).catch(function () {
            switcher.querySelectorAll("button").forEach(function (item) {
              item.disabled = false;
            });
            toast("Não foi possível trocar de encarte. Tente novamente.");
          });
        });
      });
      brand.insertAdjacentElement("afterend", switcher);
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
        "Ao finalizar, o preçário e a composição de Telas, Cards e Stories ficam guardados no \"Mês anterior\", com download em PDF. A área fica limpa para a nova campanha.";
      acoes.appendChild(aviso);
    }

    document.addEventListener("encarte:abriu-finalizar", atualizarResumoFinal);
  }

  function atualizarResumoFinal() {
    var resumo = document.getElementById("finResumo");
    if (!resumo) return;
    resumo.innerHTML = '<p class="fin-carregando">Conferindo o que já foi feito…</p>';
    fetch("/api/estado")
      .then(function (r) { return r.json(); })
      .catch(function () { return null; })
      .then(function (res) {
      var estado = res || {};
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
    var nomes = { telas: "Telas", cards: "Cards", stories: "Stories" };
    var materiais = Array.isArray(meta.materiais) ? meta.materiais.filter(function (tipo) {
      return Object.prototype.hasOwnProperty.call(nomes, tipo);
    }) : [];
    materiais.forEach(function (tipo) {
      html += '<button type="button" class="btn-download" data-historico-pdf="' +
        tipo + '">Baixar ' + nomes[tipo] + ' (PDF)</button>';
    });
    if (!meta.temPrecario && !materiais.length)
      html += '<span class="ws-hist-vazio">Sem arquivos guardados.</span>';
    body.innerHTML = html + "</div>";
    var status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    body.appendChild(status);
    var ws = window.EncarteWS.ws;
    body.querySelectorAll("[data-historico-pdf]").forEach(function (button) {
      button.addEventListener("click", function () {
        baixarHistoricoPdf(button, status, ws, meta.archiveId, nomes);
      });
    });
  }

  async function baixarHistoricoPdf(button, status, ws, archiveId, nomes) {
    var tipo = button.getAttribute("data-historico-pdf");
    var original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando " + nomes[tipo] + "…";
    status.textContent = "Preparando o PDF do mês anterior. Aguarde nesta página.";
    var endpoint = "/api/historico/pdf/" + tipo + "?ws=" + encodeURIComponent(ws) +
      "&archiveId=" + encodeURIComponent(archiveId || "");
    var deadline = Date.now() + 15 * 60 * 1000;
    var firstRequest = true;
    try {
      while (Date.now() < deadline) {
        var response = await fetch(endpoint + (firstRequest ? "&retry=1" : ""), { method: "POST" });
        firstRequest = false;
        var data = await response.json().catch(function () {
          throw new Error("Não foi possível consultar o PDF. Tente novamente.");
        });
        if (!response.ok) throw new Error(data.error || "Não foi possível gerar o PDF.");
        if (response.status === 202) {
          await new Promise(function (resolve) {
            setTimeout(resolve, Math.min(Math.max(Number(data.retryAfterMs) || 2000, 1000), 5000));
          });
          continue;
        }
        if (!data.downloadUrl) throw new Error("O servidor não informou o arquivo para download.");
        var link = document.createElement("a");
        link.href = data.downloadUrl;
        link.className = "btn-download";
        link.textContent = "Baixar PDF de " + nomes[tipo];
        link.download = "";
        status.textContent = "PDF pronto. Se o download não começar, clique aqui: ";
        status.appendChild(link);
        link.click();
        return;
      }
      throw new Error("O PDF ainda não ficou pronto. Tente novamente em alguns instantes.");
    } catch (error) {
      status.textContent = error && error.message ? error.message : "Erro ao preparar PDF.";
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  async function finalizarMes() {
    if (estadoVersao === null) {
      alert("Aguarde o encarte terminar de carregar antes de finalizar.");
      return;
    }
    var ok = confirm(
      "Finalizar o mês do Encarte " + window.EncarteWS.nome() + "?\n\n" +
        "O preçário e a composição de Telas, Cards e Stories ficam no \"Mês anterior\" para baixar em PDF. A área fica limpa para a nova campanha.\n\n" +
        "Atenção: o histórico guarda apenas UM mês — o anterior atual será substituído.",
    );
    if (!ok) return;
    var button = document.querySelector(".ws-finalizar");
    if (button && button.disabled) return;
    if (button) button.disabled = true;
    // Archive the latest complete composition, not an older autosave snapshot.
    var waitUntil = Date.now() + 15000;
    while ((salvandoAgora || salvandoFoto || restaurando) && Date.now() < waitUntil) {
      await new Promise(function (resolve) { setTimeout(resolve, 200); });
    }
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var saved = await saveNow(true);
    if (!saved || dirty || salvandoFoto || atualizacaoPendente || restaurando) {
      if (button) button.disabled = false;
      alert("Aguarde o progresso ser salvo e confira as alterações antes de finalizar. Nenhum material foi apagado.");
      return;
    }
    return fetch("/api/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: estadoVersao }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          alert("Mês finalizado! A página vai recarregar para começar o novo ciclo.");
          window.location.reload();
        } else if (result.status === 409 || result.status === 428) {
          receberAtualizacaoRemota();
          alert(
            "O encarte mudou em outra sessão. A versão atual foi carregada; confira antes de finalizar novamente.",
          );
        } else {
          alert(
            "Erro ao finalizar: " +
              ((result.data && result.data.error) || "desconhecido"),
          );
        }
      })
      .catch(function (err) {
        alert("Erro ao finalizar: " + (err && err.message ? err.message : err));
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  }

  // ---------- Autosave ----------
  function collectFrontend() {
    return {
      catalogo: window.__encarteCatalogo || null,
      fotos: window.__encarteFotos || {},
      // Chaves para o servidor APAGAR (renomeações/remoções) — o merge do
      // servidor nunca apaga por ausência, só por pedido explícito.
      fotosRemovidas: Object.keys(window.__encarteFotosRemovidas || {}),
      telas: typeof window.__telasSnapshot === "function" ? window.__telasSnapshot() : null,
      cardsExtras: typeof window.__cardsSnapshot === "function" ? window.__cardsSnapshot() : null,
      storiesExtras: typeof window.__storiesSnapshot === "function" ? window.__storiesSnapshot() : null,
    };
  }

  // "Sujo" = há mudanças ainda não confirmadas pelo servidor. Só limpa quando
  // um save com frontend completo responde OK. Em falha, reagenda sozinho.
  var dirty = false;
  var retryDelay = 3000;
  var salvandoAgora = false;
  var salvandoFoto = false;

  function markSaved() {
    if (!indicador) return;
    var agora = new Date();
    indicador.classList.remove("save-erro");
    indicador.textContent =
      "Progresso salvo às " +
      String(agora.getHours()).padStart(2, "0") + ":" +
      String(agora.getMinutes()).padStart(2, "0");
  }

  function markSaveFailed() {
    if (!indicador) return;
    indicador.classList.add("save-erro");
    indicador.textContent = "Não foi possível salvar — tentando de novo…";
  }

  function saveNow(includeFrontend) {
    if (salvandoAgora || salvandoFoto) {
      // Já existe um save em voo (pode ser um save só de etapa, que não
      // reagenda nada ao terminar) — reagenda explicitamente para não perder.
      if (includeFrontend) scheduleSave(500);
      return Promise.resolve(false);
    }
    if (estadoVersao === null || restaurando) {
      if (includeFrontend) scheduleSave(500);
      return Promise.resolve(false);
    }
    var body = { etapa: etapaAtual, version: estadoVersao };
    if (includeFrontend) {
      body.frontend = collectFrontend();
      dirty = false; // otimista; refeito em caso de falha
    }
    salvandoAgora = true;
    return fetch("/api/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          salvandoAgora = false;
          if (r.ok) {
            if (typeof data.version === "string") setEstadoVersao(data.version);
            retryDelay = 3000;
            if (atualizacaoPendente) {
              receberAtualizacaoRemota();
            } else if (includeFrontend && dirty) {
              // Chegaram mudanças enquanto salvava — salva de novo em seguida.
              scheduleSave(1000);
            } else if (includeFrontend) {
              markSaved();
            }
            return true;
          }
          if (r.status === 409 || r.status === 428) {
            receberAtualizacaoRemota();
            return false;
          }
          onSaveError(includeFrontend);
        });
      })
      .catch(function () {
        salvandoAgora = false;
        onSaveError(includeFrontend);
      });
  }

  function onSaveError(includeFrontend) {
    if (!includeFrontend) return;
    // NUNCA descartar mudanças em silêncio: marca como pendente, avisa o
    // usuário e tenta de novo com espera crescente (máx. 30s).
    dirty = true;
    markSaveFailed();
    scheduleSave(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  function scheduleSave(delayMs) {
    if (restaurando) return;
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveNow(true);
    }, typeof delayMs === "number" ? delayMs : 3000);
  }

  ["encarte:telas", "encarte:catalogo", "encarte:catalogo-update", "encarte:extras"].forEach(
    function (evt) {
      document.addEventListener(evt, function () { scheduleSave(); });
    },
  );
  document.addEventListener("encarte:estado-versao", function (ev) {
    if (ev && typeof ev.detail === "string") setEstadoVersao(ev.detail);
  });
  document.addEventListener("encarte:estado-conflito", function () {
    receberAtualizacaoRemota();
  });
  // Fotos são o dado mais precioso (e o mais pesado de refazer). Duas camadas:
  // 1) salva SÓ a foto imediatamente (pacote pequeno, sobrevive a quedas);
  // 2) o autosave completo continua como pano de fundo.
  function salvarFoto(key, foto, tentativa) {
    if (salvandoAgora || salvandoFoto || estadoVersao === null || restaurando) {
      setTimeout(function () { salvarFoto(key, foto, tentativa); }, 400);
      return;
    }
    salvandoFoto = true;
    fetch("/api/estado/foto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, foto: foto, version: estadoVersao }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          salvandoFoto = false;
          if (r.ok) {
            if (typeof data.version === "string") setEstadoVersao(data.version);
            return;
          }
          if (r.status === 409 || r.status === 428) {
            receberAtualizacaoRemota();
            return;
          }
          throw new Error("HTTP " + r.status);
        });
      })
      .catch(function () {
        salvandoFoto = false;
        var n = (tentativa || 0) + 1;
        if (n <= 3) setTimeout(function () { salvarFoto(key, foto, n); }, n * 2000);
        else markSaveFailed();
      });
  }
  document.addEventListener("encarte:fotos", function (ev) {
    var d = (ev && ev.detail) || {};
    if (!restaurando && d.key) salvarFoto(d.key, d.foto || null, 0);
    scheduleSave(800);
  });

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

  // Última chance de salvar ao fechar a página. Atenção: sendBeacon tem limite
  // de ~64KB na maioria dos navegadores — com fotos em base64 o pacote completo
  // quase sempre estoura. Por isso: (1) tenta fetch keepalive primeiro (aceita
  // corpos maiores em alguns navegadores), (2) o beacon é só reserva, e (3) a
  // proteção real é o autosave com retentativa acima — não este handler.
  function salvarAoSair() {
    if (!dirty && !saveTimer) return; // nada pendente
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    var payload = JSON.stringify({
      etapa: etapaAtual,
      frontend: collectFrontend(),
      version: estadoVersao,
    });
    var url = "/api/estado?ws=" + window.EncarteWS.ws;
    var enviado = false;
    try {
      // Chromium rejeita keepalive com corpo >64KB — a rejeição é assíncrona,
      // então também tentamos o beacon como reserva sempre que possível.
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
      enviado = payload.length < 60000;
    } catch (_) {}
    if (!enviado) {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      } catch (_) {}
    }
  }
  window.addEventListener("pagehide", salvarAoSair);
  window.addEventListener("beforeunload", salvarAoSair);

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

  function receberAtualizacaoRemota() {
    if (salvandoAgora || salvandoFoto) {
      atualizacaoPendente = true;
      return;
    }
    atualizacaoPendente = false;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // A versão mais recente vence, conforme a regra de colaboração escolhida.
    dirty = false;
    restaurar(true);
  }

  function restaurar(remoto) {
    if (restaurando) return Promise.resolve();
    restaurando = true;
    return fetch("/api/estado", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Não foi possível carregar o encarte.");
        return r.json();
      })
      .then(function (data) {
        renderHistorico(data && data.historico);
        if (!data) return;
        if (typeof data.version === "string") setEstadoVersao(data.version);
        var f = data.frontend || {};
        var temAlgo = false;

        // Estado vazio recebido remotamente significa que outra sessão
        // finalizou o mês. Recarregar é a forma segura de limpar todos os
        // módulos que mantêm estado interno próprio.
        if (
          remoto &&
          !data.servidor &&
          Object.keys(f).length === 0
        ) {
          window.location.reload();
          return;
        }

        try {
          window.__encarteFotos =
            f.fotos && typeof f.fotos === "object" ? f.fotos : {};
          if (f.catalogo && Array.isArray(f.catalogo.produtos)) {
            window.__encarteCatalogo = f.catalogo;
          } else {
            window.__encarteCatalogo = null;
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
        // Migração única: fotos grandes salvas antes da compressão existir são
        // comprimidas agora e re-salvas (leves) via evento "encarte:fotos".
        if (!remoto && window.EncarteImg) {
          setTimeout(function () { window.EncarteImg.comprimirMapaFotos(); }, 2000);
        }
        if (data.etapa) {
          etapaAtual = data.etapa;
          abrirEtapa(data.etapa);
        }
        if (temAlgo) {
          var nomes = { precarios: "Preçário", telas: "Telas", cards: "Cards", stories: "Stories", finalizar: "Finalizar" };
          if (remoto) {
            toast("Encarte " + window.EncarteWS.nome() + " atualizado por outra sessão.");
          } else {
            toast(
              "Encarte " + window.EncarteWS.nome() + ": retomando de onde você parou (" +
                (nomes[data.etapa] || "Preçários") + ").",
            );
          }
        }
      })
      .catch(function () {
        restaurando = false;
      });
  }

  function consultarAtualizacoes() {
    if (
      polling ||
      restaurando ||
      estadoVersao === null ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    polling = true;
    fetch("/api/estado/versao", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Falha ao consultar versão");
        return r.json();
      })
      .then(function (data) {
        if (
          data &&
          typeof data.version === "string" &&
          data.version !== estadoVersao
        ) {
          receberAtualizacaoRemota();
        }
      })
      .catch(function () {})
      .finally(function () {
        polling = false;
      });
  }

  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    injectSidebar();
    restaurar(false).then(function () {
      setInterval(consultarAtualizacoes, 3000);
    });
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
