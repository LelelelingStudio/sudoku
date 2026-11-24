/**
 * Lelele Sudoku - versioned localStorage adapter.
 * All data is local; no account, cloud save or server is involved.
 */

import { DEFAULT_SETTINGS, SCHEMA_VERSION } from "./config.js";

export { DEFAULT_SETTINGS };

export const STORAGE_PREFIX = "lelele-sudoku:";
export const STORAGE_KEYS = Object.freeze({
  SETTINGS: "settings",
  STATISTICS: "statistics",
  SAVES: "saves",
  DAILY: "daily"
});

export function createEmptyStatistics() {
  return {
    version: SCHEMA_VERSION,
    gamesStarted: 0,
    gamesCompleted: 0,
    gamesAbandoned: 0,
    totalTimeMs: 0,
    totalMistakes: 0,
    totalHints: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastCompletedDate: null,
    bySize: {},
    byVariant: {},
    byDifficulty: {},
    byMode: {},
    dailyHistory: {}
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeSettings(input) {
  const result = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== "object") return result;
  const languages = ["en", "zh"];
  const difficulties = ["easy", "medium", "hard", "expert", "master"];
  const variants = ["classic", "diagonal", "jigsaw", "killer", "thermo", "consecutive", "windoku", "arrow", "samurai"];
  if (languages.includes(input.language)) result.language = input.language;
  for (const key of ["sound", "soundEffects", "animations", "autoNotes", "errorCheck", "hintsAllowed", "timer"]) {
    if (typeof input[key] === "boolean") result[key] = input[key];
  }
  if (difficulties.includes(input.difficulty)) result.difficulty = input.difficulty;
  if ([4, 6, 9, 16].includes(Number(input.boardSize))) result.boardSize = Number(input.boardSize);
  if (variants.includes(input.variant)) result.variant = input.variant;
  return result;
}

function sanitizeStatistics(input) {
  const base = createEmptyStatistics();
  if (!input || typeof input !== "object" || input.version !== SCHEMA_VERSION) return base;
  const numeric = [
    "gamesStarted", "gamesCompleted", "gamesAbandoned", "totalTimeMs",
    "totalMistakes", "totalHints", "currentStreak", "bestStreak"
  ];
  for (const key of numeric) {
    const value = Number(input[key]);
    if (Number.isFinite(value) && value >= 0) base[key] = value;
  }
  for (const key of ["bySize", "byVariant", "byDifficulty", "byMode", "dailyHistory"]) {
    if (input[key] && typeof input[key] === "object" && !Array.isArray(input[key])) {
      base[key] = clone(input[key]);
    }
  }
  base.lastCompletedDate = typeof input.lastCompletedDate === "string" ? input.lastCompletedDate : null;
  return base;
}

export class SudokuStorage {
  constructor(options = {}) {
    this.prefix = options.prefix ?? STORAGE_PREFIX;
    this.storage = options.storage ?? null;
    this.available = false;
    this.initialize();
  }

  initialize() {
    try {
      const target = this.storage ?? globalThis.localStorage;
      if (!target || typeof target.getItem !== "function") {
        this.available = false;
        return;
      }
      const probe = `${this.prefix}__probe__`;
      target.setItem(probe, "1");
      target.removeItem(probe);
      this.storage = target;
      this.available = true;
    } catch {
      this.available = false;
      this.storage = null;
    }
  }

  key(name) {
    return `${this.prefix}${name}`;
  }

  get(name, fallback = null) {
    if (!this.available) return fallback;
    try {
      const raw = this.storage.getItem(this.key(name));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  set(name, value) {
    if (!this.available) return false;
    try {
      this.storage.setItem(this.key(name), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(name) {
    if (!this.available) return false;
    try {
      this.storage.removeItem(this.key(name));
      return true;
    } catch {
      return false;
    }
  }

  getSettings() {
    return sanitizeSettings(this.get(STORAGE_KEYS.SETTINGS));
  }

  saveSettings(settings) {
    return this.set(STORAGE_KEYS.SETTINGS, sanitizeSettings(settings));
  }

  updateSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    return this.saveSettings(settings) ? settings : null;
  }

  getStatistics() {
    return sanitizeStatistics(this.get(STORAGE_KEYS.STATISTICS));
  }

  saveStatistics(statistics) {
    return this.set(STORAGE_KEYS.STATISTICS, sanitizeStatistics(statistics));
  }

  getSaves() {
    const saves = this.get(STORAGE_KEYS.SAVES, []);
    return Array.isArray(saves) ? saves.filter(item => item && item.id && item.state) : [];
  }

  getSave(id) {
    return this.getSaves().find(item => item.id === id) ?? null;
  }

  saveGame(state) {
    if (!state || !state.id) return false;
    const saves = this.getSaves().filter(item => item.id !== state.id);
    saves.unshift({ id: state.id, savedAt: Date.now(), state });
    const trimmed = saves.slice(0, 8);
    return this.set(STORAGE_KEYS.SAVES, trimmed);
  }

  deleteSave(id) {
    return this.set(STORAGE_KEYS.SAVES, this.getSaves().filter(item => item.id !== id));
  }

  clearSaves() {
    return this.remove(STORAGE_KEYS.SAVES);
  }

  getDailyRecords() {
    const value = this.get(STORAGE_KEYS.DAILY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  getDailyRecord(key) {
    return this.getDailyRecords()[key] ?? null;
  }

  setDailyRecord(key, record) {
    const records = this.getDailyRecords();
    records[key] = record;
    return this.set(STORAGE_KEYS.DAILY, records);
  }

  exportData() {
    return {
      application: "Lelele Sudoku",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      statistics: this.getStatistics(),
      saves: this.getSaves(),
      daily: this.getDailyRecords()
    };
  }

  importData(data) {
    if (!data || data.application !== "Lelele Sudoku") return false;
    let ok = true;
    if (data.settings) ok = this.saveSettings(data.settings) && ok;
    if (data.statistics) ok = this.saveStatistics(data.statistics) && ok;
    if (Array.isArray(data.saves)) ok = this.set(STORAGE_KEYS.SAVES, data.saves.slice(0, 8)) && ok;
    if (data.daily && typeof data.daily === "object") ok = this.set(STORAGE_KEYS.DAILY, data.daily) && ok;
    return ok;
  }

  clearAll() {
    if (!this.available) return false;
    let ok = true;
    for (const name of Object.values(STORAGE_KEYS)) ok = this.remove(name) && ok;
    try {
      const keys = [];
      for (let i = 0; i < this.storage.length; i += 1) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.prefix)) keys.push(key);
      }
      keys.forEach(key => this.storage.removeItem(key));
    } catch {
      ok = false;
    }
    return ok;
  }
}

export const storage = new SudokuStorage();
export function createStorage(options) {
  return new SudokuStorage(options);
}
