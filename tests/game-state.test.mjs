import test from "node:test";
import assert from "node:assert/strict";

import { createGameState, SudokuGameState } from "../src/game-state.js";
import { generatePuzzle } from "../src/generator.js";

const puzzle = generatePuzzle({ size: 9, variant: "classic", difficulty: "easy", seed: "state-test" });

function firstEmpty(state) {
  return state.spec.activeCells.find(cell => !state.values[cell]);
}

test("input, undo and redo restore values and notes", () => {
  const state = createGameState(puzzle);
  const cell = firstEmpty(state);
  const correct = puzzle.solution[cell];
  const wrong = correct === 9 ? 8 : correct + 1;
  state.setValue(cell, wrong);
  assert.equal(state.values[cell], wrong);
  assert.equal(state.mistakes, 1);
  state.setNotesMode(true);
  state.toggleNote(cell + 1, 3);
  assert.ok(state.notes[cell + 1].includes(3));
  state.undo();
  assert.equal(state.values[cell], wrong);
  assert.equal(state.notes[cell + 1].length, 0);
  state.undo();
  assert.equal(state.values[cell], 0);
  state.redo();
  assert.equal(state.values[cell], wrong);
  state.redo();
  assert.deepEqual(state.notes[cell + 1], [3]);
});

test("notes mode toggles candidates and erase clears the cell", () => {
  const state = createGameState(puzzle);
  const cell = firstEmpty(state);
  state.setNotesMode(true);
  state.toggleNote(cell, 2);
  state.toggleNote(cell, 5);
  assert.deepEqual(state.notes[cell], [2, 5]);
  state.toggleNote(cell, 2);
  assert.deepEqual(state.notes[cell], [5]);
  state.erase(cell);
  assert.equal(state.notes[cell].length, 0);
});

test("hints reveal the stored solution and count themselves", () => {
  const state = createGameState(puzzle);
  const result = state.useHint();
  assert.ok(result);
  assert.equal(state.values[result.cell], puzzle.solution[result.cell]);
  assert.equal(state.hintsUsed, 1);
  assert.ok(state.hintCells.includes(result.cell));
});

test("completion, pause and restart are reflected in status", () => {
  const state = createGameState(puzzle);
  state.pause();
  assert.equal(state.status, "paused");
  assert.equal(state.setValue(firstEmpty(state), 1), false);
  state.resume();
  for (const cell of state.spec.activeCells) {
    if (!puzzle.givens[cell]) state.setValue(cell, puzzle.solution[cell]);
  }
  assert.equal(state.status, "completed");
  assert.equal(state.isComplete(), true);
  state.reset();
  assert.equal(state.status, "playing");
  assert.equal(state.mistakes, 0);
});

test("serialize and restore keep the full editable state", () => {
  const state = createGameState(puzzle, { id: "save-test" });
  const cell = firstEmpty(state);
  state.setValue(cell, puzzle.solution[cell]);
  state.toggleNote(firstEmpty(state), 7);
  const saved = state.serialize();
  const restored = SudokuGameState.fromJSON(saved);
  assert.ok(restored);
  assert.equal(restored.id, "save-test");
  assert.equal(restored.values.join(""), state.values.join(""));
  assert.deepEqual(restored.notes, state.notes);
  assert.equal(restored.canUndo(), true);
});

test("auto candidates produce real candidate lists", () => {
  const state = createGameState(puzzle, { autoNotes: true });
  const empty = firstEmpty(state);
  assert.ok(state.notes[empty].length > 0);
  assert.ok(state.notes[empty].every(value => value >= 1 && value <= 9));
});

test("timeout marks a failed time-attack game", () => {
  const state = createGameState(puzzle, { mode: "time-attack" });
  assert.equal(state.timeOut(), true);
  assert.equal(state.status, "failed");
});
