/* Sélecteur de charte graphique (site live).
   Campus = site.css par défaut. Persistance localStorage. */
(function () {
  const STORAGE_KEY = "ep-site-theme";

  /** Titre H1 d'accueil par thème (Campus = formulaire HTML spécial). */
  const HOME_TITLES = {
    amphitheatre: "Amphithéâtre",
    "salle-td": "Salle de TD",
    "salle-lecture-access-jour": "Salle de lecture",
    "salle-lecture-access-nuit": "Salle de lecture",
    "salle-lecture-jour": "Salle de lecture",
    "salle-lecture-nuit": "Salle de lecture",
    "restaurant-universitaire": "Restau' U",
    cafeteria: "Cafétéria",
    "chambre-etudiant": "Résidence universitaire",
  };

  const CAMPUS_HOME_TITLE_HTML = "<em>Droit</em> public et administratif";
  const HOME_EYEBROW = "Droit public et administratif";

  function scriptBase() {
    const el =
      document.currentScript ||
      document.querySelector('script[src*="site-theme"]') ||
      document.querySelector('script[src*="site-nav"]');
    if (el && el.src) return new URL("./", el.src).href;
    return new URL("./", location.href).href;
  }

  const root = scriptBase();

  function abs(path) {
    return new URL(path.replace(/^\//, ""), root).href;
  }

  const FALLBACK = {
    default: "campus",
    themes: [
      {
        id: "campus",
        label: "Campus",
        css: "site.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap",
      },
      {
        id: "amphitheatre",
        label: "Amphithéâtre",
        css: "themes/amphitheatre.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap",
      },
      {
        id: "salle-td",
        label: "Salle de TD",
        css: "themes/salle-td.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap",
      },
      {
        id: "salle-lecture-access-jour",
        label: "Salle de lecture (accessibilité) · jour",
        css: "themes/salle-lecture-access-jour.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap",
      },
      {
        id: "salle-lecture-access-nuit",
        label: "Salle de lecture (accessibilité) · nuit",
        css: "themes/salle-lecture-access-nuit.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap",
      },
      {
        id: "salle-lecture-jour",
        label: "Salle de lecture · jour",
        css: "themes/salle-lecture-jour.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      {
        id: "salle-lecture-nuit",
        label: "Salle de lecture · nuit",
        css: "themes/salle-lecture-nuit.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap",
      },
      {
        id: "restaurant-universitaire",
        label: "Restau' U",
        css: "themes/restaurant-universitaire.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,600;0,6..12,700;1,6..12,400&display=swap",
      },
      {
        id: "cafeteria",
        label: "Cafétéria",
        css: "themes/cafeteria.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Karla:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
      },
      {
        id: "chambre-etudiant",
        label: "Résidence universitaire",
        css: "themes/chambre-etudiant.css",
        fonts:
          "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,500&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  };

  function ensureUiStyles() {
    if (document.getElementById("ep-theme-ui")) return;
    const style = document.createElement("style");
    style.id = "ep-theme-ui";
    style.textContent =
      ".site-theme-picker{display:inline-flex;align-items:center;gap:.4rem;margin-left:.35rem;}" +
      ".site-theme-picker label{font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.55;}" +
      ".site-theme-picker select{font:inherit;font-size:.78rem;font-weight:600;color:var(--ink,#111);background:var(--bg-elevated,#fff);border:1px solid var(--border,rgba(0,0,0,.15));border-radius:var(--radius,2px);padding:.28rem 1.6rem .28rem .55rem;max-width:min(16rem,52vw);cursor:pointer;appearance:none;" +
      "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23888' d='M1 1l4 4 4-4'/%3E%3C/svg%3E\");" +
      "background-repeat:no-repeat;background-position:right .55rem center;}" +
      ".site-theme-picker select:focus{outline:2px solid var(--accent,#c4a35a);outline-offset:2px;}" +
      ".site-amphi-fond-picker{display:none!important;}" +
      "@media (max-width:720px){.site-theme-picker label{display:none;}.site-theme-picker select{max-width:11rem;font-size:.72rem;}}";
    document.head.appendChild(style);
  }

  function findCssLink() {
    let el = document.getElementById("theme-css");
    if (el) return el;
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    el =
      links.find((l) => /site\.css(\?|$)/.test(l.getAttribute("href") || "")) ||
      links.find((l) => /themes\/.+\.css(\?|$)/.test(l.getAttribute("href") || ""));
    if (el) el.id = "theme-css";
    return el || null;
  }

  function ensureFontsLink() {
    let el = document.getElementById("theme-fonts");
    if (el) return el;
    el = document.createElement("link");
    el.id = "theme-fonts";
    el.rel = "stylesheet";
    document.head.appendChild(el);
    return el;
  }

  function purgeAmphiFondUi() {
    document.querySelectorAll(".site-amphi-fond-picker").forEach((el) => el.remove());
    delete document.documentElement.dataset.amphiFond;
    try {
      localStorage.removeItem("ep-amphi-fond");
    } catch (_) {}
  }

  function applyHomeHeroTitle(theme) {
    const h1 =
      document.querySelector("[data-home-title]") ||
      document.querySelector(".home-hero-copy .site-title-hero");
    if (!h1) return;
    const eyebrow =
      document.querySelector("[data-home-eyebrow]") ||
      document.querySelector(".home-hero-eyebrow");
    if (theme.id === "campus") {
      h1.innerHTML = CAMPUS_HOME_TITLE_HTML;
      h1.classList.add("is-campus-hero");
      if (eyebrow) eyebrow.hidden = true;
      return;
    }
    h1.textContent = HOME_TITLES[theme.id] || theme.label || theme.id;
    h1.classList.remove("is-campus-hero");
    if (eyebrow) {
      eyebrow.hidden = false;
      eyebrow.textContent = HOME_EYEBROW;
    }
  }

  function applyTheme(theme, manifest) {
    const cssLink = findCssLink();
    if (!cssLink) return;
    const href = abs(theme.css);
    const ver = (manifest.assetsVersion || "1") + "-" + theme.id;
    const bust = "v=" + encodeURIComponent(ver);
    const next = href + (href.indexOf("?") >= 0 ? "&" : "?") + bust;
    const finish = () => {
      document.documentElement.dataset.theme = theme.id;
      try {
        localStorage.setItem(STORAGE_KEY, theme.id);
      } catch (_) {}
      const select = document.getElementById("site-theme-select");
      if (select && select.value !== theme.id) select.value = theme.id;
      purgeAmphiFondUi();
      applyHomeHeroTitle(theme);
      try {
        document.dispatchEvent(
          new CustomEvent("ep-theme-change", { detail: { theme: theme } })
        );
      } catch (_) {}
    };
    // Ne pas recharger l'URL en boucle : un retry trop tôt (cssRules encore
    // vide / inaccessible) annulait le <link> et laissait la page sans styles.
    if (cssLink.getAttribute("href") === next) {
      finish();
    } else {
      cssLink.onload = () => finish();
      cssLink.onerror = () => finish();
      cssLink.href = next;
    }
    const fonts = ensureFontsLink();
    if (theme.fonts) fonts.href = theme.fonts;
    void manifest;
  }

  function mountPicker(manifest, attempt) {
    attempt = attempt || 0;
    ensureUiStyles();
    purgeAmphiFondUi();
    const nav = document.querySelector(".site-nav-links");
    if (!nav) {
      if (attempt < 40) {
        setTimeout(() => mountPicker(manifest, attempt + 1), 50);
      }
      return;
    }
    purgeAmphiFondUi();
    if (document.getElementById("site-theme-select")) {
      return;
    }

    const currentId =
      document.documentElement.dataset.theme || resolveInitial(manifest).id;

    const wrap = document.createElement("span");
    wrap.className = "site-theme-picker";
    wrap.innerHTML =
      '<label for="site-theme-select">Ambiance</label>' +
      '<select id="site-theme-select" aria-label="Choisir une ambiance"></select>';
    const select = wrap.querySelector("select");
    manifest.themes.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.label;
      if (t.id === currentId) opt.selected = true;
      select.appendChild(opt);
    });
    select.value = currentId;
    const anchor = nav.querySelector('[data-nav="checkout"]');
    if (anchor) {
      nav.insertBefore(wrap, anchor);
    } else {
      nav.appendChild(wrap);
    }

    select.addEventListener("change", () => {
      const theme = manifest.themes.find((t) => t.id === select.value);
      if (theme) applyTheme(theme, manifest);
    });
  }

  function resolveInitial(manifest) {
    let id = manifest.default || "campus";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && manifest.themes.some((t) => t.id === saved)) id = saved;
    } catch (_) {}
    return manifest.themes.find((t) => t.id === id) || manifest.themes[0];
  }

  function boot(manifest) {
    mountPicker(manifest);
  }

  let cachedManifest = null;

  function start() {
    fetch(abs("themes/manifest.json?v=5"))
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .catch(() => FALLBACK)
      .then((manifest) => {
        cachedManifest = manifest;
        const theme = resolveInitial(manifest);
        applyTheme(theme, manifest);
        const finish = () => boot(manifest);
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", finish);
        } else {
          finish();
        }
      });
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !cachedManifest) return;
    applyTheme(resolveInitial(cachedManifest), cachedManifest);
  });

  window.EPSiteTheme = {
    STORAGE_KEY: STORAGE_KEY,
    applyTheme: applyTheme,
    resolveInitial: resolveInitial,
    abs: abs,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
