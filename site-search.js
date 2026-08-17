/* Recherche full-text Cours + Dictionnaire + Arrêts (index build-time).
   Dépend de site-nav.js (window.SiteNavAbs) si présent ; sinon résout via currentScript. */
(function () {
  const script = document.currentScript;
  const root = new URL("./", script.src).href;

  function abs(path) {
    if (typeof window.SiteNavAbs === "function") {
      return window.SiteNavAbs(path);
    }
    return new URL(String(path || "").replace(/^\//, ""), root).href;
  }

  const SECTION_LABEL = {
    manuel: "Cours",
    dictionnaire: "Dictionnaire",
    arrets: "Arrêts",
  };

  const ACCENT_MAP = {
    à: "a", á: "a", â: "a", ä: "a", ã: "a",
    é: "e", è: "e", ê: "e", ë: "e",
    î: "i", ï: "i", í: "i",
    ô: "o", ö: "o", ó: "o", õ: "o",
    ù: "u", û: "u", ü: "u", ú: "u",
    ç: "c", ñ: "n", œ: "oe", æ: "ae",
  };

  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[àáâäãéèêëîïíôöóõùûüúçñœæ]/g, (ch) => ACCENT_MAP[ch] || ch);
  }

  function tokens(s) {
    return fold(s)
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length >= 2);
  }

  let docs = [];
  let loaded = false;
  let loading = null;

  function loadIndex() {
    if (loaded) return Promise.resolve(docs);
    if (loading) return loading;
    loading = fetch(abs("search-index.json"), { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("index " + r.status);
        return r.json();
      })
      .then((data) => {
        docs = Array.isArray(data.docs) ? data.docs : [];
        loaded = true;
        return docs;
      })
      .catch((err) => {
        console.warn("[site-search] index indisponible", err);
        docs = [];
        loaded = true;
        return docs;
      });
    return loading;
  }

  function scoreDoc(doc, queryTokens, rawFolded) {
    const titleF = fold(doc.title || "");
    const textF = fold(doc.text || "");
    let score = 0;
    if (rawFolded && titleF.indexOf(rawFolded) !== -1) score += 40;
    if (rawFolded && textF.indexOf(rawFolded) !== -1) score += 8;
    for (const tok of queryTokens) {
      if (titleF.indexOf(tok) !== -1) score += 12;
      else if (textF.indexOf(tok) !== -1) score += 3;
      else return 0; // AND : tous les tokens doivent matcher
    }
    return score;
  }

  function search(query, limit) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const qTokens = tokens(q);
    if (!qTokens.length) return [];
    const rawFolded = fold(q);
    const hits = [];
    for (let i = 0; i < docs.length; i++) {
      const s = scoreDoc(docs[i], qTokens, rawFolded);
      if (s > 0) hits.push({ doc: docs[i], score: s });
    }
    hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, "fr"));
    return hits.slice(0, limit || 40);
  }

  function ensureUI() {
    const nav = document.querySelector(".site-nav");
    if (!nav || nav.querySelector(".site-nav-search")) return null;

    const wrap = document.createElement("div");
    wrap.className = "site-nav-search";
    wrap.innerHTML =
      '<label class="site-nav-search-label" for="site-search-input">' +
        '<span class="visually-hidden">Rechercher</span>' +
        '<input id="site-search-input" class="site-nav-search-input" type="search" ' +
          'placeholder="Rechercher (cours, dictionnaire, arrêts…)" autocomplete="off" ' +
          'spellcheck="false" enterkeyhint="search" />' +
      "</label>" +
      '<div class="site-nav-search-panel" hidden role="listbox" aria-label="Résultats de recherche"></div>';

    const brand = nav.querySelector(".site-nav-brand");
    const links = nav.querySelector(".site-nav-links");
    if (brand && brand.parentNode === nav) {
      nav.insertBefore(wrap, brand.nextSibling);
    } else if (links && links.parentNode === nav) {
      nav.insertBefore(wrap, links);
    } else {
      nav.appendChild(wrap);
    }
    return wrap;
  }

  function render(panel, hits, query) {
    if (!hits.length) {
      panel.innerHTML =
        '<p class="site-nav-search-empty">Aucun résultat pour « ' +
        escapeHtml(query) +
        " ».</p>";
      panel.hidden = false;
      return;
    }
    const sections = { manuel: [], dictionnaire: [], arrets: [] };
    hits.forEach((h) => {
      const sec = h.doc.section;
      if (sections[sec]) sections[sec].push(h);
      else sections.manuel.push(h);
    });
    let html = "";
    ["manuel", "dictionnaire", "arrets"].forEach((sec) => {
      const group = sections[sec];
      if (!group.length) return;
      html +=
        '<p class="site-nav-search-group">' +
        escapeHtml(SECTION_LABEL[sec] || sec) +
        " · " +
        group.length +
        "</p>";
      group.forEach((h) => {
        const url = abs(h.doc.url);
        html +=
          '<a class="site-nav-search-hit" role="option" href="' +
          url +
          '">' +
          '<span class="site-nav-search-hit-title">' +
          escapeHtml(h.doc.title) +
          "</span>" +
          '<span class="site-nav-search-hit-excerpt">' +
          escapeHtml(h.doc.excerpt || "") +
          "</span>" +
          "</a>";
      });
    });
    panel.innerHTML = html;
    panel.hidden = false;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init() {
    const wrap = ensureUI();
    if (!wrap) return;
    const input = wrap.querySelector(".site-nav-search-input");
    const panel = wrap.querySelector(".site-nav-search-panel");
    let timer = null;

    function run() {
      const q = input.value;
      if (q.trim().length < 2) {
        panel.hidden = true;
        panel.innerHTML = "";
        return;
      }
      loadIndex().then(() => {
        render(panel, search(q, 36), q.trim());
      });
    }

    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(run, 160);
    });
    input.addEventListener("focus", () => {
      loadIndex();
      if (input.value.trim().length >= 2) run();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        panel.hidden = true;
        input.blur();
      }
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.hidden = true;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
