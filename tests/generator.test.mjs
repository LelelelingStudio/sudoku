import test from "node:test";
import assert from "node:assert/strict";

import { buildSpec, isSolved } from "../src/constraints.js";
import { solve } from "../src/solver.js";
import { generatePuzzle, createRng, hashSeed } from "../src/generator.js";
import { evaluateDifficulty } from "../src/difficulty.js";
import { dateKey, dailySeed, generateDailyPuzzle } from "../src/daily-challenge.js";

function assertValid(puzzle) {
  const spec = buildSpec(puzzle);
  assert.equal(isSolved(spec, puzzle.solution), true, "stored solution must satisfy all rules");
  const result = solve(spec, puzzle.givens, { limit: 2 });
  assert.equal(result.solutions.length, 1, "puzzle must have exactly one solution");
  puzzle.givens.forEach((value, index) => {
    if (value) assert.equal(value, puzzle.solution[index], "givens must match the solution");
  });
}

test("seeded RNG is deterministic and hashSeed is stable", () => {
  const a = createRng("seed");
  const b = createRng("seed");
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(hashSeed("abc"), hashSeed("abc"));
});

test("classic generator produces valid unique puzzles for all sizes", () => {
  for (const size of [4, 6, 9, 16]) {
    const puzzle = generatePuzzle({ size, variant: "classic", difficulty: "easy", seed: `size-${size}` });
    assert.equal(puzzle.size, size);
    assertValid(puzzle);
  }
});

test("five difficulty levels produce distinct actual ratings", () => {
  const ratings = [];
  for (const difficulty of ["easy", "medium", "hard", "expert", "master"]) {
    const puzzle = generatePuzzle({
      size: 9, variant: "classic", difficulty, seed: `difficulty-${difficulty}`
    });
    assertValid(puzzle);
    const evaluation = evaluateDifficulty(buildSpec(puzzle), puzzle.givens);
    assert.equal(evaluation.unsolvable, undefined);
    ratings.push(puzzle.meta.rating);
    assert.equal(puzzle.difficulty, difficulty);
  }
  assert.ok(ratings[0] < ratings[ratings.length - 1], "master must rate harder than easy");
});

test("same seed reproduces the same puzzle, different seeds differ", () => {
  const a = generatePuzzle({ size: 9, variant: "classic", difficulty: "easy", seed: "repeat" });
  const b = generatePuzzle({ size: 9, variant: "classic", difficulty: "easy", seed: "repeat" });
  const c = generatePuzzle({ size: 9, variant: "classic", difficulty: "easy", seed: "other" });
  assert.equal(a.givens.join(""), b.givens.join(""));
  assert.notEqual(a.givens.join(""), c.givens.join(""));
});

test("daily challenge is deterministic for a local date", () => {
  const date = new Date(2026, 10, 24, 12, 0, 0);
  const key = dateKey(date);
  assert.equal(key, "2026-11-24");
  assert.ok(dailySeed(key, { size: 9 }).includes(key));
  const a = generateDailyPuzzle({ size: 9, difficulty: "easy" }, date);
  const b = generateDailyPuzzle({ size: 9, difficulty: "easy" }, date);
  assert.equal(a.givens.join(""), b.givens.join(""));
  assert.equal(a.meta.dailyKey, key);
  assertValid(a);
});

test("generation honours cancellation", () => {
  assert.doesNotThrow(() => generatePuzzle({
    size: 9, variant: "classic", difficulty: "easy", seed: "cancel",
    shouldCancel: () => false
  }));
  assert.throws(() => generatePuzzle({
    size: 9, variant: "classic", difficulty: "easy", seed: "cancel",
    shouldCancel: () => true
  }), /CANCELLED/);
});
