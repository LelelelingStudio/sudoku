/**
 * Lelele Sudoku - generic board specification and constraint validation.
 *
 * A "spec" is the immutable, derived representation of a puzzle. It turns any
 * supported board (sizes, jigsaw regions, Samurai overlap, variant rules) into
 * units, peer cells and candidate masks so the solver and the UI share exactly
 * the same rules.
 */

import { getPreset, symbolsFor } from "./config.js";

export function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function pushUnit(store, unit) {
  const unique = [...new Set(unit)].filter(Number.isInteger);
  if (unique.length > 1) {
    store.push(unique);
    return unique;
  }
  return null;
}

function buildSamuraiGeometry(puzzle) {
  const boards = puzzle.samurai?.boards ?? [
    { top: 0, left: 0 },
    { top: 0, left: 12 },
    { top: 6, left: 6 },
    { top: 12, left: 0 },
    { top: 12, left: 12 }
  ];
  const gridSize = puzzle.samurai?.gridSize ?? 21;
  const active = new Array(gridSize * gridSize).fill(false);
  for (const board of boards) {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        active[(board.top + r) * gridSize + board.left + c] = true;
      }
    }
  }
  return { boards, gridSize, active };
}

/**
 * Build an immutable derived specification from a serialisable puzzle.
 * Puzzle shape: { size, boxRows, boxCols, variant, givens, regions?, extra?, samurai? }
 */
