/* Charge le pack membre (Flipcards / Relier) et active le deep-link ?cours=DP-XXX. */
(function () {
  var PACK = window.__MEMBER_PACK__ || "";
  var API = "https://flipcards-auth.cab-pechard.workers.dev";
  var msg = document.getElementById("msg");

  function deny(reason) {
    try { sessionStorage.removeItem("flipcards_ok"); } catch (_) {}
    location.replace("../membre/" + (reason ? ("?err=" + encodeURIComponent(reason)) : ""));
  }

  function packKind(pack) {
    if (pack === "flipcards" || pack === "relier") return "jurisprudence";
    if (pack === "flipcards-dico" || pack === "relier-dico") return "notions";
    return "";
  }

  function patchRelierSeries(html) {
    if (html.indexOf('data-size="all"') === -1) {
      html = html.replace(
        /<button type="button" class="chip chip-size" data-size="3" aria-pressed="true">3<\/button>/,
        '<button type="button" class="chip chip-size" data-size="all" aria-pressed="true">Tout</button>' +
          '<button type="button" class="chip chip-size" data-size="3" aria-pressed="false">3</button>'
      );
    }
    html = html.replace(/let seriesSize = 3;/, "let seriesSize = Infinity;");
    html = html.replace(
      /seriesSize = Number\(btn\.dataset\.size\) \|\| 3;/,
      'seriesSize = btn.dataset.size === "all" ? Infinity : (Number(btn.dataset.size) || Infinity);'
    );
    html = html.replace(
      /return "Tout le set · série de " \+ seriesSize;/,
      'return Number.isFinite(seriesSize) ? "Tout le set · série de " + seriesSize : "Tout le set · toute la série";'
    );
    html = html.replace(
      /bits\.push\("série de " \+ seriesSize\);/,
      'bits.push(Number.isFinite(seriesSize) ? "série de " + seriesSize : "toute la série");'
    );
    return html;
  }

  function patchMemberHtml(html, pack) {
    var kind = packKind(pack);
    if (kind) {
      html = html.replace(
        /(const|let|var)\s+MANIFEST_KIND\s*=\s*null\s*;/,
        'const MANIFEST_KIND = "' + kind + '";'
      );
    }
    if (pack === "relier" || pack === "relier-dico") {
      html = patchRelierSeries(html);
    }
    if (pack === "flipcards" || pack === "relier") {
      if (html.indexOf("gd-filters-pack.js") === -1) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../assets/gd-filters-pack.js?v=2"><\/script></body>'
        );
      }
    }
    html = html.replace(/site-nav\.js\?v=\d+/g, "site-nav.js?v=31");
    if (pack === "flipcards-dico" || pack === "relier-dico") {
      if (html.indexOf("dico-cours-themes.js") === -1) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../dico-cours-themes.js?v=2"><\/script></body>'
        );
      }
    }
    if (!new URLSearchParams(location.search).get("cours")) return html;
    return html.replace(
      /(initCoursFilter\(\)\s*\.then\(\s*(?:\(\)\s*=>|function\s*\(\s*\)\s*)\s*\{)([\s\S]*?)(\n\}\);)/,
      function (_, open, body, close) {
        if (/coursFilter[\s\S]{0,80}enterGame\s*\(/.test(body)) return open + body + close;
        return (
          open +
          body +
          "\n  if (coursFilter && typeof enterGame === \"function\" && (typeof inGame === \"undefined\" || !inGame)) enterGame();" +
          close
        );
      }
    );
  }

  (async function boot() {
    if (!PACK) {
      deny("contenu");
      return;
    }
    var base = (window.FLIPCARDS_AUTH && FLIPCARDS_AUTH.baseUrl) || API || "";
    base = String(base).replace(/\/$/, "");
    if (!base || /EXAMPLE/i.test(base)) {
      deny("api");
      return;
    }
    var token = "";
    try {
      token = (window.FLIPCARDS_AUTH && FLIPCARDS_AUTH.getToken && FLIPCARDS_AUTH.getToken()) || "";
    } catch (_) {}
    if (!token) {
      deny();
      return;
    }
    try {
      var me = await fetch(base + "/api/me", {
        headers: { Authorization: "Bearer " + token }
      });
      if (!me.ok) throw new Error("session");
      if (msg) msg.textContent = "Chargement du contenu…";
      var r = await fetch(base + "/api/content/" + encodeURIComponent(PACK), {
        headers: { Authorization: "Bearer " + token }
      });
      if (!r.ok) {
        var errTxt = "";
        try { errTxt = (await r.json()).error || ""; } catch (_) {}
        throw new Error(errTxt || ("http " + r.status));
      }
      var html = await r.text();
      if (!html || html.length < 200) throw new Error("contenu vide");
      html = patchMemberHtml(html, PACK);
      document.open();
      document.write(html);
      document.close();
    } catch (e) {
      deny((e && e.message) || "contenu");
    }
  })();
})();
