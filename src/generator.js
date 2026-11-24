/** Deterministic puzzle generation for Lelele Sudoku. No third-party deps. */
import { getPreset } from "./config.js";
import { buildSpec, candidateMask, isSolved } from "./constraints.js";
import { solve } from "./solver.js";
import { evaluateDifficulty, DIFFICULTY_TARGETS } from "./difficulty.js";

export function hashSeed(value) {
  const str = String(value ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function createRng(seed) {
  let a = (typeof seed === "number" ? seed >>> 0 : hashSeed(seed)) || 0x6d2b79f5;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function popCount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n += 1; }
  return n;
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const cancelled = fn => typeof fn === "function" && fn() === true;
function checkCancel(fn) {
  if (cancelled(fn)) throw new Error("CANCELLED");
}
function neighbours(cell, size) {
  const r = Math.floor(cell / size), c = cell % size, out = [];
  if (r > 0) out.push(cell - size);
  if (r + 1 < size) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c + 1 < size) out.push(cell + 1);
  return out;
}
function isConnected(cells, size) {
  const set = new Set(cells), seen = new Set(), stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop();
    if (seen.has(c)) continue;
    seen.add(c);
    for (const nb of neighbours(c, size)) {
      if (set.has(nb) && !seen.has(nb)) stack.push(nb);
    }
  }
  return seen.size === cells.length;
}

/** Randomised MRV backtracking. `startGrid` may carry prefilled cells. */
function generateFullSolution(spec, rng, shouldCancel, startGrid = null, nodeLimit = 300000) {
  const grid = (startGrid ?? new Array(spec.cellCount).fill(0)).slice();
  let nodes = 0;
  function search() {
    if (cancelled(shouldCancel)) return false;
    if (++nodes > nodeLimit) return false;

    let target = -1, bestMask = 0, bestCount = Infinity;
    for (const cell of spec.activeCells) {
      if (grid[cell]) continue;
      const mask = candidateMask(spec, grid, cell);
      const c = popCount(mask);
      if (c === 0) return false;
      if (c < bestCount) {
        bestCount = c; bestMask = mask; target = cell;
        if (c === 1) break;
      }
    }
    if (target < 0) return isSolved(spec, grid);

    const values = [];
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      values.push(Math.log2(bit) + 1);
      m ^= bit;
    }
    shuffle(values, rng);
    for (const v of values) {
      grid[target] = v;
      if (search()) return true;
      grid[target] = 0;
      if (cancelled(shouldCancel)) return false;
    }
    return false;
  }
  return search() ? grid : null;
}

/** Known-good 9x9 template: nine connected 9-cell regions. */
const JIGSAW_TEMPLATE = Object.freeze([
  [42, 33, 32, 41, 50, 51, 52, 53, 44],
  [43, 34, 35, 26, 25, 24, 23, 22, 31],
  [40, 49, 48, 39, 30, 21, 20, 29, 38],
  [47, 56, 57, 58, 59, 60, 61, 62, 71],
  [80, 79, 70, 69, 78, 77, 68, 67, 76],
  [75, 66, 65, 74, 73, 72, 63, 64, 55],
  [54, 45, 46, 37, 36, 27, 28, 19, 18],
  [9, 0, 1, 10, 11, 2, 3, 12, 13],
  [4, 5, 14, 15, 6, 7, 8, 17, 16]
]);

function transformJigsawTemplate(rng) {
  const mode = Math.floor(rng() * 8);
  return JIGSAW_TEMPLATE.map(region => region.map(cell => {
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    let nr = r;
    let nc = c;
    if (mode & 1) nc = 8 - nc;
    if (mode & 2) nr = 8 - nr;
    if (mode & 4) { const t = nr; nr = nc; nc = t; }
    return nr * 9 + nc;
  }));
}

/**
 * Connected jigsaw regions: build a random Hamiltonian path over the grid and
 * split it into equal chunks. Every chunk of a path is connected by definition.
 */
