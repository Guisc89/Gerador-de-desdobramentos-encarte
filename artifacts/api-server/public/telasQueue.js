(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TelasQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CAPA = 2;
  var MIN = 3;
  var MAX = 4;
  var MAX_TELAS = 60;

  function limite(i) {
    return i === 0 ? CAPA : MAX;
  }

  function minimo(i) {
    return i === 0 ? CAPA : MIN;
  }

  function falha(message) {
    return { ok: false, error: message };
  }

  function validar(telas) {
    if (!Array.isArray(telas) || !telas.length)
      return "Não há telas para reorganizar.";
    if (telas.length > MAX_TELAS)
      return "O encarte ultrapassa o limite de 60 telas.";
    var ids = new Set();
    for (var i = 0; i < telas.length; i += 1) {
      var produtos = telas[i] && telas[i].produtos;
      if (!Array.isArray(produtos))
        return "A tela " + (i + 1) + " possui dados inválidos.";
      if (produtos.length < minimo(i) || produtos.length > limite(i))
        return i === 0
          ? "A capa precisa ter exatamente 2 produtos antes da movimentação."
          : "A tela " + (i + 1) + " precisa ter de 3 a 4 produtos antes da movimentação.";
      for (var p = 0; p < produtos.length; p += 1) {
        var id = produtos[p] && produtos[p].id;
        if (id === undefined || id === null)
          return "Todos os produtos precisam ter um identificador.";
        if (ids.has(id))
          return "Há produtos duplicados no encarte. A movimentação foi cancelada.";
        ids.add(id);
      }
    }
    return null;
  }

  function clonar(telas) {
    return telas.map(function (t) {
      return Object.assign({}, t, { produtos: t.produtos.slice() });
    });
  }

  function mover(telas, origemTela, produtoId, destinoTela, posicao) {
    var erro = validar(telas);
    if (erro) return falha(erro);
    if (
      !Number.isInteger(origemTela) ||
      !Number.isInteger(destinoTela) ||
      origemTela < 0 ||
      destinoTela < 0 ||
      origemTela >= telas.length ||
      destinoTela >= telas.length
    ) return falha("Escolha uma tela de origem e uma tela de destino válidas.");

    var origemPos = telas[origemTela].produtos.findIndex(function (p) {
      return p.id === produtoId;
    });
    if (origemPos < 0)
      return falha("O produto não foi encontrado. Nada foi alterado.");

    var maxPos = limite(destinoTela);
    if (!Number.isInteger(posicao) || posicao < 1 || posicao > maxPos)
      return falha("Escolha uma posição válida na tela de destino.");
    if (origemTela === destinoTela && posicao > telas[origemTela].produtos.length)
      return falha("A posição escolhida não existe nesta tela.");

    var copia = clonar(telas);
    var item = copia[origemTela].produtos[origemPos];

    if (origemTela === destinoTela) {
      copia[origemTela].produtos.splice(origemPos, 1);
      copia[origemTela].produtos.splice(posicao - 1, 0, item);
      return { ok: true, telas: copia };
    }

    copia[origemTela].produtos.splice(origemPos, 1);

    // Ao mover para uma tela posterior, o buraco percorre as telas até o
    // destino: cada tela puxa o primeiro produto da próxima. Restaurar a
    // contagem original (e não apenas o mínimo) evita criar uma cauda
    // desnecessária quando origem e destino estavam cheios.
    if (origemTela < destinoTela) {
      for (var f = origemTela; f < destinoTela; f += 1) {
        while (copia[f].produtos.length < telas[f].produtos.length) {
          copia[f].produtos.push(copia[f + 1].produtos.shift());
        }
      }
    }

    if (posicao - 1 > copia[destinoTela].produtos.length)
      return falha("A posição escolhida não existe na tela de destino. Nada foi alterado.");
    copia[destinoTela].produtos.splice(posicao - 1, 0, item);

    // Regra explícita da fila: o último excedente vira o primeiro da próxima.
    for (var i = destinoTela; i < copia.length; i += 1) {
      if (copia[i].produtos.length <= limite(i)) continue;
      var excedente = copia[i].produtos.pop();
      if (i + 1 === copia.length) {
        if (copia.length >= MAX_TELAS)
          return falha("Não foi possível mover: o limite de 60 telas seria ultrapassado.");
        var novoId = "movida-" + copia.length;
        while (copia.some(function (t) { return t.id === novoId; })) novoId += "-nova";
        copia.push({ id: novoId, produtos: [], disclaimer: "" });
      }
      copia[i + 1].produtos.unshift(excedente);
    }

    // Fecha buracos puxando da frente da próxima tela quando ela pode doar.
    for (var a = 0; a < copia.length - 1; a += 1) {
      while (
        copia[a].produtos.length < minimo(a) &&
        copia[a + 1].produtos.length > minimo(a + 1)
      ) copia[a].produtos.push(copia[a + 1].produtos.shift());
    }

    // Se sobrou uma cauda pequena, usa a folga mais próxima à esquerda.
    // Cada transferência é local; telas não são recriadas nem renumeradas.
    for (var u = copia.length - 1; u > 0; u -= 1) {
      while (copia[u].produtos.length < minimo(u)) {
        var doador = u - 1;
        while (doador >= 0 && copia[doador].produtos.length <= minimo(doador)) doador -= 1;
        if (doador < 0)
          return falha(
            "Não foi possível manter 2 produtos na capa e 3 a 4 nas demais telas. Nada foi alterado.",
          );
        for (var b = doador; b < u; b += 1) {
          copia[b + 1].produtos.unshift(copia[b].produtos.pop());
        }
      }
    }

    var finalErro = validar(copia);
    if (finalErro)
      return falha("Não foi possível concluir a movimentação: " + finalErro + " Nada foi alterado.");
    var alvo = copia[destinoTela].produtos[posicao - 1];
    if (!alvo || alvo.id !== produtoId)
      return falha(
        "Não foi possível preservar a posição escolhida sem desorganizar as telas. Nada foi alterado.",
      );
    return { ok: true, telas: copia };
  }

  function restaurarLegais(saved) {
    saved = saved && typeof saved === "object" ? saved : {};
    var versioned = Number(saved.schemaVersion) >= 2;
    return {
      legacyDisclaimer: versioned
        ? saved.legacyDisclaimer || ""
        : saved.legacyDisclaimer || saved.disclaimer || "",
      disclaimers: Array.isArray(saved.telas)
        ? saved.telas.map(function (tela) {
            return versioned &&
                tela &&
                Object.prototype.hasOwnProperty.call(tela, "disclaimer")
              ? tela.disclaimer || ""
              : "";
          })
        : [],
    };
  }

  function legaisCards(telas) {
    return (Array.isArray(telas) ? telas : []).map(function (tela, index) {
      return index === 0 ? "" : (tela && tela.disclaimer) || "";
    });
  }

  function legaisStories(telas, storyCount) {
    var pages = Array.isArray(telas) ? telas : [];
    return Array.from({ length: storyCount }, function (_, index) {
      return index === 0 ? "" : (pages[index] && pages[index].disclaimer) || "";
    });
  }

  // Stories preserve the page boundary and product order from Telas. Returning
  // shallow copies of the product arrays prevents the Stories UI from mutating
  // the queue while keeping every product field (including the keyed photo).
  function espelharStories(telas) {
    return (Array.isArray(telas) ? telas : []).map(function (tela) {
      return Array.isArray(tela && tela.produtos) ? tela.produtos.slice() : [];
    });
  }

  return {
    mover: mover,
    validar: validar,
    restaurarLegais: restaurarLegais,
    legaisCards: legaisCards,
    legaisStories: legaisStories,
    espelharStories: espelharStories,
  };
});