/** Deterministic daily puzzles, keyed by the player's LOCAL calendar date. */
import { normalizeSetup } from "./config.js";
import { generatePuzzle } from "./generator.js";

export function dateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailySeed(key, setup = {}) {
  const s = normalizeSetup(setup);
  return `daily:${key}:${s.size}:${s.variant}:${s.difficulty}`;
}

export function generateDailyPuzzle(setup = {}, date = new Date()) {
  const key = dateKey(date);
  const s = normalizeSetup(setup);
  const puzzle = generatePuzzle({
    size: s.size,
    variant: s.variant,
    difficulty: s.difficulty,
    seed: dailySeed(key, s),
    extra: setup.extra
  });
  puzzle.meta.dailyKey = key;
  return puzzle;
}

export function dailyLabelKey() {
  return "dailyChallenge";
}
