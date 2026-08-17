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
      '<a data-nav="bibliotheque" href="' + abs("bibliotheque/") + '">BU</a>' +
      '<a data-nav="ressources" href="' + abs("ressources/") + '">Cours</a>' +
      '<a data-nav="exercices" href="' + abs("exercices/") + '">Salles de TD</a>' +
      '<a data-nav="checkout" href="' + abs("checkout/") + '">Inscriptions</a>' +
      '<span class="site-nav-guest">' +
        '<a data-nav="membre" href="' + abs("membre/") + '">Espace pédagogique</a>' +
      "</span>" +
      '<span class="site-nav-auth" hidden>' +
        '<a class="site-nav-user" href="' + abs("index.html") + '" title="Espace pédagogique">' +
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
    const bu = { href: abs("bibliotheque/"), label: "Bibliothèque universitaire" };
    const cours = { href: abs("ressources/"), label: "Cours magistral" };
    const td = { href: abs("exercices/"), label: "Travaux dirigés" };
    const segs = cur.replace(/^\//, "").split("/").filter(Boolean);
    const first = segs[0] || "";

    if (!first) return null;

    if (first === "chronologie" || (first === "ressources" && segs[1] === "chronologie") || (first === "bibliotheque" && segs[1] === "chronologie")) {
      return [home, cours, { label: "Chronologie de la jurisprudence administrative", current: true }];
    }
    if (first === "ressources") {
      return [home, { label: "Cours magistral", current: true }];
    }
    if (first === "bibliotheque") {
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
    if (first === "manuel") return null;
    if (first === "exercices") {
      return [home, { label: "Travaux dirigés", current: true }];
    }
    if (first === "demo" || first === "flipcards") {
      return [home, td, { label: "Flipcards", href: abs("exercices/") }, { label: "Grands arrêts", current: true }];
    }
    if (first === "demo-flipcards-dico" || first === "flipcards-dico") {
      return [home, td, { label: "Flipcards", href: abs("exercices/") }, { label: "Grandes notions", current: true }];
    }
    if (first === "demo-relier" || first === "relier") {
      return [home, td, { label: "Relations", href: abs("exercices/") }, { label: "Grands arrêts", current: true }];
    }
    if (first === "demo-relier-dico" || first === "relier-dico") {
      return [home, td, { label: "Relations", href: abs("exercices/") }, { label: "Grandes notions", current: true }];
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
      else if (segs[1] === "compte") trail.push({ label: "Compte", current: true });
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
        const onManuel = cur.indexOf("/manuel") !== -1;
        const onChrono = cur.indexOf("/chronologie") !== -1;
        if (cur === p || onManuel || onChrono) {
          a.classList.add("is-active");
        }
      } else if (key === "bibliotheque") {
        const onDict = cur.indexOf("/dictionnaire") !== -1;
        const onArrets = cur.indexOf("/arrets") !== -1;
        if (cur === p || onDict || onArrets) {
          a.classList.add("is-active");
        }
      } else if (key === "exercices") {
        // actif sur /exercices/, /demo/, /flipcards/, /demo-relier/, /relier/
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
        if (cur === p || onDemo || onFlip || onDemoRelier || onRelier || onDemoRelierDico || onRelierDico || onDemoFlipDico || onFlipDico || onDemoEnch || onEnch) {
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
    const panel = document.getElementById("espace-membre");
    if (panel) panel.hidden = Boolean(isMember);

    const btn = document.querySelector("[data-home-auth-btn]");
    if (!btn) return;
    if (isMember) {
      btn.textContent = "Déconnexion";
      btn.href = "#";
      btn.setAttribute("aria-label", "Se déconnecter");
      btn.dataset.authMode = "logout";
    } else {
      btn.textContent = "Se connecter";
      btn.href = abs("membre/");
      btn.setAttribute("aria-label", "Se connecter — Espace pédagogique");
      btn.dataset.authMode = "login";
    }
  }

  function applyHomeEntryAccess(isMember) {
    document.querySelectorAll("[data-home-access]").forEach((el) => {
      const mode = el.getAttribute("data-home-access");
      if (mode === "public") {
        el.textContent = "Libre d'accès";
        return;
      }
      if (mode === "demo") {
        el.textContent = isMember ? "Ouvrir →" : "Démonstration";
        return;
      }
      el.textContent = isMember ? "Ouvrir →" : "Aperçu (accès membres)";
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
    if (!/\/manuel\//.test(location.pathname || "")) return "";
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
      fetch(abs("manuel/exercices.json"), { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(abs("manuel/liens.json"), { cache: "no-store" }).then((r) =>
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
    document.querySelectorAll("[data-ex-access]").forEach((el) => {
      el.textContent = isMember ? "Accès membre" : "Démo";
    });
  }

  function applyFlipcardsEntry(isMember) {
    document.querySelectorAll("[data-flipcards-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-fc-type]");
      const descEl = el.querySelector("[data-fc-desc]");
      const ctaEl = el.querySelector("[data-fc-cta]");
      if (isMember) {
        el.setAttribute("href", abs("flipcards/app.html"));
        if (typeEl) typeEl.textContent = "Accès membre";
        if (descEl) {
          descEl.textContent =
            "Jeu complet des flipcards : tous les arrêts, filtres par thèmes et notions, mode étude.";
        }
        if (ctaEl) ctaEl.textContent = "Ouvrir les flipcards →";
        el.setAttribute("title", "Flipcards — Grands arrêts (accès membre)");
      } else {
        el.setAttribute("href", abs("demo/"));
        if (typeEl) typeEl.textContent = "Démo";
        if (descEl) {
          descEl.textContent =
            "Cartes recto / verso sur la jurisprudence essentielle. Thèmes, notions clés, règles de droit et portée des arrêts.";
        }
        if (ctaEl) ctaEl.textContent = "Essayer la démo →";
        el.setAttribute("title", "Flipcards — Grands arrêts (démo)");
      }
    });
  }

  function applyFlipcardsDicoEntry(isMember) {
    document.querySelectorAll("[data-flipcards-dico-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-fcd-type]");
      const descEl = el.querySelector("[data-fcd-desc]");
      const ctaEl = el.querySelector("[data-fcd-cta]");
      if (isMember) {
        el.setAttribute("href", abs("flipcards-dico/app.html"));
        if (typeEl) typeEl.textContent = "Accès membre";
        if (descEl) {
          descEl.textContent =
            "Jeu complet Flipcards dictionnaire : toutes les notions et définitions, filtre par lettre.";
        }
        if (ctaEl) ctaEl.textContent = "Ouvrir Flipcards dictionnaire →";
        el.setAttribute("title", "Flipcards — Grandes notions (accès membre)");
      } else {
        el.setAttribute("href", abs("demo-flipcards-dico/"));
        if (typeEl) typeEl.textContent = "Démo";
        if (descEl) {
          descEl.textContent =
            "Cartes recto / verso du dictionnaire : notion d’un côté, définition de l’autre. Filtre par lettre.";
        }
        if (ctaEl) ctaEl.textContent = "Essayer la démo →";
        el.setAttribute("title", "Flipcards — Grandes notions (démo)");
      }
    });
  }

  function applyRelierEntry(isMember) {
    document.querySelectorAll("[data-relier-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-rl-type]");
      const descEl = el.querySelector("[data-rl-desc]");
      const ctaEl = el.querySelector("[data-rl-cta]");
      if (isMember) {
        el.setAttribute("href", abs("relier/app.html"));
        if (typeEl) typeEl.textContent = "Accès membre";
        if (descEl) {
          descEl.textContent =
            "Jeu complet Relier : toutes les décisions avec objet, filtres par thèmes et notions.";
        }
        if (ctaEl) ctaEl.textContent = "Ouvrir Relier →";
        el.setAttribute("title", "Relations — Grands arrêts (accès membre)");
      } else {
        el.setAttribute("href", abs("demo-relier/"));
        if (typeEl) typeEl.textContent = "Démo";
        if (descEl) {
          descEl.textContent =
            "Associez chaque décision à son objet. Glisser-déposer, filtres par thèmes et notions.";
        }
        if (ctaEl) ctaEl.textContent = "Essayer la démo →";
        el.setAttribute("title", "Relations — Grands arrêts (démo)");
      }
    });
  }

  function applyRelierDicoEntry(isMember) {
    document.querySelectorAll("[data-relier-dico-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-rld-type]");
      const descEl = el.querySelector("[data-rld-desc]");
      const ctaEl = el.querySelector("[data-rld-cta]");
      if (isMember) {
        el.setAttribute("href", abs("relier-dico/app.html"));
        if (typeEl) typeEl.textContent = "Accès membre";
        if (descEl) {
          descEl.textContent =
            "Jeu complet Relier dictionnaire : toutes les notions et définitions, filtre par lettre.";
        }
        if (ctaEl) ctaEl.textContent = "Ouvrir Relier dictionnaire →";
        el.setAttribute("title", "Relations — Grandes notions (accès membre)");
      } else {
        el.setAttribute("href", abs("demo-relier-dico/"));
        if (typeEl) typeEl.textContent = "Démo";
        if (descEl) {
          descEl.textContent =
            "Associez chaque notion du dictionnaire à sa définition. Glisser-déposer, filtre par lettre.";
        }
        if (ctaEl) ctaEl.textContent = "Essayer la démo →";
        el.setAttribute("title", "Relations — Grandes notions (démo)");
      }
    });
  }

  function applyEnchainementsEntry(isMember) {
    document.querySelectorAll("[data-enchainements-entry]").forEach((el) => {
      if (isMember) {
        el.setAttribute("href", abs("enchainements-logiques/"));
        el.setAttribute("title", "Enchaînements logiques (accès membre)");
      } else {
        el.setAttribute("href", abs("demo-enchainements-logiques/"));
        el.setAttribute("title", "Enchaînements logiques (démo)");
      }
    });
  }

  function applyChronologieEntry(isMember) {
    document.querySelectorAll("[data-chronologie-entry]").forEach((el) => {
      const typeEl = el.querySelector("[data-chrono-type]");
      const descEl = el.querySelector("[data-chrono-desc]");
      const ctaEl = el.querySelector("[data-chrono-cta]");
      if (isMember) {
        el.setAttribute("href", abs("chronologie/"));
        if (typeEl) typeEl.textContent = "Accès membre";
        if (descEl) {
          descEl.textContent =
            "Frise complète du fonds : toutes les décisions, filtres, décisions liées et liens vers les fiches.";
        }
        if (ctaEl) ctaEl.textContent = "Ouvrir la chronologie →";
        el.setAttribute("title", "Chronologie de la jurisprudence administrative (accès membre)");
      } else {
        el.setAttribute("href", abs("ressources/chronologie/"));
        if (typeEl) typeEl.textContent = "Démo";
        if (descEl) {
          descEl.textContent =
            "Démo de la frise chronologique (15 décisions), avec lots de décisions liées et filtres.";
        }
        if (ctaEl) ctaEl.textContent = "Essayer la démo →";
        el.setAttribute("title", "Chronologie de la jurisprudence administrative (démo)");
      }
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
    s.src = abs("site-tts.js?v=10");
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
      if (window.SiteTTS) window.SiteTTS.init(ok);
    });
  });

  function shouldShowErrorReport() {
    const cur = location.pathname || "";
    if (cur.indexOf("/manuel") !== -1) return true;
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
  themeJs.src = new URL("site-theme.js?v=19", script.src).href;
  themeJs.onerror = function () {
    console.warn("[site-theme] Impossible de charger site-theme.js — rebuild du site requis.");
  };
  document.body.appendChild(themeJs);

  // Recherche full-text (Cours + Dictionnaire + Arrêts)
  const searchJs = document.createElement("script");
  searchJs.src = new URL("site-search.js?v=6", script.src).href;
  searchJs.onerror = function () {
    console.warn("[site-search] Impossible de charger site-search.js — rebuild du site requis.");
  };
  document.body.appendChild(searchJs);
})();
