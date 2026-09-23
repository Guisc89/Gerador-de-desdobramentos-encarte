(function (root) {
  "use strict";

  var MAX_FILES = 250;
  var MAX_FILE_BYTES = 32 * 1024 * 1024;
  var MAX_TOTAL_BYTES = 256 * 1024 * 1024;
  var encoder = new TextEncoder();
  var crcTable = null;
  var activeDownloads = Object.create(null);
  var unloadRegistered = false;
  var PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

  function table() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    var crc = 0xffffffff;
    var values = table();
    for (var i = 0; i < bytes.length; i += 1) {
      crc = values[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function header(size) {
    return new Uint8Array(size);
  }

  function view(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function safeName(value, fallback) {
    var name = String(value || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return name || fallback;
  }

  function uniqueNames(files) {
    var used = Object.create(null);
    return files.map(function (file, index) {
      var original = safeName(file.filename, "imagem-" + (index + 1) + ".png");
      var dot = original.lastIndexOf(".");
      var stem = dot > 0 ? original.slice(0, dot) : original;
      var ext = dot > 0 ? original.slice(dot) : "";
      var name = original;
      var suffix = 2;
      while (used[name.toLocaleLowerCase()]) {
        name = stem + "-" + suffix + ext;
        suffix += 1;
      }
      used[name.toLocaleLowerCase()] = true;
      return name;
    });
  }

  function workspaceUrl(value, workspace) {
    var raw = String(value || "");
    if (!raw) throw new Error("Um arquivo gerado não possui endereço para download.");
    var ws = workspace || (root.EncarteWS && root.EncarteWS.ws);
    if (ws !== "rs" && ws !== "ms") return raw;
    var base = root.location && root.location.href ? root.location.href : "http://localhost/";
    var parsed;
    try {
      parsed = new URL(raw, base);
    } catch (_) {
      throw new Error("Endereço de download inválido.");
    }
    var sameOrigin = !root.location || !root.location.origin || parsed.origin === root.location.origin;
    if (sameOrigin && parsed.pathname.indexOf("/api/") === 0) {
      parsed.searchParams.set("ws", ws);
    }
    if (raw.charAt(0) === "/" && sameOrigin) return parsed.pathname + parsed.search + parsed.hash;
    return parsed.href;
  }

  function build(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error("Nenhuma imagem foi recebida para criar o ZIP.");
    }
    if (entries.length > MAX_FILES) throw new Error("O ZIP excede o limite de " + MAX_FILES + " imagens.");

    var names = uniqueNames(entries);
    var parts = [];
    var central = [];
    var offset = 0;
    var total = 0;

    entries.forEach(function (entry, index) {
      var bytes = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("A imagem " + names[index] + " excede 32 MB.");
      total += bytes.byteLength;
      if (total > MAX_TOTAL_BYTES) throw new Error("As imagens excedem o limite total de 256 MB.");

      var nameBytes = encoder.encode(names[index]);
      if (nameBytes.byteLength > 65535) throw new Error("Nome de arquivo muito longo para o ZIP.");
      var checksum = crc32(bytes);
      var local = header(30);
      var localView = view(local);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, bytes.byteLength, true);
      localView.setUint32(22, bytes.byteLength, true);
      localView.setUint16(26, nameBytes.byteLength, true);
      parts.push(local, nameBytes, bytes);

      var directory = header(46);
      var directoryView = view(directory);
      directoryView.setUint32(0, 0x02014b50, true);
      directoryView.setUint16(4, 20, true);
      directoryView.setUint16(6, 20, true);
      directoryView.setUint16(8, 0x0800, true);
      directoryView.setUint16(10, 0, true);
      directoryView.setUint32(16, checksum, true);
      directoryView.setUint32(20, bytes.byteLength, true);
      directoryView.setUint32(24, bytes.byteLength, true);
      directoryView.setUint16(28, nameBytes.byteLength, true);
      directoryView.setUint32(42, offset, true);
      central.push(directory, nameBytes);
      offset += local.byteLength + nameBytes.byteLength + bytes.byteLength;
    });

    var centralSize = central.reduce(function (sum, item) { return sum + item.byteLength; }, 0);
    var end = header(22);
    var endView = view(end);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, entries.length, true);
    endView.setUint16(10, entries.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }

  async function fetchEntries(files, options) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error("A geração não retornou imagens para o ZIP.");
    }
    if (files.length > MAX_FILES) throw new Error("O ZIP excede o limite de " + MAX_FILES + " imagens.");
    var names = uniqueNames(files);
    var entries = [];
    var total = 0;
    for (var i = 0; i < files.length; i += 1) {
      var response;
      try {
        response = await root.fetch(workspaceUrl(files[i].downloadUrl, options && options.workspace), {
          credentials: "same-origin",
        });
      } catch (_) {
        throw new Error("Não foi possível baixar " + names[i] + " para montar o ZIP.");
      }
      if (!response.ok) {
        throw new Error("Não foi possível baixar " + names[i] + " para montar o ZIP (HTTP " + response.status + ").");
      }
      var buffer = await response.arrayBuffer();
      var bytes = new Uint8Array(buffer);
      var validPng = bytes.byteLength >= PNG_SIGNATURE.length &&
        PNG_SIGNATURE.every(function (value, index) { return bytes[index] === value; });
      if (!validPng) {
        throw new Error(
          "O download de " + names[i] +
          " não retornou um PNG válido. Sua sessão pode ter expirado; entre novamente e tente de novo.",
        );
      }
      if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("A imagem " + names[i] + " excede 32 MB.");
      total += buffer.byteLength;
      if (total > MAX_TOTAL_BYTES) throw new Error("As imagens excedem o limite total de 256 MB.");
      entries.push({ filename: names[i], data: bytes });
      if (options && options.onProgress) options.onProgress(i + 1, files.length);
    }
    return entries;
  }

  async function create(files, zipFilename, options) {
    options = options || {};
    var capturedWorkspace = options.workspace || (root.EncarteWS && root.EncarteWS.ws);
    var slot = String(options.slot || "default");
    var fetchOptions = {
      workspace: capturedWorkspace,
      onProgress: options.onProgress,
    };
    var entries = await fetchEntries(files, fetchOptions);
    var blob = build(entries);
    var url = URL.createObjectURL(blob);
    var revoked = false;
    if (activeDownloads[slot]) activeDownloads[slot].revoke();
    var download = {
      blob: blob,
      url: url,
      filename: safeName(zipFilename, "imagens.zip").replace(/\.zip$/i, "") + ".zip",
      revoke: function () {
        if (!revoked) {
          URL.revokeObjectURL(url);
          revoked = true;
          if (activeDownloads[slot] === download) delete activeDownloads[slot];
        }
      },
    };
    activeDownloads[slot] = download;
    if (!unloadRegistered && root.addEventListener) {
      // A download can fire beforeunload without actually leaving the page.
      // Revoking there invalidates the ZIP before the browser consumes it.
      root.addEventListener("pagehide", function (event) {
        if (event && event.persisted) return;
        Object.keys(activeDownloads).forEach(function (key) {
          activeDownloads[key].revoke();
        });
      });
      unloadRegistered = true;
    }
    return download;
  }

  root.PngZip = {
    build: build,
    create: create,
    workspaceUrl: workspaceUrl,
    limits: { files: MAX_FILES, fileBytes: MAX_FILE_BYTES, totalBytes: MAX_TOTAL_BYTES },
  };
})(typeof window !== "undefined" ? window : globalThis);