function generateJigsawRegions(size, rng) {
  const total = size * size;
  if (size !== 9) return transformJigsawTemplate(rng);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const visited = new Uint8Array(total);
    const path = [];
    const start = Math.floor(rng() * total);
    visited[start] = 1;
    path.push(start);
    let budget = 40000;

    function walk() {
      if (path.length === total) return true;
      if (budget-- <= 0) return false;
      const current = path[path.length - 1];
      const options = neighbours(current, size).filter(nb => !visited[nb]);
      // Warnsdorff: prefer cells with the fewest onward options, random tie-break.
      const scored = options.map(nb => ({
        nb,
        degree: neighbours(nb, size).filter(next => !visited[next]).length,
        noise: rng()
      }));
      scored.sort((a, b) => a.degree - b.degree || a.noise - b.noise);
      for (const item of scored) {
        visited[item.nb] = 1;
        path.push(item.nb);
        if (walk()) return true;
        path.pop();
        visited[item.nb] = 0;
      }
      return false;
    }
    if (!walk()) continue;

    const regions = [];
    for (let i = 0; i < size; i += 1) {
      const region = path.slice(i * size, (i + 1) * size);
      if (!isConnected(region, size)) break;
      regions.push(region);
    }
    if (regions.length === size) return regions;
  }
  return transformJigsawTemplate(rng);
}

/** Connected killer cages of 2-4 cells, no repeated digits inside a cage. */
function buildCages(solution, rng, size) {
  const total = size * size;
  const owner = new Int32Array(total).fill(-1);
  const cages = [];
  for (const seed of shuffle(Array.from({ length: total }, (_, i) => i), rng)) {
    if (owner[seed] >= 0) continue;
    const ri = cages.length;
    const cells = [seed];
    owner[seed] = ri;
    const target = pick(rng, [2, 3, 3, 4]);
    while (cells.length < target) {
      const frontier = [];
      for (const c of cells) {
        for (const nb of neighbours(c, size)) {
          if (owner[nb] < 0 && !cells.includes(nb) &&
              !cells.some(x => solution[x] === solution[nb])) frontier.push(nb);
        }
      }
      if (!frontier.length) break;
      const next = pick(rng, frontier);
      cells.push(next); owner[next] = ri;
    }
    cages.push({ cells, sum: cells.reduce((s, c) => s + solution[c], 0) });
  }
  return cages;
}
function deriveCages(solution, rng, size) {
  for (let i = 0; i < 60; i += 1) {
    const cages = buildCages(solution, rng, size);
    if (cages) return cages;
  }
  return null;
}

function deriveThermos(solution, rng, size, count = 4) {
  const paths = [];
  for (const start of shuffle(Array.from({ length: size * size }, (_, i) => i), rng)) {
    if (paths.length >= count) break;
    if (paths.some(p => p.includes(start))) continue;
    const path = [start];
    while (path.length < 5) {
      const cur = path[path.length - 1];
      const nexts = shuffle(
        neighbours(cur, size).filter(n => !path.includes(n) && solution[n] > solution[cur]),
        rng
      );
      if (!nexts.length) break;
      path.push(nexts[0]);
    }
    if (path.length >= 3 && !paths.some(p => p.some(c => path.includes(c)))) paths.push(path);
  }
  return paths;
}

function deriveConsecutive(solution, size) {
  const edges = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const a = r * size + c;
      const rights = [];
      if (c + 1 < size) rights.push(a + 1);
      if (r + 1 < size) rights.push(a + size);
      for (const b of rights) {
        if (Math.abs(solution[a] - solution[b]) === 1) edges.push([a, b]);
      }
    }
  }
  return edges;
}

function deriveArrow(solution, rng, size) {
  for (const circle of shuffle(Array.from({ length: size * size }, (_, i) => i), rng)) {
    const target = solution[circle];
    for (const start of shuffle(neighbours(circle, size), rng)) {
      const found = [];
      const dfs = (cur, sum, used) => {
        if (found.length) return;
        if (used.length >= 2 && sum === target) { found.push(used.slice()); return; }
        if (used.length >= 4) return;
        for (const nb of shuffle(neighbours(cur, size), rng)) {
          if (nb === circle || used.includes(nb)) continue;
          used.push(nb);
          dfs(nb, sum + solution[nb], used);
          used.pop();
          if (found.length) return;
        }
      };
      dfs(start, solution[start], [start]);
      if (found.length) return { circle, cells: found[0] };
    }
  }
  return null;
}

const SAMURAI_BOARDS = Object.freeze([
  Object.freeze({ top: 0,  left: 0  }),
  Object.freeze({ top: 0,  left: 12 }),
  Object.freeze({ top: 6,  left: 6  }),
  Object.freeze({ top: 12, left: 0  }),
  Object.freeze({ top: 12, left: 12 })
]);
const SAMURAI_OVERLAPS = Object.freeze([
  Object.freeze({ board: 0, cr: 0, cc: 0, br: 6, bc: 6 }),
  Object.freeze({ board: 1, cr: 0, cc: 6, br: 6, bc: 0 }),
  Object.freeze({ board: 3, cr: 6, cc: 0, br: 0, bc: 6 }),
  Object.freeze({ board: 4, cr: 6, cc: 6, br: 0, bc: 0 })
]);

