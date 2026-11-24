/**
 * Lelele Sudoku - human-style solving techniques.
 * All deductions come from the active constraint spec; nothing is fabricated.
 */
import { candidateMask, maskToValues, isSolved } from "./constraints.js";

export const TECHNIQUES = Object.freeze([
  Object.freeze({ id: "nakedSingle",     key: "techniqueNakedSingle",     weight: 1 }),
  Object.freeze({ id: "hiddenSingle",    key: "techniqueHiddenSingle",    weight: 2 }),
  Object.freeze({ id: "nakedPair",       key: "techniqueNakedPair",       weight: 3 }),
  Object.freeze({ id: "hiddenPair",      key: "techniqueHiddenPair",      weight: 4 }),
  Object.freeze({ id: "nakedTriple",     key: "techniqueNakedTriple",     weight: 5 }),
  Object.freeze({ id: "pointingPair",    key: "techniquePointingPair",    weight: 6 }),
  Object.freeze({ id: "boxLineReduction",key: "techniqueBoxLineReduction",weight: 7 }),
  Object.freeze({ id: "xWing",           key: "techniqueXWing",           weight: 8 }),
  Object.freeze({ id: "swordfish",       key: "techniqueSwordfish",       weight: 9 }),
  Object.freeze({ id: "xyWing",          key: "techniqueXYWing",          weight: 10 })
]);

const BY_ID = Object.fromEntries(TECHNIQUES.map(t => [t.id, t]));
const isBoxish = k => k === "box" || k === "region";
const isLinish = k => k === "row" || k === "column";

function popCount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n += 1; }
  return n;
}
function valueMask(values) {
  let m = 0;
  for (const v of values) m |= 1 << (v - 1);
  return m;
}
function choose(list, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i <= list.length - (k - acc.length); i += 1) {
      acc.push(list[i]); rec(i + 1, acc); acc.pop();
    }
  };
  rec(0, []);
  return out;
}

function makeContext(spec, grid, bans) {
  const masks = new Array(spec.cellCount).fill(0);
  const empties = [];
  for (const cell of spec.activeCells) {
    if (grid[cell]) continue;
    const mask = candidateMask(spec, grid, cell) & ~(bans?.[cell] ?? 0);
    if (!mask) return null; // contradiction -> no genuine deduction
    masks[cell] = mask;
    empties.push(cell);
  }
  const cellBox = new Int32Array(spec.cellCount).fill(-1);
  const lineByCell = {
    row: new Int32Array(spec.cellCount).fill(-1),
    column: new Int32Array(spec.cellCount).fill(-1)
  };
  spec.units.forEach((unit, u) => {
    const kind = spec.unitKinds[u];
    if (isBoxish(kind)) for (const c of unit) cellBox[c] = u;
    if (kind === "row" || kind === "column") {
      for (const c of unit) lineByCell[kind][c] = u;
    }
  });
  return { masks, empties, cellBox, lineByCell };
}

function descriptor(id, data) {
  return {
    id, key: BY_ID[id].key,
    cells: [], value: null, candidates: [],
    unitIndex: null, unitType: null, params: {},
    ...data
  };
}

function nakedSingle(spec, ctx) {
  for (const cell of ctx.empties) {
    if (popCount(ctx.masks[cell]) !== 1) continue;
    const v = maskToValues(ctx.masks[cell])[0];
    const u = spec.cellUnits[cell][0] ?? null;
    return descriptor("nakedSingle", {
      cells: [cell], value: v, candidates: [v],
      unitIndex: u, unitType: u === null ? null : spec.unitKinds[u],
      params: { cell }
    });
  }
  return null;
}

