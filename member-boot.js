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
        '<button type="button" class="chip chip-size" data-size="all" aria-pressed="false">Tout</button>' +
          '<button type="button" class="chip chip-size" data-size="3" aria-pressed="false">3</button>'
      );
    }
    html = html.replace(/(class="chip chip-size"[^>]*aria-pressed=")true(")/g, "$1false$2");
    html = html.replace(/(data-size="10"\s+aria-pressed=")false(")/, "$1true$2");
    if (html.indexOf("RELIER_BOARD_MAX") === -1) {
      html = html.replace(
        /let seriesSize = (?:Infinity|\d+);/,
        "const RELIER_BOARD_MAX = 20;\nlet seriesSize = 10;"
      );
    } else {
      html = html.replace(/let seriesSize = Infinity;/, "let seriesSize = 10;");
    }
    html = html.replace(
      /seriesSize = Number\(btn\.dataset\.size\) \|\| 3;/,
      'seriesSize = btn.dataset.size === "all" ? Infinity : (Number(btn.dataset.size) || 10);'
    );
    html = html.replace(
      /seriesSize = btn\.dataset\.size === "all" \? Infinity : \(Number\(btn\.dataset\.size\) \|\| Infinity\);/,
      'seriesSize = btn.dataset.size === "all" ? Infinity : (Number(btn.dataset.size) || 10);'
    );
    html = html.replace(
      /return "Tout le set · série de " \+ seriesSize;/,
      'return Number.isFinite(seriesSize) ? "Tout le set · série de " + seriesSize : "Tout le set · toute la série";'
    );
    html = html.replace(
      /bits\.push\("série de " \+ seriesSize\);/,
      'bits.push(Number.isFinite(seriesSize) ? "série de " + seriesSize : "toute la série");'
    );
    if (html.indexOf("RELIER_BOARD_MAX") !== -1) {
      html = html.replace(
        /const size = Math\.min\(seriesSize, pool\.length\);/,
        "const size = Number.isFinite(seriesSize) ? Math.min(seriesSize, pool.length, RELIER_BOARD_MAX) : Math.min(pool.length, RELIER_BOARD_MAX);"
      );
      html = html.replace(
        /const need = Math\.min\(seriesSize, n\);/,
        "const need = Number.isFinite(seriesSize) ? Math.min(seriesSize, n, RELIER_BOARD_MAX) : Math.min(n, RELIER_BOARD_MAX);"
      );
    }
    if (html.indexOf('classList.add("is-play")') === -1) {
      html = html.replace(
        /home\.hidden = true;\s*game\.hidden = false;\s*renderBoard\(\);/,
        'home.hidden = true;\n  game.hidden = false;\n  var appPlay = document.getElementById("app");\n  if (appPlay) appPlay.classList.add("is-play");\n  renderBoard();'
      );
      html = html.replace(
        /home\.hidden = false;\s*game\.hidden = true;\s*updateHomeCount\(\);/,
        'home.hidden = false;\n  game.hidden = true;\n  var appPlay = document.getElementById("app");\n  if (appPlay) appPlay.classList.remove("is-play");\n  updateHomeCount();'
      );
    }
    return html;
  }

  function countPackData(html) {
    var match = html.match(/\b(?:const|let|var)\s+DATA\s*=\s*\[/);
    if (!match || match.index == null) return 0;
    var start = html.indexOf("[", match.index);
    if (start < 0) return 0;
    var depth = 0;
    var inStr = false;
    var quote = "";
    var esc = false;
    for (var i = start; i < html.length; i++) {
      var c = html[i];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === "\\") {
          esc = true;
          continue;
        }
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = true;
        quote = c;
        continue;
      }
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          try {
            var parsed = JSON.parse(html.slice(start, i + 1));
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch (_) {
            return 0;
          }
        }
      }
    }
    return 0;
  }

  function patchMemberGuestCopy(html, pack) {
    var fondsN = countPackData(html);
    html = html.replace(/\b8 \/ /g, "");
    html = html.replace(/\b15 \/ /g, "");
    html = html.replace(/\s*\(utilisateurs connectés\)\s*/g, " ");
    html = html.replace(/thème \(page de cours\)/g, "thème");
    html = html.replace(/thème \(page de cours ou une lettre\)/g, "thème ou une lettre");
    if ((pack === "flipcards" || pack === "relier") && fondsN) {
      html = html.replace(/tout le set \(8 cartes\)/g, "tout le set (" + fondsN + " cartes)");
    }
    if ((pack === "flipcards-dico" || pack === "relier-dico") && fondsN) {
      html = html.replace(/tout le set \(8 cartes\)/g, "tout le set (" + fondsN + " cartes)");
    }
    html = html.replace(/\.wrap \{ max-width: 48rem;/g, ".wrap { max-width: 52rem;");
    html = html.replace(/\.wrap\.is-study \{ max-width: 36rem;/g, ".wrap.is-study { max-width: 40rem;");
    html = html.replace(
      ".wrap:has(#screen-game:not([hidden])) { max-width: 68rem; }",
      ".wrap.is-play { max-width: 68rem; }"
    );
    html = html.replace(
      ".wrap { max-width: 68rem; margin: 0 auto; padding: 1.5rem 1rem 0; }",
      ".wrap { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 0; }\n.wrap.is-play { max-width: 68rem; }"
    );
    html = html.replace(/max-width: 48rem;/g, function (m, offset) {
      var slice = html.slice(Math.max(0, offset - 80), offset + 40);
      if (slice.indexOf("fullscreen") !== -1 || slice.indexOf("wrap") !== -1) {
        return "max-width: 52rem;";
      }
      return m;
    });
    html = html.replace(/max-width: 36rem;/g, function (m, offset) {
      var slice = html.slice(Math.max(0, offset - 80), offset + 40);
      if (slice.indexOf("is-study") !== -1 || slice.indexOf("study-main") !== -1) {
        return "max-width: 40rem;";
      }
      return m;
    });
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
    if (pack === "relier") {
      html = html.replace(
        /Associez chaque nom à sa objet/g,
        "Associez chaque décision à sa objet"
      );
      html = html.replace(
        /Associez chaque nom à son objet/g,
        "Associez chaque décision à son objet"
      );
      html = html.replace(
        /const tipW = Math\.min\(352, Math\.max\(220, Math\.min\(wrapRect\.width \* 0\.42, window\.innerWidth \* 0\.42\)\)\);\s*faitsTip\.style\.width = tipW \+ "px";\s*const left = itemRect\.left - wrapRect\.left - tipW - 12;\s*faitsTip\.style\.left = Math\.max\(0, left\) \+ "px";/,
        'const gap = 12;\n  const viewportPad = 8;\n  const available = itemRect.left - viewportPad - gap;\n  let tipW = Math.min(352, Math.max(180, Math.min(wrapRect.width * 0.42, window.innerWidth * 0.32)));\n  if (available >= 140) tipW = Math.min(tipW, available);\n  faitsTip.style.width = tipW + "px";\n  const left = itemRect.left - wrapRect.left - tipW - gap;\n  faitsTip.style.left = left + "px";'
      );
      html = html.replace(
        /faitsTip\.style\.left = Math\.max\(0, left\) \+ "px";/,
        'faitsTip.style.left = left + "px";'
      );
    }
    html = html.replace(/gd-filters-pack\.js\?v=\d+/g, "gd-filters-pack.js?v=4");
    html = html.replace(/gd-importance-stars\.js\?v=\d+/g, "gd-importance-stars.js?v=2");
    html = html.replace(/dico-cours-themes\.js\?v=\d+/g, "dico-cours-themes.js?v=3");
    html = patchMemberGuestCopy(html, pack);
    if (html.indexOf("cours-themes.js") === -1) {
      var placed = false;
      html = html.replace(
        /<script src="[^"]*(?:gd-filters-pack|dico-cours-themes)\.js[^"]*"><\/script>/,
        function (tag) {
          if (placed) return tag;
          placed = true;
          return '<script src="../assets/cours-themes.js?v=1"><\/script>' + tag;
        }
      );
      if (!placed) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../assets/cours-themes.js?v=1"><\/script></body>'
        );
      }
    }
    if (pack === "flipcards" || pack === "relier") {
      if (html.indexOf("gd-filters-pack.js") === -1) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../assets/gd-filters-pack.js?v=4"><\/script></body>'
        );
      }
      if (html.indexOf("gd-importance-stars.js") === -1) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../assets/gd-importance-stars.js?v=2"><\/script></body>'
        );
      }
    }
    html = html.replace(/site-nav\.js\?v=\d+/g, "site-nav.js?v=41");
    if (pack === "flipcards-dico" || pack === "relier-dico") {
      if (html.indexOf("dico-cours-themes.js") === -1) {
        html = html.replace(
          /<\/body>/i,
          '<script src="../dico-cours-themes.js?v=3"><\/script></body>'
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