function generateSamuraiSolution(rng, shouldCancel) {
  const GS = 21;
  const empty81 = new Array(81).fill(0);
  const centerSpec = buildSpec({ size: 9, variant: "classic", givens: empty81 });
  const center = generateFullSolution(centerSpec, rng, shouldCancel);
  if (!center) return null;

  const sols = new Array(5);
  sols[2] = center; // 中心盘
  for (const map of SAMURAI_OVERLAPS) {
    const givens = new Array(81).fill(0);
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        givens[(map.br + r) * 9 + (map.bc + c)] = center[(map.cr + r) * 9 + (map.cc + c)];
      }
    }
    const spec = buildSpec({ size: 9, variant: "classic", givens });
    sols[map.board] = generateFullSolution(spec, rng, shouldCancel, givens);
  }
  if (sols.some(s => !s)) return null;

  const grid = new Array(GS * GS).fill(0);
  SAMURAI_BOARDS.forEach((board, i) => {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        grid[(board.top + r) * GS + board.left + c] = sols[i][r * 9 + c];
      }
    }
  });
  const samurai = { boards: SAMURAI_BOARDS.map(b => ({ ...b })), gridSize: GS };
  const spec = buildSpec({ size: 9, variant: "samurai", givens: grid, samurai });
  return isSolved(spec, grid) ? { grid, samurai } : null;
}

function digHoles(spec, solution, rng, shouldCancel, maxDig, target) {
  const grid = solution.slice();
  const order = shuffle(spec.activeCells.filter(c => grid[c]), rng);
  const cap = Math.min(maxDig, order.length);
  const active = spec.activeCells.length;
  const idealClues = Math.round(active * (target.clueRatio ?? 0.4));
  const maxClues = Math.ceil(idealClues * 1.10);
  const hardFloor = Math.max(1, Math.floor(active * (active >= 81 ? 0.17 : 0.25)));
  let dug = 0;

  for (let i = 0; i < order.length && dug < cap; i += 1) {
    checkCancel(shouldCancel);
    const clues = grid.reduce((n, v, cell) => n + (spec.active[cell] && v ? 1 : 0), 0);
    if (clues <= maxClues) {
      const ev = evaluateDifficulty(spec, grid);
      if (!ev.unsolvable && ev.rating >= target.min && ev.rating <= target.max) break;
    }
    if (clues <= hardFloor) break;

    const cell = order[i];
    const backup = grid[cell];
    grid[cell] = 0;

    const res = solve(spec, grid, { limit: 2, shouldCancel });
    if (cancelled(shouldCancel)) throw new Error("CANCELLED");
    if (res.status === "unique") dug += 1;
    else grid[cell] = backup;
  }

  checkCancel(shouldCancel);
  const clues = grid.reduce((n, v, cell) => n + (spec.active[cell] && v ? 1 : 0), 0);
  if (clues < hardFloor) return null;
  const final = solve(spec, grid, { limit: 2, shouldCancel });
  if (cancelled(shouldCancel)) throw new Error("CANCELLED");
  return final.status === "unique" ? grid : null;
}

function finish(spec, solution, cfg) {
  const { size, variant, difficulty, extra, regions, samurai, target, seed, rng,
          shouldCancel, maxDig = Infinity } = cfg;
  const givens = digHoles(spec, solution, rng, shouldCancel, maxDig, target);
  if (!givens) return null;

  const ev = evaluateDifficulty(spec, givens);
  if (ev.unsolvable) return null;

  return {
    version: 2,
    size, variant, difficulty,
    givens: givens.slice(),
    solution: solution.slice(),
    ...(regions ? { regions: regions.map(r => r.slice()) } : {}),
    ...(samurai ? { samurai: {
      boards: samurai.boards.map(b => ({ ...b })),
      gridSize: samurai.gridSize
    } } : {}),
    ...(Object.keys(extra).length ? { extra: { ...extra } } : {}),
    meta: {
      seed: String(seed),
      rating: ev.rating,
      generatedAt: new Date().toISOString(),
      clueCount: givens.reduce((n, v, i) => n + (spec.active[i] && v ? 1 : 0), 0)
    }
  };
}