export function buildSpec(puzzle) {
  if (!puzzle || !Array.isArray(puzzle.givens)) {
    throw new Error("Invalid puzzle: givens must be an array");
  }

  const variant = puzzle.variant ?? "classic";
  const samurai = variant === "samurai" ? buildSamuraiGeometry(puzzle) : null;
  const size = samurai ? samurai.gridSize : Number(puzzle.size ?? 9);
  const preset = getPreset(puzzle.size ?? 9);
  const boxRows = preset.boxRows;
  const boxCols = preset.boxCols;
  const cellCount = size * size;
  const symbols = samurai ? symbolsFor(9) : symbolsFor(size);
  const maxSymbol = symbols.length;
  const active = samurai
    ? samurai.active
    : new Array(cellCount).fill(true);
  const givens = new Array(cellCount).fill(0);
  for (let i = 0; i < Math.min(puzzle.givens.length, cellCount); i += 1) {
    givens[i] = Number(puzzle.givens[i]) || 0;
  }

  const units = [];
  const unitKinds = [];

  if (samurai) {
    for (const board of samurai.boards) {
      for (let r = 0; r < 9; r += 1) {
        const row = [];
        for (let c = 0; c < 9; c += 1) {
          row.push((board.top + r) * size + board.left + c);
        }
        pushUnit(units, row);
        unitKinds.push("row");
      }
      for (let c = 0; c < 9; c += 1) {
        const col = [];
        for (let r = 0; r < 9; r += 1) {
          col.push((board.top + r) * size + board.left + c);
        }
        pushUnit(units, col);
        unitKinds.push("column");
      }
      for (let br = 0; br < 3; br += 1) {
        for (let bc = 0; bc < 3; bc += 1) {
          const box = [];
          for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
              box.push((board.top + br * 3 + r) * size + board.left + bc * 3 + c);
            }
          }
          pushUnit(units, box);
          unitKinds.push("box");
        }
      }
    }
  } else {
    for (let r = 0; r < size; r += 1) {
      const row = [];
      for (let c = 0; c < size; c += 1) row.push(r * size + c);
      pushUnit(units, row);
      unitKinds.push("row");
    }
    for (let c = 0; c < size; c += 1) {
      const col = [];
      for (let r = 0; r < size; r += 1) col.push(r * size + c);
      pushUnit(units, col);
      unitKinds.push("column");
    }

    if (Array.isArray(puzzle.regions) && puzzle.regions.length) {
      for (const region of puzzle.regions) {
        pushUnit(units, region);
        unitKinds.push("region");
      }
    } else {
      const regionRows = variant === "jigsaw" ? boxRows : boxRows;
      for (let br = 0; br < size / regionRows; br += 1) {
        for (let bc = 0; bc < size / boxCols; bc += 1) {
          const box = [];
          for (let r = 0; r < regionRows; r += 1) {
            for (let c = 0; c < boxCols; c += 1) {
              box.push((br * regionRows + r) * size + bc * boxCols + c);
            }
          }
          pushUnit(units, box);
          unitKinds.push("box");
        }
      }
    }

    const extra = puzzle.extra ?? {};
    if (extra.diagonal === true) {
      const main = [];
      const anti = [];
      for (let i = 0; i < size; i += 1) {
        main.push(i * size + i);
        anti.push(i * size + (size - 1 - i));
      }
      pushUnit(units, main);
      unitKinds.push("diagonal");
      pushUnit(units, anti);
      unitKinds.push("diagonal");
    }
    if (extra.windoku === true && size === 9) {
      for (const top of [1, 5]) {
        for (const left of [1, 5]) {
          const window = [];
          for (let r = 0; r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
              window.push((top + r) * size + left + c);
            }
          }
          pushUnit(units, window);
          unitKinds.push("window");
        }
      }
    }
  }

  const peerSets = Array.from({ length: cellCount }, () => new Set());
  const cellUnits = Array.from({ length: cellCount }, () => []);
  units.forEach((unit, unitIndex) => {
    for (const cell of unit) {
      cellUnits[cell].push(unitIndex);
      for (const other of unit) {
        if (other !== cell) peerSets[cell].add(other);
      }
    }
  });
  const peers = peerSets.map(set => [...set].sort((a, b) => a - b));

  const extra = puzzle.extra ?? {};
  const cages = (extra.cages ?? []).map(cage => ({
    cells: cage.cells.map(Number),
    sum: Number(cage.sum) || 0
  }));
  const thermos = (extra.thermos ?? []).map(path => path.map(Number));
  const arrows = (extra.arrows ?? []).map(arrow => ({
    circle: Number(arrow.circle),
    cells: arrow.cells.map(Number)
  }));
  const consecutiveEdges = new Set(
    (extra.consecutiveEdges ?? []).map(([a, b]) => edgeKey(Number(a), Number(b)))
  );
  const fullConsecutiveMarking = extra.fullConsecutiveMarking === true;

  const cellCages = Array.from({ length: cellCount }, () => []);
  cages.forEach((cage, index) => cage.cells.forEach(cell => cellCages[cell].push(index)));
  const cellThermos = Array.from({ length: cellCount }, () => []);
  thermos.forEach((path, pathIndex) => path.forEach((cell, pos) => {
    cellThermos[cell].push({ pathIndex, pos });
  }));
  const cellArrows = Array.from({ length: cellCount }, () => []);
  arrows.forEach((arrow, arrowIndex) => {
    cellArrows[arrow.circle].push({ arrowIndex, role: "circle" });
    arrow.cells.forEach(cell => cellArrows[cell].push({ arrowIndex, role: "path" }));
  });
  const cellConsecutive = Array.from({ length: cellCount }, () => []);
  for (const key of consecutiveEdges) {
    const [a, b] = key.split("-").map(Number);
    cellConsecutive[a].push({ other: b, marked: true });
    cellConsecutive[b].push({ other: a, marked: true });
  }
  if (fullConsecutiveMarking && samurai === null) {
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const a = r * size + c;
        if (c + 1 < size) {
          const b = a + 1;
          const key = edgeKey(a, b);
          if (!consecutiveEdges.has(key)) {
            cellConsecutive[a].push({ other: b, marked: false });
            cellConsecutive[b].push({ other: a, marked: false });
          }
        }
        if (r + 1 < size) {
          const b = a + size;
          const key = edgeKey(a, b);
          if (!consecutiveEdges.has(key)) {
            cellConsecutive[a].push({ other: b, marked: false });
            cellConsecutive[b].push({ other: a, marked: false });
          }
        }
      }
    }
  }

  const activeCells = [];
  for (let i = 0; i < cellCount; i += 1) if (active[i]) activeCells.push(i);

  return Object.freeze({
    size,
    cellCount,
    maxSymbol,
    symbols,
    boxRows,
    boxCols,
    variant,
    mode: puzzle.mode ?? "classic",
    active,
    activeCells,
    givens: Object.freeze(givens.slice()),
    units: units.map(unit => Object.freeze(unit)),
    unitKinds: Object.freeze(unitKinds),
    peers: peers.map(list => Object.freeze(list)),
    cellUnits: cellUnits.map(list => Object.freeze(list)),
    cages: Object.freeze(cages),
    thermos: Object.freeze(thermos),
    arrows: Object.freeze(arrows),
    consecutiveEdges: Object.freeze(consecutiveEdges),
    fullConsecutiveMarking,
    cellCages: cellCages.map(list => Object.freeze(list)),
    cellThermos: cellThermos.map(list => Object.freeze(list)),
    cellArrows: cellArrows.map(list => Object.freeze(list)),
    cellConsecutive: cellConsecutive.map(list => Object.freeze(list)),
    samurai: samurai ? Object.freeze({
      boards: samurai.boards.map(board => Object.freeze({ ...board }))
    }) : null,
    regions: puzzle.regions ? puzzle.regions.map(region => Object.freeze(region.slice())) : null
  });
}

