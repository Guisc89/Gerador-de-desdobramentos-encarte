// Seleção do encarte (RS / MS) + roteamento de todas as chamadas /api/ para o
// encarte escolhido. Carregado ANTES dos demais scripts.
(function () {
  var KEY = "encarteWS";
  var ws = localStorage.getItem(KEY);
  if (ws !== "rs" && ws !== "ms") ws = null;

  window.EncarteWS = {
    get ws() {
      return ws || "rs";
    },
    escolhido: false,
    perfil: null,
    nome: function () {
      return (ws || "rs").toUpperCase();
    },
    trocar: function () {
      document.body.appendChild(buildOverlay(true));
    },
    selecionar: selecionar,
  };

  function setWs(novo) {
    ws = novo;
    localStorage.setItem(KEY, novo);
  }

  // Todas as chamadas fetch para /api/ levam o encarte escolhido.
  var origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : input && input.url;
      if (url && url.indexOf("/api/") === 0) {
        init = init || {};
        var headers = new Headers(
          init.headers || (typeof input !== "string" && input.headers) || {},
        );
        headers.set("X-Encarte", window.EncarteWS.ws);
        init.headers = headers;
      }
    } catch (_) {
      /* nunca bloquear a chamada */
    }
    return origFetch(input, init);
  };

  // Links <a href="/api/..."> (downloads) não enviam header — anexa ?ws=.
  document.addEventListener(
    "click",
    function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.indexOf("/api/") !== 0 || href.indexOf("ws=") !== -1) return;
      a.setAttribute(
        "href",
        href + (href.indexOf("?") === -1 ? "?" : "&") + "ws=" + window.EncarteWS.ws,
      );
    },
    true,
  );

  function selecionar(novo, recarregar) {
    if (novo !== "rs" && novo !== "ms") return Promise.reject(new Error("Encarte inválido"));
    var anterior = ws;
    return fetch("/api/session/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: novo }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Não foi possível abrir o encarte.");
        return res.json();
      })
      .then(function () {
        setWs(novo);
        window.EncarteWS.escolhido = true;
        if (recarregar && anterior !== novo) {
          window.location.reload();
          return;
        }
        document.dispatchEvent(new CustomEvent("encarte:ws-escolhido"));
      });
  }

  function buildOverlay(isTroca) {
    var overlay = document.createElement("div");
    overlay.className = "ws-overlay";
    overlay.innerHTML =
      '<div class="ws-modal">' +
      "<h2>Qual encarte você vai trabalhar?</h2>" +
      '<p class="ws-hint">Cada encarte guarda seu próprio progresso: planilha, preçário, telas, cards e stories.</p>' +
      '<div class="ws-options">' +
      '<button type="button" class="ws-opt" data-ws="rs"><strong>Encarte RS</strong><span>Rio Grande do Sul</span></button>' +
      '<button type="button" class="ws-opt" data-ws="ms"><strong>Encarte MS</strong><span>Mato Grosso do Sul</span></button>' +
      "</div>" +
      '<p class="ws-choice-error" role="alert"></p>' +
      (isTroca
        ? '<button type="button" class="ws-cancel">Cancelar</button>'
        : "") +
      "</div>";
    overlay.querySelectorAll(".ws-opt").forEach(function (btn) {
      if (btn.getAttribute("data-ws") === ws) btn.classList.add("ws-opt-atual");
      btn.addEventListener("click", function () {
        var novo = btn.getAttribute("data-ws");
        var botoes = overlay.querySelectorAll("button");
        var erro = overlay.querySelector(".ws-choice-error");
        botoes.forEach(function (item) { item.disabled = true; });
        if (erro) erro.textContent = "";
        selecionar(novo, isTroca)
          .then(function () {
            overlay.remove();
          })
          .catch(function (error) {
            botoes.forEach(function (item) { item.disabled = false; });
            if (erro) erro.textContent = error && error.message
              ? error.message
              : "Não foi possível abrir o encarte.";
          });
      });
    });
    var cancel = overlay.querySelector(".ws-cancel");
    if (cancel) cancel.addEventListener("click", function () { overlay.remove(); });
    return overlay;
  }

  // O servidor registra a escolha por sessão. Assim o Operador sempre escolhe
  // após um novo login, mas um simples recarregamento não pergunta novamente.
  document.addEventListener("DOMContentLoaded", function () {
    fetch("/api/session")
      .then(function (res) {
        if (!res.ok) throw new Error("Sessão inválida");
        return res.json();
      })
      .then(function (session) {
        window.EncarteWS.perfil = session.perfil;
        if (session.perfil === "administrador") {
          if (session.workspace === "rs" || session.workspace === "ms") {
            setWs(session.workspace);
          } else if (!ws) {
            setWs("rs");
          }
          window.EncarteWS.escolhido = true;
          document.dispatchEvent(new CustomEvent("encarte:ws-escolhido"));
          return;
        }

        if (
          session.workspaceConfirmado &&
          (session.workspace === "rs" || session.workspace === "ms")
        ) {
          setWs(session.workspace);
          window.EncarteWS.escolhido = true;
          document.dispatchEvent(new CustomEvent("encarte:ws-escolhido"));
          return;
        }
        document.body.appendChild(buildOverlay(false));
      })
      .catch(function () {
        window.location.href = "/api/login";
      });
  });
})();
