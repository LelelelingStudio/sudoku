/**
 * Lelele Sudoku - game state machine.
 * Owns values, notes, undo/redo, mistakes, hints, timer accounting and saves.
 * Rules live in constraints.js; this module never decides what is legal.
 */

import { buildSpec, candidates, findConflicts, isSolved } from "./constraints.js";
import { SCHEMA_VERSION, TIME_ATTACK_SECONDS } from "./config.js";

function cloneNotes(notes) {
  return notes.map(list => list.slice());
}

export class SudokuGameState {
  constructor(puzzle, options = {}) {
    if (!puzzle || !Array.isArray(puzzle.givens) || !Array.isArray(puzzle.solution)) {
      throw new Error("Invalid puzzle");
    }
    this.spec = buildSpec(puzzle);
    this.puzzle = puzzle;
    this.id = options.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.mode = options.mode ?? puzzle.mode ?? "classic";
    this.settings = {
      errorCheck: options.errorCheck !== false,
      hintsAllowed: options.hintsAllowed !== false,
      timer: options.timer !== false,
      autoNotes: options.autoNotes === true
    };
    this.settings.difficulty = puzzle.difficulty ?? "medium";
    this.values = this.spec.givens.slice();
    this.notes = Array.from({ length: this.spec.cellCount }, () => []);
    this.cursor = this.spec.activeCells.find(cell => !this.values[cell]) ?? this.spec.activeCells[0] ?? -1;
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.elapsedMs = 0;
    this.status = "playing";
    this.history = [];
    this.future = [];
    this.hintCells = [];
    this.startedAt = Date.now();
    this.completedAt = null;
    this.timeLimitMs = this.mode === "time-attack"
      ? (TIME_ATTACK_SECONDS[puzzle.difficulty] ?? 480) * 1000
      : 0;
    this.listeners = new Set();
    this.notesMode = false;
    if (this.settings.autoNotes) this.refreshAutoNotes();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type = "change") {
    this.listeners.forEach(listener => listener(this, type));
  }

  isGiven(cell) {
    return this.spec.givens[cell] !== 0;
  }

  isActive(cell) {
    return this.spec.active[cell] === true;
  }

  snapshot() {
    return {
      values: this.values.slice(),
      notes: cloneNotes(this.notes),
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      cursor: this.cursor,
      hintCells: this.hintCells.slice()
    };
  }

  restore(snapshot) {
    this.values = snapshot.values.slice();
    this.notes = cloneNotes(snapshot.notes);
    this.mistakes = snapshot.mistakes;
    this.hintsUsed = snapshot.hintsUsed;
    this.cursor = snapshot.cursor;
    this.hintCells = snapshot.hintCells.slice();
  }

  record() {
    this.history.push(this.snapshot());
    if (this.history.length > 300) this.history.shift();
    this.future.length = 0;
  }

  canUndo() { return this.history.length > 0; }
  canRedo() { return this.future.length > 0; }

  setCursor(cell) {
    if (!this.isActive(cell)) return false;
    this.cursor = cell;
    this.emit("cursor");
    return true;
  }

  setNotesMode(enabled) {
    this.notesMode = Boolean(enabled);
    this.emit("mode");
    return this.notesMode;
  }

  setValue(cell, value) {
    if (this.status !== "playing" || !this.isActive(cell) || this.isGiven(cell)) return false;
    const numeric = Number(value) || 0;
    if (this.notesMode && numeric > 0) return this.toggleNote(cell, numeric);
    if (numeric === this.values[cell]) return false;

    this.record();
    this.values[cell] = numeric;
    this.notes[cell] = [];
    this.hintCells = this.hintCells.filter(index => index !== cell);
    if (this.settings.errorCheck && numeric > 0 && numeric !== this.puzzle.solution[cell]) {
      this.mistakes += 1;
    }
    if (numeric && this.settings.autoNotes) {
      for (const peer of this.spec.peers[cell]) {
        this.notes[peer] = this.notes[peer].filter(note => note !== numeric);
      }
    }
    this.emit("value");
    this.checkComplete();
    return true;
  }

  toggleNote(cell, value) {
    if (this.status !== "playing" || !this.isActive(cell) || this.isGiven(cell)) return false;
    const numeric = Number(value) || 0;
    if (numeric < 1 || numeric > this.spec.maxSymbol || this.values[cell]) return false;
    this.record();
    const list = this.notes[cell];
    const index = list.indexOf(numeric);
    if (index >= 0) list.splice(index, 1);
    else {
      list.push(numeric);
      list.sort((a, b) => a - b);
    }
    this.emit("notes");
    return true;
  }

  erase(cell) {
    if (this.status !== "playing" || !this.isActive(cell) || this.isGiven(cell)) return false;
    if (!this.values[cell] && !this.notes[cell].length) return false;
    this.record();
    this.values[cell] = 0;
    this.notes[cell] = [];
    this.emit("erase");
    return true;
  }

