/** Web Worker: puzzle generation, solving and logic-hint computation. */

import { buildSpec } from "./constraints.js";
import { generatePuzzle } from "./generator.js";
import { solve } from "./solver.js";
import { findNextTechnique } from "./techniques.js";

const cancelled = new Set();

function reply(message) {
  self.postMessage(message);
}

self.addEventListener("message", event => {
  const data = event.data ?? {};
  const requestId = data.requestId;
  if (data.type === "cancel") {
    cancelled.add(data.targetId ?? requestId);
    return;
  }
  if (data.type === "ping") {
    reply({ type: "pong", requestId });
    return;
  }

  try {
    if (data.type === "generate") {
      const puzzle = generatePuzzle({
        ...data.options,
        shouldCancel: () => cancelled.has(requestId)
      });
      cancelled.delete(requestId);
      reply({ type: "result", requestId, ok: true, puzzle });
      return;
    }

    if (data.type === "solve") {
      const spec = buildSpec(data.puzzle);
      const result = solve(spec, spec.givens, { limit: 1 });
      reply({ type: "result", requestId, ok: true, solution: result.solution });
      return;
    }

    if (data.type === "hint") {
      const spec = buildSpec(data.puzzle);
      const grid = spec.givens.map((value, index) => data.values?.[index] ?? value);
      const technique = findNextTechnique(spec, grid);
      reply({ type: "result", requestId, ok: true, technique });
      return;
    }

    reply({ type: "result", requestId, ok: false, error: "UNKNOWN_TASK" });
  } catch (error) {
    cancelled.delete(requestId);
    reply({
      type: "result",
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
