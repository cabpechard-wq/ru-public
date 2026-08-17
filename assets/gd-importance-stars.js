/* Étoiles d’importance à côté de chaque décision affichée
   (Flipcards « 3 au hasard… » + Relier, Grands arrêts). */
(function () {
  "use strict";

  var path = String(location.pathname || "");
  if (path.indexOf("dico") !== -1) return;

  function starsLabel(level) {
    var n = Math.max(0, Math.min(4, Number(level) || 0));
    return n ? "★".repeat(n) : "";
  }

  function asideCard(idx) {
    if (typeof ASIDE_DATA !== "undefined" && ASIDE_DATA && ASIDE_DATA.length) {
      return ASIDE_DATA[idx];
    }
    if (typeof DATA !== "undefined" && DATA) return DATA[idx];
    return null;
  }

  function cardByRecto(recto) {
    if (typeof DATA === "undefined" || !DATA) return null;
    var want = String(recto || "");
    for (var i = 0; i < DATA.length; i++) {
      if (String(DATA[i].recto || "") === want) return DATA[i];
    }
    return null;
  }

  function injectCss() {
    if (document.getElementById("gd-importance-stars-css")) return;
    var style = document.createElement("style");
    style.id = "gd-importance-stars-css";
    style.textContent =
      ".term-recto-head{display:flex;align-items:baseline;justify-content:space-between;gap:.75rem;margin-bottom:.35rem;}" +
      ".term-recto-head .term-name{flex:1 1 auto;min-width:0;}" +
      ".term-stars,.pair-stars{flex:0 0 auto;font-size:.88rem;letter-spacing:.08em;color:var(--brass,var(--accent));line-height:1;white-space:nowrap;}" +
      ".pair-item.is-source{justify-content:space-between;gap:.65rem;}" +
      ".pair-item.is-source .pair-label{flex:1 1 auto;min-width:0;}" +
      ".pair-item.is-source .pair-stars{margin-left:auto;font-size:.82rem;}";
    document.head.appendChild(style);
  }

  function decorateTermRow(el) {
    if (!el) return;
    var recto = el.querySelector(".term-recto");
    if (!recto) return;
    var card = asideCard(Number(el.dataset.idx));
    var label = starsLabel(card && card.importance_level);
    var head = recto.querySelector(".term-recto-head");
    if (!head) {
      head = document.createElement("div");
      head.className = "term-recto-head";
      var name = document.createElement("span");
      name.className = "term-name";
      while (recto.firstChild && recto.firstChild.nodeType === 3) {
        name.appendChild(recto.firstChild);
      }
      name.textContent = String(name.textContent || "").trim();
      var stars = document.createElement("span");
      stars.className = "term-stars";
      stars.setAttribute("aria-hidden", "true");
      head.appendChild(name);
      head.appendChild(stars);
      recto.insertBefore(head, recto.firstChild);
    }
    var starsEl = head.querySelector(".term-stars");
    if (!starsEl) return;
    starsEl.textContent = label;
    starsEl.hidden = !label;
  }

  function decorateTermRows() {
    document.querySelectorAll(".term-row").forEach(decorateTermRow);
  }

  function decoratePairBtn(btn) {
    if (!btn || !btn.classList.contains("is-source")) return;
    var card = cardByRecto(btn.getAttribute("data-recto"));
    var label = starsLabel(card && card.importance_level);
    var stars = btn.querySelector(".pair-stars");
    if (!stars) {
      if (!label) return;
      stars = document.createElement("span");
      stars.className = "pair-stars";
      stars.setAttribute("aria-hidden", "true");
      btn.appendChild(stars);
    }
    stars.textContent = label;
    stars.hidden = !label;
  }

  function decoratePairSources() {
    document.querySelectorAll(".pair-item.is-source").forEach(decoratePairBtn);
  }

  function decorateAll() {
    decorateTermRows();
    decoratePairSources();
  }

  function wrapFn(name, after) {
    var fn = typeof window[name] === "function" ? window[name] : null;
    if (!fn || fn.__gdStarsPatched) return;
    var wrapped = function () {
      var result = fn.apply(this, arguments);
      after.apply(this, arguments);
      return result;
    };
    wrapped.__gdStarsPatched = true;
    window[name] = wrapped;
  }

  injectCss();
  wrapFn("syncTermsList", decorateTermRows);
  wrapFn("refreshAsideList", decorateTermRows);
  wrapFn("renderBoard", decoratePairSources);
  if (typeof window.makeSourceBtn === "function" && !window.makeSourceBtn.__gdStarsPatched) {
    var origMake = window.makeSourceBtn;
    window.makeSourceBtn = function (c) {
      var btn = origMake.apply(this, arguments);
      decoratePairBtn(btn);
      return btn;
    };
    window.makeSourceBtn.__gdStarsPatched = true;
  }
  decorateAll();

  var roots = [document.getElementById("terms-list"), document.getElementById("board-rows")].filter(
    Boolean
  );
  if (roots.length && typeof MutationObserver === "function") {
    var obs = new MutationObserver(decorateAll);
    roots.forEach(function (root) {
      obs.observe(root, { childList: true, subtree: true });
    });
  }
})();