function hiddenSingle(spec, grid, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    const unit = spec.units[u];
    let placed = 0;
    for (const c of unit) if (grid[c]) placed |= 1 << (grid[c] - 1);
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      const bit = 1 << (v - 1);
      if (placed & bit) continue;
      let target = -1, count = 0;
      for (const c of unit) {
        if (!(ctx.masks[c] & bit)) continue;
        target = c; count += 1;
        if (count > 1) break;
      }
      if (count === 1) {
        return descriptor("hiddenSingle", {
          cells: [target], value: v, candidates: maskToValues(ctx.masks[target]),
          unitIndex: u, unitType: spec.unitKinds[u],
          params: { value: v, unit: unit.slice() }
        });
      }
    }
  }
  return null;
}

function nakedPair(spec, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    const unit = spec.units[u].filter(c => ctx.masks[c]);
    for (let i = 0; i < unit.length; i += 1) {
      for (let j = i + 1; j < unit.length; j += 1) {
        const a = unit[i], b = unit[j];
        if (popCount(ctx.masks[a]) !== 2 || ctx.masks[a] !== ctx.masks[b]) continue;
        const pair = ctx.masks[a];
        const eliminations = [];
        for (const c of unit) {
          if (c === a || c === b) continue;
          const gone = ctx.masks[c] & pair;
          if (gone) eliminations.push({ cell: c, values: maskToValues(gone) });
        }
        if (!eliminations.length) continue;
        return descriptor("nakedPair", {
          cells: [a, b, ...eliminations.map(e => e.cell)],
          value: null, candidates: maskToValues(pair),
          unitIndex: u, unitType: spec.unitKinds[u],
          params: { eliminations }
        });
      }
    }
  }
  return null;
}

function hiddenPair(spec, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    const unit = spec.units[u].filter(c => ctx.masks[c]);
    for (let v1 = 1; v1 <= spec.maxSymbol; v1 += 1) {
      for (let v2 = v1 + 1; v2 <= spec.maxSymbol; v2 += 1) {
        const both = (1 << (v1 - 1)) | (1 << (v2 - 1));
        const holders = unit.filter(c => ctx.masks[c] & both);
        if (holders.length !== 2) continue;
        if (!holders.every(c => (ctx.masks[c] & both) === both)) continue;
        const eliminations = [];
        for (const c of holders) {
          const gone = ctx.masks[c] & ~both;
          if (gone) eliminations.push({ cell: c, values: maskToValues(gone) });
        }
        if (!eliminations.length) continue;
        return descriptor("hiddenPair", {
          cells: holders.slice(), value: null, candidates: [v1, v2],
          unitIndex: u, unitType: spec.unitKinds[u],
          params: { eliminations }
        });
      }
    }
  }
  return null;
}

function nakedTriple(spec, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    const unit = spec.units[u].filter(c => ctx.masks[c] && popCount(ctx.masks[c]) <= 3);
    for (let i = 0; i < unit.length; i += 1) {
      for (let j = i + 1; j < unit.length; j += 1) {
        for (let k = j + 1; k < unit.length; k += 1) {
          const trio = [unit[i], unit[j], unit[k]];
          const union = ctx.masks[trio[0]] | ctx.masks[trio[1]] | ctx.masks[trio[2]];
          if (popCount(union) !== 3) continue;
          const eliminations = [];
          for (const c of unit) {
            if (trio.includes(c)) continue;
            const gone = ctx.masks[c] & union;
            if (gone) eliminations.push({ cell: c, values: maskToValues(gone) });
          }
          if (!eliminations.length) continue;
          return descriptor("nakedTriple", {
            cells: [...trio, ...eliminations.map(e => e.cell)],
            value: null, candidates: maskToValues(union),
            unitIndex: u, unitType: spec.unitKinds[u],
            params: { eliminations }
          });
        }
      }
    }
  }
  return null;
}