  undo() {
    if (!this.canUndo() || this.status !== "playing") return false;
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
    this.emit("undo");
    return true;
  }

  redo() {
    if (!this.canRedo() || this.status !== "playing") return false;
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
    this.emit("redo");
    return true;
  }

  useHint() {
    if (this.status !== "playing" || !this.settings.hintsAllowed) return null;
    let target = this.cursor;
    if (!this.isActive(target) || this.values[target] || this.isGiven(target)) {
      target = this.spec.activeCells.find(cell => !this.values[cell]) ?? -1;
    }
    if (target < 0) return null;
    const value = this.puzzle.solution[target];
    this.record();
    this.values[target] = value;
    this.notes[target] = [];
    this.hintsUsed += 1;
    this.hintCells.push(target);
    this.cursor = target;
    this.emit("hint");
    this.checkComplete();
    return { cell: target, value };
  }

  refreshAutoNotes() {
    for (const cell of this.spec.activeCells) {
      if (this.values[cell] || this.isGiven(cell)) {
        this.notes[cell] = [];
      } else {
        this.notes[cell] = candidates(this.spec, this.values, cell);
      }
    }
    this.emit("notes");
  }

  getConflicts() {
    return findConflicts(this.spec, this.values);
  }

  getWrongCells() {
    if (!this.settings.errorCheck) return new Set();
    const wrong = new Set();
    for (const cell of this.spec.activeCells) {
      if (this.values[cell] && this.values[cell] !== this.puzzle.solution[cell]) wrong.add(cell);
    }
    return wrong;
  }

  isComplete() {
    return isSolved(this.spec, this.values);
  }

  checkComplete() {
    if (this.status === "playing" && this.isComplete()) {
      this.status = "completed";
      this.completedAt = Date.now();
      this.emit("complete");
      return true;
    }
    return false;
  }

  timeOut() {
    if (this.status !== "playing") return false;
    this.status = "failed";
    this.emit("timeout");
    return true;
  }

  pause() {
    if (this.status !== "playing") return false;
    this.status = "paused";
    this.emit("pause");
    return true;
  }

  resume() {
    if (this.status !== "paused") return false;
    this.status = "playing";
    this.emit("resume");
    return true;
  }

  tick(deltaMs) {
    if (this.status !== "playing" || !this.settings.timer) return;
    this.elapsedMs += Math.max(0, deltaMs);
  }

  reset() {
    this.record();
    this.values = this.spec.givens.slice();
    this.notes = Array.from({ length: this.spec.cellCount }, () => []);
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.hintCells = [];
    this.elapsedMs = 0;
    this.status = "playing";
    this.completedAt = null;
    if (this.settings.autoNotes) this.refreshAutoNotes();
    this.emit("reset");
  }

  serialize() {
    return {
      version: SCHEMA_VERSION,
      id: this.id,
      puzzle: this.puzzle,
      mode: this.mode,
      settings: { ...this.settings },
      values: this.values.slice(),
      notes: cloneNotes(this.notes),
      cursor: this.cursor,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      elapsedMs: this.elapsedMs,
      status: this.status === "paused" ? "playing" : this.status,
      history: this.history.map(snapshot => ({
        values: snapshot.values.slice(),
        notes: cloneNotes(snapshot.notes),
        mistakes: snapshot.mistakes,
        hintsUsed: snapshot.hintsUsed,
        cursor: snapshot.cursor,
        hintCells: snapshot.hintCells.slice()
      })),
      future: this.future.map(snapshot => ({
        values: snapshot.values.slice(),
        notes: cloneNotes(snapshot.notes),
        mistakes: snapshot.mistakes,
        hintsUsed: snapshot.hintsUsed,
        cursor: snapshot.cursor,
        hintCells: snapshot.hintCells.slice()
      })),
      hintCells: this.hintCells.slice(),
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  static fromJSON(data) {
    if (!data || data.version !== SCHEMA_VERSION || !data.puzzle) return null;
    const state = new SudokuGameState(data.puzzle, {
      id: data.id,
      mode: data.mode,
      ...(data.settings ?? {})
    });
    state.values = data.values.slice();
    state.notes = cloneNotes(data.notes ?? []);
    state.cursor = data.cursor ?? state.cursor;
    state.mistakes = Number(data.mistakes) || 0;
    state.hintsUsed = Number(data.hintsUsed) || 0;
    state.elapsedMs = Number(data.elapsedMs) || 0;
    state.status = data.status === "completed" || data.status === "failed" ? data.status : "playing";
    state.history = Array.isArray(data.history) ? data.history : [];
    state.future = Array.isArray(data.future) ? data.future : [];
    state.hintCells = Array.isArray(data.hintCells) ? data.hintCells : [];
    state.startedAt = Number(data.startedAt) || Date.now();
    state.completedAt = data.completedAt ?? null;
    return state;
  }
}

export function createGameState(puzzle, options) {
  return new SudokuGameState(puzzle, options);
}
