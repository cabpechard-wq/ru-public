/* Filtre « Thème » = pages du Cours (champ Manuel des fiches dictionnaire).
   Dictionnaire : <select> à côté de « Filtrer une entrée ».
   Flipcards / Relations Grandes notions : classifier chips, comme les Grands arrêts. */
(function () {
  if (window.__DICO_COURS_THEMES__) return;
  window.__DICO_COURS_THEMES__ = true;

  function termKey(s) {
    return String(s || "")
      .normalize("NFC")
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function colorForPath(path) {
    var p = String(path || "");
    if (p.indexOf("/dp-500/") !== -1) return "red";
    if (p.indexOf("/dp-400/") !== -1) return "purple";
    if (p.indexOf("/dp-300/") !== -1) return "green";
    if (p.indexOf("/dp-200/") !== -1) return "yellow";
    if (p.indexOf("/dp-100/") !== -1) return "orange";
    return "default";
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function entriesUrl() {
    var path = location.pathname || "";
    if (path.indexOf("/dictionnaire") !== -1) return "./entries.json";
    return "../dictionnaire/entries.json";
  }

  function sortFr(a, b) {
    return String(a).localeCompare(String(b), "fr", { sensitivity: "base" });
  }

  /* ——— Dictionnaire ——— */
  function initDictionary() {
    var input = document.getElementById("dict-filter");
    var toolbar = document.querySelector(".dict-toolbar");
    if (!input || !toolbar) return false;

    var select = document.getElementById("dict-theme");
    if (!select) {
      select = document.createElement("select");
      select.id = "dict-theme";
      select.setAttribute("aria-label", "Thème");
      toolbar.insertBefore(select, input);
    }
    if (!document.querySelector("label[for='dict-theme']")) {
      var lab = document.createElement("label");
      lab.className = "sr-only";
      lab.htmlFor = "dict-theme";
      lab.textContent = "Thème";
      toolbar.insertBefore(lab, select);
    }

    var entries = Array.from(document.querySelectorAll(".dict-entry"));
    var sections = Array.from(document.querySelectorAll(".dict-letter"));
    var themes = {};

    entries.forEach(function (el) {
      var labels = [];
      el.querySelectorAll(".dict-extra").forEach(function (p) {
        if (!/^\s*Cours\s*:/.test(p.textContent || "")) return;
        p.querySelectorAll("a").forEach(function (a) {
          var t = (a.textContent || "").trim();
          if (!t) return;
          labels.push(t);
          themes[t] = true;
        });
      });
      el.setAttribute("data-cours", labels.join("\n"));
    });

    var current = select.value || "";
    select.innerHTML = "";
    var all = document.createElement("option");
    all.value = "";
    all.textContent = "Tous les thèmes";
    select.appendChild(all);
    Object.keys(themes)
      .sort(sortFr)
      .forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        select.appendChild(opt);
      });
    if (current && themes[current]) select.value = current;

    function apply() {
      var q = (input.value || "").trim().toLowerCase();
      var theme = select.value || "";
      entries.forEach(function (el) {
        var textOk =
          !q ||
          (el.getAttribute("data-term") || "").indexOf(q) !== -1 ||
          (el.textContent || "").toLowerCase().indexOf(q) !== -1;
        var themeOk =
          !theme ||
          ("\n" + (el.getAttribute("data-cours") || "") + "\n").indexOf("\n" + theme + "\n") !== -1;
        el.hidden = !(textOk && themeOk);
      });
      sections.forEach(function (sec) {
        var any = Array.from(sec.querySelectorAll(".dict-entry")).some(function (e) {
          return !e.hidden;
        });
        sec.hidden = !any;
      });
    }

    input.addEventListener("input", apply);
    select.addEventListener("change", apply);
    apply();
    return true;
  }

  /* ——— Flipcards / Relations Grandes notions ——— */
  function bindClassifierToggle(btn) {
    if (!btn || btn.__coursToggleBound) return;
    btn.__coursToggleBound = true;
    btn.addEventListener("click", function () {
      var panel = btn.closest(".classifier");
      if (!panel) return;
      var slide = panel.querySelector(".classifier-slide");
      var inner = panel.querySelector(".classifier-slide-inner");
      if (!slide || !inner) return;
      var open = !panel.classList.contains("is-open");
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var from = slide.getBoundingClientRect().height;
      var to = open ? inner.scrollHeight : 0;
      panel.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (reduce || typeof slide.animate !== "function") {
        slide.style.height = open ? "auto" : "0px";
        return;
      }
      slide.style.height = from + "px";
      void slide.offsetHeight;
      var anim = slide.animate(
        [{ height: from + "px" }, { height: to + "px" }],
        { duration: 420, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" }
      );
      anim.onfinish = function () {
        slide.style.height = open ? "auto" : "0px";
        anim.cancel();
      };
    });
  }

  function insertCoursClassifier() {
    var chips = document.getElementById("chips-cours");
    if (chips) return chips;
    var letterPanel = document.querySelector('.classifier[data-group-panel="theme"]');
    if (!letterPanel || !letterPanel.parentNode) return null;
    var panel = document.createElement("div");
    panel.className = "classifier";
    panel.setAttribute("data-group-panel", "cours");
    panel.innerHTML =
      '<div class="classifier-row">' +
      '<button type="button" class="classifier-toggle" aria-expanded="false" aria-controls="chips-cours">' +
      '<svg class="classifier-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      '<span class="classifier-title">Thèmes <span class="classifier-hint">(1 seul choix)</span></span>' +
      "</button>" +
      '<button type="button" class="classifier-clear" data-clear="cours">Effacer la sélection</button>' +
      "</div>" +
      '<div class="classifier-slide">' +
      '<div class="classifier-slide-inner">' +
      '<div class="classifier-body">' +
      '<div class="chips" id="chips-cours" role="group" aria-label="Thèmes"></div>' +
      "</div></div></div>";
    letterPanel.parentNode.insertBefore(panel, letterPanel);
    bindClassifierToggle(panel.querySelector(".classifier-toggle"));
    var clearBtn = panel.querySelector("[data-clear='cours']");
    if (clearBtn) {
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof selected === "undefined" || !selected.cours) return;
        selected.cours.clear();
        document.querySelectorAll('.chip[data-group="cours"]').forEach(function (c) {
          c.setAttribute("aria-pressed", "false");
        });
        if (typeof updateHomeCount === "function") updateHomeCount();
      });
    }
    return document.getElementById("chips-cours");
  }

  function patchExerciseFilters() {
    if (typeof selected === "undefined") return;
    if (!selected.cours) selected.cours = new Set();

    function matchesCours(card) {
      if (!selected.cours || !selected.cours.size) return true;
      var want = Array.from(selected.cours)[0];
      return (card.cours || []).indexOf(want) !== -1;
    }

    if (typeof matchesFiltersExcept === "function" && !matchesFiltersExcept.__coursPatched) {
      var origExcept = matchesFiltersExcept;
      matchesFiltersExcept = function (card, exceptGroup) {
        if (exceptGroup !== "cours" && !matchesCours(card)) return false;
        return origExcept(card, exceptGroup);
      };
      matchesFiltersExcept.__coursPatched = true;
    } else if (typeof matchesFilters === "function" && !matchesFilters.__coursPatched) {
      var orig = matchesFilters;
      matchesFilters = function (card) {
        if (!matchesCours(card)) return false;
        return orig(card);
      };
      matchesFilters.__coursPatched = true;
    }

    if (typeof cardMatchesUpstream === "function" && !cardMatchesUpstream.__coursPatched) {
      var origUp = cardMatchesUpstream;
      cardMatchesUpstream = function (card, opts) {
        if (!opts || opts.applyCours !== false) {
          if (!matchesCours(card)) return false;
        }
        return origUp(card, opts);
      };
      cardMatchesUpstream.__coursPatched = true;
    }

    if (typeof selectionHint === "function" && !selectionHint.__coursPatched) {
      var origHint = selectionHint;
      selectionHint = function () {
        var base = origHint();
        if (!selected.cours || !selected.cours.size) return base;
        var label = Array.from(selected.cours)[0];
        if (!base || /^Tout le set/.test(base)) return label;
        return label + " · " + base;
      };
      selectionHint.__coursPatched = true;
    }
  }

  function fillCoursChips(chips, catalog) {
    chips.innerHTML = catalog
      .map(function (item) {
        return (
          '<button type="button" class="chip" data-group="cours" data-value="' +
          escHtml(item.label) +
          '" data-color="' +
          escHtml(item.color) +
          '" aria-pressed="false">' +
          escHtml(item.label) +
          "</button>"
        );
      })
      .join("");

    chips.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled || btn.classList.contains("is-disabled")) return;
        if (typeof selected === "undefined") return;
        if (!selected.cours) selected.cours = new Set();
        var value = btn.getAttribute("data-value");
        if (selected.cours.has(value)) {
          selected.cours.delete(value);
        } else {
          selected.cours.clear();
          selected.cours.add(value);
        }
        document.querySelectorAll('.chip[data-group="cours"]').forEach(function (c) {
          c.setAttribute(
            "aria-pressed",
            selected.cours.has(c.getAttribute("data-value")) ? "true" : "false"
          );
        });
        if (typeof updateHomeCount === "function") updateHomeCount();
      });
    });
  }

  function initExercises(payload) {
    if (typeof DATA === "undefined" || !Array.isArray(DATA) || !DATA.length) return;
    if (typeof selected === "undefined") return;

    var list = (payload && payload.entries) || [];
    var byTerm = {};
    var catalogMap = {};
    list.forEach(function (entry) {
      var labels = [];
      (entry.cours || []).forEach(function (c) {
        if (String((c && c.path) || "").indexOf("/manuel/") === -1) return;
        var label = String((c && c.label) || "").trim();
        if (!label) return;
        labels.push(label);
        if (!catalogMap[label]) {
          catalogMap[label] = { label: label, color: colorForPath(c.path) };
        }
      });
      if (!labels.length) return;
      var keys = [termKey(entry.term), termKey(entry.id)];
      keys.forEach(function (k) {
        if (k) byTerm[k] = labels;
      });
    });

    DATA.forEach(function (card) {
      var labels = byTerm[termKey(card.recto)] || byTerm[termKey(card.id)] || [];
      card.cours = labels;
    });

    var catalog = Object.keys(catalogMap)
      .sort(sortFr)
      .map(function (k) {
        return catalogMap[k];
      })
      .filter(function (item) {
        return DATA.some(function (card) {
          return (card.cours || []).indexOf(item.label) !== -1;
        });
      });
    if (!catalog.length) return;

    patchExerciseFilters();
    var chips = insertCoursClassifier();
    if (!chips) return;
    fillCoursChips(chips, catalog);
    if (typeof updateHomeCount === "function") updateHomeCount();
  }

  if (initDictionary()) return;

  fetch(entriesUrl(), { cache: "no-store" })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (payload) {
      if (payload) initExercises(payload);
    })
    .catch(function () {});
})();
