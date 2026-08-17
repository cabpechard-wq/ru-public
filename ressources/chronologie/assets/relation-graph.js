/**
 * Graphe force-directed des relations — panneau latéral de la chronologie.
 * API : ChronoRelationGraph.init / show / hide / resize / fit
 */
(function (global) {
  "use strict";

  var canvas = null;
  var ctx = null;
  var byId = new Map();
  var nodes = [];
  var links = [];
  var levelsMap = new Map();
  var rootId = null;
  var depth = 2;
  var alpha = 1;
  var running = false;
  var lastTs = 0;
  var view = { x: 0, y: 0, k: 1 };
  var drag = null;
  var onSelect = null;
  var visible = false;
  var needsFit = false;
  /** Set<number> des niveaux mis en avant (légende), ou null = tous. */
  var legendFilter = null;
  /** Set<number> importances mises en avant, ou null. */
  var importanceFilter = null;
  /** Set<string> colonnes juridiction, ou null. */
  var jurFilter = null;

  function juridictionFamily(j) {
    var s = String(j || "").toLowerCase();
    if (s.indexOf("conflit") !== -1) return "tc";
    if (s.indexOf("cass") !== -1 || s.indexOf("appel") !== -1) return "cass";
    if (
      s.indexOf("cjue") !== -1 ||
      s.indexOf("cjce") !== -1 ||
      s.indexOf("cedh") !== -1 ||
      s.indexOf("cij") !== -1 ||
      s.indexOf("union") !== -1 ||
      s.indexOf("européen") !== -1 ||
      s.indexOf("europeen") !== -1
    )
      return "ue";
    return "ce";
  }

  function familyColor(fam) {
    var css = getComputedStyle(document.documentElement);
    if (isAccessTheme()) {
      return css.getPropertyValue("--ink").trim() || "#000000";
    }
    var map = {
      tc: css.getPropertyValue("--marker-tc").trim() || "#c8102e",
      cass: css.getPropertyValue("--marker-cass").trim() || "#c45c5c",
      ue: css.getPropertyValue("--marker-cjue").trim() || "#2f9e6e",
      ce: css.getPropertyValue("--marker-ce").trim() || "#3d6b8c",
    };
    return map[fam] || map.ce;
  }

  function isAccessTheme() {
    var t = document.documentElement.getAttribute("data-theme") || "";
    return t.indexOf("salle-lecture-access-") === 0;
  }

  function themeVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /** Nom complet, non tronqué. */
  function fullLabel(nom) {
    return String(nom || "").trim();
  }

  function radiusFor(imp) {
    return 7 + Math.max(1, Math.min(4, imp || 1)) * 2.8;
  }

  function getNeighbors(id) {
    var set = new Set();
    var d = byId.get(id);
    if (d) (d.liees || []).forEach(function (x) { set.add(x); });
    byId.forEach(function (o, oid) {
      if (oid === id) return;
      if ((o.liees || []).indexOf(id) !== -1) set.add(oid);
    });
    return set;
  }

  function bfsIds(start, maxDepth) {
    var levels = new Map();
    if (!start || !byId.has(start)) return levels;
    levels.set(start, 0);
    var frontier = [start];
    var d;
    for (d = 0; d < maxDepth; d++) {
      var next = [];
      frontier.forEach(function (id) {
        getNeighbors(id).forEach(function (nid) {
          if (levels.has(nid) || !byId.has(nid)) return;
          levels.set(nid, d + 1);
          next.push(nid);
        });
      });
      frontier = next;
      if (!frontier.length) break;
    }
    return levels;
  }

  function wrapLines(c, text, maxWidth) {
    var words = String(text || "").split(/\s+/);
    var lines = [];
    var cur = "";
    var i;
    for (i = 0; i < words.length; i++) {
      var trial = cur ? cur + " " + words[i] : words[i];
      if (cur && c.measureText(trial).width > maxWidth) {
        lines.push(cur);
        cur = words[i];
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [text];
  }

  function labelMetrics(c, n) {
    var fontSize = n.id === rootId ? 12.5 : 11.25;
    c.font =
      (n.id === rootId ? "650 " : "500 ") +
      fontSize +
      "px " +
      (getComputedStyle(document.body).fontFamily || "sans-serif");
    var maxW = Math.min(220, Math.max(120, (canvas.clientWidth || 400) * 0.42));
    var lines = wrapLines(c, n.label, maxW);
    var tw = 0;
    lines.forEach(function (ln) {
      tw = Math.max(tw, c.measureText(ln).width);
    });
    var lineH = fontSize * 1.25;
    return {
      lines: lines,
      tw: tw,
      lineH: lineH,
      boxW: tw + 12,
      boxH: lines.length * lineH + 8,
      fontSize: fontSize,
    };
  }

  function rebuild() {
    if (!canvas || !rootId) return;
    levelsMap = bfsIds(rootId, depth);
    if (levelsMap.size < 2) {
      nodes = [];
      links = [];
      ensureLoop();
      return;
    }

    var w = canvas.clientWidth || 420;
    var h = canvas.clientHeight || 520;
    var cx = w * 0.5;
    var cy = h * 0.48;
    var maxLvl = 0;
    levelsMap.forEach(function (lv) {
      if (lv > maxLvl) maxLvl = lv;
    });

    var byLevel = {};
    levelsMap.forEach(function (lv, id) {
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(id);
    });

    var ringMax = Math.min(w, h) * 0.42;
    var ringStep = maxLvl > 0 ? ringMax / maxLvl : ringMax;

    nodes = [];
    Object.keys(byLevel)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      })
      .forEach(function (lv) {
        var ids = byLevel[lv].slice().sort(function (a, b) {
          var da = byId.get(a);
          var db = byId.get(b);
          return String(da && da.nom).localeCompare(String(db && db.nom), "fr");
        });
        var count = ids.length;
        ids.forEach(function (id, i) {
          var d = byId.get(id);
          var ang =
            count === 1
              ? -Math.PI / 2
              : -Math.PI / 2 + (i / count) * Math.PI * 2 + (lv % 2) * 0.12;
          var rad = lv === 0 ? 0 : ringStep * lv;
          nodes.push({
            id: id,
            d: d,
            label: fullLabel(d.nom),
            level: lv,
            fam: juridictionFamily(d.juridiction),
            jurCol: juridictionColKey(d.juridiction),
            r: radiusFor(d.importance),
            x: cx + Math.cos(ang) * rad,
            y: cy + Math.sin(ang) * rad,
            vx: 0,
            vy: 0,
            fixed: false,
          });
        });
      });

    var nodeMap = new Map(nodes.map(function (n) { return [n.id, n]; }));
    var seen = new Set();
    links = [];
    levelsMap.forEach(function (_lv, id) {
      var d = byId.get(id);
      (d.liees || []).forEach(function (tid) {
        if (!levelsMap.has(tid)) return;
        var a = id < tid ? id : tid;
        var b = id < tid ? tid : id;
        var key = a + "|" + b;
        if (seen.has(key)) return;
        seen.add(key);
        var edgeLevel = Math.max(
          (nodeMap.get(id) && nodeMap.get(id).level) || 0,
          (nodeMap.get(tid) && nodeMap.get(tid).level) || 0
        );
        links.push({
          source: nodeMap.get(id),
          target: nodeMap.get(tid),
          level: edgeLevel,
        });
      });
    });

    view = { x: 0, y: 0, k: 1 };
    alpha = 1;
    needsFit = true;
    ensureLoop();
  }

  function tick(dt) {
    if (alpha < 0.02) {
      alpha = 0;
      if (needsFit) {
        needsFit = false;
        fitView(28);
      }
      return;
    }
    var n = nodes.length;
    var i;
    var j;
    var charge = 2200 + n * 90;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var a = nodes[i];
        var b = nodes[j];
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist2 = dx * dx + dy * dy || 1;
        var dist = Math.sqrt(dist2);
        // Collision douce (nœuds + place pour labels)
        var minD = a.r + b.r + 36;
        var force = (charge * alpha) / dist2;
        if (dist < minD) force += ((minD - dist) * 0.35 * alpha) / dist;
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        if (!a.fixed) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!b.fixed) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }
    links.forEach(function (l) {
      var a = l.source;
      var b = l.target;
      if (!a || !b) return;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ideal = 88 + (Math.abs((a.level || 0) - (b.level || 0)) * 18) + a.r + b.r;
      var f = (dist - ideal) * 0.05 * alpha;
      var fx = (dx / dist) * f;
      var fy = (dy / dist) * f;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    });

    // Ancrage radial léger par niveau
    var w = canvas.clientWidth || 420;
    var h = canvas.clientHeight || 520;
    var cx = w * 0.5;
    var cy = h * 0.48;
    var maxLvl = 1;
    nodes.forEach(function (p) {
      if ((p.level || 0) > maxLvl) maxLvl = p.level;
    });
    var ringMax = Math.min(w, h) * 0.42;
    var ringStep = ringMax / Math.max(1, maxLvl);

    nodes.forEach(function (p) {
      if (p.fixed) return;
      var targetR = (p.level || 0) * ringStep;
      var dx = p.x - cx;
      var dy = p.y - cy;
      var r = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if ((p.level || 0) === 0) {
        p.vx += (cx - p.x) * 0.08 * alpha;
        p.vy += (cy - p.y) * 0.08 * alpha;
      } else {
        var ux = dx / r;
        var uy = dy / r;
        p.vx += (cx + ux * targetR - p.x) * 0.035 * alpha;
        p.vy += (cy + uy * targetR - p.y) * 0.035 * alpha;
      }
      p.vx *= 0.82;
      p.vy *= 0.82;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
    });
    alpha *= 0.978;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function nodesBounds() {
    if (!nodes.length || !ctx) return null;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    nodes.forEach(function (n) {
      var m = labelMetrics(ctx, n);
      var lx = n.x - m.boxW / 2;
      var ly = n.y + n.r + 4;
      minX = Math.min(minX, n.x - n.r, lx);
      maxX = Math.max(maxX, n.x + n.r, lx + m.boxW);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, ly + m.boxH);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function fitView(pad) {
    var b = nodesBounds();
    if (!b) return;
    var cssW = canvas.clientWidth || 420;
    var cssH = canvas.clientHeight || 520;
    var bw = Math.max(40, b.maxX - b.minX);
    var bh = Math.max(40, b.maxY - b.minY);
    var p = pad == null ? 28 : pad;
    var k = Math.min((cssW - p * 2) / bw, (cssH - p * 2) / bh, 1.35);
    k = Math.max(0.35, k);
    var midX = (b.minX + b.maxX) / 2;
    var midY = (b.minY + b.maxY) / 2;
    view.k = k;
    view.x = cssW / 2 - midX * k;
    view.y = cssH / 2 - midY * k;
  }

  function juridictionColKey(j) {
    var s = String(j || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    if (s.indexOf("tribunal des conflits") !== -1 || s.indexOf("conflit") !== -1) return "tc";
    if (s.indexOf("conseil constitutionnel") !== -1) return "cons-constit";
    if (
      s.indexOf("conseil d") !== -1 ||
      s.indexOf("cour administrative") !== -1 ||
      s.indexOf("tribunal administratif") !== -1 ||
      /\bcaa\b/.test(s) ||
      /\bta\b/.test(s)
    )
      return "adm";
    if (
      s.indexOf("cedh") !== -1 ||
      s.indexOf("cjue") !== -1 ||
      s.indexOf("cjce") !== -1 ||
      s.indexOf("cij") !== -1 ||
      s.indexOf("europeenne") !== -1 ||
      s.indexOf("union europeenne") !== -1
    )
      return "intl";
    return "civ";
  }

  function toFilterSet(levels) {
    if (levels && typeof levels.forEach === "function" && levels.size) {
      return new Set(levels);
    }
    if (Array.isArray(levels) && levels.length) return new Set(levels);
    return null;
  }

  function legendLevelFilterActive() {
    return !!(legendFilter && legendFilter.size > 0);
  }

  function legendImportanceFilterActive() {
    return !!(importanceFilter && importanceFilter.size > 0);
  }

  function legendJurFilterActive() {
    return !!(jurFilter && jurFilter.size > 0);
  }

  function anyLegendDimActive() {
    return (
      legendLevelFilterActive() ||
      legendImportanceFilterActive() ||
      legendJurFilterActive()
    );
  }

  function isNodeDimmed(n) {
    if (!n || n.id === rootId || n.level === 0) return false;
    if (!anyLegendDimActive()) return false;
    if (legendLevelFilterActive() && n.level >= 1 && !legendFilter.has(n.level)) {
      return true;
    }
    if (legendImportanceFilterActive()) {
      var imp = (n.d && n.d.importance) || 1;
      if (!importanceFilter.has(imp)) return true;
    }
    if (legendJurFilterActive()) {
      var jk = n.jurCol || juridictionColKey(n.d && n.d.juridiction);
      if (!jurFilter.has(jk)) return true;
    }
    return false;
  }

  function isLinkDimmed(l) {
    if (!l || !l.source || !l.target) return false;
    if (!anyLegendDimActive()) return false;
    if (legendLevelFilterActive()) {
      var lvl = l.level;
      if (lvl == null) {
        lvl = Math.max(l.source.level || 0, l.target.level || 0);
      }
      if (lvl >= 1 && !legendFilter.has(lvl)) return true;
    }
    if (isNodeDimmed(l.source) || isNodeDimmed(l.target)) return true;
    return false;
  }

  function draw() {
    if (!canvas || !ctx || !visible) return;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 420;
    var cssH = canvas.clientHeight || 520;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);

    links.forEach(function (l) {
      if (!l.source || !l.target) return;
      var dim = isLinkDimmed(l);
      ctx.globalAlpha = dim ? 0.14 : 1;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      if (isAccessTheme()) {
        ctx.strokeStyle = themeVar("--ink", "#000000");
        ctx.globalAlpha = dim ? 0.22 : 0.55;
      } else {
        ctx.strokeStyle = "rgba(120,135,150,0.42)";
      }
      ctx.lineWidth = 1.35 / view.k;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    nodes.forEach(function (n) {
      var isSel = n.id === rootId;
      var dim = isNodeDimmed(n);
      var access = isAccessTheme();
      var ink = access ? themeVar("--ink", "#000000") : "#1a2332";
      var bg = access ? themeVar("--bg", "#ffe03d") : null;
      ctx.globalAlpha = dim ? 0.18 : 1;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = familyColor(n.fam);
      ctx.fill();
      if (isSel) {
        ctx.lineWidth = 2.5 / view.k;
        ctx.strokeStyle = bg || "#fff";
        ctx.stroke();
        ctx.lineWidth = 1.35 / view.k;
        ctx.strokeStyle = familyColor(n.fam);
        ctx.stroke();
      }

      var m = labelMetrics(ctx, n);
      var lx = n.x - m.boxW / 2;
      var ly = n.y + n.r + 4;
      if (access) {
        ctx.fillStyle = bg;
      } else {
        ctx.fillStyle = isSel ? "rgba(255,255,255,0.97)" : "rgba(248,250,252,0.95)";
      }
      roundRect(ctx, lx, ly, m.boxW, m.boxH, 4);
      ctx.fill();
      if (isSel || access) {
        ctx.strokeStyle = access
          ? ink
          : "rgba(30,58,95,0.22)";
        ctx.lineWidth = 1 / view.k;
        ctx.stroke();
      }
      ctx.fillStyle = dim ? (access ? ink : "rgba(26,35,50,0.45)") : ink;
      if (dim && access) ctx.globalAlpha = 0.35;
      ctx.textBaseline = "top";
      ctx.font =
        (isSel ? "650 " : "500 ") +
        m.fontSize +
        "px " +
        (getComputedStyle(document.body).fontFamily || "sans-serif");
      m.lines.forEach(function (ln, i) {
        var tw = ctx.measureText(ln).width;
        ctx.fillText(ln, n.x - tw / 2, ly + 4 + i * m.lineH);
      });
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function loop(ts) {
    running = true;
    var dt = Math.min(32, ts - (lastTs || ts));
    lastTs = ts;
    if (visible && alpha > 0) tick(dt);
    else if (visible && needsFit) {
      needsFit = false;
      fitView(28);
    }
    draw();
    if (visible && (alpha > 0 || drag || needsFit)) requestAnimationFrame(loop);
    else running = false;
  }

  function ensureLoop() {
    if (!running) {
      lastTs = 0;
      requestAnimationFrame(loop);
    }
  }

  function worldFromEvent(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left - view.x) / view.k,
      y: (ev.clientY - rect.top - view.y) / view.k,
    };
  }

  function hitNode(wx, wy) {
    var best = null;
    var bestD = Infinity;
    nodes.forEach(function (n) {
      var dx = n.x - wx;
      var dy = n.y - wy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var m = labelMetrics(ctx, n);
      var inLabel =
        wx >= n.x - m.boxW / 2 &&
        wx <= n.x + m.boxW / 2 &&
        wy >= n.y + n.r + 4 &&
        wy <= n.y + n.r + 4 + m.boxH;
      if ((d <= n.r + 6 || inLabel) && d < bestD) {
        best = n;
        bestD = d;
      }
    });
    return best;
  }

  function bindCanvas() {
    canvas.addEventListener("pointerdown", function (ev) {
      canvas.setPointerCapture(ev.pointerId);
      var w = worldFromEvent(ev);
      var n = hitNode(w.x, w.y);
      if (n) {
        n.fixed = true;
        drag = { node: n, ox: w.x - n.x, oy: w.y - n.y };
        if (typeof onSelect === "function" && n.id !== rootId) onSelect(n.id);
      } else {
        drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
      }
      ensureLoop();
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      if (drag.node) {
        var w = worldFromEvent(ev);
        drag.node.x = w.x - drag.ox;
        drag.node.y = w.y - drag.oy;
        drag.node.vx = 0;
        drag.node.vy = 0;
        alpha = Math.max(alpha, 0.15);
      } else if (drag.pan) {
        view.x = drag.vx + (ev.clientX - drag.sx);
        view.y = drag.vy + (ev.clientY - drag.sy);
      }
      ensureLoop();
    });
    function endDrag() {
      if (drag && drag.node) drag.node.fixed = false;
      drag = null;
      ensureLoop();
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener(
      "wheel",
      function (ev) {
        ev.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var mx = ev.clientX - rect.left;
        var my = ev.clientY - rect.top;
        var wx = (mx - view.x) / view.k;
        var wy = (my - view.y) / view.k;
        var factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
        view.k = Math.max(0.28, Math.min(2.6, view.k * factor));
        view.x = mx - wx * view.k;
        view.y = my - wy * view.k;
        ensureLoop();
      },
      { passive: false }
    );
  }

  global.ChronoRelationGraph = {
    init: function (canvasEl, opts) {
      canvas = canvasEl;
      if (!canvas) return;
      ctx = canvas.getContext("2d");
      onSelect = opts && opts.onSelect;
      bindCanvas();
    },
    show: function (id, map, maxDepth) {
      byId = map instanceof Map ? map : new Map();
      rootId = id;
      depth = Math.max(1, Math.min(6, maxDepth || 2));
      visible = true;
      rebuild();
    },
    hide: function () {
      visible = false;
      rootId = null;
      nodes = [];
      links = [];
      alpha = 0;
      needsFit = false;
      legendFilter = null;
      importanceFilter = null;
      jurFilter = null;
      if (ctx && canvas) {
        var dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth || 0, canvas.clientHeight || 0);
      }
    },
    /** Niveaux légende à mettre en avant (Set|Array|null). */
    setLegendFilter: function (levels) {
      legendFilter = toFilterSet(levels);
      importanceFilter = null;
      jurFilter = null;
      if (!visible) return;
      if (running) return;
      draw();
    },
    /** Filtres légende combinés : { levels, importance, juridictions }. */
    setLegendFilters: function (opts) {
      opts = opts || {};
      legendFilter = toFilterSet(opts.levels);
      importanceFilter = toFilterSet(opts.importance);
      jurFilter = toFilterSet(opts.juridictions);
      if (!visible) return;
      if (running) return;
      draw();
    },
    resize: function () {
      if (!visible) return;
      needsFit = true;
      alpha = Math.max(alpha, 0.12);
      ensureLoop();
    },
    fit: function () {
      fitView(28);
      ensureLoop();
    },
    isVisible: function () {
      return visible;
    },
    redraw: function () {
      if (!visible) return;
      ensureLoop();
      if (!running) draw();
    },
  };
})(window);
