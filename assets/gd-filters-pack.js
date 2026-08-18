/* Bandeau Grandes décisions (Flipcards / Relier jurisprudence) :
   recherche + référence + filtre avancé (modèle Enchaînements). */
(function () {
  "use strict";

  if (typeof DATA === "undefined" || !Array.isArray(DATA)) return;
  var path = String(location.pathname || "");
  if (path.indexOf("dico") !== -1) return;

  var homeCard =
    document.querySelector("#screen-home .home-card") || document.querySelector(".home-card");
  if (!homeCard || homeCard.querySelector(".gd-filters")) return;

  document.querySelectorAll(".classifier").forEach(function (el) {
    el.hidden = true;
  });

  var mount = document.createElement("div");
  mount.className = "arrets-filters gd-filters";
  mount.innerHTML =
    '<div class="arrets-toolbar-row">' +
    '<label class="arrets-search-field" for="gd-filter-search"><span class="sr-only">Recherche</span>' +
    '<input id="gd-filter-search" type="search" placeholder="Mots clés (recherche générale)" autocomplete="off"></label>' +
    '<label class="arrets-theme-field" for="gd-filter-reference">' +
    '<span class="arrets-theme-label">Référence :</span>' +
    '<input id="gd-filter-reference" type="search" placeholder="n° requête, décision, RG…" autocomplete="off" aria-label="Filtrer par référence">' +
    "</label>" +
    '<button type="button" class="arrets-advanced-toggle" id="gd-advanced-toggle" aria-expanded="false" aria-controls="gd-advanced-panel">Filtre avancé</button>' +
    "</div>" +
    '<div class="arrets-advanced-panel" id="gd-advanced-panel" hidden>' +
    '<div class="arrets-advanced-row" id="gd-row-primary">' +
    '<div class="arrets-advanced-field" data-field="gd-juridictions"><span class="arrets-advanced-label" id="label-gd-juridictions">Juridictions</span>' +
    '<div id="gd-filter-juridictions" class="ms" role="group" aria-labelledby="label-gd-juridictions"></div></div>' +
    '<div class="arrets-advanced-field is-collapsed" data-field="gd-formations"><span class="arrets-advanced-label" id="label-gd-formations">Formation de jugement</span>' +
    '<div id="gd-filter-formations" class="ms" role="group" aria-labelledby="label-gd-formations"></div></div>' +
    '<div class="arrets-advanced-field" data-field="gd-themes"><span class="arrets-advanced-label" id="label-gd-themes">Thèmes</span>' +
    '<div id="gd-filter-themes" class="ms" role="group" aria-labelledby="label-gd-themes"></div></div>' +
    '<div class="arrets-advanced-field" data-field="gd-notions"><span class="arrets-advanced-label" id="label-gd-notions">Notions</span>' +
    '<div id="gd-filter-notions" class="ms" role="group" aria-labelledby="label-gd-notions"></div></div>' +
    "</div>" +
    '<div class="arrets-advanced-row arrets-advanced-row--secondary">' +
    '<div class="arrets-advanced-field arrets-advanced-field--importance"><span class="arrets-advanced-label">Importance</span>' +
    '<div class="arrets-chip-group" role="group" aria-label="Importance">' +
    '<label class="arrets-chip"><input type="checkbox" name="gd-importance" value="1"><span>★</span></label>' +
    '<label class="arrets-chip"><input type="checkbox" name="gd-importance" value="2"><span>★★</span></label>' +
    '<label class="arrets-chip"><input type="checkbox" name="gd-importance" value="3"><span>★★★</span></label>' +
    '<label class="arrets-chip"><input type="checkbox" name="gd-importance" value="4"><span>★★★★</span></label>' +
    "</div></div>" +
    '<div class="arrets-advanced-field arrets-advanced-field--period"><span class="arrets-advanced-label">Période</span>' +
    '<div class="arrets-period-stack">' +
    '<label class="arrets-period-row" for="gd-date-from"><span class="arrets-period-label">Début</span>' +
    '<input id="gd-date-from" type="date" aria-label="Date de début"></label>' +
    '<label class="arrets-period-row" for="gd-date-to"><span class="arrets-period-label">Fin</span>' +
    '<input id="gd-date-to" type="date" aria-label="Date de fin"></label>' +
    "</div></div></div></div>";

  var banner = homeCard.querySelector(".cours-banner");
  if (banner && banner.parentNode === homeCard) {
    homeCard.insertBefore(mount, banner.nextSibling);
  } else {
    homeCard.insertBefore(mount, homeCard.firstChild);
  }

  var els = {
    search: document.getElementById("gd-filter-search"),
    reference: document.getElementById("gd-filter-reference"),
    themes: document.getElementById("gd-filter-themes"),
    notions: document.getElementById("gd-filter-notions"),
    juridictions: document.getElementById("gd-filter-juridictions"),
    formations: document.getElementById("gd-filter-formations"),
    dateFrom: document.getElementById("gd-date-from"),
    dateTo: document.getElementById("gd-date-to"),
    toggle: document.getElementById("gd-advanced-toggle"),
    panel: document.getElementById("gd-advanced-panel"),
    rowPrimary: document.getElementById("gd-row-primary"),
    formationField: mount.querySelector('[data-field="gd-formations"]'),
  };

  var filters = {
    q: "",
    reference: "",
    themes: [],
    notions: [],
    juridictions: [],
    formations: [],
    importance: [],
    dateFrom: "",
    dateTo: "",
  };
  var openMsId = null;

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

  function uniqueThemes(arr) {
    return window.CoursThemes ? CoursThemes.uniqueSorted(arr) : uniqueSorted(arr);
  }

  function themeText(s) {
    return window.CoursThemes
      ? CoursThemes.displayLabel(s)
      : String(s || "").replace(/^\s*\d{1,2}(?:\.\d+)?\s*[-–.]\s*/, "").trim();
  }

  function normKey(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getMsSelected(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('input[type="checkbox"]:checked')).map(function (cb) {
      return cb.value;
    });
  }

  function closeAllMs() {
    mount.querySelectorAll(".ms__panel").forEach(function (p) {
      p.hidden = true;
    });
    mount.querySelectorAll(".ms__toggle").forEach(function (t) {
      t.setAttribute("aria-expanded", "false");
    });
    openMsId = null;
  }

  function buildMultiSelect(root, values, selected, placeholder) {
    if (!root) return;
    root.innerHTML = "";
    root.classList.add("ms");

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
        span.textContent = themeText(v);
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
      else if (sel.length === 1) label.textContent = themeText(sel[0]);
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

  function cardTheme(card) {
    if (card.gdTheme) return card.gdTheme;
    return (card.themes && card.themes[0]) || "";
  }

  function populateOptions() {
    var themes = uniqueThemes(DATA.map(cardTheme));
    var notions = uniqueSorted(
      DATA.reduce(function (acc, card) {
        return acc.concat(card.notions || []);
      }, [])
    );
    var juridictions = uniqueSorted(
      DATA.map(function (card) {
        return card.juridiction;
      })
    );
    buildMultiSelect(els.themes, themes, filters.themes, "Tous les thèmes");
    buildMultiSelect(els.notions, notions, filters.notions, "Toutes les notions");
    buildMultiSelect(els.juridictions, juridictions, filters.juridictions, "Toutes les juridictions");
    updateFormationOptions();
  }

  function updateFormationOptions() {
    if (!els.formations) return;
    var jKeys = getMsSelected(els.juridictions);
    var prev = getMsSelected(els.formations);
    var seen = {};
    var options = [];
    if (jKeys.length) {
      DATA.forEach(function (card) {
        if (jKeys.indexOf(card.juridiction) === -1) return;
        var f = String(card.formation || "").trim();
        if (!f || seen[f]) return;
        seen[f] = true;
        options.push(f);
      });
      options = uniqueSorted(options);
    }
    var keep = prev.filter(function (v) {
      return options.indexOf(v) !== -1;
    });
    filters.formations = keep;
    buildMultiSelect(els.formations, options, keep, "Toutes les formations");
    var active = Boolean(jKeys.length && options.length);
    if (els.formationField) els.formationField.classList.toggle("is-collapsed", !active);
    if (els.rowPrimary) els.rowPrimary.classList.toggle("has-formation", active);
  }

  function selectedImportance() {
    return Array.from(mount.querySelectorAll('input[name="gd-importance"]:checked')).map(function (
      el
    ) {
      return el.value;
    });
  }

  function readFilters() {
    filters.q = ((els.search && els.search.value) || "").trim().toLowerCase();
    filters.reference = ((els.reference && els.reference.value) || "").trim().toLowerCase();
    filters.themes = getMsSelected(els.themes);
    filters.notions = getMsSelected(els.notions);
    filters.juridictions = getMsSelected(els.juridictions);
    filters.formations = getMsSelected(els.formations);
    filters.importance = selectedImportance();
    filters.dateFrom = (els.dateFrom && els.dateFrom.value) || "";
    filters.dateTo = (els.dateTo && els.dateTo.value) || "";
  }

  function cardMatches(card) {
    if (typeof coursFilter !== "undefined" && coursFilter && typeof coursTitleKey === "function") {
      if (!coursFilter.has(coursTitleKey(card.recto))) return false;
    }
    if (filters.themes.length && filters.themes.indexOf(cardTheme(card)) === -1) return false;
    if (filters.juridictions.length && filters.juridictions.indexOf(card.juridiction) === -1) {
      return false;
    }
    if (filters.formations.length && filters.formations.indexOf(card.formation) === -1) return false;
    if (filters.notions.length) {
      var have = card.notions || [];
      var okN = filters.notions.every(function (n) {
        return have.indexOf(n) !== -1;
      });
      if (!okN) return false;
    }
    if (filters.importance.length) {
      var lvl = String(Number(card.importance_level) || card.importance || "");
      if (filters.importance.indexOf(lvl) === -1) return false;
    }
    var ds = String(card.date || "").slice(0, 10);
    if (filters.dateFrom && ds && ds < filters.dateFrom) return false;
    if (filters.dateTo && ds && ds > filters.dateTo) return false;
    if ((filters.dateFrom || filters.dateTo) && !ds) return false;
    if (filters.reference) {
      var ref = String(card.reference || "").toLowerCase();
      if (ref.indexOf(filters.reference) === -1) return false;
    }
    if (filters.q) {
      var hay = [card.recto, card.verso, card.objet, card.portee, cardTheme(card), card.reference]
        .concat(card.notions || [])
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(filters.q) === -1) return false;
    }
    return true;
  }

  function onFilterChange() {
    var prevJ = filters.juridictions.join("\0");
    readFilters();
    if (prevJ !== filters.juridictions.join("\0")) {
      updateFormationOptions();
      readFilters();
    }
    if (typeof updateHomeCount === "function") updateHomeCount();
  }

  function enrich(decisions) {
    var byNom = {};
    (decisions || []).forEach(function (d) {
      byNom[normKey(d.nom)] = d;
    });
    DATA.forEach(function (card) {
      var d = byNom[normKey(card.recto)];
      if (!d) return;
      card.juridiction = d.juridiction || card.juridiction || "";
      card.formation = d.formation || card.formation || "";
      card.date = d.date || card.date || "";
      card.reference = d.reference || card.reference || "";
      card.gdTheme = d.theme || card.gdTheme || "";
    });
  }

  window.matchesFilters = function (card) {
    return cardMatches(card);
  };
  window.matchesFiltersExcept = function (card) {
    return cardMatches(card);
  };
  window.updateChipAvailability = function () {};
  window.filteredIndexes = function () {
    return DATA.map(function (_, idx) {
      return idx;
    }).filter(function (idx) {
      return cardMatches(DATA[idx]);
    });
  };
  window.selectionHint = function () {
    var bits = [];
    if (filters.q) bits.push("recherche");
    if (filters.reference) bits.push("référence");
    if (filters.themes.length) bits.push(filters.themes.length + " thème(s)");
    if (filters.notions.length) bits.push(filters.notions.length + " notion(s)");
    if (filters.juridictions.length) bits.push(filters.juridictions.length + " juridiction(s)");
    if (filters.formations.length) bits.push(filters.formations.length + " formation(s)");
    if (filters.importance.length) bits.push(filters.importance.length + " importance(s)");
    if (filters.dateFrom || filters.dateTo) bits.push("période");
    if (typeof seriesHint === "function") bits.push(seriesHint());
    if (!bits.length) return "Tout le set";
    return bits.join(" · ");
  };

  if (els.search) els.search.addEventListener("input", onFilterChange);
  if (els.reference) els.reference.addEventListener("input", onFilterChange);
  if (els.dateFrom) els.dateFrom.addEventListener("change", onFilterChange);
  if (els.dateTo) els.dateTo.addEventListener("change", onFilterChange);
  mount.querySelectorAll('input[name="gd-importance"]').forEach(function (el) {
    el.addEventListener("change", onFilterChange);
  });
  if (els.toggle && els.panel) {
    els.toggle.addEventListener("click", function () {
      var open = els.panel.hidden;
      els.panel.hidden = !open;
      els.toggle.setAttribute("aria-expanded", open ? "true" : "false");
      els.toggle.classList.toggle("is-open", open);
    });
  }
  document.addEventListener("click", function (ev) {
    if (!openMsId) return;
    var t = ev.target;
    if (t && t.closest && t.closest(".gd-filters .ms")) return;
    closeAllMs();
  });

  populateOptions();

  var url = new URL("../chronologie/data/chronology-decisions.json", location.href).href;
  fetch(url, { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then(function (raw) {
      enrich(raw && raw.decisions);
      populateOptions();
      if (typeof updateHomeCount === "function") updateHomeCount();
    })
    .catch(function () {
      if (typeof updateHomeCount === "function") updateHomeCount();
    });
})();