function pointingPair(spec, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    if (!isBoxish(spec.unitKinds[u])) continue;
    const unit = spec.units[u];
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      const bit = 1 << (v - 1);
      const holders = unit.filter(c => ctx.masks[c] & bit);
      if (holders.length < 2) continue;
      for (const axis of ["row", "column"]) {
        const keyOf = axis === "row"
          ? c => Math.floor(c / spec.size)
          : c => c % spec.size;
        const key = keyOf(holders[0]);
        if (!holders.every(c => keyOf(c) === key)) continue;
        const line = ctx.lineByCell[axis][holders[0]];
        if (line < 0) continue;
        const eliminations = [];
        for (const c of spec.units[line]) {
          if (unit.includes(c) || !(ctx.masks[c] & bit)) continue;
          eliminations.push({ cell: c, values: [v] });
        }
        if (!eliminations.length) continue;
        return descriptor("pointingPair", {
          cells: [...holders, ...eliminations.map(e => e.cell)],
          value: null, candidates: [v],
          unitIndex: u, unitType: spec.unitKinds[u],
          params: { eliminations, axis }
        });
      }
    }
  }
  return null;
}

function boxLineReduction(spec, ctx) {
  for (let u = 0; u < spec.units.length; u += 1) {
    const kind = spec.unitKinds[u];
    if (!isLinish(kind)) continue;
    const unit = spec.units[u];
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      const bit = 1 << (v - 1);
      const holders = unit.filter(c => ctx.masks[c] & bit);
      if (holders.length < 2) continue;
      const box = ctx.cellBox[holders[0]];
      if (box < 0 || !holders.every(c => ctx.cellBox[c] === box)) continue;
      const eliminations = [];
      for (const c of spec.units[box]) {
        if (unit.includes(c) || !(ctx.masks[c] & bit)) continue;
        eliminations.push({ cell: c, values: [v] });
      }
      if (!eliminations.length) continue;
      return descriptor("boxLineReduction", {
        cells: [...holders, ...eliminations.map(e => e.cell)],
        value: null, candidates: [v],
        unitIndex: u, unitType: kind,
        params: { eliminations, boxIndex: box }
      });
    }
  }
  return null;
}

function fish(spec, ctx, lineCount) {
  const id = lineCount === 2 ? "xWing" : "swordfish";
  for (const axis of ["row", "column"]) {
    const cross = axis === "row" ? "column" : "row";
    const lines = [];
    spec.units.forEach((unit, u) => {
      if (spec.unitKinds[u] === axis) lines.push({ u, unit });
    });
    for (let v = 1; v <= spec.maxSymbol; v += 1) {
      const bit = 1 << (v - 1);
      const candidates = [];
      for (const line of lines) {
        const pos = line.unit.filter(c => ctx.masks[c] & bit);
        if (pos.length >= 2 && pos.length <= lineCount) {
          candidates.push({ ...line, pos });
        }
      }
      if (candidates.length < lineCount) continue;
      for (const combo of choose(candidates, lineCount)) {
        const positions = new Set(combo.flatMap(r => r.pos));
        if (positions.size !== lineCount) continue;
        const baseUnits = new Set(combo.map(r => r.u));
        const eliminations = [];
        for (const p of positions) {
          const crossLine = ctx.lineByCell[cross][p];
          if (crossLine < 0) continue;
          for (const c of spec.units[crossLine]) {
            const ownLine = spec.cellUnits[c].find(i => spec.unitKinds[i] === axis);
            if (baseUnits.has(ownLine)) continue;
            if (ctx.masks[c] & bit) eliminations.push({ cell: c, values: [v] });
          }
        }
        if (!eliminations.length) continue;
        return descriptor(id, {
          cells: [...positions, ...eliminations.map(e => e.cell)],
          value: null, candidates: [v],
          unitIndex: combo[0].u, unitType: axis,
          params: { eliminations, axis, lines: combo.map(r => r.u) }
        });
      }
    }
  }
  return null;
}

