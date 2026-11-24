/** Rating is 0..100; thresholds are explicit and shared with the generator. */
import { buildSpec, candidateMask, isSolved } from "./constraints.js";
import { solve } from "./solver.js";
import { TECHNIQUES, solveWithTechniques } from "./techniques.js";
import { DIFFICULTIES } from "./config.js";

const WEIGHT = Object.fromEntries(TECHNIQUES.map(t => [t.id, t.weight]));

// 明确阈值：rating <= cutoff 即属于该档；master 为兜底档。
export const RATING_CUTOFFS = Object.freeze({
  easy: 26, medium: 40, hard: 52, expert: 64
});

// rating 结合技巧权重、搜索深度、空格密度与候选数，不只看挖空数量。
// clueRatio 是生成器挖空的目标线索占比，防止「简单题只挖 5 格」。
export const DIFFICULTY_TARGETS = Object.freeze({
  easy:   Object.freeze({ min: 8,  max: 26, clueRatio: 0.50 }),
  medium: Object.freeze({ min: 24, max: 40, clueRatio: 0.40 }),
  hard:   Object.freeze({ min: 38, max: 52, clueRatio: 0.33 }),
  expert: Object.freeze({ min: 50, max: 64, clueRatio: 0.28 }),
  master: Object.freeze({ min: 62, max: 100, clueRatio: 0.24 })
});

function popCount(mask) {
  let n = 0;
  while (mask) { mask &= mask - 1; n += 1; }
  return n;
}
function normalizeSpec(spec) {
  return spec?.units && Array.isArray(spec.activeCells) ? spec : buildSpec(spec);
}

export function evaluateDifficulty(spec, grid) {
  const s = normalizeSpec(spec);
  const start = (grid ?? s.givens).slice();
  const hasBlanks = start.some(v => !v);
  const clueGrid = hasBlanks ? start : s.givens; // 完整解时退回题目线索
  const clueCount = clueGrid.reduce((n, v, i) => n + (s.active[i] && v ? 1 : 0), 0);
  const empty = s.activeCells.filter(c => !clueGrid[c]);

  const probe = solve(s, start, { limit: 1 });
  if (probe.status === "contradiction") {
    return {
      level: "master", rating: 100, techniques: {},
      searchDepth: 0, clueCount, confidence: 0, unsolvable: true
    };
  }

  const tw = solveWithTechniques(s, start, { maxSteps: 500 });
  const techniques = { ...tw.usedTechniques };
  const placements = tw.steps.reduce((n, st) => n + (st.value != null ? 1 : 0), 0);

  let finalSolved = tw.complete;
  let searchNodes = probe.stats.nodes;
  if (!finalSolved) {
    const rest = solve(s, tw.grid, { limit: 1 });
    searchNodes = rest.stats.nodes;
    finalSolved = rest.status === "solved" || rest.status === "unique";
  }
  // 搜索节点量级：1 个节点记 0，10 记 1，100 记 2 …
  const searchDepth = searchNodes <= 1 ? 0 : Math.floor(Math.log10(searchNodes));

  let maxWeight = 1, weightedSum = 0, total = 0;
  for (const [id, count] of Object.entries(techniques)) {
    const w = WEIGHT[id] ?? 1;
    maxWeight = Math.max(maxWeight, w);
    weightedSum += w * count;
    total += count;
  }
  const avgWeight = total ? weightedSum / total : maxWeight;
  const techniquePart = (0.65 * maxWeight + 0.35 * avgWeight) * 6.5; // 6.5..65

  let candidateSum = 0, counted = 0;
  for (const c of empty) {
    const pc = popCount(candidateMask(s, clueGrid, c));
    if (pc) { candidateSum += pc; counted += 1; }
  }
  const avgCandidates = counted ? candidateSum / counted : 0;
  const densityPart = s.activeCells.length ? (empty.length / s.activeCells.length) * 18 : 0;
  const candidatePart = Math.min(8, Math.max(0, (avgCandidates - 2) * 1.6));
  const searchPart = Math.min(30, searchDepth * 12);

  const rating = Math.max(0, Math.min(100,
    Math.round(techniquePart + densityPart + candidatePart + searchPart)
  ));

  let level = "master";
  for (const name of DIFFICULTIES) {
    if (rating <= (RATING_CUTOFFS[name] ?? 100)) { level = name; break; }
  }

  const coverage = empty.length ? placements / empty.length : 1;
  let confidence = 0.55 + 0.45 * coverage - Math.min(0.25, searchDepth * 0.05);
  if (!finalSolved) confidence -= 0.15;
  confidence = Math.max(0.05, Math.min(1, confidence));

  return { level, rating, techniques, searchDepth, clueCount, confidence };
}