export function createGrid(spec) {
  return spec.activeCells.map(i => spec.givens[i]);
}

export function cloneGrid(grid) {
  return grid.slice();
}

/** Compact index <-> grid index helpers for specs with inactive cells (Samurai). */
export function makeGridIndexer(spec) {
  const toGrid = spec.activeCells;
  const toCompact = new Int32Array(spec.cellCount).fill(-1);
  toGrid.forEach((index, compact) => { toCompact[index] = compact; });
  return { toGrid, toCompact };
}

export function allMask(spec) {
  return spec.maxSymbol === 16 ? 0xffff : (1 << spec.maxSymbol) - 1;
}

export function maskToValues(mask) {
  const values = [];
  while (mask) {
    const bit = mask & -mask;
    values.push(Math.log2(bit) + 1);
    mask ^= bit;
  }
  return values;
}

export function hasValue(mask, value) {
  return (mask & (1 << (value - 1))) !== 0;
}

/** Candidate bitmask for a cell. Pure; grid values are 1..N or 0. */
export function candidateMask(spec, grid, cell) {
  if (!spec.active[cell]) return 0;
  const value = grid[cell];
  if (value) return 1 << (value - 1);

  let mask = allMask(spec);
  for (const unitIndex of spec.cellUnits[cell]) {
    for (const other of spec.units[unitIndex]) {
      const gridValue = grid[other];
      if (gridValue) mask &= ~(1 << (gridValue - 1));
    }
  }
  if (!mask) return 0;

  for (const cageIndex of spec.cellCages[cell]) {
    const cage = spec.cages[cageIndex];
    let sum = 0;
    let filled = 0;
    for (const other of cage.cells) {
      const current = grid[other];
      if (current) {
        sum += current;
        filled += 1;
        if (other === cell) mask &= ~(1 << (current - 1));
      }
    }
    const remaining = cage.cells.length - filled;
    const low = cage.sum - sum - remaining * spec.maxSymbol;
    const high = cage.sum - sum - (remaining - 1);
    let allowed = 0;
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      if (v >= low && v <= high) allowed |= 1 << (v - 1);
    }
    mask &= allowed;
    if (!mask) return 0;
  }

  for (const info of spec.cellThermos[cell]) {
    const path = spec.thermos[info.pathIndex];
    const before = grid[path[info.pos - 1]];
    const after = grid[path[info.pos + 1]];
    let allowed = 0;
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      if (before && v <= before) continue;
      if (after && v >= after) continue;
      allowed |= 1 << (v - 1);
    }
    mask &= allowed;
    if (!mask) return 0;
  }

  for (const info of spec.cellConsecutive[cell]) {
    const other = grid[info.other];
    if (!other) continue;
    let allowed = 0;
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      const diff = Math.abs(v - other);
      if (info.marked ? diff === 1 : diff !== 1) allowed |= 1 << (v - 1);
    }
    mask &= allowed;
    if (!mask) return 0;
  }

  for (const info of spec.cellArrows[cell]) {
    const arrow = spec.arrows[info.arrowIndex];
    if (info.role === "circle") {
      let filled = 0;
      let sum = 0;
      let complete = true;
      for (const pathCell of arrow.cells) {
        const current = grid[pathCell];
        if (current) sum += current;
        else complete = false;
        filled += current ? 1 : 0;
      }
      const remaining = arrow.cells.length - filled;
      const low = sum + remaining;
      const high = sum + remaining * spec.maxSymbol;
      if (complete) {
        mask &= 1 << (sum - 1);
      } else {
        let allowed = 0;
        for (let v = 1; v <= spec.maxSymbol; v += 1) {
          if (v >= low && v <= high) allowed |= 1 << (v - 1);
        }
        mask &= allowed;
      }
    } else {
      const circle = grid[arrow.circle];
      if (circle) {
        let sum = 0;
        let filled = 0;
        for (const pathCell of arrow.cells) {
          const current = pathCell === cell ? 0 : grid[pathCell];
          if (current) { sum += current; filled += 1; }
        }
        const remaining = arrow.cells.length - filled;
        const low = circle - sum - (remaining - 1) * spec.maxSymbol;
        const high = circle - sum - (remaining - 1);
        let allowed = 0;
        for (let v = 1; v <= spec.maxSymbol; v += 1) {
          if (v >= low && v <= high) allowed |= 1 << (v - 1);
        }
        mask &= allowed;
      }
    }
    if (!mask) return 0;
  }

  return mask;
}

