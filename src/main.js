/**
 * Lelele Sudoku - application controller.
 * Wires the rules engine, worker, state machine, UI, storage and LeleleSDK.
 */

import { buildSpec } from "./constraints.js";
import {
  DEFAULT_SETTINGS, VARIANTS,
  VARIANT_NAMES, VARIANT_RULE_KEYS, TIME_ATTACK_SECONDS,
  normalizeSetup, labelFor, symbolsFor
} from "./config.js";
import { createBoard } from "./board.js";
import { createGameState } from "./game-state.js";
import { createTimer, formatTime } from "./timer.js";
import { createStatistics } from "./statistics.js";
import { generateDailyPuzzle, dateKey } from "./daily-challenge.js";
import {
  languageManager, t, toggleLanguage, SUPPORTED_LANGUAGES
} from "./language.js";
import { storage } from "./storage.js";
import * as leleleSDK from "./sdk.js";
import { createSound } from "./sound.js";
import { flashCell, celebrate, revealPanel, clearAnimations } from "./animations.js";

const SCORE_WEIGHTS = Object.freeze({
  easy: 600, medium: 900, hard: 1300, expert: 1800, master: 2400
});

class SudokuApp {
  constructor() {
    this.elements = this.collectElements();
    this.settings = { ...DEFAULT_SETTINGS, ...storage.getSettings() };
    this.setup = {
      size: this.settings.boardSize,
      variant: this.settings.variant,
      difficulty: this.settings.difficulty,
      mode: "classic",
      errorCheck: this.settings.errorCheck,
      hintsAllowed: this.settings.hintsAllowed,
      timer: this.settings.timer,
      autoNotes: this.settings.autoNotes
    };
    this.state = null;
    this.timer = null;
    this.screen = "home";
    this.requestId = 0;
    this.pending = new Map();
    this.dialogResolve = null;
    this.dialogDismissible = true;
    this.toastTimer = null;
    this.saveTimer = null;
    this.playerName = null;
    this.statistics = createStatistics(storage);
    this.sound = createSound({ enabled: this.settings.sound });
    this.board = createBoard(this.elements["sudoku-board"], {
      onCellClick: index => this.handleCellClick(index)
    });
    this.init();
  }

  collectElements() {
    const ids = [
      "home-panel", "setup-panel", "variants-panel", "stats-panel", "game-panel",
      "continue-button", "new-game-button", "daily-button", "mode-time-attack",
      "variants-button", "stats-button", "how-to-button", "leaderboard-button",
      "setup-size", "setup-variant", "setup-difficulty", "setup-error-check",
      "setup-hints", "setup-timer", "setup-auto-notes", "setup-start", "setup-back",
      "variant-list", "stats-content", "variants-back", "stats-back",
      "game-mode-label", "game-difficulty-label", "timer-display", "mistake-count",
      "hint-count", "pause-button", "game-settings-button", "sudoku-board",
      "numpad", "notes-button", "undo-button", "redo-button", "hint-button",
      "erase-button", "restart-button", "back-button", "dialog-backdrop",
      "dialog-title", "dialog-copy", "dialog-extra", "dialog-actions", "toast",
      "import-file", "language-toggle", "settings-button"
    ];
    const elements = {};
    for (const id of ids) elements[id] = document.getElementById(id);
    return elements;
  }

  init() {
    languageManager.subscribe(() => this.applyTranslations());
    if (!SUPPORTED_LANGUAGES[this.settings.language?.toUpperCase()]) {
      this.settings.language = "en";
    }
    languageManager.setLanguage(this.settings.language);

    this.initWorker();
    this.bindEvents();
    this.populateSetup();
    this.buildVariantList();
    this.showScreen("home");
    this.applyTranslations();

    leleleSDK.ensureSDK();
    leleleSDK.getPlayerName().then(name => { this.playerName = name; });

    if (storage.getSaves().length === 0) this.elements["continue-button"].disabled = true;
  }

  initWorker() {
    try {
      this.worker = new Worker(new URL("./solver-worker.js", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", event => {
        const data = event.data ?? {};
        const resolve = this.pending.get(data.requestId);
        if (!resolve) return;
        this.pending.delete(data.requestId);
        resolve(data);
      });
      this.worker.addEventListener("error", () => { this.worker = null; });
    } catch {
      this.worker = null;
    }
  }

