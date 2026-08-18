/* Bandeau site : brand + liens + état connexion (email).
   Dépend de auth.js (FLIPCARDS_AUTH). Placer après auth.js. */
(function () {
  const script = document.currentScript;
  const root = new URL("./", script.src).href;

  function abs(path) {
    return new URL(path.replace(/^\//, ""), root).href;
  }
  // Exposé pour site-search.js (même racine d'assets)
  window.SiteNavAbs = abs;

  function applyFondsCount(kind, n) {
    const count = Number(n);
    if (!count) return;
    if (kind === "jurisprudence") window.FONDS_JURISPRUDENCE_COUNT = count;
    if (kind === "dictionnaire") window.FONDS_DICTIONNAIRE_COUNT = count;
    document.querySelectorAll('[data-fonds-count="' + kind + '"]').forEach((el) => {
      el.textContent = String(count);
    });
  }

  function loadFondsCounts() {
    const juris = fetch(abs("chronologie/data/chronology-meta.json"), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        const n = meta && (Number(meta.count) || (Array.isArray(meta.decisions) && meta.decisions.length));
        applyFondsCount("jurisprudence", n);
        return n || 0;
      })
      .catch(() => 0);
    const dico = fetch(abs("dictionnaire/entries-meta.json"), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        const n = meta && (Number(meta.count) || (Array.isArray(meta.entries) && meta.entries.length));
        applyFondsCount("dictionnaire", n);
        return n || 0;
      })
      .catch(() => 0);
    return Promise.all([juris, dico]);
  }

  loadFondsCounts();

  if (!document.querySelector('link[rel="icon"]')) {
    const fav = document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/svg+xml";
    fav.href = abs("favicon.svg");
    document.head.appendChild(fav);
  }

  const header = document.createElement("header");
  header.className = "site-nav";
  header.innerHTML =
    '<a class="site-nav-brand" href="' + abs("index.html") + '">' +
      '<span class="site-nav-kicker"><span class="brand-part-primary">Les Ressources</span> <span class="brand-part-secondary">Universitaires</span></span>' +
      '<span class="site-nav-product"><em>Droit</em> public et administratif</span>' +
    "</a>" +
    '<nav class="site-nav-links" aria-label="Navigation">' +
      '<a data-nav="home" href="' + abs("index.html") + '">Accueil</a>' +
      '<a data-nav="bibliotheque" href="' + abs("bibliotheque-universitaire/") + '">BU</a>' +
      '<a data-nav="ressources" href="' + abs("cours-magistral/") + '">Cours</a>' +
      '<a data-nav="exercices" href="' + abs("travaux-diriges/") + '">Salles de TD</a>' +
      '<a data-nav="checkout" href="' + abs("checkout/") + '">Inscriptions</a>' +
      '<span class="site-nav-guest">' +
        '<a data-nav="membre" href="' + abs("membre/") + '">Espace pédagogique</a>' +
      "</span>" +
      '<span class="site-nav-auth" hidden>' +
        '<a class="site-nav-user" href="' + abs("membre/compte/") + '" title="Mon compte">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<circle cx="12" cy="8" r="3.75"/>' +
            '<path d="M4.5 20.25c0-3.6 3.35-6.25 7.5-6.25s7.5 2.65 7.5 6.25v.75H4.5v-.75z"/>' +
          "</svg>" +
          '<span data-nav-email></span>' +
        "</a>" +
        '<button type="button" class="site-nav-logout" data-nav-logout>Déconnexion</button>' +
      "</span>" +
    "</nav>";

  document.body.prepend(header);
  document.body.classList.add("site-body");

  function pathNorm() {
    return (location.pathname || "")
      .replace(/\/index\.html$/, "")
      .replace(/\/+$/, "") || "/";
  }

  function crumbSep() {
    return '<span class="sep" aria-hidden="true">›</span>';
  }

  function renderCrumbs(items) {
    const parts = [];
    items.forEach((item, i) => {
      if (i) parts.push(crumbSep());
      const last = i === items.length - 1 || item.current;
      if (last) parts.push("<strong>" + item.label + "</strong>");
      else parts.push('<a href="' + item.href + '">' + item.label + "</a>");
    });
    return parts.join("");
  }

  function trailForPath(cur) {
    const home = { href: abs("index.html"), label: "Droit public et administratif" };
    const bu = { href: abs("bibliotheque-universitaire/"), label: "Bibliothèque universitaire" };
    const cours = { href: abs("cours-magistral/"), label: "Cours magistral" };
    const td = { href: abs("travaux-diriges/"), label: "Travaux dirigés" };
    const segs = cur.replace(/^\//, "").split("/").filter(Boolean);
    const first = segs[0] || "";

    if (!first) return null;

    if (first === "chronologie" || first === "demo-chronologie" || (first === "ressources" && segs[1] === "chronologie") || (first === "bibliotheque" && segs[1] === "chronologie")) {
      return [home, cours, { label: "Chronologie de la jurisprudence administrative", current: true }];
    }
    if (first === "ressources" || first === "cours-magistral") {
      return [home, { href: abs("cours-magistral/"), label: "Cours magistral", current: true }];
    }
    if (first === "bibliotheque" || first === "bibliotheque-universitaire") {
      return [home, { label: "Bibliothèque universitaire", current: true }];
    }
    if (first === "dictionnaire") {
      return [home, bu, { label: "Dictionnaire juridique", current: true }];
    }
    if (first === "arrets") {
      const trail = [home, bu, { href: abs("arrets/"), label: "Fiches d'arrêts et de décisions" }];
      if (segs.length > 1) trail.push({ label: "Fiche", current: true });
      else trail[trail.length - 1].current = true;
      return trail;
    }
    if (first === "cours") return null;
    if (first === "exercices" || first === "travaux-diriges") {
      return [home, { label: "Travaux dirigés", current: true }];
    }
    if (first === "demo" || first === "flipcards") {
      return [home, td, { label: "Flipcards", href: abs("travaux-diriges/") }, { label: "Grands arrêts", current: true }];
    }
    if (first === "demo-flipcards-dico" || first === "flipcards-dico") {
      return [home, td, { label: "Flipcards", href: abs("travaux-diriges/") }, { label: "Grandes notions", current: true }];
    }
    if (first === "demo-relier" || first === "relier") {
      return [home, td, { label: "Relations", href: abs("travaux-diriges/") }, { label: "Grands arrêts", current: true }];
    }
    if (first === "demo-relier-dico" || first === "relier-dico") {
      return [home, td, { label: "Relations", href: abs("travaux-diriges/") }, { label: "Grandes notions", current: true }];
    }
    if (first === "demo-enchainements-logiques" || first === "enchainements-logiques") {
      return [home, td, { label: "Enchaînements logiques", current: true }];
    }
    if (first === "checkout") {
      return [home, { label: "Inscriptions", current: true }];
    }
    if (first === "membre") {
      const trail = [home, { href: abs("membre/"), label: "Espace pédagogique" }];
      if (segs[1] === "forgot") trail.push({ label: "Mot de passe oublié", current: true });
      else if (segs[1] === "compte") trail.push({ label: "Mon compte", current: true });
      else if (segs[1] === "reset") trail.push({ label: "Réinitialisation", current: true });
      else trail[trail.length - 1].current = true;
      return trail;
    }
    if (first === "mentions-legales") {
      return [home, { label: "Mentions légales", current: true }];
    }
    if (first === "cgv") {
      return [home, { label: "CGV", current: true }];
    }
    return [home, { label: document.title.replace(/\s+[—–-].*$/, "").trim() || first, current: true }];
  }

  function insertCrumbEl(html) {
    const el = document.createElement("p");
    el.className = "site-crumb";
    el.setAttribute("aria-label", "Fil d’Ariane");
    el.innerHTML = html;
    const wrap = document.getElementById("app") || document.querySelector(".wrap");
    const main = document.querySelector("main");
    if (wrap) wrap.insertBefore(el, wrap.firstChild);
    else if (main) main.insertBefore(el, main.firstChild);
    else header.insertAdjacentElement("afterend", el);
    return el;
  }

  function ensureSiteCrumbs() {
    const cur = pathNorm();
    const trail = trailForPath(cur);
    if (!trail) return;
    const html = renderCrumbs(trail);
    const existing = document.querySelector(".site-crumb");
    const force =
      cur.indexOf("/chronologie") !== -1 ||
      cur.indexOf("/demo-chronologie") !== -1 ||
      cur.indexOf("/arrets") !== -1 ||
      cur.indexOf("/dictionnaire") !== -1 ||
      cur.indexOf("/demo") !== -1 ||
      cur.indexOf("/flipcards") !== -1 ||
      cur.indexOf("/relier") !== -1 ||
      cur.indexOf("/enchainements-logiques") !== -1 ||
      cur.indexOf("/mentions-legales") !== -1 ||
      cur.indexOf("/cgv") !== -1 ||
      cur.indexOf("/membre") !== -1;
    if (existing && !force) return;
    if (existing) {
      existing.setAttribute("aria-label", "Fil d’Ariane");
      existing.innerHTML = html;
      return;
    }
    insertCrumbEl(html);
  }
  ensureSiteCrumbs();

  header.querySelectorAll("[data-nav]").forEach((a) => {
    const key = a.getAttribute("data-nav");
    const href = a.getAttribute("href") || "";
    try {
      const p = new URL(href).pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
      const cur = location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") || "/";
      if (key === "home") {
        if (cur === p) a.classList.add("is-active");
      } else if (key === "ressources") {
        const onCours = cur.indexOf("/cours") !== -1;
        const onCoursMagistral = cur.indexOf("/cours-magistral") !== -1;
        const onChrono = cur.indexOf("/chronologie") !== -1 || cur.indexOf("/demo-chronologie") !== -1;
        if (cur === p || onCours || onCoursMagistral || onChrono) {
          a.classList.add("is-active");
        }
      } else if (key === "bibliotheque") {
        const onDict = cur.indexOf("/dictionnaire") !== -1;
        const onArrets = cur.indexOf("/arrets") !== -1;
        const onBu = cur.indexOf("/bibliotheque") !== -1;
        if (cur === p || onDict || onArrets || onBu) {
          a.classList.add("is-active");
        }
      } else if (key === "exercices") {
        const onTd = cur.indexOf("/travaux-diriges") !== -1 || cur.indexOf("/exercices") !== -1;
        // actif sur /travaux-diriges/, /demo/, /flipcards/, /demo-relier/, /relier/
        const onDemo = cur.indexOf("/demo/") !== -1 || cur.endsWith("/demo");
        const onFlip = (cur.indexOf("/flipcards/") !== -1 || cur.endsWith("/flipcards"))
          && cur.indexOf("/flipcards-dico") === -1;
        const onDemoRelier = cur.indexOf("/demo-relier/") !== -1 || cur.endsWith("/demo-relier");
        const onRelier = (cur.indexOf("/relier/") !== -1 || cur.endsWith("/relier"))
          && cur.indexOf("/relier-dico") === -1;
        const onDemoRelierDico = cur.indexOf("/demo-relier-dico/") !== -1 || cur.endsWith("/demo-relier-dico");
        const onRelierDico = cur.indexOf("/relier-dico/") !== -1 || cur.endsWith("/relier-dico");
        const onDemoFlipDico = cur.indexOf("/demo-flipcards-dico/") !== -1 || cur.endsWith("/demo-flipcards-dico");
        const onFlipDico = cur.indexOf("/flipcards-dico/") !== -1 || cur.endsWith("/flipcards-dico");
        const onDemoEnch = cur.indexOf("/demo-enchainements-logiques/") !== -1 || cur.endsWith("/demo-enchainements-logiques");
        const onEnch = cur.indexOf("/enchainements-logiques/") !== -1 || cur.endsWith("/enchainements-logiques");
        if (cur === p || onTd || onDemo || onFlip || onDemoRelier || onRelier || onDemoRelierDico || onRelierDico || onDemoFlipDico || onFlipDico || onDemoEnch || onEnch) {
          a.classList.add("is-active");
        }
      } else if (cur === p || (p !== "/" && cur.startsWith(p + "/"))) {
        a.classList.add("is-active");
      }
    } catch (_) {}
  });

  const guest = header.querySelector(".site-nav-guest");
  const auth = header.querySelector(".site-nav-auth");
  const emailEl = header.querySelector("[data-nav-email]");
  const logoutBtn = header.querySelector("[data-nav-logout]");
  const checkoutLink = header.querySelector('[data-nav="checkout"]');

  logoutBtn.addEventListener("click", () => {
    if (window.FLIPCARDS_AUTH) FLIPCARDS_AUTH.clearToken();
    location.href = abs("index.html");
  });

  async function refreshAuth() {
    if (!window.FLIPCARDS_AUTH) return null;
    const me = await FLIPCARDS_AUTH.requireSession();
    if (me && me.email) {
      guest.hidden = true;
      auth.hidden = false;
      emailEl.textContent = me.email;
      if (checkoutLink) checkoutLink.hidden = true;
    } else {
      guest.hidden = false;
      auth.hidden = true;
      emailEl.textContent = "";
      if (checkoutLink) checkoutLink.hidden = false;
    }
    return me;
  }

  function applyHomeAuth(isMember) {
    if (!isMember) return;
    const panel = document.getElementById("espace-membre");
    if (panel) panel.hidden = true;

    const btn = document.querySelector("[data-home-auth-btn]");
    if (!btn) return;
    btn.textContent = "Déconnexion";
    btn.href = "#";
    btn.setAttribute("aria-label", "Se déconnecter");
    btn.dataset.authMode = "logout";
  }

  function applyHomeEntryAccess(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-home-access]").forEach((el) => {
      const mode = el.getAttribute("data-home-access");
      if (mode === "public") return;
      el.textContent = "Ouvrir →";
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-home-auth-btn]");
    if (!btn || btn.dataset.authMode !== "logout") return;
    e.preventDefault();
    if (window.FLIPCARDS_AUTH) FLIPCARDS_AUTH.clearToken();
    location.href = abs("index.html");
  });

  function applyManuelPreview(isMember) {
    const prose = document.querySelector("article.manuel-prose");
    if (!prose) return;

    let wrap = document.querySelector(".manuel-readmore-wrap");

    if (isMember) {
      prose.classList.remove("is-preview");
      if (wrap) wrap.hidden = true;
      return;
    }

    prose.classList.add("is-preview");
    if (!wrap) {
      wrap = document.createElement("p");
      wrap.className = "manuel-readmore-wrap";
      const a = document.createElement("a");
      a.className = "manuel-readmore";
      a.href = abs("membre/");
      a.textContent = "Lire la suite";
      a.setAttribute("aria-label", "Lire la suite — Espace pédagogique");
      wrap.appendChild(a);
      prose.insertAdjacentElement("afterend", wrap);
    }
    wrap.hidden = false;
  }

  function blockCopyOn(el) {
    if (!el) return;
    ["copy", "cut", "contextmenu", "selectstart", "dragstart"].forEach((ev) => {
      el.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  function protectManuelCopy() {
    const prose = document.querySelector("article.manuel-prose");
    if (!prose) return;
    blockCopyOn(prose);
    blockCopyOn(document.querySelector(".manuel-content"));
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = String(e.key || "").toLowerCase();
      if (key !== "c" && key !== "x" && key !== "a" && key !== "s") return;
      const sel = window.getSelection && window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (key === "a" || key === "s") {
          e.preventDefault();
        }
        return;
      }
      try {
        const node = sel.anchorNode && (sel.anchorNode.nodeType === 3
          ? sel.anchorNode.parentElement
          : sel.anchorNode);
        if (node && prose.contains(node)) e.preventDefault();
      } catch (_) {
        e.preventDefault();
      }
    });
  }

  // Infobulle titre complet sur les entrées tronquées du menu Manuel
  document.querySelectorAll(".manuel-nav-side .nav-title").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (t) {
      const a = el.closest("a");
      if (a && !a.getAttribute("title")) a.setAttribute("title", t);
    }
  });

  /** Les liens d’exercices du manuel doivent ouvrir l’app déjà filtrée, pas le menu. */
  function applyManuelExerciseDeepLinks() {
    document.querySelectorAll(".manuel-exercises a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || href.indexOf("cours=") === -1) return;
      let next = href;
      ["flipcards-dico", "relier-dico", "flipcards", "relier"].forEach((folder) => {
        const re = new RegExp("(/" + folder + "/)(?:index\\.html)?\\?");
        next = next.replace(re, "$1app.html?");
      });
      if (next !== href) a.setAttribute("href", next);
    });
  }
  applyManuelExerciseDeepLinks();

  /**
   * Pied de page « Ressources liées » + compteurs d’exercices : même index que
   * Flipcards / Relations (?cours=DP-XXX), sans plafond à 25.
   */
  function chapterCodeFromLocation() {
    if (!/\/cours\//.test(location.pathname || "")) return "";
    const parts = (location.pathname || "")
      .replace(/\/index\.html$/, "")
      .split("/")
      .filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = /^dp-(\d+)$/i.exec(parts[i]);
      if (m) return "DP-" + m[1];
    }
    return "";
  }

  function escLinked(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkedTitleKey(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function hrefFromLiens(liens, kind, title) {
    const bag = liens && liens[kind];
    if (!bag) return "";
    if (bag[title]) return abs(bag[title]);
    const k = linkedTitleKey(title);
    for (const t of Object.keys(bag)) {
      if (linkedTitleKey(t) === k) return abs(bag[t]);
    }
    return "";
  }

  function syncManuelLinkedResources() {
    const code = chapterCodeFromLocation();
    const content = document.querySelector(".manuel-content");
    if (!code || !content) return;
    Promise.all([
      fetch(abs("cours/exercices.json"), { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(abs("cours/liens.json"), { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([map, liens]) => {
        const entry = map && map[code];
        if (!entry) return;
        const jp = entry.jurisprudence || [];
        const notions = entry.notions || [];
        if (!jp.length && !notions.length) return;

        const bits = [];
        function pushLink(title, kind, cls) {
          const href = hrefFromLiens(liens, kind, title);
          if (bits.length) {
            bits.push(
              '<span class="site-linked-resources-sep" aria-hidden="true">·</span>'
            );
          }
          if (href) {
            bits.push(
              '<a class="' +
                cls +
                '" href="' +
                escLinked(href) +
                '">' +
                escLinked(title) +
                "</a>"
            );
          } else {
            bits.push(
              '<span class="notion-link-inactive">' + escLinked(title) + "</span>"
            );
          }
        }
        jp.forEach((t) => pushLink(t, "jurisprudence", "arret-link"));
        notions.forEach((t) => pushLink(t, "notions", "dict-link"));

        let aside = content.querySelector(".site-linked-resources");
        if (!aside) {
          aside = document.createElement("aside");
          aside.className = "site-linked-resources";
          aside.setAttribute("aria-label", "Ressources liées");
          const exercises = content.querySelector(".manuel-exercises");
          const nav = content.querySelector(".manuel-chapternav");
          if (exercises) content.insertBefore(aside, exercises);
          else if (nav) content.insertBefore(aside, nav);
          else content.appendChild(aside);
        }
        aside.innerHTML =
          '<p class="site-linked-resources-title">Ressources liées…</p>' +
          '<p class="site-linked-resources-links">' +
          bits.join("") +
          "</p>";

        content.querySelectorAll(".manuel-exercises-group").forEach((group) => {
          const title =
            (group.querySelector(".manuel-exercises-title") || {}).textContent ||
            "";
          const countEl = group.querySelector(".manuel-exercises-count");
          if (!countEl) return;
          if (/jurisprudence/i.test(title)) {
            countEl.textContent = "(" + jp.length + ")";
          } else if (/notions/i.test(title)) {
            countEl.textContent = "(" + notions.length + ")";
          }
        });
      })
      .catch(() => {});
  }
  syncManuelLinkedResources();

  function applyTdRubriqueAccess(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-ex-access]").forEach((el) => {
      el.textContent = "Accès complet";
    });
    document.querySelectorAll(".ex-list-rubriques .ex-item-type").forEach((el) => {
      if ((el.textContent || "").trim() === "Démonstration") {
        el.textContent = "Accès complet";
      }
    });
  }

  function applyLoggedInCopy(isMember) {
    if (!isMember) return;

    document.querySelectorAll(".ex-item").forEach((item) => {
      const title = ((item.querySelector(".ex-item-title") || {}).textContent || "");
      const desc = item.querySelector(".ex-item-desc");
      const cta = item.querySelector(".ex-item-cta");
      if (desc && /Fiches d['’]arrêts/.test(title)) {
        desc.innerHTML = (desc.innerHTML || "").replace(/\b8 \/ /g, "");
      }
      if (cta && /^\s*Aperçus/.test(cta.textContent || "")) {
        cta.textContent = "Consulter →";
      }
      if (desc) {
        desc.innerHTML = (desc.innerHTML || "").replace(/\b15 \/ /g, "");
      }
    });

    document.querySelectorAll(
      "[data-flipcards-entry], [data-flipcards-dico-entry], [data-relier-entry], [data-relier-dico-entry], [data-enchainements-entry]"
    ).forEach((el) => {
      el.innerHTML = (el.innerHTML || "").replace(/\b8 \/ /g, "");
    });

    document.querySelectorAll(".arrets-index .site-lead").forEach((el) => {
      el.innerHTML = (el.innerHTML || "").replace(/\b8 \/ /g, "");
    });

    document.querySelectorAll(".page-sub").forEach((el) => {
      let html = el.innerHTML;
      html = html.replace(/\b8 \/ /g, "").replace(/\b15 \/ /g, "");
      html = html.replace(/\s*\(utilisateurs connectés\)\s*/g, " ");
      html = html.replace(/ {2,}/g, " ");
      el.innerHTML = html;
    });

    function stripChronoDemoFraction() {
      const alert = document.getElementById("chrono-alert");
      if (!alert) return;
      const t = alert.textContent || "";
      const next = t.replace(/\b15 \/ /g, "").replace(/\b8 \/ /g, "");
      if (next !== t) alert.textContent = next;
    }
    stripChronoDemoFraction();
    const chronoAlert = document.getElementById("chrono-alert");
    if (chronoAlert && !chronoAlert._ruFractionBound) {
      chronoAlert._ruFractionBound = true;
      new MutationObserver(stripChronoDemoFraction).observe(chronoAlert, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  function applyFlipcardsEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-flipcards-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-fc-type]");
      const descEl = el.querySelector("[data-fc-desc]");
      const ctaEl = el.querySelector("[data-fc-cta]");
      el.setAttribute("href", abs("flipcards/app.html"));
      if (typeEl) typeEl.textContent = "Accès membre";
      if (descEl) {
        descEl.textContent =
          "Jeu complet des flipcards : tous les arrêts, filtres par thèmes et notions, mode étude.";
      }
      if (ctaEl) ctaEl.textContent = "Ouvrir les flipcards →";
      el.setAttribute("title", "Flipcards — Grands arrêts (accès membre)");
    });
  }

  function applyFlipcardsDicoEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-flipcards-dico-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-fcd-type]");
      const descEl = el.querySelector("[data-fcd-desc]");
      const ctaEl = el.querySelector("[data-fcd-cta]");
      el.setAttribute("href", abs("flipcards-dico/app.html"));
      if (typeEl) typeEl.textContent = "Accès membre";
      if (descEl) {
        descEl.textContent =
          "Jeu complet Flipcards dictionnaire : toutes les notions et définitions, filtre par lettre.";
      }
      if (ctaEl) ctaEl.textContent = "Ouvrir Flipcards dictionnaire →";
      el.setAttribute("title", "Flipcards — Grandes notions (accès membre)");
    });
  }

  function applyRelierEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-relier-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-rl-type]");
      const descEl = el.querySelector("[data-rl-desc]");
      const ctaEl = el.querySelector("[data-rl-cta]");
      el.setAttribute("href", abs("relier/app.html"));
      if (typeEl) typeEl.textContent = "Accès membre";
      if (descEl) {
        descEl.textContent =
          "Jeu complet Relier : toutes les décisions avec objet, filtres par thèmes et notions.";
      }
      if (ctaEl) ctaEl.textContent = "Ouvrir Relier →";
      el.setAttribute("title", "Relations — Grands arrêts (accès membre)");
    });
  }

  function applyRelierDicoEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-relier-dico-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-rld-type]");
      const descEl = el.querySelector("[data-rld-desc]");
      const ctaEl = el.querySelector("[data-rld-cta]");
      el.setAttribute("href", abs("relier-dico/app.html"));
      if (typeEl) typeEl.textContent = "Accès membre";
      if (descEl) {
        descEl.textContent =
          "Jeu complet Relier dictionnaire : toutes les notions et définitions, filtre par lettre.";
      }
      if (ctaEl) ctaEl.textContent = "Ouvrir Relier dictionnaire →";
      el.setAttribute("title", "Relations — Grandes notions (accès membre)");
    });
  }

  function applyEnchainementsEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-enchainements-entry]").forEach((el) => {
      el.setAttribute("href", abs("enchainements-logiques/"));
      el.setAttribute("title", "Enchaînements logiques (accès membre)");
    });
  }

  function applyChronologieEntry(isMember) {
    if (!isMember) return;
    document.querySelectorAll("[data-chronologie-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-chrono-type]");
      const descEl = el.querySelector("[data-chrono-desc]");
      const ctaEl = el.querySelector("[data-chrono-cta]");
      el.setAttribute("href", abs("chronologie/"));
      if (typeEl) typeEl.textContent = "Accès membre";
      if (descEl) {
        descEl.textContent =
          "Frise complète du fonds : toutes les décisions, filtres, décisions liées et liens vers les fiches.";
      }
      if (ctaEl) ctaEl.textContent = "Ouvrir la chronologie →";
      el.setAttribute("title", "Chronologie de la jurisprudence administrative (accès membre)");
    });
  }

  // Aperçu Manuel : verrouiller d'abord, déverrouiller si membre (évite le flash du texte complet)
  if (document.querySelector("article.manuel-prose")) {
    applyManuelPreview(false);
    protectManuelCopy();
  }

  function needsSiteTTS() {
    if (!("speechSynthesis" in window)) return false;
    return Boolean(
      document.querySelector("article.manuel-prose") ||
      document.querySelector(".dict-entries")
    );
  }

  function ensureSiteTTS(cb) {
    if (!needsSiteTTS()) {
      cb();
      return;
    }
    if (window.SiteTTS) {
      cb();
      return;
    }
    const existing = document.querySelector('script[src*="site-tts.js"]');
    if (existing) {
      if (window.SiteTTS) {
        cb();
        return;
      }
      existing.addEventListener("load", () => cb(), { once: true });
      existing.addEventListener("error", () => cb(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = abs("site-tts.js?v=11");
    s.onload = () => cb();
    s.onerror = () => cb();
    document.body.appendChild(s);
  }

  ensureSiteTTS(() => {
    refreshAuth().then((me) => {
      const ok = Boolean(me && me.email);
      applyHomeAuth(ok);
      applyHomeEntryAccess(ok);
      applyManuelPreview(ok);
      applyTdRubriqueAccess(ok);
      applyFlipcardsEntry(ok);
      applyFlipcardsDicoEntry(ok);
      applyRelierEntry(ok);
      applyRelierDicoEntry(ok);
      applyChronologieEntry(ok);
      applyEnchainementsEntry(ok);
      applyLoggedInCopy(ok);
      if (window.SiteTTS) window.SiteTTS.init(ok);
    });
  });

  function shouldShowErrorReport() {
    const cur = location.pathname || "";
    if (cur.indexOf("/cours") !== -1) return true;
    if (cur.indexOf("/dictionnaire") !== -1) return true;
    if (cur.indexOf("/arrets") !== -1) return true;
    if (cur.indexOf("/demo/") !== -1 || cur.endsWith("/demo")) return true;
    if (cur.indexOf("/demo-flipcards-dico/") !== -1 || cur.endsWith("/demo-flipcards-dico")) return true;
    if (cur.indexOf("/flipcards-dico/") !== -1 || cur.endsWith("/flipcards-dico")) return true;
    if (cur.indexOf("/flipcards/") !== -1 || cur.endsWith("/flipcards")) return true;
    if (cur.indexOf("/demo-relier/") !== -1 || cur.endsWith("/demo-relier")) return true;
    if (cur.indexOf("/demo-relier-dico/") !== -1 || cur.endsWith("/demo-relier-dico")) return true;
    if (cur.indexOf("/relier-dico/") !== -1 || cur.endsWith("/relier-dico")) return true;
    if (cur.indexOf("/relier/") !== -1 || cur.endsWith("/relier")) return true;
    if (cur.indexOf("/chronologie/") !== -1 || cur.endsWith("/chronologie")) return true;
    if (cur.indexOf("/demo-chronologie/") !== -1 || cur.endsWith("/demo-chronologie")) return true;
    if (cur.indexOf("/demo-enchainements-logiques/") !== -1 || cur.endsWith("/demo-enchainements-logiques")) return true;
    if (cur.indexOf("/enchainements-logiques/") !== -1 || cur.endsWith("/enchainements-logiques")) return true;
    return false;
  }

  if (shouldShowErrorReport()) {
    const report = document.createElement("a");
    report.className = "site-error-report";
    report.href =
      "mailto:cab.pechard@gmail.com"
      + "?subject=" + encodeURIComponent("Signaler une erreur / suggérer un ajout")
      + "&body=" + encodeURIComponent(
        "Bonjour,\n\nJe souhaite signaler une erreur ou suggérer un ajout sur la page suivante :\n"
        + location.href
        + "\n\nDescription :\n"
      );
    report.textContent = "Signaler une erreur / suggérer un ajout";
    report.setAttribute(
      "aria-label",
      "Signaler une erreur ou suggérer un ajout par e-mail"
    );
    document.body.appendChild(report);
  }

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML =
    '<div class="site-footer-inner">' +
      '<div class="site-footer-meta">' +
        '<p class="site-footer-brand"><span class="brand-part-primary">Les Ressources</span> <span class="brand-part-secondary">Universitaires</span> — Droit public et administratif</p>' +
        '<p class="site-footer-copy">© <span class="brand-part-primary">Les Ressources</span> <span class="brand-part-secondary">Universitaires</span> · Tous droits réservés · Reproductions / exportations interdites</p>' +
      "</div>" +
      '<nav class="site-footer-links" aria-label="Informations légales">' +
        '<a href="' + abs("mentions-legales/") + '">Mentions légales</a>' +
        '<a href="' + abs("cgv/") + '">CGV</a>' +
        '<a href="mailto:cab.pechard@gmail.com">Contact</a>' +
      "</nav>" +
    "</div>";
  document.body.appendChild(footer);

  // Sélecteur de charte (Campus par défaut) — chargé après le bandeau
  const themeJs = document.createElement("script");
  themeJs.src = new URL("site-theme.js?v=20", script.src).href;
  themeJs.onerror = function () {
    console.warn("[site-theme] Impossible de charger site-theme.js — rebuild du site requis.");
  };
  document.body.appendChild(themeJs);

  // Recherche full-text (Cours + Dictionnaire + Arrêts)
  const searchJs = document.createElement("script");
  searchJs.src = new URL("site-search.js?v=7", script.src).href;
  searchJs.onerror = function () {
    console.warn("[site-search] Impossible de charger site-search.js — rebuild du site requis.");
  };
  document.body.appendChild(searchJs);
})();
