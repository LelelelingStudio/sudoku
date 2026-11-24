import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(String(key), String(value)); },
  removeItem(key) { values.delete(key); },
  clear() { values.clear(); }
};

const { createStorage, createEmptyStatistics } = await import("../src/storage.js");
const { createStatistics } = await import("../src/statistics.js");

test("settings are sanitized and persisted under the sudoku prefix", () => {
  values.clear();
  const storage = createStorage();
  assert.equal(storage.available, true);
  const saved = storage.saveSettings({ language: "xx", difficulty: "impossible", sound: false, boardSize: 99 });
  assert.equal(saved, true);
  const settings = storage.getSettings();
  assert.equal(settings.language, "en");
  assert.equal(settings.difficulty, "medium");
  assert.equal(settings.sound, false);
  assert.equal(settings.boardSize, 9);
  assert.equal(values.has("lelele-sudoku:settings"), true);
});

test("statistics record completion, streaks and per-difficulty best time", () => {
  values.clear();
  const storage = createStorage();
  const statistics = createStatistics(storage);
  statistics.recordStart({ size: 9, variant: "classic", difficulty: "medium", mode: "classic" });
  statistics.recordCompletion(
    { size: 9, variant: "classic", difficulty: "medium", mode: "classic" },
    { completed: true, elapsedMs: 120000, mistakes: 2, hints: 1 }
  );
  const summary = statistics.getSummary();
  assert.equal(summary.gamesStarted, 1);
  assert.equal(summary.gamesCompleted, 1);
  assert.equal(summary.winRate, 100);
  assert.equal(summary.currentStreak, 1);
  assert.equal(summary.byDifficulty.medium.bestTimeMs, 120000);
  assert.equal(summary.dailyHistory && typeof summary.dailyHistory, "object");
});

test("export and import round-trip local data", () => {
  values.clear();
  const storage = createStorage();
  storage.saveSettings({ language: "zh" });
  const exported = storage.exportData();
  assert.equal(exported.application, "Lelele Sudoku");
  values.clear();
  assert.equal(storage.importData(exported), true);
  assert.equal(storage.getSettings().language, "zh");
  assert.equal(storage.importData({ application: "Other Game" }), false);
});

test("saves and daily records survive a new storage instance", () => {
  values.clear();
  const storage = createStorage();
  storage.saveGame({ id: "a", puzzle: {}, values: [] });
  storage.setDailyRecord("2026-11-24", { completed: true });
  const next = createStorage();
  assert.equal(next.getSaves().length, 1);
  assert.equal(next.getDailyRecord("2026-11-24").completed, true);
  next.deleteSave("a");
  assert.equal(next.getSaves().length, 0);
});

test("corrupt data cannot break startup", () => {
  values.clear();
  values.set("lelele-sudoku:settings", "{broken");
  values.set("lelele-sudoku:statistics", "null");
  const storage = createStorage();
  assert.deepEqual(storage.getSettings().language, "en");
  assert.deepEqual(storage.getStatistics(), createEmptyStatistics());
});

test("clearAll removes every sudoku key but keeps unrelated data", () => {
  values.clear();
  values.set("other-app:keep", "1");
  const storage = createStorage();
  storage.saveSettings({});
  storage.saveGame({ id: "x", values: [] });
  assert.equal(storage.clearAll(), true);
  assert.equal(values.has("other-app:keep"), true);
  assert.equal(storage.getSaves().length, 0);
});
