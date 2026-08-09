/* Lecture à voix haute — Web Speech API (manuel, arrêts, dictionnaire).
   Dictionnaire : contrôles par entrée. Autres pages : capsules + barre de progression. */
(function () {
  function detectMode() {
    if (document.querySelector(".dict-entries")) return "dictionary";
    if (document.querySelector("article.manuel-prose")) return "article";
    return null;
  }

  function detectResource() {
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("/dictionnaire")) return "dictionary";
    if (p.includes("/arrets")) return "arrets";
    if (p.includes("/manuel")) return "manuel";
    if (p.includes("/exercices")) return "exercices";
    return "other";
  }

  const mode = detectMode();
  const resource = detectResource();
  if (!mode || !("speechSynthesis" in window)) return;

  /** Préférences par nom (Windows / Chrome) — 1 voix masculine (cours), 3 féminines. */
  const VOICE_PREFS = {
    manuel: [/henri/i, /paul/i, /\bmale\b/i, /homme/i, /masculin/i],
    arrets: [/denise/i, /julie/i, /hortense/i],
    dictionary: [/brigitte/i, /caroline/i, /elsa/i],
    exercices: [/virginie/i, /am[eé]lie/i, /claude/i],
  };

  const MALE_HINTS =
    /\b(henri|paul|male|homme|masculin|thomas|nicolas|google français male)\b/i;
  const FEMALE_HINTS =
    /\b(denise|julie|brigitte|caroline|elsa|hortense|claude|female|femme|f[eé]minin|virginie|am[eé]lie|google français female)\b/i;

  const PREVIEW_MAX_CHARS = 480;
  const MS_PER_CHAR = 55;
  const SKIP_SECONDS = 10;

  let isMember = false;
  let selectedVoice = null;
  let frenchVoices = [];
  const voiceSelects = [];
  let fullText = "";
  let currentCharOffset = 0;
  let speechRate = 1;
  let estimatedTotalMs = 0;
  let progressTimer = null;
  let speechStartTime = 0;
  let pausedAccum = 0;
  let pauseStart = 0;
  let isSeeking = false;
  let speakSession = 0;
  let activeEntry = null;
  let activeEntryUi = null;
  let articleUi = null;

  function voiceGender(voice) {
    const n = voice.name || "";
    if (MALE_HINTS.test(n)) return "male";
    if (FEMALE_HINTS.test(n)) return "female";
    return "unknown";
  }

  function pickDefaultVoiceForResource(res) {
    const prefs = VOICE_PREFS[res] || [];
    for (const re of prefs) {
      const hit = frenchVoices.find((v) => re.test(v.name));
      if (hit) return hit;
    }
    const males = frenchVoices.filter((v) => voiceGender(v) === "male");
    const females = frenchVoices.filter((v) => voiceGender(v) === "female");
    switch (res) {
      case "manuel":
        return males[0] || frenchVoices[0] || null;
      case "arrets":
        return females[0] || frenchVoices[0] || null;
      case "dictionary":
        return females[1] || females[0] || frenchVoices[0] || null;
      case "exercices":
        return females[2] || females[0] || frenchVoices[0] || null;
      default:
        return frenchVoices[0] || null;
    }
  }

  function voiceStorageKey() {
    return "site-tts-voice-" + resource;
  }

  function resolveVoiceForResource() {
    const stored = sessionStorage.getItem(voiceStorageKey());
    if (stored) {
      const hit = frenchVoices.find((v) => v.voiceURI === stored);
      if (hit) return hit;
    }
    return pickDefaultVoiceForResource(resource);
  }

  function loadFrenchVoices() {
    const voices = window.speechSynthesis.getVoices();
    frenchVoices = voices
      .filter((v) => v.lang && v.lang.toLowerCase().startsWith("fr"))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    selectedVoice = resolveVoiceForResource();
  }

  function populateVoiceSelect(sel) {
    const prev = sel.value || selectedVoice?.voiceURI || "";
    sel.innerHTML = "";
    if (!frenchVoices.length) {
      const o = document.createElement("option");
      o.textContent = "Par défaut";
      o.value = "";
      sel.appendChild(o);
      return;
    }
    frenchVoices.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name.replace(/^(Microsoft |Google )/, "");
      sel.appendChild(o);
    });
    const pick =
      frenchVoices.find((v) => v.voiceURI === prev) ||
      selectedVoice ||
      frenchVoices[0];
    if (pick) sel.value = pick.voiceURI;
  }

  function refreshVoices() {
    loadFrenchVoices();
    voiceSelects.forEach(populateVoiceSelect);
  }

  function buildVoiceSelect(onChange) {
    const wrap = document.createElement("label");
    wrap.className = "site-tts-voice-wrap";
    const sel = document.createElement("select");
    sel.className = "site-tts-voice";
    sel.setAttribute("aria-label", "Voix");
    voiceSelects.push(sel);
    populateVoiceSelect(sel);
    sel.addEventListener("change", () => {
      selectedVoice =
        frenchVoices.find((v) => v.voiceURI === sel.value) || null;
      if (selectedVoice) {
        sessionStorage.setItem(voiceStorageKey(), selectedVoice.voiceURI);
      }
      voiceSelects.forEach((s) => {
        if (s !== sel) s.value = sel.value;
      });
      if (typeof onChange === "function") onChange();
    });
    wrap.append(document.createTextNode("Voix "), sel);
    return wrap;
  }

  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  }
  refreshVoices();

  function normalizeText(raw) {
    return (raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeBtn(label, className, options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "site-tts-btn " + className;
    if (options && options.icon) {
      b.textContent = options.icon;
      b.setAttribute("aria-label", label);
      b.classList.add("site-tts-btn-icon");
    } else {
      b.textContent = label;
    }
    return b;
  }

  function estimateDurationMs(charCount) {
    return (charCount || 0) * (MS_PER_CHAR / speechRate);
  }

  function charsForSeconds(seconds) {
    return Math.round(seconds * 1000 * (speechRate / MS_PER_CHAR));
  }

  function formatTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function extractArticleText(previewOnly) {
    const prose = document.querySelector("article.manuel-prose");
    if (!prose) return "";
    const clone = prose.cloneNode(true);
    clone.querySelectorAll("script, style").forEach((n) => n.remove());
    let text = normalizeText(clone.innerText || clone.textContent || "");
    if (previewOnly && text.length > PREVIEW_MAX_CHARS) {
      text = text.slice(0, PREVIEW_MAX_CHARS).replace(/\s+\S*$/, "") + "\u2026";
    }
    return text;
  }

  function buildArticleSpeechText() {
    const body = extractArticleText(false);
    if (!body) return "";
    const titleEl =
      document.querySelector("article.manuel-prose")?.closest(".manuel-content")
        ?.querySelector(".site-title") ||
      document.querySelector(".arrets-fiche-layout .site-title");
    const title = titleEl ? normalizeText(titleEl.textContent) : "";
    return title ? title + ". " + body : body;
  }

  function buildEntrySpeechText(entry) {
    const term = normalizeText(
      entry.querySelector(".dict-term-label")?.textContent ||
        entry.querySelector(".dict-term")?.textContent ||
        ""
    );
    const def = normalizeText(
      entry.querySelector(".dict-def")?.textContent || ""
    );
    if (!term || !def) return "";
    return term + ". " + def;
  }

  function clearProgressTimer() {
    if (progressTimer) {
      cancelAnimationFrame(progressTimer);
      progressTimer = null;
    }
  }

  function resetProgress(ui) {
    clearProgressTimer();
    currentCharOffset = 0;
    pausedAccum = 0;
    pauseStart = 0;
    fullText = "";
    estimatedTotalMs = 0;
    if (!ui) return;
    ui.progressFill.style.width = "0%";
    ui.seekInput.value = "0";
    ui.seekInput.disabled = true;
    ui.timeEl.textContent = "0:00 / 0:00";
  }

  function updateProgressUI(ui) {
    if (!ui || isSeeking || !fullText.length) return;
    const pct = Math.min(100, (currentCharOffset / fullText.length) * 100);
    ui.progressFill.style.width = pct + "%";
    ui.seekInput.value = String(pct);
    const elapsed = estimateDurationMs(currentCharOffset);
    ui.timeEl.textContent =
      formatTime(elapsed) + " / " + formatTime(estimatedTotalMs);
  }

  function updateProgressFromPct(ui, pct) {
    if (!ui) return;
    const elapsed = (pct / 100) * estimatedTotalMs;
    ui.timeEl.textContent =
      formatTime(elapsed) + " / " + formatTime(estimatedTotalMs);
    ui.progressFill.style.width = pct + "%";
  }

  function startProgressTimer(ui) {
    clearProgressTimer();
    function tick() {
      if (!window.speechSynthesis.speaking) return;
      if (window.speechSynthesis.paused || isSeeking) {
        progressTimer = requestAnimationFrame(tick);
        return;
      }
      const elapsed = performance.now() - speechStartTime - pausedAccum;
      const estOffset = Math.min(
        fullText.length,
        Math.round(elapsed * (speechRate / MS_PER_CHAR))
      );
      if (estOffset > currentCharOffset && currentCharOffset < fullText.length - 1) {
        currentCharOffset = estOffset;
        updateProgressUI(ui);
      }
      progressTimer = requestAnimationFrame(tick);
    }
    progressTimer = requestAnimationFrame(tick);
  }

  function setArticleUiState(ui, state) {
    if (!ui) return;
    const playing = state === "playing";
    const paused = state === "paused";
    const idle = state === "idle";
    ui.btnPlay.hidden = !idle;
    ui.btnPause.hidden = !playing;
    ui.btnResume.hidden = !paused;
    ui.btnStop.hidden = idle;
    ui.btnBack.hidden = idle;
    ui.btnForward.hidden = idle;
    ui.seekInput.disabled = idle && !fullText.length;
    ui.root.classList.toggle("is-active", playing || paused);
  }

  function setEntryUiState(ui, state) {
    if (!ui) return;
    const playing = state === "playing";
    const paused = state === "paused";
    const idle = state === "idle";
    ui.btnPlay.hidden = !idle;
    ui.btnPause.hidden = !playing;
    ui.btnResume.hidden = !paused;
    ui.btnStop.hidden = idle;
    ui.root.classList.toggle("is-active", playing || paused);
    ui.entry.classList.toggle("is-tts-active", playing || paused);
  }

  function finishArticlePlayback(ui) {
    clearProgressTimer();
    currentCharOffset = fullText.length;
    ui.progressFill.style.width = "100%";
    ui.seekInput.value = "100";
    ui.timeEl.textContent =
      formatTime(estimatedTotalMs) + " / " + formatTime(estimatedTotalMs);
    window.setTimeout(() => {
      resetProgress(ui);
      setArticleUiState(ui, "idle");
      activeEntry = null;
      activeEntryUi = null;
    }, 400);
  }

  function stopAll() {
    speakSession++;
    window.speechSynthesis.cancel();
    clearProgressTimer();
    if (articleUi) {
      resetProgress(articleUi);
      setArticleUiState(articleUi, "idle");
    }
    if (activeEntryUi) setEntryUiState(activeEntryUi, "idle");
    activeEntry = null;
    activeEntryUi = null;
    fullText = "";
  }

  function speakText(text, offset, ui, options) {
    const opts = options || {};
    const isArticle = Boolean(opts.article);
    const entry = opts.entry || null;
    const entryUi = opts.entryUi || null;

    if (!text) return;

    speakSession++;
    const mySession = speakSession;

    if (!fullText) fullText = text;
    offset = Math.max(0, Math.min(offset, Math.max(0, fullText.length - 1)));
    const slice = fullText.slice(offset).trim();
    if (!slice) {
      if (isArticle && ui) finishArticlePlayback(ui);
      else if (entryUi) setEntryUiState(entryUi, "idle");
      return;
    }

    window.speechSynthesis.cancel();
    clearProgressTimer();

    currentCharOffset = offset;
    estimatedTotalMs = estimateDurationMs(fullText.length);
    if (isArticle && ui) {
      ui.seekInput.disabled = false;
      updateProgressUI(ui);
    }

    activeEntry = entry;
    activeEntryUi = entryUi;

    loadFrenchVoices();

    const utter = new SpeechSynthesisUtterance(fullText.slice(offset));
    utter.lang = selectedVoice?.lang || "fr-FR";
    if (selectedVoice) utter.voice = selectedVoice;
    utter.rate = speechRate;
    utter.pitch = 1;

    const baseOffset = offset;

    utter.onboundary = (e) => {
      if (mySession !== speakSession) return;
      currentCharOffset = baseOffset + e.charIndex + (e.charLength || 1);
      if (isArticle && ui) updateProgressUI(ui);
    };

    utter.onstart = () => {
      if (mySession !== speakSession) return;
      speechStartTime = performance.now();
      pausedAccum = 0;
      pauseStart = 0;
      if (isArticle && ui) {
        setArticleUiState(ui, "playing");
        startProgressTimer(ui);
      } else if (entryUi) {
        setEntryUiState(entryUi, "playing");
      }
    };

    utter.onpause = () => {
      if (mySession !== speakSession) return;
      pauseStart = performance.now();
      if (isArticle && ui) setArticleUiState(ui, "paused");
      else if (entryUi) setEntryUiState(entryUi, "paused");
    };

    utter.onresume = () => {
      if (mySession !== speakSession) return;
      if (pauseStart) pausedAccum += performance.now() - pauseStart;
      pauseStart = 0;
      if (isArticle && ui) setArticleUiState(ui, "playing");
      else if (entryUi) setEntryUiState(entryUi, "playing");
    };

    utter.onend = () => {
      if (mySession !== speakSession) return;
      if (isArticle && ui) {
        if (currentCharOffset >= fullText.length - 2) finishArticlePlayback(ui);
      } else if (entryUi) {
        setEntryUiState(entryUi, "idle");
        activeEntry = null;
        activeEntryUi = null;
        fullText = "";
      }
    };

    utter.onerror = () => {
      if (mySession !== speakSession) return;
      if (isArticle && ui) {
        resetProgress(ui);
        setArticleUiState(ui, "idle");
      } else if (entryUi) {
        setEntryUiState(entryUi, "idle");
      }
      activeEntry = null;
      activeEntryUi = null;
    };

    window.speechSynthesis.speak(utter);
  }

  function speakArticleFromOffset(offset, ui) {
    const text = fullText || buildArticleSpeechText();
    speakText(text, offset, ui, { article: true });
  }

  function speakEntry(entry, entryUi) {
    if (activeEntry && activeEntry !== entry) stopAll();
    const text = buildEntrySpeechText(entry);
    speakText(text, 0, null, { entry: entry, entryUi: entryUi });
  }

  function initArticlePlayer() {
    const prose = document.querySelector("article.manuel-prose");
    if (!prose) return;

    const root = document.createElement("div");
    root.className = "site-tts site-tts--capsules";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Audio");

    const capsules = document.createElement("div");
    capsules.className = "site-tts-capsules";

    const progressWrap = document.createElement("div");
    progressWrap.className = "site-tts-progress";

    const timeEl = document.createElement("span");
    timeEl.className = "site-tts-time";
    timeEl.textContent = "0:00 / 0:00";

    const seekInput = document.createElement("input");
    seekInput.type = "range";
    seekInput.className = "site-tts-seek";
    seekInput.min = "0";
    seekInput.max = "100";
    seekInput.step = "0.1";
    seekInput.value = "0";
    seekInput.setAttribute("aria-label", "Position dans la lecture");
    seekInput.disabled = true;

    const progressTrack = document.createElement("div");
    progressTrack.className = "site-tts-progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "site-tts-progress-fill";
    progressTrack.append(progressFill, seekInput);
    progressWrap.append(timeEl, progressTrack);

    const btnPlay = makeBtn("Écouter", "site-tts-play");
    const btnPause = makeBtn("Pause", "site-tts-pause", { icon: "\u23F8" });
    const btnResume = makeBtn("Reprendre", "site-tts-resume");
    const btnStop = makeBtn("Arrêter", "site-tts-stop", { icon: "\u23F9" });
    const btnBack = makeBtn("-10 s", "site-tts-skip");
    const btnForward = makeBtn("+10 s", "site-tts-skip");

    const speedWrap = document.createElement("label");
    speedWrap.className = "site-tts-speed-wrap";
    const speedSelect = document.createElement("select");
    speedSelect.className = "site-tts-speed";
    speedSelect.setAttribute("aria-label", "Vitesse de lecture");
    [0.75, 1, 1.25, 1.5, 1.75, 2].forEach((r) => {
      const o = document.createElement("option");
      o.value = String(r);
      o.textContent = r === 1 ? "1\u00d7" : r + "\u00d7";
      speedSelect.appendChild(o);
    });
    speedSelect.value = "1";
    speedWrap.append(document.createTextNode("Vitesse "), speedSelect);

    const voiceWrap = buildVoiceSelect(() => {
      if (window.speechSynthesis.speaking && articleUi) {
        speakArticleFromOffset(currentCharOffset, articleUi);
      }
    });

    btnPause.hidden = true;
    btnResume.hidden = true;
    btnStop.hidden = true;
    btnBack.hidden = true;
    btnForward.hidden = true;

    capsules.append(
      btnPlay,
      btnPause,
      btnResume,
      btnStop,
      btnBack,
      btnForward,
      speedWrap,
      voiceWrap
    );
    root.append(capsules, progressWrap);

    const anchor =
      prose.closest(".manuel-content")?.querySelector(".site-title") || prose;
    anchor.insertAdjacentElement("afterend", root);

    const ui = {
      root,
      btnPlay,
      btnPause,
      btnResume,
      btnStop,
      btnBack,
      btnForward,
      seekInput,
      progressFill,
      timeEl,
      speedSelect,
    };
    articleUi = ui;

    function updateHint() {
      ui.btnPlay.textContent = "Écouter";
    }

    btnPlay.addEventListener("click", () => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        return;
      }
      if (window.speechSynthesis.speaking) return;
      fullText = buildArticleSpeechText();
      speakArticleFromOffset(0, ui);
    });

    btnPause.addEventListener("click", () => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
    });

    btnResume.addEventListener("click", () => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    });

    btnStop.addEventListener("click", stopAll);

    btnBack.addEventListener("click", () => {
      if (!fullText) fullText = buildArticleSpeechText();
      if (!fullText) return;
      const next = currentCharOffset + charsForSeconds(-SKIP_SECONDS);
      speakArticleFromOffset(Math.max(0, next), ui);
    });

    btnForward.addEventListener("click", () => {
      if (!fullText) fullText = buildArticleSpeechText();
      if (!fullText) return;
      const next = currentCharOffset + charsForSeconds(SKIP_SECONDS);
      speakArticleFromOffset(
        Math.min(next, fullText.length - 1),
        ui
      );
    });

    speedSelect.addEventListener("change", () => {
      speechRate = parseFloat(speedSelect.value) || 1;
      if (!fullText) fullText = buildArticleSpeechText();
      if (fullText) estimatedTotalMs = estimateDurationMs(fullText.length);
      if (window.speechSynthesis.speaking) {
        speakArticleFromOffset(currentCharOffset, ui);
      } else {
        updateProgressUI(ui);
      }
    });

    seekInput.addEventListener("pointerdown", () => {
      isSeeking = true;
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
    });

    seekInput.addEventListener("input", () => {
      updateProgressFromPct(ui, parseFloat(seekInput.value) || 0);
    });

    function endSeek() {
      if (!isSeeking) return;
      isSeeking = false;
      if (!fullText) fullText = buildArticleSpeechText();
      if (!fullText) return;
      const offset = Math.round(
        ((parseFloat(seekInput.value) || 0) / 100) * fullText.length
      );
      speakArticleFromOffset(offset, ui);
    }

    seekInput.addEventListener("pointerup", endSeek);
    seekInput.addEventListener("change", endSeek);

    updateHint();
    setArticleUiState(ui, "idle");
    ui._updateHint = updateHint;
  }

  function createEntryControls(entry) {
    const root = document.createElement("span");
    root.className = "site-tts site-tts--entry";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Écouter");

    const btnPlay = makeBtn("Écouter l'entrée", "site-tts-play", { icon: "\u25B6" });
    const btnPause = makeBtn("Pause", "site-tts-pause", { icon: "\u23F8" });
    const btnResume = makeBtn("Reprendre", "site-tts-resume", { icon: "\u25B6" });
    const btnStop = makeBtn("Arrêter", "site-tts-stop", { icon: "\u23F9" });

    btnPause.hidden = true;
    btnResume.hidden = true;
    btnStop.hidden = true;

    root.append(btnPlay, btnPause, btnResume, btnStop);

    const ui = { root, btnPlay, btnPause, btnResume, btnStop, entry };

    btnPlay.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.speechSynthesis.speaking && activeEntry === entry) {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        return;
      }
      if (window.speechSynthesis.speaking) stopAll();
      speakEntry(entry, ui);
    });

    btnPause.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeEntry === entry && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
      }
    });

    btnResume.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeEntry === entry && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    });

    btnStop.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeEntry === entry) stopAll();
    });

    return ui;
  }

  function initDictionaryEntries() {
    const dictToolbar = document.querySelector(".dict-toolbar");
    if (dictToolbar && !dictToolbar.querySelector(".site-tts-voice")) {
      dictToolbar.appendChild(
        buildVoiceSelect(() => {
          if (window.speechSynthesis.speaking && activeEntry && activeEntryUi) {
            speakEntry(activeEntry, activeEntryUi);
          }
        })
      );
    }

    document.querySelectorAll(".dict-entry").forEach((entry) => {
      const termEl = entry.querySelector(".dict-term");
      if (!termEl || termEl.querySelector(".site-tts--entry")) return;

      const label = document.createElement("span");
      label.className = "dict-term-label";
      label.textContent = termEl.textContent;
      termEl.textContent = "";
      termEl.append(label, createEntryControls(entry).root);
    });

    const dictFilter = document.getElementById("dict-filter");
    if (dictFilter) {
      dictFilter.addEventListener("input", () => {
        if (window.speechSynthesis.speaking) stopAll();
      });
    }
  }

  if (mode === "dictionary") {
    initDictionaryEntries();
  } else {
    initArticlePlayer();
  }

  window.addEventListener("beforeunload", stopAll);
  window.addEventListener("pagehide", stopAll);

  window.SiteTTS = {
    init(member) {
      isMember = Boolean(member);
      stopAll();
      if (articleUi && articleUi._updateHint) articleUi._updateHint();
    },
    stop: stopAll,
  };
})();
