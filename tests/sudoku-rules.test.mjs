import test from "node:test";
import assert from "node:assert/strict";

import { buildSpec, findConflicts, isSolved, candidateMask } from "../src/constraints.js";
import { solve } from "../src/solver.js";
import { createGameState } from "../src/game-state.js";

const CLASSIC = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const grid = value => value.split("").map(Number);

test("correct solution passes every standard constraint", () => {
  const puzzle = { size: 9, variant: "classic", givens: grid(CLASSIC) };
  const spec = buildSpec(puzzle);
  assert.equal(findConflicts(spec, grid(SOLUTION)).size, 0);
  assert.equal(isSolved(spec, grid(SOLUTION)), true);
});

test("row, column and box duplicates are detected", () => {
  const spec = buildSpec({ size: 9, variant: "classic", givens: new Array(81).fill(0) });
  const base = grid(SOLUTION);
  base[1] = base[0];
  assert.ok(findConflicts(spec, base).has(1));
  const column = grid(SOLUTION);
  column[9] = column[0];
  assert.ok(findConflicts(spec, column).has(9));
  const box = grid(SOLUTION);
  box[10] = box[0];
  assert.ok(findConflicts(spec, box).has(10));
});

test("candidate masks exclude used digits", () => {
  const spec = buildSpec({ size: 9, variant: "classic", givens: grid(CLASSIC) });
  const board = grid(CLASSIC);
  const candidates = candidateMask(spec, board, 2);
  assert.equal((candidates & (1 << 4)) === 0, true); // digit 5 already in the row
  assert.equal((candidates & (1 << 2)) === 0, true); // digit 3 already in the box
  assert.equal((candidates & 1) !== 0, true); // digit 1 is still possible here
});

test("givens cannot be modified and completion is detected", () => {
  const puzzle = { size: 9, variant: "classic", givens: grid(CLASSIC), solution: grid(SOLUTION) };
  const state = createGameState(puzzle);
  assert.equal(state.setValue(0, 5), false);
  const Board = grid(SOLUTION);
  for (let cell = 0; cell < 81; cell += 1) {
    if (!puzzle.givens[cell]) state.setValue(cell, Board[cell]);
  }
  assert.equal(state.status, "completed");
  assert.equal(state.isComplete(), true);
});

test("unsolvable and multi-solution puzzles are distinguished", () => {
  const unsolvable = grid(CLASSIC);
  unsolvable[0] = 7;
  unsolvable[1] = 5;
  const spec = buildSpec({ size: 9, variant: "classic", givens: unsolvable });
  assert.equal(solve(spec, spec.givens, { limit: 1 }).status, "contradiction");
  const sparse = new Array(81).fill(0);
  const result = solve(spec, sparse, { limit: 2 });
  assert.equal(result.solutions.length, 2);
});

test("4x4 mini and 6x6 mini enforce their own box geometry", () => {
  for (const size of [4, 6]) {
    const spec = buildSpec({ size, variant: "classic", givens: new Array(size * size).fill(0) });
    assert.equal(spec.maxSymbol, size);
    assert.equal(spec.units.filter(kind => kind && spec.unitKinds[spec.units.indexOf(kind)] === "box").length > 0, true);
    const board = new Array(size * size).fill(0);
    board[0] = 1;
    board[1] = 1;
    assert.ok(findConflicts(spec, board).size > 0);
  }
});

test("16x16 mega uses A-G symbols and 4x4 boxes", () => {
  const spec = buildSpec({ size: 16, variant: "classic", givens: new Array(256).fill(0) });
  assert.equal(spec.maxSymbol, 16);
  assert.equal(spec.symbols[15], "G");
  assert.equal(spec.boxRows, 4);
  assert.equal(spec.boxCols, 4);
});

test("diagonal and windoku add real extra units", () => {
  const diagonal = buildSpec({ size: 9, variant: "diagonal", givens: new Array(81).fill(0), extra: { diagonal: true } });
  assert.ok(diagonal.unitKinds.includes("diagonal"));
  assert.ok(diagonal.peers[0].includes(80));
  const windoku = buildSpec({ size: 9, variant: "windoku", givens: new Array(81).fill(0), extra: { windoku: true } });
  assert.equal(windoku.unitKinds.filter(kind => kind === "window").length, 4);
});