export function candidates(spec, grid, cell) {
  return maskToValues(candidateMask(spec, grid, cell));
}

export function isPlacementValid(spec, grid, cell, value) {
  if (!spec.active[cell] || !Number.isInteger(value) || value < 1 || value > spec.maxSymbol) {
    return false;
  }
  const mask = candidateMask(spec, grid, cell);
  return hasValue(mask, value);
}

/** Full constraint audit. Returns compact indices of conflicting cells. */
export function findConflicts(spec, grid) {
  const conflicts = new Set();

  for (let u = 0; u < spec.units.length; u += 1) {
    const seen = new Map();
    for (const cell of spec.units[u]) {
      const value = grid[cell];
      if (!value) continue;
      if (seen.has(value)) {
        conflicts.add(cell);
        conflicts.add(seen.get(value));
      } else {
        seen.set(value, cell);
      }
    }
  }

  for (const cage of spec.cages) {
    const seen = new Map();
    let sum = 0;
    let filled = 0;
    for (const cell of cage.cells) {
      const value = grid[cell];
      if (!value) continue;
      sum += value;
      filled += 1;
      if (seen.has(value)) {
        conflicts.add(cell);
        conflicts.add(seen.get(value));
      } else seen.set(value, cell);
    }
    if (filled === cage.cells.length && sum !== cage.sum) {
      cage.cells.forEach(cell => conflicts.add(cell));
    }
  }

  for (const path of spec.thermos) {
    for (let i = 1; i < path.length; i += 1) {
      const prev = grid[path[i - 1]];
      const next = grid[path[i]];
      if (prev && next && next <= prev) {
        conflicts.add(path[i - 1]);
        conflicts.add(path[i]);
      }
    }
  }

  for (const key of spec.consecutiveEdges) {
    const [a, b] = key.split("-").map(Number);
    const left = grid[a];
    const right = grid[b];
    if (left && right && Math.abs(left - right) !== 1) {
      conflicts.add(a);
      conflicts.add(b);
    }
  }
  if (spec.fullConsecutiveMarking && !spec.samurai) {
    const marked = spec.consecutiveEdges;
    for (let r = 0; r < spec.size; r += 1) {
      for (let c = 0; c < spec.size; c += 1) {
        const a = r * spec.size + c;
        const neighbours = [];
        if (c + 1 < spec.size) neighbours.push(a + 1);
        if (r + 1 < spec.size) neighbours.push(a + spec.size);
        for (const b of neighbours) {
          if (marked.has(edgeKey(a, b))) continue;
          const left = grid[a];
          const right = grid[b];
          if (left && right && Math.abs(left - right) === 1) {
            conflicts.add(a);
            conflicts.add(b);
          }
        }
      }
    }
  }

  for (const arrow of spec.arrows) {
    let sum = 0;
    let complete = true;
    for (const cell of arrow.cells) {
      const value = grid[cell];
      if (value) sum += value;
      else complete = false;
    }
    const circle = grid[arrow.circle];
    if (complete) {
      if (circle && circle !== sum) {
        conflicts.add(arrow.circle);
        arrow.cells.forEach(cell => conflicts.add(cell));
      }
    } else if (circle && sum > circle) {
      arrow.cells.forEach(cell => { if (grid[cell]) conflicts.add(cell); });
      conflicts.add(arrow.circle);
    }
  }

  return conflicts;
}

export function isSolved(spec, grid) {
  for (const cell of spec.activeCells) {
    if (!grid[cell]) return false;
  }
  return findConflicts(spec, grid).size === 0;
}

export function countGivens(spec) {
  return spec.activeCells.reduce((sum, cell) => sum + (spec.givens[cell] ? 1 : 0), 0);
}

export function gridToString(spec, grid) {
  return spec.activeCells.map(cell => grid[cell] || 0).join("");
}
