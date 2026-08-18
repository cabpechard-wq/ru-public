/* Ordre des thèmes = fiches de cours (numéros XX- du filtre /arrets/).
   Affichage des menus : le préfixe « XX- » est masqué.
   Réutilisable : window.CoursThemes.{compare, uniqueSorted, displayLabel, sortOptions, comparePaths} */
(function (root) {
  "use strict";

  var ORDER = [
    "11-État / déconcentration",
    "12-Collectivités territoriales / décentralisation",
    "13-Entités publiques spécialisées",
    "21-Principes du système normatif",
    "22-Constitution",
    "23-Principes généraux du droit",
    "24-Loi et règlements",
    "25-Droit international",
    "31-Service public",
    "32-Biens de l'administration",
    "33-Pouvoir de police",
    "34-Actes administratifs unilatéraux",
    "35-Contrats administratifs",
    "41-Organisation et fonctionnement de la juridiction administrative",
    "42-Compétence de la juridiction administrative",
    "51-Principes généraux de la responsabilité de l'administration",
    "52-Responsabilité sans faute",
    "53-Responsabilité pour faute",
    "54-Responsabilité des agents publics",
    "55-Quasi-contrats",
  ];

  /* Fiches de cours sans numéro d’arrêt, calées dans le sommaire. */
  var EXTRA = [
    ["L'organisation administrative", 10],
    ["Les établissements publics et entités assimilées", 13],
    ["Le système normatif administratif", 20],
    ["La jurisprudence", 24.5],
    ["Les grands équilibres du système normatif", 25.5],
    ["Les moyens de l'action administrative", 30],
    ["Les moyens humains et matériels", 30.5],
    ["Les fonctionnaires et agents publics", 31.5],
    ["Les moyens juridiques", 32.5],
    ["Les recours administratifs", 35.5],
    ["Le contrôle juridictionnel de l'administration", 40],
    ["La responsabilité de la puissance publique", 50],
  ];

  var NUM_RE = /^\s*(\d{1,2}(?:\.\d+)?)\s*[-–.]\s*/;

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/œ/gi, "oe")
      .replace(/æ/gi, "ae")
      .toLowerCase();
  }

  function stripNum(s) {
    return String(s || "").replace(NUM_RE, "").trim();
  }

  function matchKey(s) {
    var t = fold(stripNum(s));
    t = t.replace(/^(les|le|la)\s+/i, "");
    t = t.replace(/^(l'|l’)/i, "");
    t = t.replace(/\s+et\s+(les|le|la)\s+/g, " ");
    t = t.replace(/\s+et\s+(l'|l’)/g, " ");
    t = t.replace(/\s+\/\s+/g, " ");
    t = t.replace(/\s+et\s+/g, " ");
    t = t.replace(/['’]/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  function sortFr(a, b) {
    var ka = fold(a);
    var kb = fold(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return String(a).localeCompare(String(b), "fr");
  }

  var RANK = {};
  ORDER.forEach(function (label) {
    var m = String(label).match(NUM_RE);
    RANK[matchKey(label)] = m ? parseFloat(m[1]) : 10000;
  });
  EXTRA.forEach(function (pair) {
    var key = matchKey(pair[0]);
    if (RANK[key] == null) RANK[key] = pair[1];
  });

  function numPrefix(s) {
    var m = String(s || "").match(NUM_RE);
    return m ? parseFloat(m[1]) : null;
  }

  function rank(s) {
    var n = numPrefix(s);
    if (n != null) return n;
    var k = matchKey(s);
    if (Object.prototype.hasOwnProperty.call(RANK, k)) return RANK[k];
    return 10000;
  }

  function compare(a, b) {
    var ra = rank(a);
    var rb = rank(b);
    if (ra !== rb) return ra - rb;
    return sortFr(stripNum(a), stripNum(b));
  }

  function uniqueSorted(arr) {
    return Array.from(new Set((arr || []).filter(Boolean))).sort(compare);
  }

  function rawLabel(item) {
    if (typeof item === "string") return item;
    return String((item && (item.label || item.value)) || "");
  }

  function sortOptions(items) {
    return (items || []).slice().sort(function (a, b) {
      return compare(rawLabel(a), rawLabel(b));
    });
  }

  function displayLabel(s) {
    return stripNum(s);
  }

  function optionText(item) {
    return displayLabel(rawLabel(item));
  }

  function pathKey(path) {
    var m = String(path || "").match(/dp-\d+/g);
    return m ? m.join("/") : "";
  }

  function comparePaths(pa, pb) {
    var ka = pathKey(pa);
    var kb = pathKey(pb);
    if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
    return 0;
  }

  root.CoursThemes = {
    ORDER: ORDER,
    fold: fold,
    stripNum: stripNum,
    matchKey: matchKey,
    rank: rank,
    compare: compare,
    uniqueSorted: uniqueSorted,
    sortOptions: sortOptions,
    displayLabel: displayLabel,
    optionText: optionText,
    pathKey: pathKey,
    comparePaths: comparePaths,
  };
})(typeof window !== "undefined" ? window : this);
