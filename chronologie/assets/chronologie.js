/**
 * Chronologie juridique — moteur de présentation (Option A)
 */
(function () {
  "use strict";

  var DEFAULT_CONFIG = {
    dataUrl: "./data/chronology-decisions-demo.json",
    ficheBaseUrl: "/ressources/fiches/",
    checkoutUrl: "../checkout/",
    demo: false,
    defaultMinImportance: 1,
    supportedDataVersion: 1,
  };

  var config = Object.assign({}, DEFAULT_CONFIG, window.__CHRONO_CONFIG__ || {});

  /** Plafond UI multi-relations (7 = fantôme, non sélectionnable pour l’instant). */
  var RELATION_DEPTH_UI_MAX = 7;
  var RELATION_DEPTH_SELECTABLE_MAX = 6;

  var MONTH_SHORT = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];

  var state = {
    raw: null,
    byId: new Map(),
    filtered: [],
    displayed: [],
    selectedId: null,
    view: "timeline",
    scale: "year", // year | month | day
    orientation: "vertical", // vertical (défaut) | horizontal
    /** Ordre d’apparition sur la frise : asc = date croissante, desc = décroissante. */
    chronoOrder: "asc",
    relatedOnly: false,
    multiRelations: false,
    relationDepth: 2, // 1–6 sélectionnable ; 7 fantôme UI
    /** Niveaux mis en avant dans la légende (vide = tous actifs). */
    legendLevelFilter: null, // Set<number> | null
    /** Importances mises en avant (1–4). */
    legendImportanceFilter: null, // Set<number> | null
    /** Colonnes juridiction mises en avant (clés JURIDICTION_COLS). */
    legendJuridictionFilter: null, // Set<string> | null
    graphUserClosed: false,
    filters: {
      q: "",
      reference: "",
      themes: [],
      notions: [],
      importance: [],
      juridictions: [],
      formations: [],
      dateFrom: null,
      dateTo: null,
    },
  };

  var els = {};
  var openMsId = null;
  var linkDrawTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function stars(n) {
    return "★".repeat(n || 0);
  }

  function slugKey(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function juridictionKey(j) {
    var s = slugKey(j);
    if (s.indexOf("conseil-d") === 0 && s.indexOf("etat") !== -1) return "ce";
    if (s.indexOf("tribunal-des-conflits") === 0) return "tc";
    if (s.indexOf("conseil-constitutionnel") === 0) return "cons-constit";
    if (s.indexOf("cour-de-cassation") === 0) return "cass";
    if (s.indexOf("cour-d-appel") === 0) return "ca";
    if (s.indexOf("tribunal-judiciaire") === 0) return "tj";
    if (s.indexOf("cour-internationale-de-justice") === 0) return "cij";
    if (s.indexOf("cour-europeenne") === 0) return "cedh";
    if (s.indexOf("cour-de-justice") === 0) return "cjue";
    if (s.indexOf("cour-administrative") === 0) return "caa";
    if (s.indexOf("tribunal-administratif") === 0) return "ta";
    return s;
  }

  // Colonnes de la frise verticale (essai) : par juridiction.
  var JURIDICTION_COLS = [
    { key: "tc", label: "Tribunal des conflits", short: "Trib. des conflits" },
    { key: "cons-constit", label: "Conseil constitutionnel", short: "Cons. constit." },
    { key: "adm", label: "CE / CAA / TA", short: "CE / CAA / TA" },
    { key: "civ", label: "Cass. / CA / TJ et autres", short: "Cass. / CA / TJ…" },
    { key: "intl", label: "CIJ / CEDH / CJUE", short: "CIJ / CEDH / CJUE" },
  ];

  function juridictionColKey(j) {
    var k = juridictionKey(j);
    if (k === "tc") return "tc";
    if (k === "cons-constit") return "cons-constit";
    if (k === "ce" || k === "caa" || k === "ta") return "adm";
    if (k === "cass" || k === "ca" || k === "tj") return "civ";
    if (k === "cedh" || k === "cjue" || k === "cij") return "intl";
    if (k.indexOf("tribunal-administratif") === 0 || k.indexOf("ta-") === 0) return "adm";
    if (k.indexOf("cour-administrative") === 0) return "adm";
    return "civ";
  }

  function formatDateFr(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort(function (a, b) {
      return a.localeCompare(b, "fr", { sensitivity: "base" });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setAlert(message, tone) {
    if (!els.alert) return;
    if (!message) {
      els.alert.hidden = true;
      els.alert.textContent = "";
      return;
    }
    els.alert.hidden = false;
    els.alert.dataset.tone = tone || "warn";
    els.alert.textContent = message;
  }

  function syncDemoUi(data) {
    var upsell = $("chrono-demo-upsell");
    var isDemo = !!(config.demo || (data && data.meta && data.meta.demo));
    if (upsell) upsell.hidden = !isDemo;
    if (!isDemo) return;
    var n = (data && data.decisions && data.decisions.length) || 0;
    var total = (data && data.meta && data.meta.sourceCount) || null;
    setAlert(
      "Démo publique : " +
        n +
        " décisions" +
        (total ? " sur " + total : "") +
        ". Connectez-vous pour la frise complète.",
      "info"
    );
  }

  function buildIndex(data) {
    state.byId = new Map();
    (data.decisions || []).forEach(function (d) {
      state.byId.set(d.id, d);
    });
  }

  /** Voisinage direct non orienté (liees + reverse). */
  function getNeighbors(id) {
    var set = new Set();
    if (!id || !state.byId.has(id)) return set;
    var sel = state.byId.get(id);
    (sel.liees || []).forEach(function (x) {
      set.add(x);
    });
    state.byId.forEach(function (d, otherId) {
      if (otherId === id) return;
      if ((d.liees || []).indexOf(id) !== -1) set.add(otherId);
    });
    return set;
  }

  function currentRelationDepth() {
    if (state.multiRelations) {
      var n = Number(state.relationDepth);
      if (!isFinite(n) || n < 1) n = 2;
      return Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, Math.round(n)));
    }
    return 1;
  }

  /** Profondeur max réellement atteignable depuis id (plafonnée à l’UI). */
  function maxReachableRelationDepth(id) {
    if (!id || !state.byId.has(id)) return 0;
    var graph = buildRelationGraph(id, RELATION_DEPTH_SELECTABLE_MAX);
    var max = 0;
    graph.levels.forEach(function (lvl) {
      if (lvl > max) max = lvl;
    });
    return Math.max(0, Math.min(RELATION_DEPTH_SELECTABLE_MAX, max));
  }

  /** Lien orienté a → b dans les données (`liees`). */
  function hasDirectedLink(fromId, toId) {
    var d = state.byId.get(fromId);
    if (!d || !toId) return false;
    return (d.liees || []).indexOf(toId) !== -1;
  }

  /**
   * BFS depuis id jusqu'à maxDepth.
   * levels: Map(id → niveau), 0 = sélection.
   * edges: liens {a,b,level,ab,ba} — ab/ba = sens déclarés dans liees.
   */
  function buildRelationGraph(id, maxDepth) {
    var levels = new Map();
    var edges = [];
    if (!id || !state.byId.has(id)) return { levels: levels, edges: edges };

    var depth = Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, maxDepth || 1));
    levels.set(id, 0);
    var frontier = [id];
    var d;
    for (d = 1; d <= depth; d++) {
      var next = [];
      frontier.forEach(function (uid) {
        getNeighbors(uid).forEach(function (vid) {
          if (levels.has(vid)) return;
          if (!state.byId.has(vid)) return;
          levels.set(vid, d);
          next.push(vid);
        });
      });
      frontier = next;
      if (!frontier.length) break;
    }

    var ids = Array.from(levels.keys());
    ids.forEach(function (a) {
      getNeighbors(a).forEach(function (b) {
        if (!levels.has(b)) return;
        if (String(a) >= String(b)) return;
        var edgeLevel = Math.max(levels.get(a), levels.get(b));
        if (edgeLevel < 1) return;
        var ab = hasDirectedLink(a, b);
        var ba = hasDirectedLink(b, a);
        // Voisinage inverse sans liees explicite : flèche chronologique plus bas.
        if (!ab && !ba) {
          ab = true;
          ba = true;
        }
        edges.push({ a: a, b: b, level: edgeLevel, ab: ab, ba: ba });
      });
    });

    return { levels: levels, edges: edges };
  }

  /** Ensemble sélection + relations jusqu'à la profondeur courante. */
  function getRelatedSet(id) {
    return new Set(buildRelationGraph(id, currentRelationDepth()).levels.keys());
  }

  function selectedHasLinks() {
    if (!state.selectedId) return false;
    // Toujours basé sur le voisinage direct (niveau 1).
    return getNeighbors(state.selectedId).size > 0;
  }

  /** Chaîne chronologique pour tri / liste / mode simple. */
  function getChainIds() {
    if (!state.selectedId || !selectedHasLinks()) return [];
    var set = getRelatedSet(state.selectedId);
    return Array.from(set)
      .map(function (id) {
        return state.byId.get(id);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return a.nom.localeCompare(b.nom, "fr");
      })
      .map(function (d) {
        return d.id;
      });
  }

  function chainIndexMap() {
    var ids = getChainIds();
    var map = new Map();
    ids.forEach(function (id, i) {
      map.set(id, i);
    });
    return map;
  }

  function chainColorForLevel(level) {
    var n = Math.max(1, Math.min(10, level || 1));
    var probe = document.createElement("span");
    probe.style.color = "var(--chain-l" + n + ")";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    var resolved = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    if (resolved && resolved !== "rgba(0, 0, 0, 0)" && resolved !== "transparent") {
      return resolved;
    }
    var fallback = getComputedStyle(document.documentElement)
      .getPropertyValue("--chain-link")
      .trim();
    return fallback || "#d5803b";
  }

  function legendLevelFilterActive() {
    return !!(state.legendLevelFilter && state.legendLevelFilter.size > 0);
  }

  function legendImportanceFilterActive() {
    return !!(state.legendImportanceFilter && state.legendImportanceFilter.size > 0);
  }

  function legendJuridictionFilterActive() {
    return !!(state.legendJuridictionFilter && state.legendJuridictionFilter.size > 0);
  }

  function anyLegendFilterActive() {
    return (
      legendLevelFilterActive() ||
      legendImportanceFilterActive() ||
      legendJuridictionFilterActive()
    );
  }

  /** @deprecated alias — niveaux */
  function legendFilterActive() {
    return legendLevelFilterActive();
  }

  function isLegendLevelHighlighted(level) {
    if (!legendLevelFilterActive()) return true;
    return state.legendLevelFilter.has(level);
  }

  function isLegendImportanceHighlighted(imp) {
    if (!legendImportanceFilterActive()) return true;
    return state.legendImportanceFilter.has(imp);
  }

  function isLegendJuridictionHighlighted(key) {
    if (!legendJuridictionFilterActive()) return true;
    return state.legendJuridictionFilter.has(key);
  }

  function pruneLegendLevelFilter(maxDepth) {
    if (!state.legendLevelFilter) return;
    var next = new Set();
    state.legendLevelFilter.forEach(function (lvl) {
      if (lvl >= 1 && lvl <= maxDepth) next.add(lvl);
    });
    state.legendLevelFilter = next.size ? next : null;
  }

  /** Niveau BFS (0 = sélection) ; null si hors graphe courant. */
  function relationLevelOf(id, levels) {
    if (!levels || !levels.has(id)) return null;
    return levels.get(id);
  }

  /**
   * Décision à griser si un filtre légende actif l’exclut.
   * La décision sélectionnée reste toujours lisible.
   */
  function isDecisionDimmedByLegend(id, levels) {
    if (id === state.selectedId) return false;
    if (!anyLegendFilterActive()) return false;
    var d = state.byId.get(id);
    if (!d) return false;

    if (legendLevelFilterActive()) {
      var lvl = relationLevelOf(id, levels);
      if (lvl != null && lvl >= 1 && !state.legendLevelFilter.has(lvl)) return true;
    }

    if (legendImportanceFilterActive()) {
      var imp = d.importance || 1;
      if (!state.legendImportanceFilter.has(imp)) return true;
    }

    if (legendJuridictionFilterActive()) {
      var jkey = juridictionColKey(d.juridiction);
      if (!state.legendJuridictionFilter.has(jkey)) return true;
    }

    return false;
  }

  function currentRelationLevels() {
    if (!state.selectedId || !selectedHasLinks()) return new Map();
    return buildRelationGraph(state.selectedId, currentRelationDepth()).levels;
  }

  function applyLegendDimToMarkers() {
    if (!els.timeline) return;
    var levels = currentRelationLevels();
    els.timeline.querySelectorAll(".marker").forEach(function (btn) {
      var id = btn.dataset.id;
      var dim = isDecisionDimmedByLegend(id, levels);
      btn.classList.toggle("is-legend-dimmed", dim);
      var wrap = btn.closest(".marker-with-label");
      if (wrap) {
        wrap.classList.toggle("is-legend-dimmed", dim);
        var nom = wrap.querySelector(".marker-with-label__nom");
        if (nom) nom.classList.toggle("is-legend-dimmed", dim);
      }
    });
  }

  function applyLegendFilterToGraph() {
    var Graph = window.ChronoRelationGraph;
    if (!Graph) return;
    if (typeof Graph.setLegendFilters === "function") {
      Graph.setLegendFilters({
        levels:
          state.multiRelations && legendLevelFilterActive()
            ? state.legendLevelFilter
            : null,
        importance: legendImportanceFilterActive()
          ? state.legendImportanceFilter
          : null,
        juridictions: legendJuridictionFilterActive()
          ? state.legendJuridictionFilter
          : null,
      });
      return;
    }
    if (typeof Graph.setLegendFilter === "function") {
      Graph.setLegendFilter(
        state.multiRelations && legendLevelFilterActive()
          ? state.legendLevelFilter
          : null
      );
    }
  }

  function refreshLegendFiltersUi() {
    updateLevelsLegend();
    syncImportanceLegend();
    syncJuridictionLegend();
    applyLegendDimToMarkers();
    applyLegendFilterToGraph();
    scheduleDrawChainLinks();
  }

  function toggleSetFilter(key, value) {
    if (!state[key]) state[key] = new Set();
    if (state[key].has(value)) state[key].delete(value);
    else state[key].add(value);
    if (state[key].size === 0) state[key] = null;
  }

  function toggleLegendLevel(level) {
    toggleSetFilter("legendLevelFilter", level);
    refreshLegendFiltersUi();
  }

  function toggleLegendImportance(imp) {
    toggleSetFilter("legendImportanceFilter", imp);
    refreshLegendFiltersUi();
  }

  function toggleLegendJuridiction(key) {
    toggleSetFilter("legendJuridictionFilter", key);
    refreshLegendFiltersUi();
  }

  function legendToggleBtnClass(filtering, on) {
    return (
      "legend__item legend__item--toggle" +
      (filtering && on ? " is-selected" : "") +
      (filtering && !on ? " is-dimmed" : "")
    );
  }

  /* —— Multi-select widgets —— */

  function buildMultiSelect(root, values, selected, placeholder) {
    root.innerHTML = "";
    root.classList.add("ms");
    root.dataset.msId = root.id;

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ms__toggle";
    toggle.setAttribute("aria-haspopup", "listbox");
    toggle.setAttribute("aria-expanded", "false");

    var label = document.createElement("span");
    label.className = "ms__toggle-label";
    toggle.appendChild(label);

    var chev = document.createElement("span");
    chev.className = "ms__chevron";
    chev.textContent = "▾";
    chev.setAttribute("aria-hidden", "true");
    toggle.appendChild(chev);

    var panel = document.createElement("div");
    panel.className = "ms__panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-multiselectable", "true");

    if (!values.length) {
      var empty = document.createElement("div");
      empty.className = "ms__empty";
      empty.textContent = "Aucune option";
      panel.appendChild(empty);
    } else {
      values.forEach(function (v) {
        var lab = document.createElement("label");
        lab.className = "ms__option";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = v;
        cb.checked = selected.indexOf(v) !== -1;
        cb.addEventListener("change", function () {
          onFilterChange();
        });
        var span = document.createElement("span");
        span.textContent = v;
        lab.appendChild(cb);
        lab.appendChild(span);
        panel.appendChild(lab);
      });
    }

    root.appendChild(toggle);
    root.appendChild(panel);

    function refreshLabel() {
      var sel = getMsSelected(root);
      if (!sel.length) label.textContent = placeholder;
      else if (sel.length === 1) label.textContent = sel[0];
      else label.textContent = sel.length + " sélection(s)";
    }

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = panel.hidden;
      closeAllMs();
      if (willOpen) {
        panel.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        openMsId = root.id;
      }
    });

    root._msRefreshLabel = refreshLabel;
    refreshLabel();
  }

  function getMsSelected(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('input[type="checkbox"]:checked')).map(function (cb) {
      return cb.value;
    });
  }

  function closeAllMs() {
    document.querySelectorAll(".ms__panel").forEach(function (p) {
      p.hidden = true;
    });
    document.querySelectorAll(".ms__toggle").forEach(function (t) {
      t.setAttribute("aria-expanded", "false");
    });
    openMsId = null;
  }

  function populateFilterOptions(data) {
    var decisions = data.decisions || [];
    var themes = uniqueSorted(
      decisions.map(function (d) {
        return d.theme;
      })
    );
    var notions = uniqueSorted(
      decisions.reduce(function (acc, d) {
        return acc.concat(d.notions || []);
      }, [])
    );
    var juridictions = uniqueSorted(
      decisions.map(function (d) {
        return d.juridiction;
      })
    );

    buildMultiSelect(els.themes, themes, state.filters.themes, "Tous les thèmes");
    buildMultiSelect(els.juridictions, juridictions, state.filters.juridictions, "Toutes les juridictions");
    buildMultiSelect(els.notions, notions, state.filters.notions, "Toutes les notions");
    updateFormationOptions();
  }

  function updateFormationOptions() {
    if (!els.formations) return;
    var jKeys = getMsSelected(els.juridictions);
    var prev = getMsSelected(els.formations);
    var decisions = (state.raw && state.raw.decisions) || [];
    var seen = {};
    var options = [];
    if (jKeys.length) {
      decisions.forEach(function (d) {
        if (jKeys.indexOf(d.juridiction) === -1) return;
        var f = String(d.formation || "").trim();
        if (!f || seen[f]) return;
        seen[f] = true;
        options.push(f);
      });
      options = uniqueSorted(options);
    }
    var keep = prev.filter(function (v) {
      return options.indexOf(v) !== -1;
    });
    state.filters.formations = keep;
    buildMultiSelect(els.formations, options, keep, "Toutes les formations");
    var active = Boolean(jKeys.length && options.length);
    var field = els.formations.closest(".field");
    if (field) field.classList.toggle("is-collapsed", !active);
    var row = els.formations.closest(".filters__row--primary");
    if (row) row.classList.toggle("has-formation", active);
  }

  function selectedImportance() {
    return Array.from(document.querySelectorAll('input[name="importance"]:checked')).map(
      function (el) {
        return Number(el.value);
      }
    );
  }

  function readFiltersFromDom() {
    state.filters.q = ((els.search && els.search.value) || "").trim().toLowerCase();
    state.filters.reference = ((els.reference && els.reference.value) || "").trim().toLowerCase();
    state.filters.themes = getMsSelected(els.themes);
    state.filters.notions = getMsSelected(els.notions);
    state.filters.juridictions = getMsSelected(els.juridictions);
    state.filters.formations = getMsSelected(els.formations);
    state.filters.importance = selectedImportance();
    state.filters.dateFrom = (els.dateFrom && els.dateFrom.value) || null;
    state.filters.dateTo = (els.dateTo && els.dateTo.value) || null;

    if (els.relatedOnly && !els.relatedOnly.disabled) {
      state.relatedOnly = !!els.relatedOnly.checked;
    }

    if (els.themes && els.themes._msRefreshLabel) els.themes._msRefreshLabel();
    if (els.notions && els.notions._msRefreshLabel) els.notions._msRefreshLabel();
    if (els.juridictions && els.juridictions._msRefreshLabel) els.juridictions._msRefreshLabel();
    if (els.formations && els.formations._msRefreshLabel) els.formations._msRefreshLabel();
  }

  function applyFilters() {
    var f = state.filters;
    var list = (state.raw && state.raw.decisions) || [];

    state.filtered = list.filter(function (d) {
      if (f.themes.length && f.themes.indexOf(d.theme) === -1) return false;
      if (f.importance.length && f.importance.indexOf(d.importance) === -1) return false;
      if (f.juridictions.length && f.juridictions.indexOf(d.juridiction) === -1) return false;
      if (f.formations && f.formations.length && f.formations.indexOf(d.formation) === -1) {
        return false;
      }
      if (f.reference) {
        var ref = String(d.reference || "").toLowerCase();
        if (ref.indexOf(f.reference) === -1) return false;
      }
      if (f.notions.length) {
        var ok = f.notions.every(function (n) {
          return (d.notions || []).indexOf(n) !== -1;
        });
        if (!ok) return false;
      }

      var ds = String(d.date || "").slice(0, 10);
      if (f.dateFrom && ds < f.dateFrom) return false;
      if (f.dateTo && ds > f.dateTo) return false;

      if (f.q) {
        var hay = [d.nom, d.objet, d.verso, d.portee, d.theme]
          .concat(d.notions || [])
          .join(" ")
          .toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });

    state.filtered.sort(function (a, b) {
      var desc = state.chronoOrder === "desc";
      if (a.date < b.date) return desc ? 1 : -1;
      if (a.date > b.date) return desc ? -1 : 1;
      return a.nom.localeCompare(b.nom, "fr");
    });

    if (state.relatedOnly && state.selectedId && selectedHasLinks()) {
      var rel = getRelatedSet(state.selectedId);
      state.displayed = state.filtered.filter(function (d) {
        return rel.has(d.id);
      });
    } else {
      state.displayed = state.filtered.slice();
    }

    updateCounts();
    updateActiveFiltersLabel();
    updateRelatedOnlyUi();
    render();
  }

  function updateCounts() {
    var total = (state.raw && state.raw.decisions && state.raw.decisions.length) || 0;
    var n = state.displayed.length;
    if (els.countFiltered) els.countFiltered.textContent = String(n);
    if (els.countTotal) els.countTotal.textContent = String(total);
    if (els.metaGenerated && state.raw && state.raw.meta) {
      els.metaGenerated.textContent = state.raw.meta.generatedAt
        ? new Date(state.raw.meta.generatedAt).toLocaleString("fr-FR")
        : "—";
    }
  }

  function updateActiveFiltersLabel() {
    if (!els.activeFiltersList) return;
    var parts = [];
    var f = state.filters;

    if (f.q) parts.push('recherche « ' + f.q + ' »');
    if (f.reference) parts.push("référence « " + f.reference + " »");
    if (f.themes.length) {
      parts.push("thème" + (f.themes.length > 1 ? "s" : "") + " : " + f.themes.join(", "));
    }
    if (f.juridictions.length) {
      parts.push(
        "juridiction" +
          (f.juridictions.length > 1 ? "s" : "") +
          " : " +
          f.juridictions.join(", ")
      );
    }
    if (f.formations && f.formations.length) {
      parts.push(
        "formation" +
          (f.formations.length > 1 ? "s" : "") +
          " : " +
          f.formations.join(", ")
      );
    }
    if (f.notions.length) {
      parts.push("notion" + (f.notions.length > 1 ? "s" : "") + " : " + f.notions.join(", "));
    }
    if (f.importance.length && f.importance.length < 4) {
      parts.push("importance : " + f.importance.map(stars).join(" "));
    }
    if (f.dateFrom || f.dateTo) {
      parts.push(
        "période : " +
          (f.dateFrom ? formatDateFr(f.dateFrom) : "…") +
          " → " +
          (f.dateTo ? formatDateFr(f.dateTo) : "…")
      );
    }
    if (state.relatedOnly && state.selectedId && selectedHasLinks()) {
      parts.push("uniquement décisions liées");
    }
    if (state.multiRelations && state.selectedId && selectedHasLinks()) {
      parts.push("multi-relations · " + currentRelationDepth() + " niveau(x)");
    }

    els.activeFiltersList.textContent = parts.length ? parts.join(" · ") : "aucun";
  }

  function updateRelationDepthOptions() {
    if (!els.relationDepth) return;
    var maxReachable = selectedHasLinks() ? maxReachableRelationDepth(state.selectedId) : 0;
    if (maxReachable < 1) maxReachable = 1;
    if (maxReachable > RELATION_DEPTH_SELECTABLE_MAX) {
      maxReachable = RELATION_DEPTH_SELECTABLE_MAX;
    }

    var options = els.relationDepth.options;
    var i;
    for (i = 0; i < options.length; i++) {
      var opt = options[i];
      var val = Number(opt.value);
      // 7 = fantôme réservé ; les autres suivent la profondeur réellement atteignable.
      var isGhost = val === RELATION_DEPTH_UI_MAX;
      var reachable =
        !isGhost && isFinite(val) && val >= 1 && val <= maxReachable;
      opt.disabled = !reachable;
      opt.classList.toggle("is-unreachable", !reachable);
      opt.classList.toggle("is-ghost", isGhost);
      if (isGhost) {
        opt.title = "Niveau bientôt disponible";
      } else if (!reachable) {
        opt.title = "Aucun chemin à ce niveau depuis la décision sélectionnée";
      } else {
        opt.removeAttribute("title");
      }
    }

    if (state.multiRelations) {
      var depth = currentRelationDepth();
      if (depth > maxReachable) {
        state.relationDepth = maxReachable;
        depth = maxReachable;
      }
      // Si l'option courante est disabled (navigateur), forcer une valeur valide.
      els.relationDepth.value = String(depth);
      if (els.relationDepth.value !== String(depth)) {
        els.relationDepth.selectedIndex = Math.max(0, maxReachable - 1);
        state.relationDepth = Number(els.relationDepth.value) || maxReachable;
      }
    }

    els.relationDepth.title =
      "Profondeur max disponible pour cette décision : " +
      maxReachable +
      " (7 bientôt)";
  }

  function updateLevelsLegend() {
    if (!els.legendLevels) return;
    var show = !!(state.multiRelations && selectedHasLinks());
    els.legendLevels.hidden = !show;
    els.legendLevels.innerHTML = "";
    if (!show) {
      var hadFilter = !!state.legendLevelFilter;
      state.legendLevelFilter = null;
      if (hadFilter) {
        applyLegendDimToMarkers();
        applyLegendFilterToGraph();
      }
      return;
    }

    var depth = currentRelationDepth();
    pruneLegendLevelFilter(depth);

    var caption = document.createElement("span");
    caption.className = "legend__caption";
    caption.textContent = "Relations";
    els.legendLevels.appendChild(caption);

    var filtering = legendLevelFilterActive();
    var lvl;
    for (lvl = 1; lvl <= depth; lvl++) {
      (function (level) {
        var color = chainColorForLevel(level);
        var on = isLegendLevelHighlighted(level);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = legendToggleBtnClass(filtering, on);
        btn.dataset.level = String(level);
        btn.setAttribute("aria-pressed", filtering && on ? "true" : "false");
        btn.title =
          (filtering && on ? "Désélectionner" : "Mettre en avant") +
          " le niveau " +
          level;

        var arrow = document.createElement("span");
        arrow.className = "legend__arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.style.color = color;
        arrow.innerHTML =
          '<svg viewBox="0 0 28 10" focusable="false">' +
          '<path d="M1 5 H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '<path d="M17 1.5 L24 5 L17 8.5 Z" fill="currentColor"/>' +
          "</svg>";

        var label = document.createElement("span");
        label.className = "legend__level-label";
        label.textContent = "Niv. " + level;

        btn.appendChild(arrow);
        btn.appendChild(label);
        btn.addEventListener("click", function () {
          toggleLegendLevel(level);
        });
        els.legendLevels.appendChild(btn);
      })(lvl);
    }
  }

  function syncImportanceLegend() {
    var block = els.legendImportance;
    if (!block) return;
    block.innerHTML = "";

    var caption = document.createElement("span");
    caption.className = "legend__caption";
    caption.textContent = "Importance";
    block.appendChild(caption);

    var filtering = legendImportanceFilterActive();
    [4, 3, 2, 1].forEach(function (imp) {
      var on = isLegendImportanceHighlighted(imp);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = legendToggleBtnClass(filtering, on);
      btn.dataset.importance = String(imp);
      btn.setAttribute("aria-pressed", filtering && on ? "true" : "false");
      btn.title =
        (filtering && on ? "Désélectionner" : "Mettre en avant") +
        " l’importance " +
        "★".repeat(imp);

      var swatch = document.createElement("span");
      swatch.className = "legend__marker";
      swatch.dataset.importance = String(imp);
      swatch.setAttribute("aria-hidden", "true");

      var starsEl = document.createElement("span");
      starsEl.className = "legend__stars";
      starsEl.textContent = "★".repeat(imp);

      btn.appendChild(swatch);
      btn.appendChild(starsEl);
      btn.addEventListener("click", function () {
        toggleLegendImportance(imp);
      });
      block.appendChild(btn);
    });
  }

  /** Légende juridictions : visible en vue horizontale (plus de colonne de noms). */
  function syncJuridictionLegend() {
    var block = els.legendJuridictions;
    if (!block) return;
    var show = (state.orientation || "vertical") === "horizontal";
    block.hidden = !show;
    if (!show) {
      var had = !!state.legendJuridictionFilter;
      state.legendJuridictionFilter = null;
      if (had) {
        applyLegendDimToMarkers();
        applyLegendFilterToGraph();
        scheduleDrawChainLinks();
      }
      return;
    }

    block.innerHTML = "";
    var caption = document.createElement("span");
    caption.className = "legend__caption";
    caption.textContent = "Juridictions";
    block.appendChild(caption);

    var filtering = legendJuridictionFilterActive();
    JURIDICTION_COLS.forEach(function (col) {
      var on = isLegendJuridictionHighlighted(col.key);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = legendToggleBtnClass(filtering, on);
      btn.dataset.jur = col.key;
      btn.setAttribute("aria-pressed", filtering && on ? "true" : "false");
      btn.title =
        (filtering && on ? "Désélectionner" : "Mettre en avant") +
        " : " +
        col.label;

      var swatch = document.createElement("span");
      swatch.className = "legend__marker legend__marker--jur";
      swatch.dataset.jur = col.key;
      swatch.setAttribute("aria-hidden", "true");

      var label = document.createElement("span");
      label.className = "legend__jur-label";
      label.textContent = col.short;

      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener("click", function () {
        toggleLegendJuridiction(col.key);
      });
      block.appendChild(btn);
    });
  }

  function updateRelatedOnlyUi() {
    var hasLinks = selectedHasLinks();
    // Multi-relations : uniquement s’il existe au moins un niveau 2 atteignable.
    var maxDepth = hasLinks ? maxReachableRelationDepth(state.selectedId) : 0;
    var multiAvailable = hasLinks && maxDepth >= 2;

    if (els.relatedOnly && els.relatedOnlyWrap) {
      els.relatedOnly.disabled = !hasLinks;
      els.relatedOnlyWrap.classList.toggle("is-disabled", !hasLinks);
      els.relatedOnlyWrap.classList.add("is-visible");
      if (!hasLinks) {
        if (els.relatedOnly.checked) els.relatedOnly.checked = false;
        state.relatedOnly = false;
      }
      els.relatedOnlyWrap.title = hasLinks
        ? "N’afficher que la décision sélectionnée et ses décisions liées"
        : "Sélectionnez une décision qui a des décisions liées";
    }

    if (els.multiRelations && els.multiRelationsWrap) {
      els.multiRelations.disabled = !multiAvailable;
      els.multiRelationsWrap.classList.toggle("is-disabled", !multiAvailable);
      els.multiRelationsWrap.classList.add("is-visible");
      if (!multiAvailable) {
        if (els.multiRelations.checked) els.multiRelations.checked = false;
        state.multiRelations = false;
      }
      els.multiRelationsWrap.title = multiAvailable
        ? "Étendre aux relations des relations (flèches colorées par niveau)"
        : hasLinks
          ? "Aucune profondeur multi-relations depuis cette décision (max. 1 niveau)"
          : "Sélectionnez une décision qui a des décisions liées";
    }

    if (els.multiRelationsDepth) {
      var showDepth = !!(multiAvailable && state.multiRelations);
      els.multiRelationsDepth.hidden = !showDepth;
    }
    if (els.relationDepth) {
      els.relationDepth.disabled = !multiAvailable || !state.multiRelations;
      updateRelationDepthOptions();
    }
    updateLevelsLegend();
  }

  function syncOrientationUi() {
    var orient = state.orientation === "horizontal" ? "horizontal" : "vertical";
    state.orientation = orient;
    document.body.dataset.chronoOrientation = orient;
    syncJuridictionLegend();
    if (!els.orientationToggle) return;
    var isVertical = orient === "vertical";
    els.orientationToggle.classList.toggle("is-vertical", isVertical);
    els.orientationToggle.classList.toggle("is-horizontal", !isVertical);
    els.orientationToggle.setAttribute("aria-pressed", isVertical ? "true" : "false");
    els.orientationToggle.setAttribute(
      "aria-label",
      isVertical ? "Basculer vers la frise horizontale" : "Basculer vers la frise verticale"
    );
    els.orientationToggle.title = isVertical
      ? "Vue verticale — cliquer pour passer en horizontale"
      : "Vue horizontale — cliquer pour passer en verticale";
    if (els.orientationToggleLabel) {
      els.orientationToggleLabel.textContent = isVertical ? "Verticale" : "Horizontale";
    }
  }

  function syncChronoOrderUi() {
    var desc = state.chronoOrder === "desc";
    if (!els.chronoOrderToggle) return;
    els.chronoOrderToggle.classList.toggle("is-desc", desc);
    els.chronoOrderToggle.setAttribute("aria-pressed", desc ? "true" : "false");
    els.chronoOrderToggle.setAttribute(
      "aria-label",
      desc
        ? "Passer en ordre croissant (plus ancien en premier)"
        : "Passer en ordre décroissant (plus récent en premier)"
    );
    els.chronoOrderToggle.title = desc
      ? "Ordre : date décroissante"
      : "Ordre : date croissante";
    if (els.chronoOrderToggleLabel) {
      els.chronoOrderToggleLabel.textContent = desc
        ? "Date décroissante"
        : "Date croissante";
    }
  }

  /** Comparaison numérique / string selon l’ordre chrono de la frise. */
  function chronoDir() {
    return state.chronoOrder === "desc" ? -1 : 1;
  }

  function cmpChronoNum(a, b) {
    if (a === b) return 0;
    return (a < b ? -1 : 1) * chronoDir();
  }

  function cmpChronoStr(a, b) {
    if (a === b) return 0;
    return (a < b ? -1 : 1) * chronoDir();
  }

  function syncScaleUi() {
    document.querySelectorAll("[data-scale]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-scale") === state.scale);
    });
    if (els.timelineTitle) {
      if (state.scale === "month") els.timelineTitle.textContent = "Frise par mois";
      else if (state.scale === "day") els.timelineTitle.textContent = "Frise par jours";
      else els.timelineTitle.textContent = "Frise par années";
    }
  }

  function render() {
    if (state.view === "list") {
      els.timelinePanel.hidden = true;
      els.listPanel.hidden = false;
      renderList();
    } else {
      els.timelinePanel.hidden = false;
      els.listPanel.hidden = true;
      renderTimeline();
    }
    renderDetail();
    syncViewButtons();
    syncScaleUi();
    syncOrientationUi();
    syncChronoOrderUi();
    syncImportanceLegend();
    syncRelationGraph();
  }

  function layoutGraphPanel() {
    var panel = els.graphPanel;
    var frise = els.timelinePanel;
    if (!panel || panel.hidden || !frise) return;
    var friseRect = frise.getBoundingClientRect();
    var gap = 12;
    var left = 0;
    var width = Math.max(260, Math.floor(friseRect.left - gap));
    // Si presque pas de gouttière (écran étroit), prendre ~38vw mais rester à gauche.
    if (width < 280) {
      width = Math.min(Math.floor(window.innerWidth * 0.42), Math.max(240, friseRect.left - 8));
    }
    var top = Math.max(0, Math.floor(friseRect.top));
    // Hauteur ~carrée (comme la capture), plafonnée à la frise / ~58vh.
    var height = Math.min(
      Math.floor(friseRect.height),
      Math.floor(window.innerHeight * 0.58),
      Math.max(300, Math.round(width * 1.08))
    );
    panel.style.position = "fixed";
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.width = width + "px";
    panel.style.height = height + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function syncRelationGraph() {
    var panel = els.graphPanel;
    var workspace = els.workspace;
    var Graph = window.ChronoRelationGraph;
    if (!panel || !workspace) return;

    var show =
      state.view === "timeline" &&
      !!state.selectedId &&
      selectedHasLinks() &&
      !state.graphUserClosed;

    document.documentElement.classList.toggle("is-chrono-graph-open", show);
    document.body.classList.toggle("is-chrono-graph-open", show);
    workspace.classList.toggle("is-graph-open", show);

    if (!show) {
      panel.hidden = true;
      panel.style.width = "";
      panel.style.height = "";
      panel.style.top = "";
      panel.style.left = "";
      if (Graph && Graph.isVisible()) Graph.hide();
      return;
    }

    panel.hidden = false;
    layoutGraphPanel();
    if (Graph) {
      // Profondeur affichée = profondeur multi active (sinon voisinage direct).
      Graph.show(state.selectedId, state.byId, currentRelationDepth());
      applyLegendFilterToGraph();
      requestAnimationFrame(function () {
        layoutGraphPanel();
        Graph.resize();
        applyLegendFilterToGraph();
      });
    }
  }

  function syncViewButtons() {
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === state.view);
    });
    if (els.scaleSegmented) {
      els.scaleSegmented.hidden = state.view !== "timeline";
    }
  }

  function decadeOf(year) {
    return Math.floor(year / 10) * 10;
  }

  function parseDateParts(iso) {
    var p = String(iso || "").slice(0, 10).split("-");
    var y = Number(p[0]) || 0;
    var m = Number(p[1]) || 1;
    var d = Number(p[2]) || 1;
    return { y: y, m: m, d: d, ym: y + "-" + String(m).padStart(2, "0") };
  }

  function monthLabel(ym) {
    var p = String(ym).split("-");
    var y = p[0];
    var mi = Number(p[1]) - 1;
    var mon = MONTH_SHORT[mi] || p[1];
    return mon + " " + y;
  }

  function sortDecisions(items, chainActive, chainMap) {
    var desc = state.chronoOrder === "desc";
    return items.slice().sort(function (a, b) {
      if (chainActive && chainMap.has(a.id) && chainMap.has(b.id)) {
        return chainMap.get(a.id) - chainMap.get(b.id);
      }
      if (a.date < b.date) return desc ? 1 : -1;
      if (a.date > b.date) return desc ? -1 : 1;
      return a.nom.localeCompare(b.nom, "fr");
    });
  }

  /**
   * Titre seul : après la 2ᵉ virgule, sans parenthèses.
   * Si > 21 car. : « … » + à partir du mot entier qui contient le 21ᵉ caractère
   * (pas de coupure au milieu d’un mot).
   */
  function formatFriseNom(nom, full) {
    var raw = String(nom || "").trim();
    if (full) return raw;
    var i1 = raw.indexOf(",");
    var title = raw;
    if (i1 !== -1) {
      var i2 = raw.indexOf(",", i1 + 1);
      if (i2 !== -1) title = raw.slice(i2 + 1).trim();
    }
    title = title
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length <= 21) return title;

    // Index 0-based du 21ᵉ caractère → trouver le début du mot qui le contient.
    var idx = 20;
    var start = idx;
    while (start > 0 && !/\s/.test(title.charAt(start - 1))) {
      start -= 1;
    }
    return "…" + title.slice(start);
  }

  function appendMarkers(dots, items, chainActive, chainMap, showNomLabel) {
    var isVertical = (state.orientation || "vertical") === "vertical";
    var hideOthersVertical =
      isVertical && !!state.selectedId && selectedHasLinks();
    var relLevels = anyLegendFilterActive() ? currentRelationLevels() : null;

    sortDecisions(items, chainActive, chainMap).forEach(function (d) {
      var inChain =
        !!state.selectedId &&
        (d.id === state.selectedId || (chainMap && chainMap.has(d.id)));

      var withNom = false;
      if (showNomLabel === true) {
        // Vertical : si sélection liée → uniquement les noms de la chaîne (complets).
        withNom = hideOthersVertical ? inChain : true;
      } else if (showNomLabel === "selected-or-chain") {
        withNom = inChain;
      }

      var fullNom = inChain;
      var legendDim = isDecisionDimmedByLegend(d.id, relLevels);

      if (withNom) {
        var wrap = document.createElement("div");
        wrap.className = "marker-with-label";
        if (fullNom) wrap.classList.add("is-full-nom");
        if (legendDim) wrap.classList.add("is-legend-dimmed");
        wrap.appendChild(makeMarker(d, chainActive, chainMap, legendDim));
        var lab = document.createElement("div");
        lab.className = "marker-with-label__nom";
        if (fullNom) lab.classList.add("is-full");
        if (legendDim) lab.classList.add("is-legend-dimmed");
        lab.dataset.importance = String(d.importance || 1);
        lab.textContent = formatFriseNom(d.nom, fullNom);
        lab.title = d.nom || "";
        wrap.appendChild(lab);
        dots.appendChild(wrap);
      } else {
        dots.appendChild(makeMarker(d, chainActive, chainMap, legendDim));
      }
    });
  }

  function buildTimelineSegments() {
    var scale = state.scale || "year";
    var segments = [];

    if (scale === "month") {
      var byYear = new Map();
      state.displayed.forEach(function (d) {
        if (!byYear.has(d.annee)) byYear.set(d.annee, []);
        byYear.get(d.annee).push(d);
      });
      Array.from(byYear.keys())
        .sort(cmpChronoNum)
        .forEach(function (year) {
          var byMonth = new Map();
          byYear.get(year).forEach(function (d) {
            var parts = parseDateParts(d.date);
            if (!byMonth.has(parts.m)) byMonth.set(parts.m, []);
            byMonth.get(parts.m).push(d);
          });
          var units = Array.from(byMonth.keys())
            .sort(cmpChronoNum)
            .map(function (m) {
              return { label: MONTH_SHORT[m - 1] || String(m), items: byMonth.get(m) };
            });
          segments.push({ label: String(year), units: units });
        });
    } else if (scale === "day") {
      var byYm = new Map();
      state.displayed.forEach(function (d) {
        var parts = parseDateParts(d.date);
        if (!byYm.has(parts.ym)) byYm.set(parts.ym, []);
        byYm.get(parts.ym).push(d);
      });
      Array.from(byYm.keys())
        .sort(cmpChronoStr)
        .forEach(function (ym) {
          var byDay = new Map();
          byYm.get(ym).forEach(function (d) {
            var parts = parseDateParts(d.date);
            var dayKey = String(parts.d).padStart(2, "0");
            if (!byDay.has(dayKey)) byDay.set(dayKey, []);
            byDay.get(dayKey).push(d);
          });
          var units = Array.from(byDay.keys())
            .sort(function (a, b) {
              return cmpChronoNum(Number(a), Number(b));
            })
            .map(function (dayKey) {
              return { label: dayKey, items: byDay.get(dayKey) };
            });
          segments.push({ label: monthLabel(ym), units: units });
        });
    } else {
      var byDecade = new Map();
      state.displayed.forEach(function (d) {
        var dec = decadeOf(d.annee);
        if (!byDecade.has(dec)) byDecade.set(dec, []);
        byDecade.get(dec).push(d);
      });
      Array.from(byDecade.keys())
        .sort(cmpChronoNum)
        .forEach(function (dec) {
          var byY = new Map();
          byDecade.get(dec).forEach(function (d) {
            if (!byY.has(d.annee)) byY.set(d.annee, []);
            byY.get(d.annee).push(d);
          });
          var units = Array.from(byY.keys())
            .sort(cmpChronoNum)
            .map(function (year) {
              return { label: String(year), items: byY.get(year) };
            });
          segments.push({ label: String(dec), units: units });
        });
    }
    return segments;
  }

  /**
   * Regroupe les décisions d'une unité par colonne de juridiction.
   */
  function bucketByJuridiction(items) {
    var buckets = {};
    JURIDICTION_COLS.forEach(function (col) {
      buckets[col.key] = [];
    });
    items.forEach(function (d) {
      var key = juridictionColKey(d.juridiction);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(d);
    });
    return buckets;
  }

  function renderTimeline() {
    var root = els.timeline;
    root.innerHTML = "";
    root.dataset.scale = state.scale || "year";
    root.dataset.orientation = state.orientation || "vertical";
    root.style.removeProperty("--chain-arc-room");
    root.style.removeProperty("--h-row-gap");

    if (!state.displayed.length) {
      root.innerHTML = '<div class="empty">Aucune décision ne correspond aux filtres.</div>';
      return;
    }

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "timeline__links");
    svg.setAttribute("aria-hidden", "true");
    root.appendChild(svg);

    var chainMap = chainIndexMap();
    var chainActive = chainMap.size > 1;
    var relatedOnlyView = !!(state.relatedOnly && chainActive);
    var segments = buildTimelineSegments();

    if ((state.orientation || "vertical") === "vertical") {
      renderTimelineVertical(root, segments, chainMap, chainActive);
    } else {
      renderTimelineHorizontal(root, segments, chainMap, chainActive, relatedOnlyView);
    }
    scheduleDrawChainLinks();
  }

  /** Profondeur d’arc = niveau (pas d’adaptation au cadre). */
  function archDepthForLevel(level, orientation) {
    var lvl = Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, level || 1));
    if (orientation === "horizontal") return 28 + (lvl - 1) * 22;
    return 22 + (lvl - 1) * 16;
  }

  /** Couleur marqueur/arc en rgb() (les markers SVG aiment mal color(srgb…)). */
  function toRgbCss(color) {
    var s = String(color || "").trim();
    var m = s.match(/color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    if (m) {
      return (
        "rgb(" +
        Math.round(Number(m[1]) * 255) +
        ", " +
        Math.round(Number(m[2]) * 255) +
        ", " +
        Math.round(Number(m[3]) * 255) +
        ")"
      );
    }
    return s || "#d5803b";
  }

  function renderTimelineVertical(root, segments, chainMap, chainActive) {
    var grid = document.createElement("div");
    grid.className = "tgrid tgrid--vertical";
    var totalUnits = segments.reduce(function (n, seg) {
      return n + seg.units.length;
    }, 0);
    grid.style.gridTemplateColumns =
      "minmax(3.25rem, auto) minmax(2.75rem, auto) repeat(" +
      JURIDICTION_COLS.length +
      ", minmax(0, 1fr))";
    grid.style.gridTemplateRows =
      "auto repeat(" + totalUnits + ", minmax(var(--unit-min-h), auto))";

    /* Bandeau opaque sticky : masque le contenu qui défile sous les titres. */
    var headBar = document.createElement("div");
    headBar.className = "tgrid-v-headbar";
    headBar.setAttribute("aria-hidden", "true");
    headBar.style.gridColumn = "1 / -1";
    headBar.style.gridRow = "1";
    grid.appendChild(headBar);

    JURIDICTION_COLS.forEach(function (col, i) {
      var jHead = document.createElement("div");
      jHead.className = "tcol-head";
      jHead.textContent = col.short;
      jHead.title = col.label;
      jHead.style.gridColumn = String(i + 3);
      jHead.style.gridRow = "1";
      grid.appendChild(jHead);
    });

    var row = 2;
    segments.forEach(function (seg) {
      var segCount = seg.units.length;
      var head = document.createElement("div");
      head.className = "tseg-head";
      head.textContent = seg.label;
      head.style.gridColumn = "1";
      head.style.gridRow = row + " / " + (row + segCount);
      grid.appendChild(head);

      seg.units.forEach(function (unit) {
        var unitLabel = document.createElement("div");
        unitLabel.className = "tunit-head";
        unitLabel.textContent = unit.label;
        unitLabel.style.gridColumn = "2";
        unitLabel.style.gridRow = String(row);
        grid.appendChild(unitLabel);

        var buckets = bucketByJuridiction(unit.items);
        JURIDICTION_COLS.forEach(function (col, i) {
          var items = buckets[col.key];
          if (!items || !items.length) return;
          var cell = document.createElement("div");
          cell.className = "tcell";
          cell.style.gridColumn = String(i + 3);
          cell.style.gridRow = String(row);
          cell.style.zIndex = String(10 - i);
          appendMarkers(cell, items, chainActive, chainMap, true);
          grid.appendChild(cell);
        });

        row += 1;
      });
    });

    root.appendChild(grid);
  }

  function renderTimelineHorizontal(root, segments, chainMap, chainActive, relatedOnlyView) {
    var grid = document.createElement("div");
    grid.className = "tgrid tgrid--horizontal";
    var totalUnits = segments.reduce(function (n, seg) {
      return n + seg.units.length;
    }, 0);
    // Pas de colonne de libellés juridictions : les noms sont en légende.
    grid.style.gridTemplateColumns =
      "repeat(" + totalUnits + ", minmax(var(--unit-min-w), auto))";
    grid.style.gridTemplateRows =
      "auto auto repeat(" + JURIDICTION_COLS.length + ", minmax(var(--h-row-min, 56px), auto))";

    var col = 1;
    segments.forEach(function (seg) {
      var segCount = seg.units.length;
      var head = document.createElement("div");
      head.className = "tseg-head";
      head.textContent = seg.label;
      head.style.gridColumn = col + " / " + (col + segCount);
      head.style.gridRow = "1";
      grid.appendChild(head);

      seg.units.forEach(function (unit) {
        if (!relatedOnlyView) {
          var unitLabel = document.createElement("div");
          unitLabel.className = "tunit-head";
          unitLabel.textContent = unit.label;
          unitLabel.style.gridColumn = String(col);
          unitLabel.style.gridRow = "2";
          grid.appendChild(unitLabel);
        }

        var buckets = bucketByJuridiction(unit.items);
        JURIDICTION_COLS.forEach(function (jrow, i) {
          var items = buckets[jrow.key];
          if (!items || !items.length) return;
          var cell = document.createElement("div");
          cell.className = "tcell";
          cell.style.gridColumn = String(col);
          cell.style.gridRow = String(i + 3);
          // Nom toujours pour la sélection + ses relations (pas seulement en filtre « liées »).
          appendMarkers(cell, items, chainActive, chainMap, "selected-or-chain");
          grid.appendChild(cell);
        });

        col += 1;
      });
    });

    root.appendChild(grid);
  }

  function makeMarker(d, chainActive, chainMap, legendDim) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "marker";
    btn.dataset.id = d.id;
    btn.dataset.importance = String(d.importance || 1);
    btn.dataset.juridictionKey = juridictionKey(d.juridiction);
    if (!d.complete) btn.classList.add("is-incomplete");
    if (state.selectedId === d.id) btn.classList.add("is-selected");

    if (chainActive) {
      if (chainMap.has(d.id)) btn.classList.add("is-in-chain");
      else btn.classList.add("is-dimmed");
    }
    if (legendDim) btn.classList.add("is-legend-dimmed");

    btn.title = d.nom + " — " + formatDateFr(d.date);
    btn.setAttribute("aria-label", d.nom + ", " + formatDateFr(d.date));
    btn.addEventListener("click", function () {
      focus(d.id);
    });
    bindFicheTip(btn, d);
    return btn;
  }

  function scheduleDrawChainLinks() {
    if (linkDrawTimer) cancelAnimationFrame(linkDrawTimer);
    linkDrawTimer = requestAnimationFrame(function () {
      linkDrawTimer = requestAnimationFrame(drawChainLinks);
    });
  }

  function markerCenter(root, rootRect, id) {
    var el = root.querySelector('.marker[data-id="' + id + '"]');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return {
      id: id,
      x: r.left - rootRect.left - root.clientLeft + root.scrollLeft + r.width / 2,
      y: r.top - rootRect.top - root.clientTop + root.scrollTop + r.height / 2,
    };
  }

  /** Pointe de flèche dessinée en polygone (fiable, sans <marker> SVG). */
  function drawArrowTip(svg, tipX, tipY, dirX, dirY, color, dimmed) {
    var len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    var ux = dirX / len;
    var uy = dirY / len;
    var size = 9;
    var bx = tipX - ux * size;
    var by = tipY - uy * size;
    var px = -uy * size * 0.55;
    var py = ux * size * 0.55;
    var tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tip.setAttribute(
      "d",
      "M " +
        tipX.toFixed(1) +
        " " +
        tipY.toFixed(1) +
        " L " +
        (bx + px).toFixed(1) +
        " " +
        (by + py).toFixed(1) +
        " L " +
        (bx - px).toFixed(1) +
        " " +
        (by - py).toFixed(1) +
        " Z"
    );
    tip.setAttribute("class", "timeline__arrow-tip" + (dimmed ? " is-dimmed" : ""));
    tip.style.setProperty("--arrow-tip-fill", color);
    tip.style.fill = color;
    tip.setAttribute("fill", color);
    tip.setAttribute("stroke", "none");
    if (dimmed) tip.setAttribute("opacity", "0.18");
    svg.appendChild(tip);
  }

  /**
   * Arc simple : niveau → couleur + profondeur.
   * Relation → flèche mono ou double. Pas de clamp / pas d’agrandissement de grille.
   */
  function drawArcPath(svg, a, b, color, level, arrows) {
    var rgb = toRgbCss(color);
    var levels = currentRelationLevels();
    var dimmed =
      (state.multiRelations && !isLegendLevelHighlighted(level)) ||
      isDecisionDimmedByLegend(a && a.id, levels) ||
      isDecisionDimmedByLegend(b && b.id, levels);
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var pad = Math.min(12, dist * 0.25);
    var x1 = a.x + (dx / dist) * pad;
    var y1 = a.y + (dy / dist) * pad;
    var x2 = b.x - (dx / dist) * pad;
    var y2 = b.y - (dy / dist) * pad;

    var midX = (x1 + x2) / 2;
    var midY = (y1 + y2) / 2;
    var lvl = Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, level || 1));
    var orient = state.orientation || "vertical";
    var arch = archDepthForLevel(lvl, orient);
    var mx;
    var my;

    if (orient === "vertical") {
      var nx = -dy / dist;
      var ny = dx / dist;
      var side = nx < 0 || (Math.abs(nx) < 0.08 && dx >= 0) ? 1 : -1;
      if (Math.abs(dx) < 18) side = nx <= 0 ? 1 : -1;
      mx = midX + nx * side * arch;
      my = midY + ny * side * arch;
    } else {
      mx = midX;
      my = Math.max(y1, y2) + arch;
    }

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M " +
        x1.toFixed(1) +
        " " +
        y1.toFixed(1) +
        " Q " +
        mx.toFixed(1) +
        " " +
        my.toFixed(1) +
        " " +
        x2.toFixed(1) +
        " " +
        y2.toFixed(1)
    );
    path.setAttribute("stroke", rgb);
    path.style.stroke = rgb;
    path.setAttribute("fill", "none");
    path.setAttribute("data-level", String(lvl));
    if (dimmed) {
      path.classList.add("is-dimmed");
      path.setAttribute("opacity", "0.18");
    }
    svg.appendChild(path);

    var showStart = !!(arrows && arrows.start);
    var showEnd = !arrows || arrows.end !== false;
    // Tangentes de la courbe Q aux extrémités.
    if (showEnd) drawArrowTip(svg, x2, y2, x2 - mx, y2 - my, rgb, dimmed);
    if (showStart) drawArrowTip(svg, x1, y1, x1 - mx, y1 - my, rgb, dimmed);
  }

  function drawChainLinks() {
    var root = els.timeline;
    if (!root) return;
    var svg = root.querySelector(".timeline__links");
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    if (!state.selectedId || !selectedHasLinks()) {
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      return;
    }

    var displayed = new Set(
      state.displayed.map(function (d) {
        return d.id;
      })
    );
    var graph = buildRelationGraph(state.selectedId, currentRelationDepth());
    if (graph.levels.size < 2) {
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      return;
    }

    var tw = root.clientWidth || root.offsetWidth;
    var th = root.clientHeight || root.offsetHeight;
    svg.setAttribute("width", String(tw));
    svg.setAttribute("height", String(th));
    svg.setAttribute("viewBox", "0 0 " + tw + " " + th);
    svg.setAttribute("preserveAspectRatio", "none");

    var rootRect = root.getBoundingClientRect();

    if (!state.multiRelations) {
      var chainIds = getChainIds().filter(function (id) {
        return displayed.has(id);
      });
      if (chainIds.length < 2) return;

      var color = chainColorForLevel(1);
      var points = [];
      chainIds.forEach(function (id) {
        var pt = markerCenter(root, rootRect, id);
        if (pt) points.push(pt);
      });
      for (var i = 0; i < points.length - 1; i++) {
        var idFrom = points[i].id;
        var idTo = points[i + 1].id;
        var ab = hasDirectedLink(idFrom, idTo);
        var ba = hasDirectedLink(idTo, idFrom);
        var pFrom = points[i];
        var pTo = points[i + 1];
        var arrows;
        if (ab && ba) {
          arrows = { start: true, end: true };
        } else if (ab) {
          arrows = { start: false, end: true };
        } else if (ba) {
          pFrom = points[i + 1];
          pTo = points[i];
          arrows = { start: false, end: true };
        } else {
          arrows = { start: true, end: true };
        }
        drawArcPath(svg, pFrom, pTo, color, 1, arrows);
      }
      return;
    }

    var drawable = [];
    graph.edges.forEach(function (e) {
      if (!displayed.has(e.a) || !displayed.has(e.b)) return;
      var pa = markerCenter(root, rootRect, e.a);
      var pb = markerCenter(root, rootRect, e.b);
      if (!pa || !pb) return;
      var arrows;
      if (e.ab && e.ba) arrows = { start: true, end: true };
      else if (e.ab) arrows = { start: false, end: true };
      else if (e.ba) arrows = { start: true, end: false };
      else arrows = { start: true, end: true };
      drawable.push({ from: pa, to: pb, level: e.level, arrows: arrows });
    });

    drawable
      .sort(function (a, b) {
        return a.level - b.level;
      })
      .forEach(function (seg) {
        drawArcPath(
          svg,
          seg.from,
          seg.to,
          chainColorForLevel(seg.level),
          seg.level,
          seg.arrows
        );
      });
  }

  function renderList() {
    var ul = els.list;
    ul.innerHTML = "";

    if (!state.displayed.length) {
      ul.innerHTML = '<li class="empty">Aucune décision ne correspond aux filtres.</li>';
      return;
    }

    var chainMap = chainIndexMap();
    var chainActive = chainMap.size > 1;
    var chainIds = chainActive ? getChainIds() : [];
    var nextChainAfter = new Map();
    if (chainActive) {
      var visibleChain = chainIds.filter(function (id) {
        return state.displayed.some(function (d) {
          return d.id === id;
        });
      });
      for (var i = 0; i < visibleChain.length - 1; i++) {
        nextChainAfter.set(visibleChain[i + 1], true); // successor gets left arrow
      }
    }

    state.displayed.forEach(function (d) {
      var li = document.createElement("li");
      li.className = "list-item-wrap";

      var arrowSlot = document.createElement("span");
      arrowSlot.className = "chain-arrow";
      arrowSlot.setAttribute("aria-hidden", "true");
      if (chainActive && nextChainAfter.has(d.id)) {
        arrowSlot.textContent = "→";
      } else {
        arrowSlot.textContent = "";
      }

      if (chainActive && !chainMap.has(d.id)) li.classList.add("is-dimmed");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-item" + (state.selectedId === d.id ? " is-selected" : "");
      btn.addEventListener("click", function () {
        focus(d.id);
      });

      btn.innerHTML =
        '<span class="list-item__date">' +
        escapeHtml(formatDateFr(d.date)) +
        "</span>" +
        '<span class="list-item__body">' +
        '<div class="list-item__nom" data-importance="' +
        String(d.importance || 1) +
        '">' +
        escapeHtml(d.nom) +
        "</div>" +
        (d.objet ? '<p class="list-item__objet">' + escapeHtml(d.objet) + "</p>" : "") +
        "</span>" +
        '<span class="list-item__meta">' +
        '<span class="tag tag--stars" title="Importance">' +
        stars(d.importance) +
        "</span>" +
        "</span>";

      bindFicheTip(btn, d);

      li.appendChild(arrowSlot);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function renderDetail() {
    var wrap = els.detail;
    var d = state.selectedId ? state.byId.get(state.selectedId) : null;

    els.main.classList.toggle("is-detail-closed", !d);

    if (!d) {
      hideDetailFicheTip();
      detailTipDecision = null;
      wrap.innerHTML = "";
      wrap.hidden = false;
      wrap.classList.add("is-empty");
      wrap.setAttribute("aria-hidden", "true");
      return;
    }

    var related = getNeighbors(d.id);
    var relatedList = Array.from(related)
      .map(function (id) {
        return state.byId.get(id);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return a.nom.localeCompare(b.nom, "fr");
      });

    var ficheUrl =
      d.slugFiche && config.ficheBaseUrl
        ? config.ficheBaseUrl.replace(/\/?$/, "/") + d.slugFiche + "/"
        : null;

    var html = "";
    html += '<div class="detail__head">';
    html += "<h2>" + escapeHtml(d.nom) + "</h2>";
    html +=
      '<button type="button" class="detail__close" id="detail-close" aria-label="Fermer">×</button>';
    html += "</div>";

    // Capsules: Date + Importance only (no Thème)
    html += '<div class="detail__meta">';
    html += '<span class="tag">' + escapeHtml(formatDateFr(d.date)) + "</span>";
    html += '<span class="tag tag--stars">' + stars(d.importance) + "</span>";
    html += "</div>";

    if (d.objet) {
      html +=
        '<div class="detail__section"><h3>Objet</h3><p>' + escapeHtml(d.objet) + "</p></div>";
    }
    if (d.portee) {
      html +=
        '<div class="detail__section"><h3>Portée</h3><p>' + escapeHtml(d.portee) + "</p></div>";
    }

    if (relatedList.length) {
      html += '<div class="detail__section"><h3>Décisions liées</h3><ul class="related-list">';
      relatedList.forEach(function (r) {
        html +=
          "<li><button type=\"button\" data-focus=\"" +
          escapeHtml(r.id) +
          "\" data-tip-id=\"" +
          escapeHtml(r.id) +
          "\">" +
          escapeHtml(r.nom) +
          " <span class=\"tag\">" +
          escapeHtml(formatDateFr(r.date)) +
          "</span>" +
          ' <span class="tag tag--stars" title="Importance">' +
          stars(r.importance) +
          "</span></button></li>";
      });
      html += "</ul></div>";
    }

    html += '<div class="detail__section"><h3>Fiche de décision</h3>';
    html += '<div class="detail__actions" style="padding:8px 0 0">';
    if (ficheUrl) {
      html += '<a class="button-link" href="' + escapeHtml(ficheUrl) + '">Ouvrir la fiche</a>';
    } else {
      html +=
        '<span class="button-link is-disabled" title="Fiche non disponible pour cette décision" aria-disabled="true">Ouvrir la fiche</span>';
    }
    html += "</div></div>";

    wrap.innerHTML = html;
    wrap.hidden = false;
    wrap.classList.remove("is-empty");
    wrap.setAttribute("aria-hidden", "false");
    detailTipDecision = decisionHasFicheBody(d) ? d : null;
    hideDetailFicheTip();

    var closeBtn = $("detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        hideDetailFicheTip();
        hideFicheTip();
        state.selectedId = null;
        clearRelationModes();
        applyFilters();
      });
    }
    wrap.querySelectorAll("[data-focus]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        hideFicheTip();
        hideDetailFicheTip();
        focus(btn.getAttribute("data-focus"));
      });
      var tipId = btn.getAttribute("data-tip-id");
      if (tipId && state.byId.has(tipId)) {
        bindFicheTip(btn, state.byId.get(tipId));
      }
    });
  }

  /* —— Bulle fiche (style Flipcards game-summary-tip) —— */

  var ficheTipTimer = null;
  var ficheTipId = null;
  var detailTipTimer = null;
  var detailTipDecision = null;
  var detailTipId = null;

  function decisionHasFicheBody(d) {
    if (!d) return false;
    return !!(d.faits || d.enjeu || d.solution || d.perspective);
  }

  function detailFicheTipRoot() {
    return $("detail-fiche-tip");
  }

  function setDetailFicheLine(rowId, text) {
    var row = $(rowId);
    if (!row) return;
    var textEl = row.querySelector(".fiche-text");
    var value = (text || "").trim();
    if (textEl) textEl.textContent = value || "—";
    row.classList.toggle("is-empty", !value);
    row.hidden = false;
  }

  function hideDetailFicheTip() {
    if (detailTipTimer) {
      clearTimeout(detailTipTimer);
      detailTipTimer = null;
    }
    detailTipId = null;
    var tip = detailFicheTipRoot();
    if (!tip) return;
    tip.hidden = true;
    tip.setAttribute("aria-hidden", "true");
    tip.classList.remove("is-open", "is-above", "is-right", "is-left", "is-left-of-detail", "is-right-of-detail");
  }

  function scheduleHideDetailFicheTip() {
    if (detailTipTimer) clearTimeout(detailTipTimer);
    detailTipTimer = setTimeout(hideDetailFicheTip, 140);
  }

  function cancelHideDetailFicheTip() {
    if (detailTipTimer) {
      clearTimeout(detailTipTimer);
      detailTipTimer = null;
    }
  }

  function showDetailFicheTip(anchorEl, d) {
    var tip = detailFicheTipRoot();
    if (!tip || !d || !decisionHasFicheBody(d)) return;
    cancelHideDetailFicheTip();
    detailTipId = d.id;

    setDetailFicheLine("dft-faits", d.faits);
    setDetailFicheLine("dft-enjeu", d.enjeu);
    setDetailFicheLine("dft-solution", d.solution);
    setDetailFicheLine("dft-perspective", d.perspective);

    tip.hidden = false;
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("is-open");

    var rect = anchorEl.getBoundingClientRect();
    var gap = 12;
    var preferredW = Math.min(380, Math.max(260, window.innerWidth * 0.36));
    var availRight = Math.max(0, window.innerWidth - rect.right - gap - 8);
    var tipW = preferredW;
    var left;

    // Priorité : à droite de l'encadré ; on réduit la largeur si l'espace est juste.
    if (availRight >= 200) {
      tipW = Math.min(preferredW, availRight);
      left = rect.right + gap;
      tip.classList.remove("is-left", "is-left-of-detail");
      tip.classList.add("is-right", "is-right-of-detail");
    } else {
      tipW = Math.min(preferredW, Math.max(200, rect.left - gap - 8));
      left = Math.max(8, rect.left - tipW - gap);
      tip.classList.remove("is-right", "is-right-of-detail");
      tip.classList.add("is-left", "is-left-of-detail");
    }

    tip.style.width = tipW + "px";
    tip.style.maxHeight = Math.min(window.innerHeight - 24, 440) + "px";
    tip.style.left = left + "px";
    tip.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - 120)) + "px";

    requestAnimationFrame(function () {
      if (detailTipId !== d.id) return;
      var tipH = tip.offsetHeight || 160;
      var nextTop = Math.max(8, Math.min(rect.top, window.innerHeight - tipH - 8));
      tip.style.top = nextTop + "px";
    });
  }

  function bindDetailPanelTip() {
    if (!els.detail || els.detail._detailTipBound) return;
    els.detail._detailTipBound = true;
    els.detail.addEventListener("pointerenter", function () {
      if (!detailTipDecision) return;
      showDetailFicheTip(els.detail, detailTipDecision);
    });
    els.detail.addEventListener("pointerleave", scheduleHideDetailFicheTip);
  }

  function ficheTipEls() {
    return {
      root: $("fiche-tip"),
      nom: $("fiche-tip-nom"),
      meta: $("fiche-tip-meta"),
      objet: $("fiche-tip-objet"),
      verso: $("fiche-tip-verso"),
    };
  }

  function hideFicheTip() {
    if (ficheTipTimer) {
      clearTimeout(ficheTipTimer);
      ficheTipTimer = null;
    }
    ficheTipId = null;
    var tip = ficheTipEls().root;
    if (!tip) return;
    tip.hidden = true;
    tip.setAttribute("aria-hidden", "true");
    tip.classList.remove("is-open", "is-above", "is-left", "is-right");
  }

  function scheduleHideFicheTip() {
    if (ficheTipTimer) clearTimeout(ficheTipTimer);
    ficheTipTimer = setTimeout(hideFicheTip, 120);
  }

  function cancelHideFicheTip() {
    if (ficheTipTimer) {
      clearTimeout(ficheTipTimer);
      ficheTipTimer = null;
    }
  }

  function showFicheTip(anchorEl, d) {
    var tip = ficheTipEls();
    if (!tip.root || !d) return;
    cancelHideFicheTip();
    ficheTipId = d.id;

    tip.nom.textContent = d.nom || "";
    tip.meta.textContent =
      (formatDateFr(d.date) || "") +
      (d.importance ? " · " + stars(d.importance) : "") +
      (d.juridiction ? " · " + d.juridiction : "");
    tip.objet.textContent = d.objet || "";
    tip.objet.hidden = !d.objet;
    tip.verso.textContent = d.verso || "";
    tip.verso.hidden = !d.verso;

    tip.root.hidden = false;
    tip.root.setAttribute("aria-hidden", "false");
    tip.root.classList.add("is-open");
    tip.root.classList.remove("is-above", "is-right");
    tip.root.classList.add("is-left");

    var rect = anchorEl.getBoundingClientRect();
    var tipW = Math.min(320, Math.max(220, window.innerWidth * 0.42));
    tip.root.style.width = tipW + "px";

    var gap = 12;
    var left = rect.left - tipW - gap;
    if (left < 8) {
      // Pas assez de place à gauche → bascule à droite.
      left = Math.min(rect.right + gap, window.innerWidth - tipW - 8);
      tip.root.classList.remove("is-left");
      tip.root.classList.add("is-right");
    }
    tip.root.style.left = Math.max(8, left) + "px";

    requestAnimationFrame(function () {
      if (ficheTipId !== d.id) return;
      var tipH = tip.root.offsetHeight || 120;
      var top = rect.top + rect.height / 2 - tipH / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
      tip.root.style.top = top + "px";
    });
  }

  function bindFicheTip(el, d) {
    if (!el || !d) return;
    el.addEventListener("pointerenter", function () {
      showFicheTip(el, d);
    });
    el.addEventListener("pointerleave", scheduleHideFicheTip);
    el.addEventListener("focus", function () {
      showFicheTip(el, d);
    });
    el.addEventListener("blur", scheduleHideFicheTip);
  }

  function clearRelationModes() {
    state.relatedOnly = false;
    if (els.relatedOnly) els.relatedOnly.checked = false;
    state.multiRelations = false;
    if (els.multiRelations) els.multiRelations.checked = false;
    if (els.multiRelationsDepth) els.multiRelationsDepth.hidden = true;
    state.legendLevelFilter = null;
    state.legendImportanceFilter = null;
    state.legendJuridictionFilter = null;
  }

  function timelineStickyInsets() {
    var pad = { top: 16, left: 16, bottom: 20, right: 16 };
    if (!els.timeline) return pad;
    var orient = state.orientation || "vertical";
    if (orient === "vertical") {
      var head =
        els.timeline.querySelector(".tgrid-v-headbar") ||
        els.timeline.querySelector(".tcol-head");
      if (head) {
        pad.top = Math.ceil(head.getBoundingClientRect().height) + 16;
      } else {
        pad.top = 56;
      }
    } else {
      var rowHead = els.timeline.querySelector(".trow-head");
      if (rowHead) {
        pad.left = Math.ceil(rowHead.getBoundingClientRect().width) + 16;
      } else {
        pad.left = 120;
      }
      var hHead = els.timeline.querySelector(".tseg-head, .tunit-head");
      if (hHead) {
        pad.top = Math.ceil(hHead.getBoundingClientRect().height) + 12;
      }
    }
    return pad;
  }

  /** Centre le marqueur dans la zone visible (sous l’en-tête sticky). */
  function scrollTimelineToSelected() {
    var scroller = els.timelineScroll;
    var marker = els.timeline && els.timeline.querySelector(".marker.is-selected");
    if (!scroller || !marker) return;

    var sRect = scroller.getBoundingClientRect();
    var mRect = marker.getBoundingClientRect();
    var inset = timelineStickyInsets();

    var viewTop = sRect.top + inset.top;
    var viewBottom = sRect.bottom - inset.bottom;
    var viewLeft = sRect.left + inset.left;
    var viewRight = sRect.right - inset.right;
    var viewMidY = (viewTop + viewBottom) / 2;
    var viewMidX = (viewLeft + viewRight) / 2;
    var markerMidY = mRect.top + mRect.height / 2;
    var markerMidX = mRect.left + mRect.width / 2;

    var dy = markerMidY - viewMidY;
    var dx = markerMidX - viewMidX;
    // Tolérance : ne bouge que si hors zone confortable.
    var slackY = Math.max(24, (viewBottom - viewTop) * 0.12);
    var slackX = Math.max(24, (viewRight - viewLeft) * 0.12);
    if (Math.abs(dy) < slackY) dy = 0;
    if (Math.abs(dx) < slackX) dx = 0;
    if (!dy && !dx) return;

    if (typeof scroller.scrollBy === "function") {
      scroller.scrollBy({ top: dy, left: dx, behavior: "smooth" });
    } else {
      scroller.scrollTop += dy;
      scroller.scrollLeft += dx;
    }
  }

  function scrollListToSelected() {
    var listBtn = els.list && els.list.querySelector(".list-item.is-selected");
    if (!listBtn || typeof listBtn.scrollIntoView !== "function") return;
    listBtn.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function focus(id) {
    if (!state.byId.has(id)) return;
    state.selectedId = id;
    if (!selectedHasLinks()) {
      clearRelationModes();
    }
    applyFilters();
    // Nouvelle sélection → autoriser le graphe à se rouvrir.
    state.graphUserClosed = false;
    syncRelationGraph();
    // Après layout (en-tête sticky mesurable), centrer hors zone couverte.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (state.view === "list") scrollListToSelected();
        else scrollTimelineToSelected();
      });
    });
  }

  function resetFilters() {
    if (els.search) els.search.value = "";
    if (els.reference) els.reference.value = "";
    if (state.raw) populateFilterOptions(state.raw);
    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.checked = Number(el.value) >= config.defaultMinImportance;
    });
    els.dateFrom.value = "";
    els.dateTo.value = "";
    if (els.relatedOnly) els.relatedOnly.checked = false;
    state.relatedOnly = false;
    if (els.multiRelations) els.multiRelations.checked = false;
    state.multiRelations = false;
    state.relationDepth = 2;
    state.legendLevelFilter = null;
    state.legendImportanceFilter = null;
    state.legendJuridictionFilter = null;
    if (els.relationDepth) els.relationDepth.value = "2";
    if (els.multiRelationsDepth) els.multiRelationsDepth.hidden = true;
    readFiltersFromDom();
    applyFilters();
  }

  function bindUi() {
    els.alert = $("chrono-alert");
    els.main = $("chrono-main");
    els.search = $("filter-search");
    els.reference = $("filter-reference");
    els.themes = $("filter-themes");
    els.notions = $("filter-notions");
    els.juridictions = $("filter-juridictions");
    els.formations = $("filter-formations");
    els.advancedToggle = $("filters-advanced-toggle");
    els.advancedPanel = $("filters-advanced-panel");
    els.dateFrom = $("filter-date-from");
    els.dateTo = $("filter-date-to");
    els.relatedOnly = $("filter-related-only");
    els.relatedOnlyWrap = $("related-only-wrap");
    els.multiRelations = $("filter-multi-relations");
    els.multiRelationsWrap = $("multi-relations-wrap");
    els.multiRelationsDepth = $("multi-relations-depth");
    els.relationDepth = $("filter-relation-depth");
    els.legendLevels = $("legend-levels");
    els.legendJuridictions = $("legend-juridictions");
    els.legendImportance = $("legend-importance");
    els.activeFiltersList = $("active-filters-list");
    els.timeline = $("timeline");
    els.timelineScroll = $("timeline-scroll");
    els.timelinePanel = $("timeline-panel");
    els.listPanel = $("list-panel");
    els.workspace = $("chrono-workspace");
    els.graphPanel = $("graph-panel");
    els.graphPanelClose = $("graph-panel-close");
    els.relationGraphCanvas = $("relation-graph-canvas");
    els.list = $("decision-list");
    els.detail = $("detail");
    els.countFiltered = $("count-filtered");
    els.countTotal = $("count-total");
    els.metaGenerated = $("meta-generated");
    els.resetBtn = $("filter-reset");
    els.timelineTitle = $("timeline-title");
    els.orientationToggle = $("orientation-toggle");
    els.orientationToggleLabel = $("orientation-toggle-label");
    els.chronoOrderToggle = $("chrono-order-toggle");
    els.chronoOrderToggleLabel = $("chrono-order-toggle-label");
    els.scaleSegmented = $("scale-segmented");

    ["input", "change"].forEach(function (evt) {
      if (els.search) els.search.addEventListener(evt, onFilterChange);
      if (els.reference) els.reference.addEventListener(evt, onFilterChange);
      if (els.dateFrom) els.dateFrom.addEventListener(evt, onFilterChange);
      if (els.dateTo) els.dateTo.addEventListener(evt, onFilterChange);
    });

    if (els.advancedToggle && els.advancedPanel) {
      els.advancedToggle.addEventListener("click", function () {
        var open = els.advancedPanel.hidden;
        els.advancedPanel.hidden = !open;
        els.advancedToggle.setAttribute("aria-expanded", open ? "true" : "false");
        els.advancedToggle.classList.toggle("is-open", open);
      });
    }

    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.addEventListener("change", onFilterChange);
    });

    if (els.relatedOnly) {
      els.relatedOnly.addEventListener("change", function () {
        if (els.relatedOnly.disabled) return;
        state.relatedOnly = !!els.relatedOnly.checked;
        applyFilters();
      });
    }

    if (els.multiRelations) {
      els.multiRelations.addEventListener("change", function () {
        if (els.multiRelations.disabled) return;
        state.multiRelations = !!els.multiRelations.checked;
        if (state.multiRelations && (!state.relationDepth || state.relationDepth < 1)) {
          state.relationDepth = 2;
        }
        applyFilters();
      });
    }

    if (els.relationDepth) {
      els.relationDepth.addEventListener("change", function () {
        var n = Number(els.relationDepth.value);
        var maxReachable = selectedHasLinks()
          ? maxReachableRelationDepth(state.selectedId)
          : RELATION_DEPTH_SELECTABLE_MAX;
        if (maxReachable < 1) maxReachable = 1;
        if (maxReachable > RELATION_DEPTH_SELECTABLE_MAX) {
          maxReachable = RELATION_DEPTH_SELECTABLE_MAX;
        }
        if (!isFinite(n) || n < 1) n = 1;
        if (n > maxReachable) n = maxReachable;
        if (n >= RELATION_DEPTH_UI_MAX) n = maxReachable;
        state.relationDepth = Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, n));
        els.relationDepth.value = String(state.relationDepth);
        applyFilters();
      });
    }

    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.getAttribute("data-view");
        render();
      });
    });

    document.querySelectorAll("[data-scale]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.scale = btn.getAttribute("data-scale") || "year";
        render();
      });
    });

    if (els.orientationToggle) {
      els.orientationToggle.addEventListener("click", function () {
        state.orientation =
          state.orientation === "horizontal" ? "vertical" : "horizontal";
        render();
      });
    }

    if (els.chronoOrderToggle) {
      els.chronoOrderToggle.addEventListener("click", function () {
        state.chronoOrder = state.chronoOrder === "desc" ? "asc" : "desc";
        applyFilters();
      });
    }

    if (els.resetBtn) els.resetBtn.addEventListener("click", resetFilters);

    if (els.graphPanelClose) {
      els.graphPanelClose.addEventListener("click", function () {
        state.graphUserClosed = true;
        syncRelationGraph();
      });
    }

    if (window.ChronoRelationGraph && els.relationGraphCanvas) {
      window.ChronoRelationGraph.init(els.relationGraphCanvas, {
        onSelect: function (id) {
          focus(id);
        },
      });
    }

    bindDetailPanelTip();

    if (els.timelineScroll) {
      els.timelineScroll.addEventListener("scroll", function () {
        hideFicheTip();
        hideDetailFicheTip();
        scheduleDrawChainLinks();
      });
    }
    if (els.list) {
      els.list.addEventListener("scroll", hideFicheTip);
    }
    window.addEventListener("resize", function () {
      hideFicheTip();
      hideDetailFicheTip();
      scheduleDrawChainLinks();
      layoutGraphPanel();
      if (window.ChronoRelationGraph) window.ChronoRelationGraph.resize();
    });

    window.addEventListener("ep-theme-change", function () {
      scheduleDrawChainLinks();
      if (window.ChronoRelationGraph && window.ChronoRelationGraph.redraw) {
        window.ChronoRelationGraph.redraw();
      }
    });

    window.addEventListener(
      "scroll",
      function () {
        if (els.graphPanel && !els.graphPanel.hidden) layoutGraphPanel();
      },
      true
    );

    var tipRoot = $("fiche-tip");
    if (tipRoot) {
      tipRoot.addEventListener("pointerenter", cancelHideFicheTip);
      tipRoot.addEventListener("pointerleave", scheduleHideFicheTip);
    }
    var detailTipRoot = detailFicheTipRoot();
    if (detailTipRoot) {
      detailTipRoot.addEventListener("pointerenter", cancelHideDetailFicheTip);
      detailTipRoot.addEventListener("pointerleave", scheduleHideDetailFicheTip);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        hideFicheTip();
        hideDetailFicheTip();
        if (openMsId) {
          closeAllMs();
          return;
        }
        if (state.selectedId) {
          state.selectedId = null;
          state.graphUserClosed = false;
          clearRelationModes();
          applyFilters();
        }
      }
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".ms")) closeAllMs();
    });
  }

  function onFilterChange() {
    var prevJ = (state.filters.juridictions || []).join("\0");
    readFiltersFromDom();
    var nextJ = (state.filters.juridictions || []).join("\0");
    if (prevJ !== nextJ) {
      updateFormationOptions();
      readFiltersFromDom();
    }
    applyFilters();
  }

  function load(data) {
    if (!data || !Array.isArray(data.decisions)) {
      throw new Error("Dataset invalide : propriété decisions manquante.");
    }
    var versionWarn = "";
    if (data.meta && data.meta.version > config.supportedDataVersion) {
      versionWarn =
        "Version de données " +
        data.meta.version +
        " supérieure à la version supportée (" +
        config.supportedDataVersion +
        "). Mettez à jour chronologie.js.";
    }

    if (!data.meta) data.meta = { version: 1, count: data.decisions.length, generatedAt: null };
    data.meta.count = data.decisions.length;

    state.raw = data;
    buildIndex(data);
    populateFilterOptions(data);

    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.checked = Number(el.value) >= config.defaultMinImportance;
    });

    if (versionWarn) setAlert(versionWarn, "warn");
    else syncDemoUi(data);
    readFiltersFromDom();
    applyFilters();
    applyDeepLink();
  }

  function applyDeepLink() {
    var params = new URLSearchParams(location.search || "");
    var raw = params.get("id") || params.get("decision") || "";
    if (!raw && location.hash) raw = String(location.hash).replace(/^#/, "");
    if (!raw) return;
    var key = slugKey(raw);
    var id = null;
    if (state.byId.has(raw)) id = raw;
    else if (state.byId.has(key)) id = key;
    else {
      state.byId.forEach(function (d, did) {
        if (id) return;
        if (slugKey(did) === key || slugKey(d.slugFiche || "") === key) id = did;
      });
    }
    if (id) focus(id);
  }

  function getState() {
    return {
      selectedId: state.selectedId,
      view: state.view,
      scale: state.scale,
      orientation: state.orientation,
      relatedOnly: state.relatedOnly,
      multiRelations: state.multiRelations,
      relationDepth: currentRelationDepth(),
      filters: Object.assign({}, state.filters),
      filteredCount: state.displayed.length,
      total: (state.raw && state.raw.decisions && state.raw.decisions.length) || 0,
      meta: state.raw && state.raw.meta,
    };
  }

  async function boot() {
    bindUi();

    if (window.__CHRONO_DATA__) {
      load(window.__CHRONO_DATA__);
      return;
    }

    if (!config.dataUrl) {
      setAlert("Aucune source de données configurée.", "error");
      return;
    }

    try {
      var res = await fetch(config.dataUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error("HTTP " + res.status + " pour " + config.dataUrl);
      var data = await res.json();
      load(data);
    } catch (err) {
      console.error(err);
      setAlert(
        "Impossible de charger les données (" +
          config.dataUrl +
          "). Servez la page en HTTP et vérifiez le chemin du JSON. " +
          (err && err.message ? err.message : ""),
        "error"
      );
      if (els.timeline) {
        els.timeline.innerHTML = '<div class="empty">Données indisponibles.</div>';
      }
    }
  }

  window.Chronologie = {
    load: load,
    filter: function (partial) {
      Object.assign(state.filters, partial || {});
      if (partial && partial.themes != null && els.themes) {
        state.filters.themes = [].concat(partial.themes);
        if (state.raw) populateFilterOptions(state.raw);
      }
      if (partial && partial.theme != null && els.themes) {
        state.filters.themes = partial.theme ? [partial.theme] : [];
        if (state.raw) populateFilterOptions(state.raw);
      }
      if (partial && partial.q != null) els.search.value = partial.q;
      applyFilters();
    },
    focus: focus,
    getState: getState,
    config: config,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