  request(type, payload = {}) {
    const requestId = ++this.requestId;
    if (this.worker) {
      return new Promise(resolve => {
        this.pending.set(requestId, resolve);
        this.worker.postMessage({ type, requestId, ...payload });
      });
    }
    return this.runInline(type, payload);
  }

  async runInline(type, payload) {
    try {
      if (type === "generate") {
        const { generatePuzzle } = await import("./generator.js");
        return { ok: true, puzzle: generatePuzzle(payload.options ?? {}) };
      }
      const { buildSpec: build } = await import("./constraints.js");
      const spec = build(payload.puzzle);
      if (type === "solve") {
        const { solve } = await import("./solver.js");
        return { ok: true, solution: solve(spec, spec.givens, { limit: 1 }).solution };
      }
      if (type === "hint") {
        const { findNextTechnique } = await import("./techniques.js");
        const grid = spec.givens.map((value, index) => payload.values?.[index] ?? value);
        return { ok: true, technique: findNextTechnique(spec, grid) };
      }
      return { ok: false, error: "UNKNOWN_TASK" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  bindEvents() {
    const el = this.elements;
    el["language-toggle"].addEventListener("click", () => toggleLanguage());
    el["settings-button"].addEventListener("click", () => this.openSettings());
    el["continue-button"].addEventListener("click", () => this.continueGame());
    el["new-game-button"].addEventListener("click", () => this.openSetup("classic"));
    el["daily-button"].addEventListener("click", () => this.startDaily());
    el["mode-time-attack"].addEventListener("click", () => this.openSetup("time-attack"));
    el["variants-button"].addEventListener("click", () => this.showScreen("variants"));
    el["stats-button"].addEventListener("click", () => this.showStats());
    el["how-to-button"].addEventListener("click", () => this.showHowTo());
    el["leaderboard-button"].addEventListener("click", () => this.showLeaderboard());
    el["variants-back"].addEventListener("click", () => this.showScreen("home"));
    el["stats-back"].addEventListener("click", () => this.showScreen("home"));
    el["setup-back"].addEventListener("click", () => this.showScreen("home"));
    el["setup-start"].addEventListener("click", () => this.startFromSetup());

    el["pause-button"].addEventListener("click", () => this.togglePause());
    el["game-settings-button"].addEventListener("click", () => this.showRules());
    el["notes-button"].addEventListener("click", () => this.toggleNotes());
    el["undo-button"].addEventListener("click", () => this.undo());
    el["redo-button"].addEventListener("click", () => this.redo());
    el["hint-button"].addEventListener("click", () => this.showHint());
    el["erase-button"].addEventListener("click", () => this.erase());
    el["restart-button"].addEventListener("click", () => this.restart());
    el["back-button"].addEventListener("click", () => this.goHome());

    el["dialog-backdrop"].addEventListener("click", event => {
      if (event.target === el["dialog-backdrop"] && this.dialogDismissible) this.closeDialog(null);
    });
    el["import-file"].addEventListener("change", event => this.importData(event));

    document.addEventListener("keydown", event => this.handleKeyboard(event));
  }

  populateSetup() {
    const variantSelect = this.elements["setup-variant"];
    variantSelect.innerHTML = "";
    for (const variant of VARIANTS) {
      const option = document.createElement("option");
      option.value = variant;
      option.dataset.i18n = VARIANT_NAMES[variant];
      option.textContent = t(VARIANT_NAMES[variant]);
      variantSelect.appendChild(option);
    }
    this.elements["setup-size"].value = String(this.setup.size);
    this.elements["setup-difficulty"].value = this.setup.difficulty;
    variantSelect.value = this.setup.variant;
    this.elements["setup-error-check"].checked = this.setup.errorCheck;
    this.elements["setup-hints"].checked = this.setup.hintsAllowed;
    this.elements["setup-timer"].checked = this.setup.timer;
    this.elements["setup-auto-notes"].checked = this.setup.autoNotes;
  }

  applyTranslations() {
    document.documentElement.lang = languageManager.getLanguage();
    document.querySelectorAll("[data-i18n]").forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });
    this.elements["language-toggle"].textContent = languageManager.getLanguage() === "en" ? "中文" : "EN";
    this.buildVariantList();
    if (this.screen === "stats") this.showStats();
    if (this.screen === "game") this.updateGameUI();
  }

  showScreen(name) {
    this.screen = name;
    const mapping = {
      home: "home-panel", setup: "setup-panel", variants: "variants-panel",
      stats: "stats-panel", game: "game-panel"
    };
    for (const [key, id] of Object.entries(mapping)) {
      this.elements[id].hidden = key !== name;
    }
    const panel = this.elements[mapping[name]];
    if (panel) revealPanel(panel);
    if (name === "home") this.elements["continue-button"].disabled = !storage.getSaves().length;
  }

  openSetup(mode = "classic") {
    this.setup.mode = mode;
    this.populateSetup();
    this.showScreen("setup");
  }

  readSetup() {
    const el = this.elements;
    const setup = normalizeSetup({
      size: Number(el["setup-size"].value),
      variant: el["setup-variant"].value,
      difficulty: el["setup-difficulty"].value,
      mode: this.setup.mode,
      errorCheck: el["setup-error-check"].checked,
      hintsAllowed: el["setup-hints"].checked,
      timer: el["setup-timer"].checked,
      autoNotes: el["setup-auto-notes"].checked
    });
    this.settings = {
      ...this.settings,
      boardSize: setup.size,
      variant: setup.variant,
      difficulty: setup.difficulty,
      errorCheck: setup.errorCheck,
      hintsAllowed: setup.hintsAllowed,
      timer: setup.timer,
      autoNotes: setup.autoNotes
    };
    storage.saveSettings(this.settings);
    this.setup = { ...this.setup, ...setup };
    return setup;
  }

  async startFromSetup() {
    const setup = this.readSetup();
    if (setup.variant === "samurai") setup.size = 9;
    await this.generateAndStart(setup);
  }

  async startDaily() {
    const setup = normalizeSetup({
      size: this.settings.boardSize,
      variant: this.settings.variant === "samurai" ? "classic" : this.settings.variant,
      difficulty: this.settings.difficulty,
      mode: "daily",
      errorCheck: this.settings.errorCheck,
      hintsAllowed: this.settings.hintsAllowed,
      timer: this.settings.timer,
      autoNotes: this.settings.autoNotes
    });
    const key = dateKey();
    const record = storage.getDailyRecord(key);
    if (record?.completed) {
      const choice = await this.showDialog({
        title: t("dailyChallenge"),
        copy: `${t("dailyAlreadyDone")}\n${t("dailyTomorrow")}`,
        actions: [
          { label: t("back"), value: "back" },
          { label: t("playAgain"), value: "replay", primary: true }
        ]
      });
      if (choice !== "replay") return;
    }
    this.showToast(t("generating"));
    try {
      const puzzle = generateDailyPuzzle(setup, new Date());
      this.startWithPuzzle(puzzle, setup);
    } catch {
      this.showToast(t("generateFailed"), true);
    }
  }

  async generateAndStart(setup) {
    this.showToast(t("generating"));
    const response = await this.request("generate", { options: setup });
    if (!response.ok || !response.puzzle) {
      this.showToast(response.error === "CANCELLED" ? t("generateFailed") : t("generateFailed"), true);
      return;
    }
    this.startWithPuzzle(response.puzzle, setup);
  }

  startWithPuzzle(puzzle, setup) {
    const normalized = normalizeSetup({ ...setup, size: puzzle.size, variant: puzzle.variant });
    this.state = createGameState(puzzle, {
      mode: normalized.mode,
      errorCheck: normalized.errorCheck,
      hintsAllowed: normalized.hintsAllowed,
      timer: normalized.timer,
      autoNotes: normalized.autoNotes
    });
    this.statistics.recordStart({
      size: puzzle.size, variant: puzzle.variant,
      difficulty: puzzle.difficulty, mode: normalized.mode
    });
    this.board.build(puzzle, buildSpec(puzzle));
    this.buildNumpad(puzzle.size);
    this.state.subscribe(() => this.onStateChanged());
    this.startTimer();
    this.showScreen("game");
    this.updateGameUI();
    this.saveNow();
  }

  buildNumpad(size) {
    const pad = this.elements.numpad;
    pad.innerHTML = "";
    for (const symbol of symbolsFor(size)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.value = symbol;
      button.textContent = symbol;
      button.addEventListener("click", () => this.handleDigit(symbol));
      pad.appendChild(button);
    }
    const erase = document.createElement("button");
    erase.type = "button";
    erase.className = "erase";
    erase.textContent = "×";
    erase.addEventListener("click", () => this.erase());
    pad.appendChild(erase);
  }

  handleCellClick(index) {
    if (!this.state || this.screen !== "game") return;
    if (!this.state.setCursor(index)) return;
    this.sound.play("select");
    this.updateGameUI();
  }

  handleDigit(text) {
    if (!this.state || this.state.status !== "playing") return;
    const value = symbolsFor(this.state.spec.size).indexOf(String(text).toUpperCase()) + 1;
    if (!value) return;
    const cell = this.state.cursor;
    const isNote = this.state.notesMode;
    const changed = isNote ? this.state.toggleNote(cell, value) : this.state.setValue(cell, value);
    if (!changed) {
      if (this.state.isGiven(cell)) this.showToast(t("givenCell"), true);
      return;
    }
    const element = this.board.getCell(cell);
    if (!isNote && this.state.settings.errorCheck && value !== this.state.puzzle.solution[cell]) {
      this.sound.play("error");
      if (this.settings.animations) flashCell(element, "error");
      this.showToast(t("wrongValue"), true);
    } else {
      this.sound.play("input");
      if (this.settings.animations) flashCell(element, isNote ? "pop" : "pop");
    }
    this.updateGameUI();
  }

  erase() {
    if (!this.state?.erase(this.state.cursor)) return;
    this.sound.play("button");
    this.updateGameUI();
  }

  toggleNotes() {
    if (!this.state) return;
    const enabled = this.state.setNotesMode(!this.state.notesMode);
    this.elements["notes-button"].classList.toggle("active", enabled);
    this.showToast(t(enabled ? "notesOn" : "notesOff"));
    this.updateGameUI();
  }

  undo() {
    if (!this.state?.undo()) return;
    this.sound.play("button");
    this.updateGameUI();
  }

  redo() {
    if (!this.state?.redo()) return;
    this.sound.play("button");
    this.updateGameUI();
  }

  async showHint() {
    if (!this.state || this.state.status !== "playing") return;
    if (!this.state.settings.hintsAllowed) {
      this.showToast(t("noHints"), true);
      return;
    }
    this.showToast(t("loading"));
    const response = await this.request("hint", {
      puzzle: this.state.puzzle,
      values: this.state.values
    });
    const technique = response.ok ? response.technique : null;
    if (!technique) {
      this.showToast(t("hintNoLogic"));
      return;
    }
    const explainKey = `explain${technique.id.charAt(0).toUpperCase()}${technique.id.slice(1)}`;
    const copy = t(explainKey, {
      value: technique.value ?? technique.candidates?.[0] ?? "",
      values: (technique.candidates ?? []).map(value => labelFor(this.state.spec.size, value)).join(", ")
    });
    const choice = await this.showDialog({
      title: t(technique.key),
      copy,
      dismissible: true,
      actions: [
        { label: t("close"), value: "close" },
        { label: t("solvePuzzle"), value: "solve" },
        { label: t("revealCell"), value: "reveal" },
        { label: t("solveStep"), value: "step", primary: true }
      ]
    });
    if (choice === "reveal") this.revealCell();
    else if (choice === "step") this.applyTechniqueStep(technique);
    else if (choice === "solve") this.solveWholePuzzle();
  }

  applyTechniqueStep(technique) {
    if (!this.state || technique.value == null) return;
    const cell = technique.cells?.[0];
    if (cell == null) return;
    this.state.setCursor(cell);
    this.state.setValue(cell, technique.value);
    this.state.hintsUsed += 1;
    this.sound.play("hint");
    this.showToast(t("hintValue", { value: labelFor(this.state.spec.size, technique.value) }));
    if (this.settings.animations) flashCell(this.board.getCell(cell), "hint");
    this.updateGameUI();
  }

  revealCell() {
    const result = this.state?.useHint();
    if (!result) return;
    this.sound.play("hint");
    this.showToast(t("hintAdded"));
    if (this.settings.animations) flashCell(this.board.getCell(result.cell), "hint");
    this.updateGameUI();
  }

  async solveWholePuzzle() {
    if (!this.state) return;
    const response = await this.request("solve", { puzzle: this.state.puzzle });
    if (!response.ok || !response.solution) return;
    for (const cell of this.state.spec.activeCells) {
      if (!this.state.puzzle.givens[cell]) {
        this.state.setCursor(cell);
        this.state.setValue(cell, response.solution[cell]);
      }
    }
    this.state.hintsUsed += 1;
    this.updateGameUI();
  }

  togglePause() {
    if (!this.state) return;
    if (this.state.status === "playing") {
      this.state.pause();
      this.timer?.pause();
      this.elements["pause-button"].textContent = t("resume");
    } else if (this.state.status === "paused") {
      this.state.resume();
      this.timer?.resume();
      this.elements["pause-button"].textContent = t("pause");
    }
    this.updateGameUI();
  }

  startTimer() {
    this.stopTimer();
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (!this.state || this.state.status !== "playing") return;
      this.state.tick(delta);
      if (this.state.mode === "time-attack") {
        const limit = TIME_ATTACK_SECONDS[this.state.puzzle.difficulty] ?? 480;
        if (this.state.elapsedMs >= limit * 1000) {
          this.state.timeOut();
          this.finishGame(false);
        }
      }
      this.updateTimerDisplay();
    }, 500);
  }

  stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  updateTimerDisplay() {
    if (!this.state) return;
    let text = formatTime(this.state.elapsedMs);
    if (this.state.mode === "time-attack") {
      const limit = TIME_ATTACK_SECONDS[this.state.puzzle.difficulty] ?? 480;
      text = formatTime(Math.max(0, limit * 1000 - this.state.elapsedMs));
    }
    this.elements["timer-display"].textContent = text;
  }

  updateGameUI() {
    const state = this.state;
    if (!state) return;
    this.elements["game-mode-label"].textContent = t(`mode${state.mode.charAt(0).toUpperCase()}${state.mode.slice(1).replace("-", "")}`) ?? state.mode;
    this.elements["game-difficulty-label"].textContent = t(state.puzzle.difficulty);
    this.elements["mistake-count"].textContent = String(state.mistakes);
    this.elements["hint-count"].textContent = String(state.hintsUsed);
    this.elements["pause-button"].textContent = state.status === "paused" ? t("resume") : t("pause");
    this.elements["undo-button"].disabled = !state.canUndo() || state.status !== "playing";
    this.elements["redo-button"].disabled = !state.canRedo() || state.status !== "playing";
    this.elements["hint-button"].disabled = !state.settings.hintsAllowed || state.status !== "playing";
    this.elements["notes-button"].classList.toggle("active", state.notesMode);
    this.elements.numpad.querySelectorAll("button").forEach(button => {
      button.disabled = state.status !== "playing";
    });
    this.updateTimerDisplay();
    this.board.update(state);
  }

  onStateChanged() {
    this.updateGameUI();
    this.scheduleSave();
    if (this.state?.status === "completed") this.finishGame(true);
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    if (!this.state || this.state.status === "completed") return;
    storage.saveGame(this.state.serialize());
  }

  continueGame() {
    const save = storage.getSaves()[0];
    if (!save) {
      this.showToast(t("noSave"), true);
      return;
    }
    let restored = null;
    let spec = null;
    try {
      restored = createGameState.fromJSON(save.state);
      if (restored) spec = buildSpec(restored.puzzle);
    } catch {
      restored = null;
    }
    if (!restored || !spec) {
      this.showToast(t("noSave"), true);
      return;
    }
    this.state = restored;
    this.board.build(restored.puzzle, spec);
    this.buildNumpad(restored.spec.size);
    this.state.subscribe(() => this.onStateChanged());
    this.startTimer();
    this.showScreen("game");
    this.updateGameUI();
    this.showToast(t("resumed"));
  }

  restart() {
    if (!this.state) return;
    this.showDialog({
      title: t("restart"),
      copy: t("resetConfirm"),
      actions: [
        { label: t("cancel"), value: "cancel" },
        { label: t("restart"), value: "restart", primary: true }
      ]
    }).then(choice => {
      if (choice !== "restart") return;
      this.state.reset();
      this.statistics.recordStart({
        size: this.state.puzzle.size, variant: this.state.puzzle.variant,
        difficulty: this.state.puzzle.difficulty, mode: this.state.mode
      });
      this.elements["pause-button"].textContent = t("pause");
      this.updateGameUI();
      this.saveNow();
    });
  }

  goHome() {
    this.saveNow();
    this.stopTimer();
    this.state = null;
    clearAnimations(document);
    this.showScreen("home");
  }

  finishGame(completed) {
    const state = this.state;
    if (!state || state.finishHandled) return;
    state.finishHandled = true;
    this.stopTimer();

    const context = {
      size: state.puzzle.size,
      variant: state.puzzle.variant,
      difficulty: state.puzzle.difficulty,
      mode: state.mode,
      dailyKey: state.mode === "daily" ? dateKey() : undefined
    };
    const result = {
      completed,
      elapsedMs: state.elapsedMs,
      mistakes: state.mistakes,
      hints: state.hintsUsed
    };
    const stats = this.statistics.recordCompletion(context, result);
    const score = this.computeScore(state, completed);
    const best = stats.byDifficulty?.[state.puzzle.difficulty]?.bestTimeMs ?? null;
    const isBest = completed && best !== null && Math.abs(best - state.elapsedMs) < 1000;

    if (state.mode === "daily") storage.setDailyRecord(dateKey(), {
      completed, timeMs: state.elapsedMs, size: state.puzzle.size, variant: state.puzzle.variant
    });
    if (completed) storage.deleteSave(state.id);

    if (leleleSDK.isInPlatform()) {
      leleleSDK.ensureSDK().then(() => leleleSDK.submitScore(score, {
        name: this.playerName ?? undefined
      }));
    }

    if (completed && this.settings.animations) {
      this.sound.play("complete");
      celebrate(this.elements["sudoku-board"].parentElement);
    }

    const actions = [
      { label: t("home"), value: "home" },
      { label: t("playAgain"), value: "again", primary: true }
    ];
    if (leleleSDK.isInPlatform()) {
      actions.push({ label: t("share"), value: "share" });
      actions.push({ label: t("nextGame"), value: "next" });
    }
    this.showDialog({
      title: completed ? t("resultCompleted") : t("resultTimeUp"),
      copy: "",
      extraHTML: `
        <div class="result-score">${score}</div>
        <div class="result-line"><span>${t("resultTime")}</span><strong>${formatTime(state.elapsedMs)}</strong></div>
        <div class="result-line"><span>${t("resultDifficulty")}</span><strong>${t(state.puzzle.difficulty)}</strong></div>
        <div class="result-line"><span>${t("resultMistakes")}</span><strong>${state.mistakes}</strong></div>
        <div class="result-line"><span>${t("resultHints")}</span><strong>${state.hintsUsed}</strong></div>
        ${best !== null ? `<div class="result-line"><span>${t("resultBest")}</span><strong>${formatTime(best)}</strong></div>` : ""}
        ${isBest ? `<p class="empty-note">${t("resultNewBest")}</p>` : ""}
        ${state.mode === "daily" ? `<p class="empty-note">${t("resultDailyDone")}</p>` : ""}
      `,
      actions,
      dismissible: false
    }).then(choice => {
      if (choice === "again") {
        this.startWithPuzzle(state.puzzle, {
          ...this.setup,
          mode: state.mode,
          size: state.puzzle.size,
          variant: state.puzzle.variant,
          difficulty: state.puzzle.difficulty
        });
      } else if (choice === "share") {
        leleleSDK.shareScore(score, t("share")).then(() => this.goHome());
      } else if (choice === "next") {
        leleleSDK.nextGame({ category: "puzzle" });
        this.goHome();
      } else {
        this.goHome();
      }
    });
  }

  computeScore(state, completed) {
    if (!completed) return 0;
    const base = SCORE_WEIGHTS[state.puzzle.difficulty] ?? 900;
    const limit = TIME_ATTACK_SECONDS[state.puzzle.difficulty] ?? 480;
    const bonus = Math.max(0, limit - Math.floor(state.elapsedMs / 1000)) * 4;
    return Math.max(0, base + bonus - state.mistakes * 40 - state.hintsUsed * 80);
  }

  buildVariantList() {
    const list = this.elements["variant-list"];
    if (!list) return;
    list.innerHTML = "";
    for (const variant of VARIANTS) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "variant-card";
      card.dataset.variant = variant;
      const glyph = document.createElement("span");
      glyph.className = "variant-glyph";
      glyph.textContent = "▦";
      const name = document.createElement("strong");
      name.textContent = t(VARIANT_NAMES[variant]);
      const desc = document.createElement("span");
      desc.textContent = t(VARIANT_RULE_KEYS[variant]);
      card.append(glyph, name, desc);
      card.addEventListener("click", () => {
        this.setup.variant = variant;
        this.setup.mode = "variant";
        this.setup.size = variant === "samurai" ? 9 : this.setup.size;
        this.openSetup("variant");
      });
      list.appendChild(card);
    }
  }

  showStats() {
    this.showScreen("stats");
    const summary = this.statistics.getSummary();
    const cards = [
      ["gamesStarted", summary.gamesStarted],
      ["gamesCompleted", summary.gamesCompleted],
      ["winRate", `${summary.winRate}%`],
      ["bestTime", summary.gamesCompleted ? formatTime(this.bestTimeOverall(summary)) : "—"],
      ["averageTime", summary.gamesCompleted ? formatTime(summary.averageTimeMs) : "—"],
      ["totalMistakes", summary.totalMistakes],
      ["totalHints", summary.totalHints],
      ["currentStreak", `${summary.currentStreak} ${t("days")}`]
    ];
    const html = `<div class="stats-grid">${cards.map(([key, value]) => `
      <div class="stat-card"><span>${t(key)}</span><strong>${value}</strong></div>
    `).join("")}</div>`;
    const sections = [
      ["bySize", summary.bySize], ["byVariant", summary.byVariant],
      ["byDifficulty", summary.byDifficulty], ["byMode", summary.byMode]
    ];
    this.elements["stats-content"].innerHTML = html + sections.map(([key, map]) => {
      const rows = Object.entries(map ?? {}).filter(([, value]) => value.completed > 0);
      if (!rows.length) return "";
      return `<h3 class="stats-section-title">${t(key)}</h3>
        <table class="stats-table"><tbody>${rows.map(([name, value]) => `
          <tr><td>${name}</td><td>${value.completed}</td><td>${value.bestTimeMs !== null ? formatTime(value.bestTimeMs) : "—"}</td></tr>
        `).join("")}</tbody></table>`;
    }).join("") + (!summary.gamesCompleted ? `<p class="empty-note">${t("noData")}</p>` : "");
  }

  bestTimeOverall(summary) {
    const values = Object.values(summary.bySize ?? {}).map(entry => entry.bestTimeMs).filter(value => value !== null);
    return values.length ? Math.min(...values) : 0;
  }

  async showLeaderboard() {
    if (!leleleSDK.isInPlatform()) {
      this.showToast(t("platformOnly"), true);
      return;
    }
    const rows = await leleleSDK.getLeaderboard();
    const copy = rows.length
      ? rows.map((row, index) => `${index + 1}. ${row.name} — ${row.score}`).join("\n")
      : t("noLeaderboard");
    await this.showDialog({ title: t("leaderboard"), copy, actions: [{ label: t("close"), value: "close", primary: true }] });
  }

  showRules() {
    const state = this.state;
    const variantKey = VARIANT_RULE_KEYS[state?.puzzle.variant ?? "classic"];
    this.showDialog({
      title: t("howToPlay"),
      copy: `${t("howIntro")}\n\n${t(variantKey)}\n\n${t("howKeyboard")}`,
      actions: [{ label: t("close"), value: "close", primary: true }]
    });
  }

  showHowTo() {
    this.showDialog({
      title: t("howTitle"),
      copy: `${t("howIntro")}\n\n${t("howBasics")}\n\n${t("howNotes")}\n\n${t("howKeyboard")}\n\n${t("howDaily")}\n\n${t("howVariants")}`,
      actions: [{ label: t("close"), value: "close", primary: true }]
    });
  }

  async openSettings() {
    const s = this.settings;
    const rows = [
      ["sound", s.sound], ["soundEffects", s.soundEffects], ["animations", s.animations],
      ["autoNotes", s.autoNotes], ["errorCheck", s.errorCheck],
      ["hintsAllowed", s.hintsAllowed], ["timer", s.timer]
    ];
    const extraHTML = `<div class="dialog-list">${rows.map(([key, value], index) => `
      <label class="dialog-row"><span>${t(key)}</span><input type="checkbox" data-setting="${key}" data-index="${index}" ${value ? "checked" : ""}></label>
    `).join("")}</div>`;
    const choice = await this.showDialog({
      title: t("settingsTitle"),
      copy: "",
      extraHTML,
      actions: [
        { label: t("cancel"), value: "cancel" },
        { label: t("clearData"), value: "clear" },
        { label: t("importData"), value: "import" },
        { label: t("exportData"), value: "export" },
        { label: t("confirm"), value: "save", primary: true }
      ]
    });
    if (choice === "cancel" || choice === null) return;
    if (choice === "export") {
      const blob = new Blob([JSON.stringify(storage.exportData(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lelele-sudoku-${dateKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.showToast(t("dataExported"));
      return;
    }
    if (choice === "import") {
      this.elements["import-file"].click();
      return;
    }
    if (choice === "clear") {
      const confirm = await this.showDialog({
        title: t("clearData"), copy: t("clearDataConfirm"),
        actions: [{ label: t("cancel"), value: "cancel" }, { label: t("confirm"), value: "confirm", primary: true }]
      });
      if (confirm === "confirm") { storage.clearAll(); window.location.reload(); }
      return;
    }
    this.elements["dialog-extra"].querySelectorAll("[data-setting]").forEach(input => {
      this.settings[input.dataset.setting] = input.checked;
    });
    storage.saveSettings(this.settings);
    this.sound.setEnabled(this.settings.sound);
    if (this.state) {
      Object.assign(this.state.settings, {
        errorCheck: this.settings.errorCheck,
        hintsAllowed: this.settings.hintsAllowed,
        timer: this.settings.timer,
        autoNotes: this.settings.autoNotes
      });
      this.updateGameUI();
    }
  }

  importData(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const ok = storage.importData(JSON.parse(String(reader.result)));
        this.showToast(t(ok ? "dataImported" : "dataImportFailed"), !ok);
      } catch {
        this.showToast(t("dataImportFailed"), true);
      }
    };
    reader.readAsText(file);
  }

  showDialog({ title, copy = "", extraHTML = "", actions = [], dismissible = true }) {
    const el = this.elements;
    el["dialog-title"].textContent = title ?? "";
    el["dialog-copy"].textContent = copy ?? "";
    el["dialog-extra"].innerHTML = extraHTML ?? "";
    el["dialog-actions"].innerHTML = "";
    this.dialogDismissible = dismissible;
    el["dialog-backdrop"].hidden = false;

    return new Promise(resolve => {
      this.dialogResolve = resolve;
      for (const action of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = action.primary ? "button-primary" : "button-secondary";
        button.textContent = action.label;
        button.addEventListener("click", () => this.closeDialog(action.value));
        el["dialog-actions"].appendChild(button);
      }
    });
  }

  closeDialog(value) {
    if (this.dialogResolve) {
      const resolve = this.dialogResolve;
      this.dialogResolve = null;
      this.elements["dialog-backdrop"].hidden = true;
      resolve(value);
    }
  }

  showToast(message, isError = false) {
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  handleKeyboard(event) {
    if (!this.state || this.screen !== "game" || !this.elements["dialog-backdrop"].hidden) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target?.tagName)) return;
    const key = event.key;
    if (/^[0-9a-gA-G]$/.test(key)) {
      event.preventDefault();
      this.handleDigit(key);
      return;
    }
    const moves = {
      ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
      w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1]
    };
    const move = moves[key] ?? moves[key.toLowerCase()];
    if (move) {
      event.preventDefault();
      const size = this.state.spec.size;
      const row = Math.floor(this.state.cursor / size) + move[0];
      const col = (this.state.cursor % size) + move[1];
      if (row >= 0 && row < size && col >= 0 && col < size) {
        const cell = row * size + col;
        if (this.state.setCursor(cell)) this.board.focusCell(cell);
      }
      return;
    }
    const shortcuts = {
      n: () => this.toggleNotes(), h: () => this.showHint(),
      z: () => this.undo(), y: () => this.redo(),
      Backspace: () => this.erase(), Delete: () => this.erase(),
      " ": () => this.togglePause(), Escape: () => this.goHome()
    };
    const handler = shortcuts[key] ?? shortcuts[key.toLowerCase?.()];
    if (handler) { event.preventDefault(); handler(); }
  }
}

window.leleleSudoku = new SudokuApp();