function xyWing(spec, ctx) {
  for (const pivot of ctx.empties) {
    const pm = ctx.masks[pivot];
    if (popCount(pm) !== 2) continue;
    const seen = new Set();
    for (const u of spec.cellUnits[pivot]) {
      for (const c of spec.units[u]) {
        if (c === pivot || !ctx.masks[c] || popCount(ctx.masks[c]) !== 2) continue;
        if (spec.peers[pivot].includes(c)) seen.add(c);
      }
    }
    if (seen.size < 2) continue;
    for (const q of seen) {
      const shared = pm & ctx.masks[q];
      if (popCount(shared) !== 1) continue;
      const x = maskToValues(shared)[0];
      const y = maskToValues(pm & ~shared)[0];
      const z = maskToValues(ctx.masks[q] & ~shared)[0];
      if (z === undefined || x === z || y === z) continue;
      const needed = (1 << (y - 1)) | (1 << (z - 1));
      for (const r of seen) {
        if (r === q || ctx.masks[r] !== needed) continue;
        const zBit = 1 << (z - 1);
        const eliminations = [];
        for (const c of spec.peers[q]) {
          if (c === pivot || c === q || c === r) continue;
          if (!spec.peers[r].includes(c)) continue;
          if (ctx.masks[c] & zBit) eliminations.push({ cell: c, values: [z] });
        }
        if (!eliminations.length) continue;
        return descriptor("xyWing", {
          cells: [pivot, q, r, ...eliminations.map(e => e.cell)],
          value: null, candidates: [z],
          unitIndex: spec.cellUnits[pivot][0] ?? null,
          unitType: spec.cellUnits[pivot].length ? spec.unitKinds[spec.cellUnits[pivot][0]] : null,
          params: { eliminations, pivot, x, y, z }
        });
      }
    }
  }
  return null;
}

/** Third argument is the internal candidate-ban map used by solveWithTechniques. */
export function findNextTechnique(spec, grid, bans = null) {
  if (!spec || !grid || isSolved(spec, grid)) return null;
  const ctx = makeContext(spec, grid, bans);
  if (!ctx) return null;

  const runners = {
    nakedSingle:      () => nakedSingle(spec, ctx),
    hiddenSingle:     () => hiddenSingle(spec, grid, ctx),
    nakedPair:        () => nakedPair(spec, ctx),
    hiddenPair:       () => hiddenPair(spec, ctx),
    nakedTriple:      () => nakedTriple(spec, ctx),
    pointingPair:     () => pointingPair(spec, ctx),
    boxLineReduction: () => boxLineReduction(spec, ctx),
    xWing:            () => fish(spec, ctx, 2),
    swordfish:        () => fish(spec, ctx, 3),
    xyWing:           () => xyWing(spec, ctx)
  };
  for (const tech of TECHNIQUES) {
    const found = runners[tech.id]();
    if (found) return found;
  }
  return null;
}

export function solveWithTechniques(spec, grid, options = {}) {
  const maxSteps = Math.max(0, options.maxSteps ?? 500);
  const work = grid.slice();
  const bans = new Array(spec.cellCount).fill(0);
  const steps = [];
  const usedTechniques = {};

  for (let i = 0; i < maxSteps; i += 1) {
    if (isSolved(spec, work)) break;
    const found = findNextTechnique(spec, work, bans);
    if (!found) break;

    if (found.value != null && found.cells.length) work[found.cells[0]] = found.value;
    for (const el of found.params?.eliminations ?? []) bans[el.cell] |= valueMask(el.values);

    steps.push({
      technique: found.id,
      techniqueKey: found.key,
      cells: found.cells.slice(),
      value: found.value,
      params: found.params,
      gridAfter: work.slice()
    });
    usedTechniques[found.id] = (usedTechniques[found.id] ?? 0) + 1;
  }

  const remaining = spec.activeCells.reduce((n, c) => n + (work[c] ? 0 : 1), 0);
  return {
    grid: work,
    steps,
    usedTechniques,
    complete: remaining === 0 && isSolved(spec, work),
    remaining
  };
}
