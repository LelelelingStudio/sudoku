/**
 * Lelele Sudoku - constraint propagation + backtracking solver.
 * Works for every board specification produced by buildSpec().
 */

import {
  buildSpec,
  candidateMask,
  cloneGrid,
  findConflicts,
  isSolved,
  maskToValues
} from "./constraints.js";

export function gridFromGivens(spec) {
  return cloneGrid(spec.givens);
}

function popCount(mask) {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count += 1;
  }
  return count;
}

/**
 * Deterministic propagation with naked singles and hidden singles.
 * Returns the list of cells assigned during this pass, or null on contradiction.
 */
export function propagate(spec, grid) {
  const trail = [];
  let changed = true;

  while (changed) {
    changed = false;

    for (const cell of spec.activeCells) {
      if (grid[cell]) continue;
      const mask = candidateMask(spec, grid, cell);
      if (!mask) {
        trail.forEach(index => { grid[index] = 0; });
        return null;
      }
      if (popCount(mask) === 1) {
        grid[cell] = maskToValues(mask)[0];
        trail.push(cell);
        changed = true;
      }
    }

    for (let u = 0; u < spec.units.length; u += 1) {
      const unit = spec.units[u];
      let placedMask = 0;
      for (const cell of unit) {
        if (grid[cell]) placedMask |= 1 << (grid[cell] - 1);
      }
      for (let value = 1; value <= spec.maxSymbol; value += 1) {
        const bit = 1 << (value - 1);
        if (placedMask & bit) continue;
        let location = -1;
        let count = 0;
        for (const cell of unit) {
          if (grid[cell]) continue;
          if (candidateMask(spec, grid, cell) & bit) {
            location = cell;
            count += 1;
            if (count > 1) break;
          }
        }
        if (count === 0) {
          trail.forEach(index => { grid[index] = 0; });
          return null;
        }
        if (count === 1) {
          grid[location] = value;
          trail.push(location);
          changed = true;
        }
      }
    }
  }

  return trail;
}

/**
 * Find up to `limit` solutions.
 * result.status: "unique" | "multiple" | "solved" | "contradiction" | "incomplete"
 */
export function solve(spec, startGrid, options = {}) {
  const limit = Math.max(1, options.limit ?? 1);
  const maxNodes = options.maxNodes ?? Number.POSITIVE_INFINITY;
  const shouldCancel = options.shouldCancel ?? (() => false);
  const grid = cloneGrid(startGrid);
  const solutions = [];
  const stats = { nodes: 0, propagated: 0, cancelled: false };

  function search() {
    if (solutions.length >= limit || stats.nodes >= maxNodes || shouldCancel()) {
      stats.cancelled = shouldCancel() || stats.nodes >= maxNodes;
      return;
    }
    stats.nodes += 1;

    const trail = propagate(spec, grid);
    if (trail === null) return;
    stats.propagated += trail.length;

    let target = -1;
    let bestMask = 0;
    let bestCount = Number.POSITIVE_INFINITY;
    let complete = true;
    for (const cell of spec.activeCells) {
      if (grid[cell]) continue;
      complete = false;
      const mask = candidateMask(spec, grid, cell);
      const count = popCount(mask);
      if (count < bestCount) {
        bestCount = count;
        bestMask = mask;
        target = cell;
        if (count <= 1) break;
      }
    }

    if (complete) {
      if (findConflicts(spec, grid).size === 0) solutions.push(cloneGrid(grid));
      undo(trail);
      return;
    }

    if (target >= 0 && bestCount > 0) {
      for (const value of maskToValues(bestMask)) {
        if (stats.nodes >= maxNodes || shouldCancel()) break;
        grid[target] = value;
        search();
        grid[target] = 0;
        if (solutions.length >= limit) break;
      }
    }

    undo(trail);
  }

  function undo(trail) {
    for (let i = trail.length - 1; i >= 0; i -= 1) grid[trail[i]] = 0;
  }

  search();

  let status;
  if (solutions.length >= limit) status = limit > 1 ? "multiple" : "solved";
  else if (solutions.length === 1) status = "unique";
  else if (stats.cancelled) status = "incomplete";
  else status = "contradiction";

  return { status, solutions, stats, solution: solutions[0] ?? null };
}

/** Count solutions up to a cap. */
export function countSolutions(spec, startGrid, cap = 2, options = {}) {
  return solve(spec, startGrid, { ...options, limit: cap }).solutions.length;
}

/** Convenience helper accepting a raw puzzle object. */
export function solvePuzzle(puzzle, options = {}) {
  const spec = puzzle && puzzle.units ? puzzle : buildSpec(puzzle);
  return solve(spec, gridFromGivens(spec), options);
}

export function hasUniqueSolution(spec, startGrid, options = {}) {
  return countSolutions(spec, startGrid, 2, options) === 1;
}

export function verifySolution(spec, grid) {
  return Boolean(grid) && isSolved(spec, grid);
}
