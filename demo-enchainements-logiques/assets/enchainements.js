/**
 * Enchaînements logiques — sélection par filtres (Chronologie) + ordre chronologique.
 */
(function () {
  "use strict";

  var DEFAULT = {
    dataUrl: "./data/chronology-decisions-demo.json",
    ficheBaseUrl: "../arrets/",
    checkoutUrl: "../checkout/",
    demo: true,
    defaultMinImportance: null,
  };

  var RELATION_DEPTH_UI_MAX = 7;
  var RELATION_DEPTH_SELECTABLE_MAX = 6;

  var config = Object.assign({}, DEFAULT, window.__ENCHAINEMENTS_CONFIG__ || {});

  var state = {
    raw: null,
    byId: new Map(),
    filtered: [],
    displayed: [],
    selectedId: null,
    relatedOnly: false,
    /** Mode « Décisions liées par leur objet » (ex-multi-relations). */
    objectLinks: false,
    /** null | 'random' | 'pick' */
    objectLinkMode: null,
    relationDepth: 2,
    /** Recherche locale pour choisir une ancre (mode pick). */
    objectLinkQuery: "",
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

  var coursFilter = null;
  var coursChapterTitle = "";

  function coursTitleKey(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  var correctOrder = [];
  var userOrder = [];
  var checked = false;
  var revealed = false;
  var dragId = null;
  var ficheTipTimer = null;
  var ficheTipId = null;
  var openMsId = null;
  var inGame = false;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function stars(n) {
    return "★".repeat(n || 0);
  }

  function shuffle(arr) {
    var a = arr.slice();
    var i;
    for (i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function foldFr(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/œ/gi, "oe")
      .replace(/æ/gi, "ae")
      .toLowerCase();
  }

  function sortFr(a, b) {
    var ka = foldFr(a);
    var kb = foldFr(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return String(a).localeCompare(String(b), "fr");
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort(sortFr);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateFr(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function displayNom(nom, showYear) {
    var raw = String(nom || "").trim();
    if (showYear || !raw) return raw;
    return raw.replace(/,\s*\d{4}\s*,/g, ", …,");
  }

  function ficheUrl(d) {
    if (!d || !d.slugFiche || !config.ficheBaseUrl) return null;
    return config.ficheBaseUrl.replace(/\/?$/, "/") + d.slugFiche + "/";
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

  /* —— Relations (port Chronologie) —— */

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
    if (state.objectLinks) {
      var n = Number(state.relationDepth);
      if (!isFinite(n) || n < 1) n = 2;
      return Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, Math.round(n)));
    }
    return 1;
  }

  function buildRelationGraph(id, maxDepth) {
    var levels = new Map();
    if (!id || !state.byId.has(id)) return { levels: levels };

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
    return { levels: levels };
  }

  function maxReachableRelationDepth(id) {
    if (!id || !state.byId.has(id)) return 0;
    var graph = buildRelationGraph(id, RELATION_DEPTH_SELECTABLE_MAX);
    var max = 0;
    graph.levels.forEach(function (lvl) {
      if (lvl > max) max = lvl;
    });
    return Math.max(0, Math.min(RELATION_DEPTH_SELECTABLE_MAX, max));
  }

  function getRelatedSet(id) {
    return new Set(buildRelationGraph(id, currentRelationDepth()).levels.keys());
  }

  function selectedHasLinks() {
    if (!state.selectedId) return false;
    return getNeighbors(state.selectedId).size > 0;
  }

  function clearRelationModes() {
    state.relatedOnly = false;
    state.objectLinks = false;
    state.objectLinkMode = null;
    state.objectLinkQuery = "";
    if (els.relatedOnly) els.relatedOnly.checked = false;
    if (els.objectLinks) els.objectLinks.checked = false;
    if (els.objectLinkSearch) els.objectLinkSearch.value = "";
    document.querySelectorAll('input[name="object-link-mode"]').forEach(function (el) {
      el.checked = false;
    });
    syncObjectLinksPanel();
  }

  /* —— Multi-select —— */

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
        cb.addEventListener("change", onFilterChange);
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

    panel.addEventListener("click", function (e) {
      e.stopPropagation();
    });

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
    buildMultiSelect(
      els.juridictions,
      juridictions,
      state.filters.juridictions,
      "Toutes les juridictions"
    );
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

  function updateCounts() {
    var total = (state.raw && state.raw.decisions && state.raw.decisions.length) || 0;
    var n = state.displayed.length;
    if (els.countFiltered) els.countFiltered.textContent = String(n);
    if (els.countTotal) els.countTotal.textContent = String(total);
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
    if (state.relatedOnly && state.selectedId && selectedHasLinks() && !state.objectLinks) {
      parts.push("uniquement décisions liées");
    }
    if (state.objectLinks && state.selectedId && selectedHasLinks()) {
      parts.push(
        "décisions liées par leur objet · " + currentRelationDepth() + " niveau(x)"
      );
    } else if (state.objectLinks) {
      parts.push("décisions liées par leur objet");
    }

    els.activeFiltersList.textContent = parts.length ? parts.join(" · ") : "aucun";
  }

  function updateRelationDepthOptions() {
    if (!els.relationDepth) return;

    // Toujours offrir 1–6 : ne pas révéler la profondeur max réelle du graphe.
    var options = els.relationDepth.options;
    var i;
    for (i = 0; i < options.length; i++) {
      var opt = options[i];
      var val = Number(opt.value);
      var isGhost = val === RELATION_DEPTH_UI_MAX;
      var selectable =
        !isGhost && isFinite(val) && val >= 1 && val <= RELATION_DEPTH_SELECTABLE_MAX;
      opt.disabled = !selectable;
      opt.classList.toggle("is-unreachable", !selectable);
      opt.classList.toggle("is-ghost", isGhost);
      if (isGhost) {
        opt.title = "Niveau bientôt disponible";
      } else {
        opt.removeAttribute("title");
      }
    }

    if (state.objectLinks) {
      var depth = currentRelationDepth();
      els.relationDepth.value = String(depth);
      if (els.relationDepth.value !== String(depth)) {
        els.relationDepth.selectedIndex = Math.max(0, depth - 1);
        state.relationDepth = Number(els.relationDepth.value) || 2;
      }
    }

    els.relationDepth.title =
      "Profondeur de parcours des décisions liées (1–" +
      RELATION_DEPTH_SELECTABLE_MAX +
      " ; 7 bientôt)";
  }

  function syncObjectLinksPanel() {
    var on = !!state.objectLinks;
    if (els.objectLinksPanel) els.objectLinksPanel.hidden = !on;
    if (els.objectLinksRandom) {
      els.objectLinksRandom.hidden = !(on && state.objectLinkMode === "random");
    }
    if (els.objectLinksPick) {
      els.objectLinksPick.hidden = !(on && state.objectLinkMode === "pick");
    }
    if (els.relationDepth) {
      els.relationDepth.disabled = !on;
      if (on) updateRelationDepthOptions();
    }
    if (els.setupHint) {
      if (!on) {
        els.setupHint.textContent =
          "Affinez les filtres, puis lancez l’exercice — ou activez « Décisions liées par leur objet » pour constituer un enchaînement (au hasard ou en choisissant une décision).";
      } else if (state.objectLinkMode === "random") {
        els.setupHint.textContent =
          "Tirez un set au hasard parmi les décisions liées qui passent les filtres (profondeur réglable).";
      } else if (state.objectLinkMode === "pick") {
        els.setupHint.textContent =
          "Recherchez une décision par son nom : la liste s’affiche dès la saisie, puis cliquez pour constituer l’enchaînement.";
      } else {
        els.setupHint.textContent =
          "Choisissez un mode : set au hasard, ou sélection d’une décision (recherche / liste).";
      }
    }
  }

  function linkableCandidates() {
    return state.filtered.filter(function (d) {
      return getNeighbors(d.id).size > 0;
    });
  }

  function displayedFromAnchor(id) {
    if (!id || !state.byId.has(id)) return [];
    var rel = getRelatedSet(id);
    return Array.from(rel)
      .map(function (rid) {
        return state.byId.get(rid);
      })
      .filter(Boolean)
      .sort(function (a, b) {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
      });
  }

  function generalSearchActive() {
    return String(state.filters.q || "").trim().length > 0;
  }

  function pickModeSearchActive() {
    return !!(
      state.objectLinks &&
      state.objectLinkMode === "pick" &&
      String(state.objectLinkQuery || "").trim().length > 0
    );
  }

  function pickListVisible() {
    // Exception : recherche générale → affiche la liste même hors « Choisir une décision ».
    return pickModeSearchActive() || generalSearchActive();
  }

  function syncPickListVisibility() {
    if (!els.pickList) return;
    var show = pickListVisible();
    if (show) {
      els.pickList.hidden = false;
      els.pickList.removeAttribute("hidden");
    } else {
      els.pickList.hidden = true;
      els.pickList.setAttribute("hidden", "");
    }
    els.pickList.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function pickListSource() {
    if (!pickListVisible()) return [];

    // Priorité au mode « Choisir une décision » + recherche par nom.
    if (pickModeSearchActive()) {
      var qNom = (state.objectLinkQuery || "").trim().toLowerCase();
      return linkableCandidates().filter(function (d) {
        return String(d.nom || "")
          .toLowerCase()
          .indexOf(qNom) !== -1;
      });
    }

    // Exception recherche générale : décisions déjà filtrées (dont q).
    return state.filtered.slice();
  }

  function drawRandomLinkedSet() {
    var pool = linkableCandidates().filter(function (d) {
      return maxReachableRelationDepth(d.id) >= 1;
    });
    if (!pool.length) {
      if (els.randomSetStatus) {
        els.randomSetStatus.textContent =
          "Aucune décision liée ne correspond aux filtres actuels.";
      }
      state.selectedId = null;
      applyFilters();
      return;
    }
    var prefer = pool.filter(function (d) {
      return maxReachableRelationDepth(d.id) >= Math.min(2, currentRelationDepth());
    });
    var use = prefer.length ? prefer : pool;
    var pick = use[Math.floor(Math.random() * use.length)];
    state.selectedId = pick.id;
    if (els.randomSetStatus) {
      els.randomSetStatus.textContent =
        "Ancre : " +
        displayNom(pick.nom || pick.id, false) +
        " · " +
        displayedFromAnchor(pick.id).length +
        " décisions.";
    }
    applyFilters();
  }

  function updateRelatedOnlyUi() {
    var hasLinks = selectedHasLinks();

    if (els.relatedOnly && els.relatedOnlyWrap) {
      var relatedAvailable = hasLinks && !state.objectLinks;
      els.relatedOnly.disabled = !relatedAvailable;
      els.relatedOnlyWrap.classList.toggle("is-disabled", !relatedAvailable);
      els.relatedOnlyWrap.classList.add("is-visible");
      if (!relatedAvailable) {
        if (els.relatedOnly.checked) els.relatedOnly.checked = false;
        if (!state.objectLinks) state.relatedOnly = false;
      }
      els.relatedOnlyWrap.title = state.objectLinks
        ? "Désactivez « Décisions liées par leur objet » pour utiliser ce filtre"
        : hasLinks
          ? "N’afficher que la décision sélectionnée et ses décisions liées"
          : "Sélectionnez une décision qui a des décisions liées";
    }

    if (els.objectLinksWrap) {
      els.objectLinksWrap.classList.add("is-visible");
      els.objectLinksWrap.title =
        "Constituer un enchaînement de décisions liées par leur objet (hasard ou choix)";
    }

    syncObjectLinksPanel();
    if (state.objectLinks && state.selectedId) updateRelationDepthOptions();
  }

  function updateStartUi() {
    var n = state.displayed.length;
    var ok = n >= 2;
    if (els.btnStart) els.btnStart.disabled = !ok;
    if (els.startHint) {
      if (ok) {
        els.startHint.textContent =
          "Prêt à lancer l’exercice (" + n + " décision" + (n > 1 ? "s" : "") + ").";
      } else if (state.objectLinks && !state.objectLinkMode) {
        els.startHint.textContent = "Choisissez un mode (hasard ou décision précise).";
      } else if (state.objectLinks && state.objectLinkMode === "pick" && !state.selectedId) {
        els.startHint.textContent = pickListVisible()
          ? "Sélectionnez une décision liée dans la liste."
          : "Commencez une recherche pour afficher les décisions liées.";
      } else if (state.objectLinks && state.objectLinkMode === "random" && !state.selectedId) {
        els.startHint.textContent = "Cliquez sur « Tirer un set ».";
      } else if (n === 1) {
        els.startHint.textContent = "Il faut au moins 2 décisions pour l’exercice.";
      } else {
        els.startHint.textContent = "Aucune décision ne correspond aux filtres.";
      }
    }
  }

  function applyFilters() {
    var f = state.filters;
    var list = (state.raw && state.raw.decisions) || [];

    state.filtered = list.filter(function (d) {
      if (coursFilter && !coursFilter.has(coursTitleKey(d.nom))) return false;
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
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
    });

    if (state.objectLinks) {
      if (state.selectedId && selectedHasLinks()) {
        state.displayed = displayedFromAnchor(state.selectedId);
      } else {
        state.displayed = [];
      }
    } else if (state.relatedOnly && state.selectedId && selectedHasLinks()) {
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
    renderPickList();
    updateStartUi();
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

  function resetFilters() {
    if (els.search) els.search.value = "";
    if (els.reference) els.reference.value = "";
    state.filters.q = "";
    state.filters.reference = "";
    state.filters.themes = [];
    state.filters.notions = [];
    state.filters.juridictions = [];
    state.filters.formations = [];
    state.filters.importance = [];
    state.filters.dateFrom = null;
    state.filters.dateTo = null;
    if (state.raw) populateFilterOptions(state.raw);
    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.checked = false;
    });
    if (els.dateFrom) els.dateFrom.value = "";
    if (els.dateTo) els.dateTo.value = "";
    clearRelationModes();
    state.selectedId = null;
    state.relationDepth = 2;
    if (els.relationDepth) els.relationDepth.value = "2";
    if (els.randomSetStatus) els.randomSetStatus.textContent = "";
    readFiltersFromDom();
    applyFilters();
  }

  function selectDecision(id) {
    if (!state.byId.has(id)) return;
    state.selectedId = id;
    if (state.objectLinks) {
      if (!selectedHasLinks()) {
        if (els.randomSetStatus) {
          els.randomSetStatus.textContent = "Cette décision n’a pas de liens.";
        }
      }
      applyFilters();
      return;
    }
    if (!selectedHasLinks()) {
      state.relatedOnly = false;
      if (els.relatedOnly) els.relatedOnly.checked = false;
    }
    applyFilters();
  }

  function renderPickList() {
    if (!els.pickList) return;
    syncPickListVisibility();
    els.pickList.innerHTML = "";
    if (!pickListVisible()) return;

    var source = pickListSource();
    if (!source.length) {
      var empty = document.createElement("li");
      empty.className = "ench-pick-list__empty";
      empty.textContent = pickModeSearchActive()
        ? "Aucune décision liée ne correspond à la recherche / aux filtres."
        : "Aucune décision ne correspond à la recherche.";
      els.pickList.appendChild(empty);
      return;
    }

    source.forEach(function (d) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ench-pick";
      btn.dataset.id = d.id;
      if (d.id === state.selectedId) btn.classList.add("is-selected");

      var nom = document.createElement("span");
      nom.className = "ench-pick__nom";
      nom.textContent = displayNom(d.nom || d.id, false);

      var meta = document.createElement("span");
      meta.className = "ench-pick__meta";
      meta.textContent =
        (d.juridiction || "") +
        (d.importance ? " · " + stars(d.importance) : "") +
        (getNeighbors(d.id).size ? " · liée" : "");

      var objet = document.createElement("span");
      objet.className = "ench-pick__objet";
      objet.textContent = d.objet || "";

      btn.appendChild(nom);
      btn.appendChild(meta);
      if (d.objet) btn.appendChild(objet);
      btn.addEventListener("click", function () {
        selectDecision(d.id);
      });
      li.appendChild(btn);
      els.pickList.appendChild(li);
    });
  }

  /* —— Fiche tip (jeu) —— */

  function hideFicheTip() {
    if (ficheTipTimer) {
      clearTimeout(ficheTipTimer);
      ficheTipTimer = null;
    }
    ficheTipId = null;
    var tip = $("fiche-tip");
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
    var tip = $("fiche-tip");
    var nomEl = $("fiche-tip-nom");
    var metaEl = $("fiche-tip-meta");
    var objetEl = $("fiche-tip-objet");
    var versoEl = $("fiche-tip-verso");
    if (!tip || !d) return;
    cancelHideFicheTip();
    ficheTipId = d.id;

    if (nomEl) nomEl.textContent = d.nom || "";
    if (metaEl) {
      metaEl.textContent =
        (formatDateFr(d.date) || "") +
        (d.importance ? " · " + stars(d.importance) : "") +
        (d.juridiction ? " · " + d.juridiction : "");
    }
    if (objetEl) {
      objetEl.textContent = d.objet || "";
      objetEl.hidden = !d.objet;
    }
    if (versoEl) {
      versoEl.textContent = d.verso || "";
      versoEl.hidden = !d.verso;
    }

    tip.hidden = false;
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("is-open");
    tip.classList.remove("is-above", "is-right");
    tip.classList.add("is-left");

    var rect = anchorEl.getBoundingClientRect();
    var tipW = Math.min(320, Math.max(220, window.innerWidth * 0.42));
    tip.style.width = tipW + "px";

    var gap = 12;
    var left = rect.left - tipW - gap;
    if (left < 8) {
      left = Math.min(rect.right + gap, window.innerWidth - tipW - 8);
      tip.classList.remove("is-left");
      tip.classList.add("is-right");
    }
    tip.style.left = Math.max(8, left) + "px";

    requestAnimationFrame(function () {
      if (ficheTipId !== d.id) return;
      var tipH = tip.offsetHeight || 120;
      var top = rect.top + rect.height / 2 - tipH / 2;
      top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
      tip.style.top = top + "px";
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

  /* —— Jeu —— */

  function clearFeedback() {
    checked = false;
    revealed = false;
    hideFicheTip();
    if (els.scoreBanner) {
      els.scoreBanner.hidden = true;
      els.scoreBanner.classList.remove("is-perfect");
      els.scoreBanner.textContent = "";
    }
    if (els.reveal) els.reveal.hidden = true;
    if (els.status) {
      els.status.hidden = true;
      els.status.textContent = "";
    }
  }

  function moveId(id, toIndex) {
    var from = userOrder.indexOf(id);
    if (from < 0) return;
    userOrder.splice(from, 1);
    var idx = Math.max(0, Math.min(toIndex, userOrder.length));
    userOrder.splice(idx, 0, id);
  }

  function renderList() {
    if (!els.list) return;
    hideFicheTip();
    els.list.innerHTML = "";
    userOrder.forEach(function (id, index) {
      var d = state.byId.get(id);
      if (!d) return;
      var isOk = revealed || (checked && correctOrder[index] === id);
      var isWrong = checked && !revealed && correctOrder[index] !== id;
      var showDetails = isOk;

      var li = document.createElement("li");
      li.className = "ench-card";
      li.draggable = !revealed;
      li.dataset.id = id;
      if (isOk) li.classList.add("is-correct");
      if (isWrong) li.classList.add("is-incorrect");

      if (showDetails) {
        var marker = document.createElement("button");
        marker.type = "button";
        marker.className = "ench-card__marker";
        marker.setAttribute("aria-label", "Aperçu fiche — " + (d.nom || id));
        marker.title = "Aperçu de la fiche";
        marker.draggable = false;
        marker.addEventListener("mousedown", function (ev) {
          ev.stopPropagation();
        });
        marker.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        });
        bindFicheTip(marker, d);
        li.appendChild(marker);
      } else {
        var slot = document.createElement("span");
        slot.className = "ench-card__marker-slot";
        slot.setAttribute("aria-hidden", "true");
        li.appendChild(slot);
      }

      var rank = document.createElement("span");
      rank.className = "ench-card__rank";
      rank.setAttribute("aria-hidden", "true");

      var body = document.createElement("div");
      body.className = "ench-card__body";

      var titleRow = document.createElement("div");
      titleRow.className = "ench-card__title";

      var nom = document.createElement("p");
      nom.className = "ench-card__nom";
      nom.textContent = displayNom(d.nom || id, showDetails);
      titleRow.appendChild(nom);

      if (showDetails) {
        var meta = document.createElement("div");
        meta.className = "ench-card__meta";
        var dateTag = document.createElement("span");
        dateTag.className = "tag";
        dateTag.textContent = formatDateFr(d.date);
        dateTag.title = "Date";
        meta.appendChild(dateTag);
        var url = ficheUrl(d);
        if (url) {
          var link = document.createElement("a");
          link.className = "ench-card__fiche";
          link.href = url;
          link.textContent = "Ouvrir la fiche";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.draggable = false;
          link.addEventListener("mousedown", function (ev) {
            ev.stopPropagation();
          });
          meta.appendChild(link);
        }
        titleRow.appendChild(meta);
      }

      body.appendChild(titleRow);

      if (d.objet) {
        var objet = document.createElement("p");
        objet.className = "ench-card__objet";
        objet.textContent = d.objet;
        body.appendChild(objet);
      }

      var moves = document.createElement("div");
      moves.className = "ench-card__moves";
      var up = document.createElement("button");
      up.type = "button";
      up.className = "ench-move";
      up.textContent = "↑";
      up.title = "Monter";
      up.setAttribute("aria-label", "Monter " + (d.nom || id));
      up.disabled = revealed || index === 0;
      up.addEventListener("click", function () {
        if (revealed) return;
        moveId(id, index - 1);
        clearFeedback();
        renderList();
      });
      var down = document.createElement("button");
      down.type = "button";
      down.className = "ench-move";
      down.textContent = "↓";
      down.title = "Descendre";
      down.setAttribute("aria-label", "Descendre " + (d.nom || id));
      down.disabled = revealed || index === userOrder.length - 1;
      down.addEventListener("click", function () {
        if (revealed) return;
        moveId(id, index + 1);
        clearFeedback();
        renderList();
      });
      moves.appendChild(up);
      moves.appendChild(down);

      li.appendChild(rank);
      li.appendChild(body);
      li.appendChild(moves);

      li.addEventListener("dragstart", onDragStart);
      li.addEventListener("dragend", onDragEnd);

      els.list.appendChild(li);
    });
  }

  function refreshMoveButtons() {
    if (!els.list) return;
    var cards = Array.from(els.list.querySelectorAll(".ench-card"));
    cards.forEach(function (card, index) {
      var ups = card.querySelectorAll(".ench-move");
      if (ups[0]) ups[0].disabled = revealed || index === 0;
      if (ups[1]) ups[1].disabled = revealed || index === cards.length - 1;
    });
  }

  function syncOrderFromDom() {
    if (!els.list) return;
    userOrder = Array.from(els.list.querySelectorAll(".ench-card")).map(function (el) {
      return el.dataset.id;
    });
  }

  function getDragAfterElement(y) {
    var elsCards = Array.from(
      els.list.querySelectorAll(".ench-card:not(.is-dragging)")
    );
    var closest = null;
    var closestOffset = Number.NEGATIVE_INFINITY;
    elsCards.forEach(function (child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = child;
      }
    });
    return closest;
  }

  function onDragStart(ev) {
    if (revealed) {
      ev.preventDefault();
      return;
    }
    var card = ev.currentTarget;
    dragId = card.dataset.id;
    card.classList.add("is-dragging");
    if (els.list) els.list.classList.add("is-sorting");
    try {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", dragId);
    } catch (e) {
      /* ignore */
    }
    clearFeedback();
  }

  function onDragEnd() {
    var dragging = els.list && els.list.querySelector(".ench-card.is-dragging");
    if (dragging) dragging.classList.remove("is-dragging");
    if (els.list) els.list.classList.remove("is-sorting");
    syncOrderFromDom();
    dragId = null;
    renderList();
  }

  function onListDragOver(ev) {
    if (revealed || !dragId) return;
    ev.preventDefault();
    try {
      ev.dataTransfer.dropEffect = "move";
    } catch (e) {
      /* ignore */
    }
    var dragging = els.list.querySelector(".ench-card.is-dragging");
    if (!dragging) return;
    var after = getDragAfterElement(ev.clientY);
    if (after == null) {
      els.list.appendChild(dragging);
    } else if (after !== dragging.nextSibling) {
      els.list.insertBefore(dragging, after);
    }
    refreshMoveButtons();
  }

  function onListDrop(ev) {
    if (revealed || !dragId) return;
    ev.preventDefault();
    syncOrderFromDom();
    dragId = null;
    renderList();
  }

  function checkOrder() {
    var correct = 0;
    var i;
    for (i = 0; i < correctOrder.length; i++) {
      if (userOrder[i] === correctOrder[i]) correct += 1;
    }
    checked = true;
    revealed = false;
    if (els.reveal) els.reveal.hidden = false;
    if (els.scoreBanner) {
      els.scoreBanner.hidden = false;
      els.scoreBanner.classList.toggle("is-perfect", correct === correctOrder.length);
      els.scoreBanner.innerHTML =
        "<strong>" +
        correct +
        "</strong> / " +
        correctOrder.length +
        " bien placées";
    }
    if (els.status) {
      els.status.hidden = true;
      els.status.textContent = "";
    }
    renderList();
  }

  function revealSolution() {
    userOrder = correctOrder.slice();
    checked = true;
    revealed = true;
    if (els.scoreBanner) {
      els.scoreBanner.hidden = false;
      els.scoreBanner.classList.add("is-perfect");
      els.scoreBanner.innerHTML =
        "<strong>" +
        correctOrder.length +
        "</strong> / " +
        correctOrder.length +
        " — solution affichée";
    }
    if (els.status) {
      els.status.hidden = false;
      els.status.textContent = "Dates révélées. Cliquez sur Recommencer pour rejouer.";
    }
    if (els.reveal) els.reveal.hidden = true;
    renderList();
  }

  function startRound() {
    clearFeedback();
    userOrder = shuffle(correctOrder);
    if (correctOrder.length > 1) {
      var same = userOrder.every(function (id, i) {
        return id === correctOrder[i];
      });
      if (same) userOrder = shuffle(correctOrder);
    }
    renderList();
  }

  function enterGame() {
    var ids = state.displayed.map(function (d) {
      return d.id;
    });
    if (ids.length < 2) return;
    correctOrder = ids.slice().sort(function (a, b) {
      var da = state.byId.get(a).date || "";
      var db = state.byId.get(b).date || "";
      if (da < db) return -1;
      if (da > db) return 1;
      return String(state.byId.get(a).nom || "").localeCompare(
        String(state.byId.get(b).nom || ""),
        "fr"
      );
    });
    inGame = true;
    if (els.screenHome) els.screenHome.hidden = true;
    if (els.screenGame) els.screenGame.hidden = false;
    if (els.lead) {
      els.lead.textContent =
        "Remettez ces décisions dans l’ordre chronologique (du plus ancien au plus récent). Les dates sont cachées.";
    }
    startRound();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function leaveGame() {
    inGame = false;
    clearFeedback();
    hideFicheTip();
    if (els.screenGame) els.screenGame.hidden = true;
    if (els.screenHome) els.screenHome.hidden = false;
    if (els.lead) {
      els.lead.textContent =
        "Affinez le lot avec les filtres (comme en Chronologie), puis lancez l’exercice : remettre les décisions dans l’ordre chronologique — les dates restent cachées.";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Filtre strict « ?cours=DP-XXX » depuis une page de chapitre du manuel (fonds membre uniquement). */
  function applyCoursLock() {
    if (!coursFilter) return;
    var filters = document.querySelector(".filters");
    if (filters) filters.hidden = true;
    var banner = $("cours-banner");
    if (banner) {
      banner.hidden = false;
      banner.textContent =
        "Filtré sur le chapitre « " + coursChapterTitle + " » (" +
        coursFilter.size + " décision(s)). Retirez « ?cours= » de l’URL pour tout le fonds.";
    }
  }

  function loadCoursFilter() {
    var ref = new URLSearchParams(location.search).get("cours");
    if (!ref || config.demo) return Promise.resolve();
    return fetch("../manuel/exercices.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (map) {
        var entry = map && map[ref.toUpperCase()];
        var titles = entry && entry.jurisprudence;
        if (!titles || !titles.length) return;
        coursFilter = new Set(titles.map(coursTitleKey));
        coursChapterTitle = (entry && entry.title) || ref;
        applyCoursLock();
      })
      .catch(function () {});
  }

  function load() {
    return fetch(config.dataUrl, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (raw) {
        state.raw = raw;
        state.byId = new Map();
        (raw.decisions || []).forEach(function (d) {
          state.byId.set(d.id, d);
        });

        var upsell = $("ench-demo-upsell");
        if (upsell) upsell.hidden = !config.demo;

        populateFilterOptions(raw);
        document.querySelectorAll('input[name="importance"]').forEach(function (el) {
          el.checked = false;
        });
        readFiltersFromDom();
        applyFilters();

        if (config.demo) {
          setAlert(
            "Démo : " +
              ((raw.decisions && raw.decisions.length) || 0) +
              " décisions. Connectez-vous pour le fonds complet.",
            "info"
          );
        }
      })
      .catch(function (err) {
        setAlert("Impossible de charger les décisions (" + err.message + ").", "warn");
        if (els.status) {
          els.status.hidden = false;
          els.status.textContent =
            "Impossible de charger les décisions (" + escapeHtml(err.message) + ").";
        }
      });
  }

  function bind() {
    els.screenHome = $("screen-home");
    els.screenGame = $("screen-game");
    els.lead = $("ench-lead");
    els.alert = $("ench-alert");
    els.setupHint = $("setup-hint");
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
    els.objectLinks = $("filter-object-links");
    els.objectLinksWrap = $("object-links-wrap");
    els.objectLinksPanel = $("object-links-panel");
    els.objectLinksRandom = $("object-links-random");
    els.objectLinksPick = $("object-links-pick");
    els.objectLinkSearch = $("object-link-search");
    els.btnRandomSet = $("btn-random-set");
    els.randomSetStatus = $("random-set-status");
    els.relationDepth = $("filter-relation-depth");
    els.activeFiltersList = $("active-filters-list");
    els.countFiltered = $("count-filtered");
    els.countTotal = $("count-total");
    els.resetBtn = $("filter-reset");
    els.pickList = $("pick-list");
    els.btnStart = $("btn-start");
    els.startHint = $("start-hint");

    els.list = $("ench-list");
    els.scoreBanner = $("score-banner");
    els.check = $("ench-check");
    els.reveal = $("ench-reveal");
    els.reset = $("ench-reset");
    els.back = $("ench-back");
    els.status = $("ench-status");

    if (els.search) els.search.addEventListener("input", onFilterChange);
    if (els.reference) els.reference.addEventListener("input", onFilterChange);
    if (els.advancedToggle && els.advancedPanel) {
      els.advancedToggle.addEventListener("click", function () {
        var open = els.advancedPanel.hidden;
        els.advancedPanel.hidden = !open;
        els.advancedToggle.setAttribute("aria-expanded", open ? "true" : "false");
        els.advancedToggle.classList.toggle("is-open", open);
      });
    }
    if (els.dateFrom) els.dateFrom.addEventListener("change", onFilterChange);
    if (els.dateTo) els.dateTo.addEventListener("change", onFilterChange);
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
    if (els.objectLinks) {
      els.objectLinks.addEventListener("change", function () {
        state.objectLinks = !!els.objectLinks.checked;
        if (!state.objectLinks) {
          state.objectLinkMode = null;
          state.objectLinkQuery = "";
          state.selectedId = null;
          document.querySelectorAll('input[name="object-link-mode"]').forEach(function (el) {
            el.checked = false;
          });
          if (els.objectLinkSearch) els.objectLinkSearch.value = "";
          if (els.randomSetStatus) els.randomSetStatus.textContent = "";
        } else {
          state.relatedOnly = false;
          if (els.relatedOnly) els.relatedOnly.checked = false;
          if (!state.relationDepth || state.relationDepth < 1) state.relationDepth = 2;
        }
        applyFilters();
      });
    }
    document.querySelectorAll('input[name="object-link-mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        if (!el.checked) return;
        state.objectLinkMode = el.value;
        state.selectedId = null;
        state.objectLinkQuery = "";
        if (els.objectLinkSearch) els.objectLinkSearch.value = "";
        if (els.randomSetStatus) els.randomSetStatus.textContent = "";
        applyFilters();
      });
    });
    if (els.btnRandomSet) {
      els.btnRandomSet.addEventListener("click", function () {
        if (!state.objectLinks || state.objectLinkMode !== "random") return;
        drawRandomLinkedSet();
      });
    }
    if (els.objectLinkSearch) {
      var onObjectLinkSearchInput = function () {
        state.objectLinkQuery = els.objectLinkSearch.value || "";
        renderPickList();
        updateStartUi();
      };
      els.objectLinkSearch.addEventListener("input", onObjectLinkSearchInput);
      els.objectLinkSearch.addEventListener("keyup", onObjectLinkSearchInput);
      els.objectLinkSearch.addEventListener("search", onObjectLinkSearchInput);
      els.objectLinkSearch.addEventListener("change", onObjectLinkSearchInput);
    }
    if (els.relationDepth) {
      els.relationDepth.addEventListener("change", function () {
        var n = Number(els.relationDepth.value);
        if (!isFinite(n)) return;
        state.relationDepth = Math.max(1, Math.min(RELATION_DEPTH_SELECTABLE_MAX, n));
        els.relationDepth.value = String(state.relationDepth);
        applyFilters();
      });
    }
    if (els.resetBtn) els.resetBtn.addEventListener("click", resetFilters);
    if (els.btnStart) els.btnStart.addEventListener("click", enterGame);

    document.addEventListener("click", function (ev) {
      if (!openMsId) return;
      var t = ev.target;
      if (t && t.closest && t.closest(".ms")) return;
      closeAllMs();
    });

    if (els.check) els.check.addEventListener("click", checkOrder);
    if (els.reveal) els.reveal.addEventListener("click", revealSolution);
    if (els.reset) els.reset.addEventListener("click", startRound);
    if (els.back) els.back.addEventListener("click", leaveGame);
    if (els.list) {
      els.list.addEventListener("dragover", onListDragOver);
      els.list.addEventListener("drop", onListDrop);
    }
    var tipRoot = $("fiche-tip");
    if (tipRoot) {
      tipRoot.addEventListener("pointerenter", cancelHideFicheTip);
      tipRoot.addEventListener("pointerleave", scheduleHideFicheTip);
    }
    window.addEventListener("scroll", hideFicheTip, true);
    window.addEventListener("resize", hideFicheTip);
  }

  loadCoursFilter().then(function () {
    bind();
    return load();
  }).then(function () {
    if (coursFilter && state.displayed && state.displayed.length >= 2) enterGame();
  });
})();