function buildOne(size, variant, difficulty, baseExtra, rng, shouldCancel, target, seed) {
  const preset = getPreset(size);
  const extra = { ...baseExtra };
  let regions = null, samurai = null, spec, solution, maxDig = Infinity;

  if (variant === "samurai") {
    const built = generateSamuraiSolution(rng, shouldCancel);
    if (!built) return null;
    samurai = built.samurai;
    solution = built.grid;
    spec = buildSpec({ size: 9, variant: "samurai", givens: solution, samurai });
    maxDig = 260; // 每次挖空仍验证唯一解；容量足够覆盖中高难度目标
    return finish(spec, solution, {
      size: 9, variant, difficulty, extra, regions, samurai,
      target, seed, rng, shouldCancel, maxDig
    });
  }

  if (variant === "jigsaw") regions = generateJigsawRegions(preset.size, rng);

  const genPuzzle = {
    size: preset.size,
    variant,
    givens: new Array(preset.size * preset.size).fill(0)
  };
  if (regions) genPuzzle.regions = regions;
  if (variant === "diagonal" || extra.diagonal === true) extra.diagonal = true;
  if (variant === "windoku" || extra.windoku === true) extra.windoku = true;
  if (extra.diagonal || extra.windoku) genPuzzle.extra = { ...extra };

  spec = buildSpec(genPuzzle);
  solution = generateFullSolution(spec, rng, shouldCancel);
  if (!solution) return null;

  // 由终盘派生变体数据，保证约束与解完全一致
  if (variant === "killer") {
    const cages = deriveCages(solution, rng, preset.size);
    if (!cages) return null;
    extra.cages = cages;
  }
  if (variant === "thermo") {
    const thermos = deriveThermos(solution, rng, preset.size);
    if (!thermos.length) return null;
    extra.thermos = thermos;
  }
  if (variant === "consecutive") {
    extra.consecutiveEdges = deriveConsecutive(solution, preset.size);
    extra.fullConsecutiveMarking = true;
  }
  if (variant === "arrow") {
    const arrow = deriveArrow(solution, rng, preset.size);
    if (!arrow) return null;
    extra.arrows = [arrow];
  }

  const finalPuzzle = {
    size: preset.size, variant,
    givens: solution.slice(),
    extra,
    ...(regions ? { regions } : {})
  };
  spec = buildSpec(finalPuzzle);
  if (!isSolved(spec, solution)) return null;

  return finish(spec, solution, {
    size: preset.size, variant, difficulty, extra, regions, samurai,
    target, seed, rng, shouldCancel
  });
}

export function generatePuzzle(options = {}) {
  const size = Number(options.size) ?? 9;
  const variant = options.variant ?? "classic";
  const difficulty = options.difficulty ?? "medium";
  const seed = options.seed ?? `${Date.now()}-${Math.random()}`;
  const rng = createRng(seed);
  const shouldCancel = options.shouldCancel;
  const maxAttempts = Math.max(1, options.maxAttempts ?? (difficulty === "master" ? 32 : 12));
  const baseExtra = { ...(options.extra ?? {}) };
  const target = { ...(DIFFICULTY_TARGETS[difficulty] ?? DIFFICULTY_TARGETS.medium) };
  // Strong extra constraints need more clues to remain uniquely solvable.
  if (variant === "consecutive") target.clueRatio = Math.min(0.64, target.clueRatio + 0.14);
  if (variant === "samurai") target.clueRatio = Math.min(0.50, target.clueRatio + 0.06);

  let best = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    checkCancel(shouldCancel);
    const puzzle = buildOne(size, variant, difficulty, baseExtra, rng, shouldCancel, target, seed);
    if (!puzzle) continue;
    if (puzzle.meta.rating >= target.min && puzzle.meta.rating <= target.max) return puzzle;
    if (!best || puzzle.meta.rating > best.meta.rating) best = puzzle;
  }
  if (best && best.meta.rating >= target.min) return best;
  throw new Error(
    `DIFFICULTY_UNREACHABLE: ${variant}/${difficulty}/${size} after ${maxAttempts} attempts (best rating ${best?.meta.rating ?? "n/a"})`
  );
}

export function tryGeneratePuzzle(options = {}) {
  try {
    return { ok: true, puzzle: generatePuzzle(options) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
