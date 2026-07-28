// Compressão de imagens no navegador (window.EncarteImg).
//
// Por quê: as fotos entravam no sistema em tamanho original (base64). No app
// publicado há um limite de ~32MB por requisição — o autosave e o "Baixar
// todas em PDF" estouravam esse teto e o proxy devolvia uma página HTML de
// erro ("Unexpected token '<' ... is not valid JSON"). Comprimir aqui resolve
// na origem: fotos de produto não precisam de mais que ~1200px (são exibidas
// em miniaturas de ~300px, renderizadas em até 3x), e fundos ~2600px.
(function () {
  var LIMIAR = 150 * 1024; // abaixo disso (chars base64), não vale a pena mexer

  function carregarImagem(uri) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("imagem inválida")); };
      img.src = uri;
    });
  }

  function temTransparencia(ctx, w, h) {
    try {
      var data = ctx.getImageData(0, 0, w, h).data;
      // Amostragem: checa 1 a cada ~64 pixels, suficiente para detectar alpha.
      for (var i = 3; i < data.length; i += 256) {
        if (data[i] < 250) return true;
      }
      return false;
    } catch (e) {
      return true; // na dúvida, preserva (PNG)
    }
  }

  // Comprime um data URI de imagem. Retorna o próprio URI se já for pequeno,
  // se não for imagem, ou se a compressão não reduzir o tamanho.
  function comprimirDataUri(uri, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 1200;
    var quality = opts.quality || 0.85;
    var limiar = opts.limiar != null ? opts.limiar : LIMIAR;
    if (typeof uri !== "string" || uri.indexOf("data:image") !== 0) {
      return Promise.resolve(uri);
    }
    if (uri.length <= limiar) return Promise.resolve(uri);
    return carregarImagem(uri)
      .then(function (img) {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return uri;
        var escala = Math.min(1, maxDim / Math.max(w, h));
        var nw = Math.max(1, Math.round(w * escala));
        var nh = Math.max(1, Math.round(h * escala));
        var canvas = document.createElement("canvas");
        canvas.width = nw;
        canvas.height = nh;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, nw, nh);
        // WebP comprime muito mais que PNG e preserva transparência (fotos
        // recortadas). Se o navegador não suportar WebP (toDataURL devolve
        // PNG), cai para PNG com alpha / JPEG sem alpha.
        var out = canvas.toDataURL("image/webp", quality);
        if (!out || out.indexOf("data:image/webp") !== 0) {
          out = temTransparencia(ctx, nw, nh)
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", quality);
        }
        return out && out.length < uri.length ? out : uri;
      })
      .catch(function () { return uri; });
  }

  // Lê um arquivo/blob e devolve o data URI já comprimido.
  function comprimirBlob(blob, opts) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }).then(function (uri) { return comprimirDataUri(uri, opts); });
  }

  // Passa um lote de estados de tela ({background, produtos:[{foto}]}) pela
  // compressão antes de enviar ao servidor (protege dados antigos, salvos
  // antes da compressão existir). Cache por URI: o mesmo fundo repetido em
  // todas as telas é comprimido uma vez só.
  function comprimirTelasPayload(estados) {
    var cache = {};
    function um(uri, opts) {
      if (typeof uri !== "string" || uri.indexOf("data:image") !== 0) {
        return Promise.resolve(uri);
      }
      if (!cache[uri]) cache[uri] = comprimirDataUri(uri, opts);
      return cache[uri];
    }
    return Promise.all(
      estados.map(function (s) {
        return Promise.all([
          um(s.background, { maxDim: 2600, quality: 0.9 }),
          Promise.all(
            (s.produtos || []).map(function (p) {
              return um(p.foto, { maxDim: 1200 }).then(function (f) {
                if (f !== p.foto) p.foto = f;
              });
            }),
          ),
        ]).then(function (r) {
          if (r[0] !== s.background) s.background = r[0];
          return s;
        });
      }),
    );
  }

  // Migração única: comprime fotos grandes já salvas no mapa global
  // (window.__encarteFotos) e republica cada uma via evento "encarte:fotos" —
  // isso atualiza as telas na hora e dispara o salvamento por-foto, deixando a
  // versão leve persistida no servidor.
  function comprimirMapaFotos() {
    var store = window.__encarteFotos || {};
    var chaves = Object.keys(store);
    var fila = Promise.resolve();
    chaves.forEach(function (key) {
      var uri = store[key];
      if (typeof uri !== "string" || uri.length <= LIMIAR) return;
      fila = fila.then(function () {
        return comprimirDataUri(uri, { maxDim: 1200 }).then(function (novo) {
          // Só aplica se ninguém trocou a foto enquanto comprimíamos.
          if (novo !== uri && window.__encarteFotos && window.__encarteFotos[key] === uri) {
            window.__encarteFotos[key] = novo;
            document.dispatchEvent(
              new CustomEvent("encarte:fotos", { detail: { key: key, foto: novo } }),
            );
          }
        });
      });
    });
    return fila;
  }

  window.EncarteImg = {
    comprimirDataUri: comprimirDataUri,
    comprimirBlob: comprimirBlob,
    comprimirTelasPayload: comprimirTelasPayload,
    comprimirMapaFotos: comprimirMapaFotos,
  };
})();
