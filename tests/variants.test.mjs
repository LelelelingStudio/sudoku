import test from "node:test";
import assert from "node:assert/strict";

import { buildSpec, findConflicts, isSolved } from "../src/constraints.js";
import { solve } from "../src/solver.js";
import { generatePuzzle } from "../src/generator.js";

function generated(variant, difficulty = "easy") {
  const puzzle = generatePuzzle({ size: 9, variant, difficulty, seed: `variant-${variant}-${difficulty}`, maxAttempts: 8 });
  const spec = buildSpec(puzzle);
  assert.equal(isSolved(spec, puzzle.solution), true, `${variant} solution must be legal`);
  assert.equal(solve(spec, puzzle.givens, { limit: 2 }).solutions.length, 1, `${variant} must be unique`);
  return { puzzle, spec };
}

test("diagonal enforces both diagonals", () => {
  const { spec, puzzle } = generated("diagonal");
  assert.equal(puzzle.extra.diagonal, true);
  assert.ok(spec.peers[0].includes(80));
  const board = puzzle.solution.slice();
  board[9] = board[0];
  assert.ok(findConflicts(spec, board).has(9));
});

test("jigsaw generates connected irregular regions used by the solver", () => {
  const { spec, puzzle } = generated("jigsaw");
  assert.equal(puzzle.regions.length, 9);
  assert.ok(puzzle.regions.every(region => region.length === 9));
  const regionIndex = puzzle.regions[0][0];
  const partner = puzzle.regions[0][1];
  assert.ok(spec.peers[regionIndex].includes(partner));
});

test("killer cages enforce sums and cage uniqueness", () => {
  const { spec, puzzle } = generated("killer");
  assert.ok(puzzle.extra.cages.length > 0);
  const wrong = { ...puzzle, extra: { cages: puzzle.extra.cages.map((cage, index) => index === 0 ? { ...cage, sum: cage.sum + 1 } : cage) } };
  const wrongSpec = buildSpec(wrong);
  assert.ok(findConflicts(wrongSpec, puzzle.solution).size > 0);
});

test("thermo paths enforce strictly increasing digits", () => {
  const { spec, puzzle } = generated("thermo");
  assert.ok(puzzle.extra.thermos.length > 0);
  const path = puzzle.extra.thermos[0];
  assert.ok(path.length >= 3);
  const board = puzzle.solution.slice();
  const first = board[path[0]];
  board[path[0]] = board[path[1]];
  board[path[1]] = first;
  assert.ok(findConflicts(spec, board).size > 0);
});

test("consecutive edges enforce distance exactly one", () => {
  const { spec, puzzle } = generated("consecutive");
  assert.ok(puzzle.extra.consecutiveEdges.length > 0);
  const [a, b] = puzzle.extra.consecutiveEdges[0];
  const board = puzzle.solution.slice();
  board[b] = board[a];
  assert.ok(findConflicts(spec, board).has(b));
});

test("windoku adds four extra 3x3 units", () => {
  const { spec, puzzle } = generated("windoku");
  assert.equal(puzzle.extra.windoku, true);
  assert.equal(spec.unitKinds.filter(kind => kind === "window").length, 4);
  const board = puzzle.solution.slice();
  board[10] = board[11];
  assert.ok(findConflicts(spec, board).size > 0);
});

test("arrow circles equal the sum of their paths", () => {
  const { spec, puzzle } = generated("arrow");
  assert.ok(puzzle.extra.arrows.length > 0);
  const arrow = puzzle.extra.arrows[0];
  const board = puzzle.solution.slice();
  board[arrow.circle] = board[arrow.circle] === 9 ? 8 : board[arrow.circle] + 1;
  assert.ok(findConflicts(spec, board).has(arrow.circle));
});

test("samurai grids share real overlap cells", () => {
  const { puzzle, spec } = generated("samurai", "easy");
  assert.equal(puzzle.givens.length, 441);
  assert.equal(spec.activeCells.length, 369);
  assert.equal(puzzle.samurai.boards.length, 5);
  // 重叠格 6,6 同时属于左上盘与中心盘，因此拥有两套行/列/宫约束。
  assert.ok(spec.cellUnits[6 * 21 + 6].length >= 6);
  const solution = puzzle.solution.slice();
  solution[132] = solution[132] === 9 ? 8 : solution[132] + 1;
  assert.ok(findConflicts(spec, solution).has(132));
});

test("mega 16x16 and mini boards keep unique solutions", () => {
  for (const size of [4, 6, 16]) {
    const puzzle = generatePuzzle({ size, variant: "classic", difficulty: "easy", seed: `mega-${size}` });
    const spec = buildSpec(puzzle);
    assert.equal(isSolved(spec, puzzle.solution), true);
    assert.equal(solve(spec, puzzle.givens, { limit: 2 }).solutions.length, 1);
  }
});
