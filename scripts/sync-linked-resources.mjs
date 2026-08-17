#!/usr/bin/env node
/**
 * Rebuilds "Ressources liées" and exercise counts on course pages from
 * manuel/exercices.json — the same index Flipcards / Relations / Enchaînements
 * use for ?cours=DP-XXX. The HTML generator currently caps each list at 25.
 *
 * Usage: node scripts/sync-linked-resources.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAP = 25;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function titleKey(s) {
  return decodeEntities(s)
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/★+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugify(term) {
  return decodeEntities(term)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/['’]/g, "-")
    .replace(/cons\.\s*constit\./g, "cons-constit")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name === "index.html") acc.push(p);
  }
  return acc;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relativePrefix(pageFile) {
  const rel = path.relative(ROOT, path.dirname(pageFile));
  const depth = rel.split(path.sep).filter(Boolean).length;
  return "../".repeat(depth);
}

function chapterCodeFromFile(pageFile) {
  const rel = path.relative(path.join(ROOT, "manuel"), pageFile);
  const parts = rel.split(path.sep);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = /^dp-(\d+)$/i.exec(parts[i]);
    if (m) return "DP-" + m[1];
  }
  return "";
}

function buildArrestMap() {
  const byKey = new Map();
  const arretsRoot = path.join(ROOT, "arrets");
  for (const page of walk(arretsRoot)) {
    const html = fs.readFileSync(page, "utf8");
    const rawTitle = (html.match(/<title>([^<]+)/) || [])[1] || "";
    const title = decodeEntities(rawTitle.replace(/\s+—.*$/, "").trim());
    const folder = path.relative(arretsRoot, path.dirname(page));
    const href = "arrets/" + folder.replace(/\\/g, "/") + "/";
    const k = titleKey(title);
    const prev = byKey.get(k);
    if (!prev || folder.length < prev.folder.length) {
      byKey.set(k, { href, folder, title });
    }
  }
  return byKey;
}

function buildDictMap() {
  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, "dictionnaire", "entries.json"), "utf8")
  );
  const byKey = new Map();
  for (const entry of data.entries || []) {
    const href = "dictionnaire/#" + entry.id;
    byKey.set(titleKey(entry.term), href);
    byKey.set(titleKey(entry.id.replace(/-/g, " ")), href);
  }
  return byKey;
}

function resolveArrest(title, arrestMap) {
  const hit = arrestMap.get(titleKey(title));
  if (hit) return hit.href;
  return "arrets/" + slugify(title) + "/";
}

function resolveNotion(title, dictMap) {
  const hit = dictMap.get(titleKey(title));
  if (hit) return hit;
  return "dictionnaire/#" + slugify(title);
}

function renderLinks(prefix, jurisprudence, notions, arrestMap, dictMap) {
  const bits = [];
  function push(title, href, cls) {
    if (bits.length) {
      bits.push(
        '<span class="site-linked-resources-sep" aria-hidden="true">·</span>'
      );
    }
    bits.push(
      '<a class="' +
        cls +
        '" href="' +
        esc(prefix + href) +
        '">' +
        esc(title) +
        "</a>"
    );
  }
  for (const title of jurisprudence) {
    push(title, resolveArrest(title, arrestMap), "arret-link");
  }
  for (const title of notions) {
    push(title, resolveNotion(title, dictMap), "dict-link");
  }
  return (
    '<aside class="site-linked-resources" aria-label="Ressources liées">' +
    '<p class="site-linked-resources-title">Ressources liées…</p>' +
    '<p class="site-linked-resources-links">' +
    bits.join("") +
    "</p></aside>"
  );
}

function patchCounts(html, jpCount, notionCount) {
  html = html.replace(
    /(<p class="manuel-exercises-title">Apprendre la jurisprudence de ce cours )<span class="manuel-exercises-count">\(\d+\)<\/span>/,
    "$1<span class=\"manuel-exercises-count\">(" + jpCount + ")</span>"
  );
  html = html.replace(
    /(<p class="manuel-exercises-title">Apprendre les notions de ce cours )<span class="manuel-exercises-count">\(\d+\)<\/span>/,
    "$1<span class=\"manuel-exercises-count\">(" + notionCount + ")</span>"
  );
  return html;
}

function main() {
  const exercices = JSON.parse(
    fs.readFileSync(path.join(ROOT, "manuel", "exercices.json"), "utf8")
  );
  const arrestMap = buildArrestMap();
  const dictMap = buildDictMap();

  const liens = { jurisprudence: {}, notions: {} };
  for (const entry of Object.values(exercices)) {
    for (const title of entry.jurisprudence || []) {
      liens.jurisprudence[title] = resolveArrest(title, arrestMap);
    }
    for (const title of entry.notions || []) {
      liens.notions[title] = resolveNotion(title, dictMap);
    }
  }
  fs.writeFileSync(
    path.join(ROOT, "manuel", "liens.json"),
    JSON.stringify(liens) + "\n"
  );

  let patched = 0;
  let uncapped = 0;
  for (const page of walk(path.join(ROOT, "manuel"))) {
    const code = chapterCodeFromFile(page);
    const entry = code && exercices[code];
    let html = fs.readFileSync(page, "utf8");
    const nextNav = html
      .replace(/site-nav\.js\?v=\d+/, "site-nav.js?v=29")
      .replace(/site\.css\?v=\d+/, "site.css?v=25");
    let changed = nextNav !== html;
    html = nextNav;

    if (entry) {
      const jp = entry.jurisprudence || [];
      const notions = entry.notions || [];
      if (jp.length > CAP || notions.length > CAP) uncapped++;
      const prefix = relativePrefix(page);
      const aside = renderLinks(prefix, jp, notions, arrestMap, dictMap);
      if (/<aside class="site-linked-resources"[\s\S]*?<\/aside>/.test(html)) {
        html = html.replace(
          /<aside class="site-linked-resources"[\s\S]*?<\/aside>/,
          aside
        );
      } else if (/<section class="manuel-exercises"/.test(html)) {
        html = html.replace(
          /<section class="manuel-exercises"/,
          aside + '<section class="manuel-exercises"'
        );
      }
      html = patchCounts(html, jp.length, notions.length);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(page, html);
      patched++;
    }
  }

  console.log(
    "sync-linked-resources: pages=%d uncapped=%d liens jp=%d notions=%d",
    patched,
    uncapped,
    Object.keys(liens.jurisprudence).length,
    Object.keys(liens.notions).length
  );
}

main();
