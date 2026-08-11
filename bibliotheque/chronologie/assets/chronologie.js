/**
 * Chronologie juridique — moteur de présentation (Option A)
 */
(function () {
  "use strict";

  var DEFAULT_CONFIG = {
    dataUrl: "./data/chronology-decisions.json",
    ficheBaseUrl: "/ressources/fiches/",
    defaultMinImportance: 1,
    supportedDataVersion: 1,
  };

  var config = Object.assign({}, DEFAULT_CONFIG, window.__CHRONO_CONFIG__ || {});

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
    relatedOnly: false,
    filters: {
      q: "",
      theme: "",
      notions: [],
      importance: [],
      juridictions: [],
      periodMode: "year",
      yearFrom: null,
      yearTo: null,
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
    if (s.indexOf("cour-europeenne") === 0) return "cedh";
    if (s.indexOf("cour-de-justice") === 0) return "cjue";
    if (s.indexOf("cour-administrative") === 0) return "caa";
    if (s.indexOf("tribunal-administratif") === 0) return "ta";
    return s;
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

  function buildIndex(data) {
    state.byId = new Map();
    (data.decisions || []).forEach(function (d) {
      state.byId.set(d.id, d);
    });
  }

  /** Undirected neighborhood of selected decision (self + liees + reverse). */
  function getRelatedSet(id) {
    var set = new Set();
    if (!id || !state.byId.has(id)) return set;
    set.add(id);
    var sel = state.byId.get(id);
    (sel.liees || []).forEach(function (x) {
      set.add(x);
    });
    state.byId.forEach(function (d, otherId) {
      if ((d.liees || []).indexOf(id) !== -1) set.add(otherId);
    });
    return set;
  }

  function selectedHasLinks() {
    if (!state.selectedId) return false;
    return getRelatedSet(state.selectedId).size > 1;
  }

  /** Chronological chain for arrows. */
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

    fillSelect(els.theme, themes, true);
    buildMultiSelect(els.juridictions, juridictions, state.filters.juridictions, "Toutes les juridictions");
    buildMultiSelect(els.notions, notions, state.filters.notions, "Toutes les notions");

    var years = decisions
      .map(function (d) {
        return d.annee;
      })
      .filter(function (y) {
        return typeof y === "number";
      });
    var minY = years.length ? Math.min.apply(null, years) : 1800;
    var maxY = years.length ? Math.max.apply(null, years) : new Date().getFullYear();
    els.yearFrom.min = minY;
    els.yearFrom.max = maxY;
    els.yearTo.min = minY;
    els.yearTo.max = maxY;
    els.yearFrom.placeholder = String(minY);
    els.yearTo.placeholder = String(maxY);
  }

  function fillSelect(select, values, withEmpty) {
    select.innerHTML = "";
    if (withEmpty) {
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Tous les thèmes";
      select.appendChild(opt0);
    }
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function selectedImportance() {
    return Array.from(document.querySelectorAll('input[name="importance"]:checked')).map(
      function (el) {
        return Number(el.value);
      }
    );
  }

  function readFiltersFromDom() {
    state.filters.q = (els.search.value || "").trim().toLowerCase();
    state.filters.theme = els.theme.value || "";
    state.filters.notions = getMsSelected(els.notions);
    state.filters.juridictions = getMsSelected(els.juridictions);
    state.filters.importance = selectedImportance();

    var modeEl = document.querySelector('input[name="period-mode"]:checked');
    state.filters.periodMode = modeEl ? modeEl.value : "year";

    var yf = els.yearFrom.value !== "" ? Number(els.yearFrom.value) : null;
    var yt = els.yearTo.value !== "" ? Number(els.yearTo.value) : null;
    state.filters.yearFrom = Number.isFinite(yf) ? yf : null;
    state.filters.yearTo = Number.isFinite(yt) ? yt : null;

    state.filters.dateFrom = els.dateFrom.value || null;
    state.filters.dateTo = els.dateTo.value || null;

    if (els.relatedOnly && !els.relatedOnly.disabled) {
      state.relatedOnly = !!els.relatedOnly.checked;
    }

    if (els.notions._msRefreshLabel) els.notions._msRefreshLabel();
    if (els.juridictions._msRefreshLabel) els.juridictions._msRefreshLabel();
  }

  function syncPeriodModeUi() {
    var mode = state.filters.periodMode || "year";
    if (els.periodYear) els.periodYear.hidden = mode !== "year";
    if (els.periodDate) els.periodDate.hidden = mode !== "date";
  }

  function applyFilters() {
    var f = state.filters;
    var list = (state.raw && state.raw.decisions) || [];

    state.filtered = list.filter(function (d) {
      if (f.theme && d.theme !== f.theme) return false;
      if (f.importance.length && f.importance.indexOf(d.importance) === -1) return false;
      if (f.juridictions.length && f.juridictions.indexOf(d.juridiction) === -1) return false;
      if (f.notions.length) {
        var ok = f.notions.every(function (n) {
          return (d.notions || []).indexOf(n) !== -1;
        });
        if (!ok) return false;
      }

      if (f.periodMode === "date") {
        var ds = String(d.date || "").slice(0, 10);
        if (f.dateFrom && ds < f.dateFrom) return false;
        if (f.dateTo && ds > f.dateTo) return false;
      } else {
        if (f.yearFrom != null && d.annee < f.yearFrom) return false;
        if (f.yearTo != null && d.annee > f.yearTo) return false;
      }

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
    if (f.theme) parts.push("thème : " + f.theme);
    if (f.juridictions.length) {
      parts.push(
        "juridiction" +
          (f.juridictions.length > 1 ? "s" : "") +
          " : " +
          f.juridictions.join(", ")
      );
    }
    if (f.notions.length) {
      parts.push("notion" + (f.notions.length > 1 ? "s" : "") + " : " + f.notions.join(", "));
    }
    if (f.importance.length && f.importance.length < 4) {
      parts.push("importance : " + f.importance.map(stars).join(" "));
    }
    if (f.periodMode === "date") {
      if (f.dateFrom || f.dateTo) {
        parts.push(
          "période : " +
            (f.dateFrom ? formatDateFr(f.dateFrom) : "…") +
            " → " +
            (f.dateTo ? formatDateFr(f.dateTo) : "…")
        );
      }
    } else if (f.yearFrom != null || f.yearTo != null) {
      parts.push(
        "années : " +
          (f.yearFrom != null ? f.yearFrom : "…") +
          " → " +
          (f.yearTo != null ? f.yearTo : "…")
      );
    }
    if (state.relatedOnly && state.selectedId && selectedHasLinks()) {
      parts.push("uniquement décisions liées");
    }

    els.activeFiltersList.textContent = parts.length ? parts.join(" · ") : "aucun";
  }

  function updateRelatedOnlyUi() {
    if (!els.relatedOnly || !els.relatedOnlyWrap) return;
    var available = selectedHasLinks();
    els.relatedOnly.disabled = !available;
    els.relatedOnlyWrap.classList.toggle("is-disabled", !available);
    els.relatedOnlyWrap.classList.add("is-visible");
    if (!available) {
      if (els.relatedOnly.checked) els.relatedOnly.checked = false;
      state.relatedOnly = false;
    }
    els.relatedOnlyWrap.title = available
      ? "N’afficher que la décision sélectionnée et ses décisions liées"
      : "Sélectionnez une décision qui a des décisions liées";
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
  }

  function syncViewButtons() {
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === state.view);
    });
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

  function dayLabel(iso) {
    var p = parseDateParts(iso);
    return String(p.d).padStart(2, "0") + "/" + String(p.m).padStart(2, "0");
  }

  function sortDecisions(items, chainActive, chainMap) {
    return items.slice().sort(function (a, b) {
      if (chainActive && chainMap.has(a.id) && chainMap.has(b.id)) {
        return chainMap.get(a.id) - chainMap.get(b.id);
      }
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return a.nom.localeCompare(b.nom, "fr");
    });
  }

  function makeTcol(key, labelText) {
    var col = document.createElement("div");
    col.className = "tcol";
    col.dataset.key = String(key);

    var label = document.createElement("div");
    label.className = "tcol__label";
    label.textContent = labelText;
    col.appendChild(label);

    var tick = document.createElement("div");
    tick.className = "tcol__tick";
    tick.setAttribute("aria-hidden", "true");
    col.appendChild(tick);

    var stack = document.createElement("div");
    stack.className = "tcol__stack";
    col.appendChild(stack);
    return { col: col, stack: stack };
  }

  function makeSubCluster(labelText) {
    var cluster = document.createElement("div");
    cluster.className = "sub-cluster";
    var lab = document.createElement("div");
    lab.className = "sub-cluster__label";
    lab.textContent = labelText;
    cluster.appendChild(lab);
    var dots = document.createElement("div");
    dots.className = "sub-cluster__dots";
    cluster.appendChild(dots);
    return { cluster: cluster, dots: dots };
  }

  function appendMarkers(dots, items, chainActive, chainMap, withExactDate) {
    items = sortDecisions(items, chainActive, chainMap);
    if (!chainActive && !withExactDate && items.length > 6) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "marker marker--cluster";
      btn.textContent = "+" + items.length;
      btn.title = items.length + " décisions";
      btn.setAttribute("aria-label", items.length + " décisions");
      var sampleYear = items[0] && items[0].annee;
      btn.addEventListener("click", function () {
        if (sampleYear) openYearMenu(sampleYear);
      });
      dots.appendChild(btn);
      return;
    }
    items.forEach(function (d) {
      if (withExactDate) {
        var wrap = document.createElement("div");
        wrap.className = "marker-with-date";
        var dl = document.createElement("div");
        dl.className = "marker-with-date__date";
        dl.textContent = dayLabel(d.date);
        wrap.appendChild(dl);
        wrap.appendChild(makeMarker(d, chainActive, chainMap));
        dots.appendChild(wrap);
      } else {
        dots.appendChild(makeMarker(d, chainActive, chainMap));
      }
    });
  }

  /**
   * Construit un segment de frise :
   * - jalon (label) en tête de segment
   * - rail horizontal d'unités (années / mois / jours)
   */
  function makeSegment(key, milestoneLabel) {
    var seg = document.createElement("div");
    seg.className = "tseg";
    seg.dataset.key = String(key);

    var mile = document.createElement("div");
    mile.className = "tseg__milestone";
    mile.innerHTML =
      '<span class="tseg__tick" aria-hidden="true"></span>' +
      '<span class="tseg__label">' +
      escapeHtml(milestoneLabel) +
      "</span>";
    seg.appendChild(mile);

    var rail = document.createElement("div");
    rail.className = "tseg__rail";
    seg.appendChild(rail);
    return { seg: seg, rail: rail };
  }

  function makeUnit(unitLabel, showLabel) {
    var unit = document.createElement("div");
    unit.className = "tunit";
    if (showLabel) {
      var lab = document.createElement("div");
      lab.className = "tunit__label";
      lab.textContent = unitLabel;
      unit.appendChild(lab);
    }
    var dots = document.createElement("div");
    dots.className = "tunit__dots";
    unit.appendChild(dots);
    return { unit: unit, dots: dots };
  }

  function renderTimeline() {
    var root = els.timeline;
    root.innerHTML = "";
    root.dataset.scale = state.scale || "year";

    if (!state.displayed.length) {
      root.innerHTML = '<div class="empty">Aucune décision ne correspond aux filtres.</div>';
      return;
    }

    var axis = document.createElement("div");
    axis.className = "timeline__axis";
    axis.setAttribute("aria-hidden", "true");
    root.appendChild(axis);

    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "timeline__links");
    svg.setAttribute("aria-hidden", "true");
    root.appendChild(svg);

    var chainMap = chainIndexMap();
    var chainActive = chainMap.size > 1;
    var scale = state.scale || "year";

    if (scale === "month") {
      // Jalons = années ; décisions rangées par mois (horizontal)
      var byYear = new Map();
      state.displayed.forEach(function (d) {
        if (!byYear.has(d.annee)) byYear.set(d.annee, []);
        byYear.get(d.annee).push(d);
      });
      Array.from(byYear.keys())
        .sort(function (a, b) {
          return a - b;
        })
        .forEach(function (year) {
          var built = makeSegment(year, String(year));
          var byMonth = new Map();
          byYear.get(year).forEach(function (d) {
            var parts = parseDateParts(d.date);
            if (!byMonth.has(parts.m)) byMonth.set(parts.m, []);
            byMonth.get(parts.m).push(d);
          });
          Array.from(byMonth.keys())
            .sort(function (a, b) {
              return a - b;
            })
            .forEach(function (m) {
              var mon = MONTH_SHORT[m - 1] || String(m);
              var u = makeUnit(mon, true);
              appendMarkers(u.dots, byMonth.get(m), chainActive, chainMap, false);
              built.rail.appendChild(u.unit);
            });
          root.appendChild(built.seg);
        });
    } else if (scale === "day") {
      // Jalons = mois ; décisions rangées par jours (horizontal)
      var byYm = new Map();
      state.displayed.forEach(function (d) {
        var parts = parseDateParts(d.date);
        if (!byYm.has(parts.ym)) byYm.set(parts.ym, []);
        byYm.get(parts.ym).push(d);
      });
      Array.from(byYm.keys())
        .sort(function (a, b) {
          return a < b ? -1 : a > b ? 1 : 0;
        })
        .forEach(function (ym) {
          var built = makeSegment(ym, monthLabel(ym));
          var byDay = new Map();
          byYm.get(ym).forEach(function (d) {
            var parts = parseDateParts(d.date);
            var dayKey = String(parts.d).padStart(2, "0");
            if (!byDay.has(dayKey)) byDay.set(dayKey, []);
            byDay.get(dayKey).push(d);
          });
          Array.from(byDay.keys())
            .sort(function (a, b) {
              return Number(a) - Number(b);
            })
            .forEach(function (dayKey) {
              var u = makeUnit(dayKey, true);
              appendMarkers(u.dots, byDay.get(dayKey), chainActive, chainMap, false);
              built.rail.appendChild(u.unit);
            });
          root.appendChild(built.seg);
        });
    } else {
      // Années : jalons = décennies ; décisions rangées par années (horizontal)
      var byDecade = new Map();
      state.displayed.forEach(function (d) {
        var dec = decadeOf(d.annee);
        if (!byDecade.has(dec)) byDecade.set(dec, []);
        byDecade.get(dec).push(d);
      });
      Array.from(byDecade.keys())
        .sort(function (a, b) {
          return a - b;
        })
        .forEach(function (dec) {
          var built = makeSegment(dec, String(dec));
          var byY = new Map();
          byDecade.get(dec).forEach(function (d) {
            if (!byY.has(d.annee)) byY.set(d.annee, []);
            byY.get(d.annee).push(d);
          });
          Array.from(byY.keys())
            .sort(function (a, b) {
              return a - b;
            })
            .forEach(function (year) {
              var u = makeUnit(String(year), true);
              appendMarkers(u.dots, byY.get(year), chainActive, chainMap, false);
              built.rail.appendChild(u.unit);
            });
          root.appendChild(built.seg);
        });
    }

    scheduleDrawChainLinks();
  }

  function makeMarker(d, chainActive, chainMap) {
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

    btn.title = d.nom + " — " + formatDateFr(d.date);
    btn.setAttribute("aria-label", d.nom + ", " + formatDateFr(d.date));
    btn.addEventListener("click", function () {
      focus(d.id);
    });
    return btn;
  }

  function scheduleDrawChainLinks() {
    if (linkDrawTimer) cancelAnimationFrame(linkDrawTimer);
    linkDrawTimer = requestAnimationFrame(function () {
      linkDrawTimer = requestAnimationFrame(drawChainLinks);
    });
  }

  function drawChainLinks() {
    var root = els.timeline;
    if (!root) return;
    var svg = root.querySelector(".timeline__links");
    if (!svg) return;

    // clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var chainIds = getChainIds().filter(function (id) {
      return state.displayed.some(function (d) {
        return d.id === id;
      });
    });
    if (chainIds.length < 2) {
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      return;
    }

    var tw = root.scrollWidth || root.offsetWidth;
    var th = root.scrollHeight || root.offsetHeight;
    svg.setAttribute("width", String(tw));
    svg.setAttribute("height", String(th));
    svg.setAttribute("viewBox", "0 0 " + tw + " " + th);

    var rootRect = root.getBoundingClientRect();

    var points = [];
    chainIds.forEach(function (id) {
      var el = root.querySelector('.marker[data-id="' + id + '"]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      points.push({
        id: id,
        x: r.left - rootRect.left + root.scrollLeft + r.width / 2,
        y: r.top - rootRect.top + root.scrollTop + r.height / 2,
      });
    });

    if (points.length < 2) return;

    // marker defs for arrowhead
    var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    var marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "chain-arrowhead");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    var tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tip.setAttribute("d", "M0,0 L6,3 L0,6 Z");
    tip.setAttribute("fill", "currentColor");
    marker.appendChild(tip);
    defs.appendChild(marker);
    svg.appendChild(defs);
    svg.style.color = getComputedStyle(document.documentElement).getPropertyValue("--orange").trim() || "#d5803b";

    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i];
      var b = points[i + 1];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // shorten so line doesn't cover marker centers
      var pad = 14;
      var x1 = a.x + (dx / dist) * pad;
      var y1 = a.y + (dy / dist) * pad;
      var x2 = b.x - (dx / dist) * pad;
      var y2 = b.y - (dy / dist) * pad;

      // Arc lisible : hauteur proportionnelle à la distance horizontale
      var mx = (x1 + x2) / 2;
      var my = (y1 + y2) / 2;
      var arch = Math.max(36, Math.min(90, Math.abs(dx) * 0.28 + 28));
      // alterne au-dessus / en-dessous pour chaînes multi-liens
      var sign = i % 2 === 0 ? -1 : 1;
      my = my + sign * arch;

      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M " + x1.toFixed(1) + " " + y1.toFixed(1) + " Q " + mx.toFixed(1) + " " + my.toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1)
      );
      path.setAttribute("marker-end", "url(#chain-arrowhead)");
      path.setAttribute("stroke", "currentColor");
      svg.appendChild(path);
    }
  }

  function openYearMenu(year) {
    var modeYear = document.querySelector('input[name="period-mode"][value="year"]');
    if (modeYear) modeYear.checked = true;
    state.filters.periodMode = "year";
    els.yearFrom.value = String(year);
    els.yearTo.value = String(year);
    els.dateFrom.value = "";
    els.dateTo.value = "";
    syncPeriodModeUi();
    readFiltersFromDom();
    state.view = "list";
    applyFilters();
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
        '<div class="list-item__nom">' +
        escapeHtml(d.nom) +
        "</div>" +
        (d.objet ? '<p class="list-item__objet">' + escapeHtml(d.objet) + "</p>" : "") +
        "</span>" +
        '<span class="list-item__meta">' +
        '<span class="tag tag--stars" title="Importance">' +
        stars(d.importance) +
        "</span>" +
        "</span>";

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
      wrap.innerHTML =
        '<div class="detail-placeholder">' +
        "Sélectionnez une décision sur la frise ou dans la liste pour afficher sa fiche synthétique et ses liens." +
        "</div>";
      wrap.hidden = false;
      return;
    }

    var related = getRelatedSet(d.id);
    related.delete(d.id);
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
          "\">" +
          escapeHtml(r.nom) +
          " <span class=\"tag\">" +
          escapeHtml(formatDateFr(r.date)) +
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

    var closeBtn = $("detail-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        state.selectedId = null;
        state.relatedOnly = false;
        if (els.relatedOnly) els.relatedOnly.checked = false;
        applyFilters();
      });
    }
    wrap.querySelectorAll("[data-focus]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        focus(btn.getAttribute("data-focus"));
      });
    });
  }

  function focus(id) {
    if (!state.byId.has(id)) return;
    state.selectedId = id;
    if (state.relatedOnly && !selectedHasLinks()) {
      state.relatedOnly = false;
      if (els.relatedOnly) els.relatedOnly.checked = false;
    }
    applyFilters();
    var listBtn = els.list && els.list.querySelector(".list-item.is-selected");
    if (listBtn && typeof listBtn.scrollIntoView === "function") {
      listBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function resetFilters() {
    els.search.value = "";
    els.theme.value = "";
    if (state.raw) populateFilterOptions(state.raw);
    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.checked = Number(el.value) >= config.defaultMinImportance;
    });
    var modeYear = document.querySelector('input[name="period-mode"][value="year"]');
    if (modeYear) modeYear.checked = true;
    els.yearFrom.value = "";
    els.yearTo.value = "";
    els.dateFrom.value = "";
    els.dateTo.value = "";
    if (els.relatedOnly) els.relatedOnly.checked = false;
    state.relatedOnly = false;
    state.filters.periodMode = "year";
    syncPeriodModeUi();
    readFiltersFromDom();
    applyFilters();
  }

  function bindUi() {
    els.alert = $("chrono-alert");
    els.main = $("chrono-main");
    els.search = $("filter-search");
    els.theme = $("filter-theme");
    els.notions = $("filter-notions");
    els.juridictions = $("filter-juridictions");
    els.yearFrom = $("filter-year-from");
    els.yearTo = $("filter-year-to");
    els.dateFrom = $("filter-date-from");
    els.dateTo = $("filter-date-to");
    els.periodYear = $("period-year-fields");
    els.periodDate = $("period-date-fields");
    els.relatedOnly = $("filter-related-only");
    els.relatedOnlyWrap = $("related-only-wrap");
    els.activeFiltersList = $("active-filters-list");
    els.timeline = $("timeline");
    els.timelineScroll = $("timeline-scroll");
    els.timelinePanel = $("timeline-panel");
    els.listPanel = $("list-panel");
    els.list = $("decision-list");
    els.detail = $("detail");
    els.countFiltered = $("count-filtered");
    els.countTotal = $("count-total");
    els.metaGenerated = $("meta-generated");
    els.resetBtn = $("filter-reset");
    els.timelineTitle = $("timeline-title");

    ["input", "change"].forEach(function (evt) {
      els.search.addEventListener(evt, onFilterChange);
      els.theme.addEventListener(evt, onFilterChange);
      els.yearFrom.addEventListener(evt, onFilterChange);
      els.yearTo.addEventListener(evt, onFilterChange);
      els.dateFrom.addEventListener(evt, onFilterChange);
      els.dateTo.addEventListener(evt, onFilterChange);
    });

    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.addEventListener("change", onFilterChange);
    });

    document.querySelectorAll('input[name="period-mode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        readFiltersFromDom();
        syncPeriodModeUi();
        applyFilters();
      });
    });

    if (els.relatedOnly) {
      els.relatedOnly.addEventListener("change", function () {
        if (els.relatedOnly.disabled) return;
        state.relatedOnly = !!els.relatedOnly.checked;
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

    if (els.resetBtn) els.resetBtn.addEventListener("click", resetFilters);

    if (els.timelineScroll) {
      els.timelineScroll.addEventListener("scroll", function () {
        scheduleDrawChainLinks();
      });
    }
    window.addEventListener("resize", function () {
      scheduleDrawChainLinks();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (openMsId) {
          closeAllMs();
          return;
        }
        if (state.selectedId) {
          state.selectedId = null;
          state.relatedOnly = false;
          if (els.relatedOnly) els.relatedOnly.checked = false;
          applyFilters();
        }
      }
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".ms")) closeAllMs();
    });
  }

  function onFilterChange() {
    readFiltersFromDom();
    syncPeriodModeUi();
    applyFilters();
  }

  function load(data) {
    if (!data || !Array.isArray(data.decisions)) {
      throw new Error("Dataset invalide : propriété decisions manquante.");
    }
    if (data.meta && data.meta.version > config.supportedDataVersion) {
      setAlert(
        "Version de données " +
          data.meta.version +
          " supérieure à la version supportée (" +
          config.supportedDataVersion +
          "). Mettez à jour chronologie.js.",
        "warn"
      );
    } else {
      setAlert("");
    }

    if (!data.meta) data.meta = { version: 1, count: data.decisions.length, generatedAt: null };
    data.meta.count = data.decisions.length;

    state.raw = data;
    buildIndex(data);
    populateFilterOptions(data);

    document.querySelectorAll('input[name="importance"]').forEach(function (el) {
      el.checked = Number(el.value) >= config.defaultMinImportance;
    });

    syncPeriodModeUi();
    readFiltersFromDom();
    applyFilters();
  }

  function getState() {
    return {
      selectedId: state.selectedId,
      view: state.view,
      scale: state.scale,
      relatedOnly: state.relatedOnly,
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
      if (partial && partial.theme != null) els.theme.value = partial.theme;
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
