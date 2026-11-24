import test from "node:test";
import assert from "node:assert/strict";

import { buildSpec, isSolved } from "../src/constraints.js";
import { solve, solvePuzzle } from "../src/solver.js";
import { findNextTechnique, solveWithTechniques, TECHNIQUES } from "../src/techniques.js";
import { generatePuzzle } from "../src/generator.js";

const CLASSIC = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const grid = value => value.split("").map(Number);

test("solver finds the known answer", () => {
  const result = solvePuzzle({ size: 9, variant: "classic", givens: grid(CLASSIC) });
  assert.equal(result.status, "solved");
  assert.equal(result.solution.join(""), SOLUTION);
});

test("solution counting stops at the requested cap", () => {
  const spec = buildSpec({ size: 9, variant: "classic", givens: new Array(81).fill(0) });
  assert.equal(solve(spec, spec.givens, { limit: 2 }).solutions.length, 2);
  assert.equal(solve(spec, spec.givens, { limit: 1 }).solutions.length, 1);
});

test("all ten required human techniques are declared", () => {
  const ids = TECHNIQUES.map(item => item.id);
  for (const required of [
    "nakedSingle", "hiddenSingle", "nakedPair", "hiddenPair", "nakedTriple",
    "pointingPair", "boxLineReduction", "xWing", "swordfish", "xyWing"
  ]) {
    assert.ok(ids.includes(required), `${required} missing`);
  }
});

test("a real naked single is found on the classic puzzle", () => {
  const spec = buildSpec({ size: 9, variant: "classic", givens: grid(CLASSIC) });
  const technique = findNextTechnique(spec, spec.givens);
  assert.ok(technique);
  assert.equal(technique.id, "nakedSingle");
  assert.equal(technique.cells.length, 1);
  assert.ok(technique.value >= 1 && technique.value <= 9);
});

test("technique solving makes genuine progress on an easy puzzle", () => {
  const puzzle = generatePuzzle({ size: 9, variant: "classic", difficulty: "easy", seed: "solver-test" });
  const spec = buildSpec(puzzle);
  const result = solveWithTechniques(spec, spec.givens, { maxSteps: 300 });
  assert.ok(result.steps.length > 0);
  assert.equal(isSolved(spec, result.grid), true);
  assert.ok(Object.keys(result.usedTechniques).length >= 1);
});
