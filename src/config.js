/**
 * Lelele Sudoku - static game configuration.
 * All board sizes, symbols, variants, modes and difficulties are data driven.
 */

export const SCHEMA_VERSION = 2;

export const BOARD_PRESETS = Object.freeze({
  4: Object.freeze({ size: 4, boxRows: 2, boxCols: 2 }),
  6: Object.freeze({ size: 6, boxRows: 2, boxCols: 3 }),
  9: Object.freeze({ size: 9, boxRows: 3, boxCols: 3 }),
  16: Object.freeze({ size: 16, boxRows: 4, boxCols: 4 })
});

export const HEX_SYMBOLS = Object.freeze([
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G"
]);

export const DIFFICULTIES = Object.freeze([
  "easy", "medium", "hard", "expert", "master"
]);

export const VARIANTS = Object.freeze([
  "classic", "diagonal", "jigsaw", "killer", "thermo",
  "consecutive", "windoku", "arrow", "samurai"
]);

export const MODES = Object.freeze([
  "classic", "daily", "time-attack", "variant"
]);

export const VARIANT_RULE_KEYS = Object.freeze({
  classic: "variantClassicDesc",
  diagonal: "variantDiagonalDesc",
  jigsaw: "variantJigsawDesc",
  killer: "variantKillerDesc",
  thermo: "variantThermoDesc",
  consecutive: "variantConsecutiveDesc",
  windoku: "variantWindokuDesc",
  arrow: "variantArrowDesc",
  samurai: "variantSamuraiDesc"
});

export const VARIANT_NAMES = Object.freeze({
  classic: "variantClassic",
  diagonal: "variantDiagonal",
  jigsaw: "variantJigsaw",
  killer: "variantKiller",
  thermo: "variantThermo",
  consecutive: "variantConsecutive",
  windoku: "variantWindoku",
  arrow: "variantArrow",
  samurai: "variantSamurai"
});

/** Time attack seconds by difficulty. */
export const TIME_ATTACK_SECONDS = Object.freeze({
  easy: 600,
  medium: 480,
  hard: 420,
  expert: 360,
  master: 300
});

export const DEFAULT_SETTINGS = Object.freeze({
  language: "en",
  sound: true,
  soundEffects: true,
  animations: true,
  autoNotes: false,
  errorCheck: true,
  hintsAllowed: true,
  timer: true,
  difficulty: "medium",
  boardSize: 9,
  variant: "classic"
});

export function getPreset(size) {
  return BOARD_PRESETS[Number(size)] ?? BOARD_PRESETS[9];
}

export function symbolsFor(size) {
  const n = Number(size);
  if (n === 16) return HEX_SYMBOLS.slice();
  if (n === 9) return HEX_SYMBOLS.slice(0, 9);
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

export function labelFor(size, value) {
  const symbols = symbolsFor(size);
  return symbols[value - 1] ?? "";
}

export function parseSymbol(size, text) {
  const key = String(text ?? "").trim().toUpperCase();
  const symbols = symbolsFor(size);
  const index = symbols.indexOf(key);
  return index < 0 ? 0 : index + 1;
}

export function isValidVariant(variant) {
  return VARIANTS.includes(variant);
}

export function isValidDifficulty(difficulty) {
  return DIFFICULTIES.includes(difficulty);
}

export function isValidMode(mode) {
  return MODES.includes(mode);
}

export function normalizeSetup(setup = {}) {
  const size = BOARD_PRESETS[Number(setup.size)] ? Number(setup.size) : 9;
  const variant = isValidVariant(setup.variant) ? setup.variant : "classic";
  return {
    size,
    variant,
    difficulty: isValidDifficulty(setup.difficulty) ? setup.difficulty : "medium",
    mode: isValidMode(setup.mode) ? setup.mode : "classic",
    errorCheck: setup.errorCheck !== false,
    hintsAllowed: setup.hintsAllowed !== false,
    timer: setup.timer !== false,
    autoNotes: setup.autoNotes === true
  };
}
