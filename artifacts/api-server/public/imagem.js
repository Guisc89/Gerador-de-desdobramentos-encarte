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

  // Encontra a caixa que contém o produto de fato, descartando bordas vazias
  // (transparentes ou quase brancas). Muitas fotos vêm quadradas com o produto
  // ocupando só uma faixa — sem o recorte, o produto aparece minúsculo no
  // card. Devolve {x, y, w, h} ou null se não houver o que recortar.
  function caixaDoConteudo(img, w, h) {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      var data = ctx.getImageData(0, 0, w, h).data;
      var minX = w, minY = h, maxX = -1, maxY = -1;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4;
          var a = data[i + 3];
          if (a < 20) continue; // transparente = vazio
          // quase branco (fundo de estúdio) = vazio
          if (data[i] > 247 && data[i + 1] > 247 && data[i + 2] > 247) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) return null; // imagem toda vazia — não mexe
      // Decide ANTES de somar a margem: só recorta se o conteúdo bruto ocupar
      // menos de 88% da área. Importante: a margem adicionada abaixo precisa
      // ficar fora dessa conta, senão uma foto já recortada é re-recortada a
      // cada recarregamento (perdendo 2% por vez e re-salvando tudo em loop).
      var rw = maxX - minX + 1;
      var rh = maxY - minY + 1;
      if (rw * rh > w * h * 0.88) return null;
      // Margem de 1% para não colar o produto na borda do card.
      var mx = Math.round(w * 0.01);
      var my = Math.round(h * 0.01);
      minX = Math.max(0, minX - mx);
      minY = Math.max(0, minY - my);
      maxX = Math.min(w - 1, maxX + mx);
      maxY = Math.min(h - 1, maxY + my);
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (e) {
      return null; // canvas contaminado etc. — segue sem recorte
    }
  }

  // Comprime um data URI de imagem. Retorna o próprio URI se já for pequeno,
  // se não for imagem, ou se a compressão não reduzir o tamanho. Com
  // opts.recortar, também apara bordas vazias (mesmo em arquivos pequenos).
  function comprimirDataUri(uri, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 1200;
    var quality = opts.quality || 0.85;
    var limiar = opts.limiar != null ? opts.limiar : LIMIAR;
    if (typeof uri !== "string" || uri.indexOf("data:image") !== 0) {
      return Promise.resolve(uri);
    }
    if (!opts.recortar && uri.length <= limiar) return Promise.resolve(uri);
    return carregarImagem(uri)
      .then(function (img) {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) return uri;
        var caixa = opts.recortar ? caixaDoConteudo(img, w, h) : null;
        if (!caixa && uri.length <= limiar) return uri; // pequeno e sem recorte
        var sx = caixa ? caixa.x : 0;
        var sy = caixa ? caixa.y : 0;
        var sw = caixa ? caixa.w : w;
        var sh = caixa ? caixa.h : h;
        var escala = Math.min(1, maxDim / Math.max(sw, sh));
        var nw = Math.max(1, Math.round(sw * escala));
        var nh = Math.max(1, Math.round(sh * escala));
        var canvas = document.createElement("canvas");
        canvas.width = nw;
        canvas.height = nh;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, nw, nh);
        // WebP comprime muito mais que PNG e preserva transparência (fotos
        // recortadas). Se o navegador não suportar WebP (toDataURL devolve
        // PNG), cai para PNG com alpha / JPEG sem alpha.
        var out = canvas.toDataURL("image/webp", quality);
        if (!out || out.indexOf("data:image/webp") !== 0) {
          out = temTransparencia(ctx, nw, nh)
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", quality);
        }
        if (!out) return uri;
        // Recorte melhora a exibição mesmo que os bytes cresçam um pouco;
        // sem recorte, só troca se ficar menor.
        if (caixa) return out.length < uri.length * 1.5 ? out : uri;
        return out.length < uri.length ? out : uri;
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
              return um(p.foto, { maxDim: 1200, recortar: true }).then(function (f) {
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

  // Migração: comprime e apara bordas vazias das fotos já salvas no mapa
  // global (window.__encarteFotos) e republica cada uma via evento
  // "encarte:fotos" — isso atualiza as telas na hora e dispara o salvamento
  // por-foto, deixando a versão leve persistida no servidor. Roda em todas as
  // fotos (o recorte vale mesmo para arquivos pequenos); as que não precisam
  // de nada voltam idênticas e são ignoradas.
  function comprimirMapaFotos() {
    var store = window.__encarteFotos || {};
    var chaves = Object.keys(store);
    var fila = Promise.resolve();
    chaves.forEach(function (key) {
      var uri = store[key];
      if (typeof uri !== "string" || uri.indexOf("data:image") !== 0) return;
      fila = fila.then(function () {
        return comprimirDataUri(uri, { maxDim: 1200, recortar: true }).then(function (novo) {
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
