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
    escolhido: !!ws,
    nome: function () {
      return (ws || "rs").toUpperCase();
    },
    trocar: function () {
      var overlay = buildOverlay(true);
      document.body.appendChild(overlay);
    },
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
        var headers = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
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

  function buildOverlay(isTroca) {
    var overlay = document.createElement("div");
    overlay.className = "ws-overlay";
    overlay.innerHTML =
      '<div class="ws-modal">' +
      "<h2>Qual encarte você vai trabalhar?</h2>" +
      '<p class="ws-hint">Cada encarte guarda seu próprio progresso: planilha, preçário, telas, cards, stories e PDF auditado.</p>' +
      '<div class="ws-options">' +
      '<button type="button" class="ws-opt" data-ws="rs"><strong>Encarte RS</strong><span>Rio Grande do Sul</span></button>' +
      '<button type="button" class="ws-opt" data-ws="ms"><strong>Encarte MS</strong><span>Mato Grosso do Sul</span></button>' +
      "</div>" +
      (isTroca
        ? '<button type="button" class="ws-cancel">Cancelar</button>'
        : "") +
      "</div>";
    overlay.querySelectorAll(".ws-opt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var novo = btn.getAttribute("data-ws");
        var mudou = novo !== ws;
        setWs(novo);
        overlay.remove();
        if (isTroca && mudou) window.location.reload();
        if (!isTroca) document.dispatchEvent(new CustomEvent("encarte:ws-escolhido"));
      });
    });
    var cancel = overlay.querySelector(".ws-cancel");
    if (cancel) cancel.addEventListener("click", function () { overlay.remove(); });
    return overlay;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ws) document.body.appendChild(buildOverlay(false));
  });
})();
