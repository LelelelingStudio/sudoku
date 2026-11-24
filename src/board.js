/**
 * Lelele Sudoku - board renderer.
 * Builds the grid once per puzzle and updates only affected cells afterwards.
 * Variant overlays are drawn from the same spec the solver uses.
 */

import { labelFor } from "./config.js";
import { edgeKey } from "./constraints.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function noteColumns(maxSymbol) {
  if (maxSymbol <= 4) return 2;
  if (maxSymbol <= 9) return 3;
  return 4;
}

export function createBoard(container, options = {}) {
  let spec = null;
  let puzzle = null;
  let cells = [];
  let overlay = null;
  const onCellClick = typeof options.onCellClick === "function" ? options.onCellClick : () => {};

  function build(nextPuzzle, nextSpec) {
    puzzle = nextPuzzle;
    spec = nextSpec;
    container.innerHTML = "";
    container.classList.add("sudoku-board");

    const size = spec.size;
    container.style.setProperty("--board-size", String(size));
    container.style.setProperty("--note-cols", String(noteColumns(spec.maxSymbol)));
    container.style.setProperty("--box-rows", String(spec.boxRows));
    container.style.setProperty("--box-cols", String(spec.boxCols));

    const grid = document.createElement("div");
    grid.className = "board-grid";
    grid.setAttribute("role", "grid");
    grid.style.gridTemplateColumns = `repeat(${size}, minmax(var(--cell-size, 34px), 1fr))`;

    cells = new Array(spec.cellCount).fill(null);
    const regionOf = new Int32Array(spec.cellCount).fill(-1);
    if (spec.regions) {
      spec.regions.forEach((region, index) => region.forEach(cell => { regionOf[cell] = index; }));
    }

    for (let index = 0; index < spec.cellCount; index += 1) {
      const row = Math.floor(index / size);
      const col = index % size;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = (row + col) % 2 === 1 ? "cell alt" : "cell";
      cell.dataset.cell = String(index);
      cell.setAttribute("role", "gridcell");

      if (!spec.active[index]) {
        cell.classList.add("inactive");
        cell.tabIndex = -1;
        cell.disabled = true;
        cells[index] = cell;
        grid.appendChild(cell);
        continue;
      }

      const valueSpan = document.createElement("span");
      valueSpan.className = "cell-value";
      cell.appendChild(valueSpan);
      const notes = document.createElement("span");
      notes.className = "cell-notes";
      cell.appendChild(notes);

      if (spec.givens[index]) cell.classList.add("given");

      const boxRight = spec.regions
        ? regionOf[index] !== regionOf[index + 1] && col + 1 < size
        : (col + 1) % spec.boxCols === 0 && col + 1 < size;
      const boxBottom = spec.regions
        ? regionOf[index] !== regionOf[index + size] && row + 1 < size
        : (row + 1) % spec.boxRows === 0 && row + 1 < size;
      if (boxRight) cell.classList.add("box-right");
      if (boxBottom) cell.classList.add("box-bottom");

      if (spec.samurai) {
        const boards = spec.samurai.boards;
        const onBoardEdge = boards.some(board => {
          const localRow = row - board.top;
          const localCol = col - board.left;
          return localRow >= 0 && localRow < 9 && localCol >= 0 && localCol < 9 &&
            (localCol === 8 || localRow === 8);
        });
        if (onBoardEdge) cell.classList.add("samurai-edge");
      }

      cell.addEventListener("click", event => {
        event.preventDefault();
        onCellClick(index);
      });
      cells[index] = cell;
      grid.appendChild(cell);
    }

    container.appendChild(grid);
    overlay = svgElement("svg", {
      class: "board-overlay",
      viewBox: `0 0 ${size} ${size}`,
      preserveAspectRatio: "none",
      "aria-hidden": "true"
    });
    container.appendChild(overlay);
    drawVariantOverlay();
  }

  function drawVariantOverlay() {
    if (!overlay) return;
    overlay.innerHTML = "";
    const size = spec.size;
    const center = index => ({ x: (index % size) + 0.5, y: Math.floor(index / size) + 0.5 });
    const line = (x1, y1, x2, y2, className) => overlay.appendChild(svgElement("line", {
      x1, y1, x2, y2, class: className, "vector-effect": "non-scaling-stroke"
    }));

    if (spec.cages.length) {
      const cageOf = new Int32Array(spec.cellCount).fill(-1);
      spec.cages.forEach((cage, index) => cage.cells.forEach(cell => { cageOf[cell] = index; }));
      spec.cages.forEach((cage, cageIndex) => {
        for (const cell of cage.cells) {
          const row = Math.floor(cell / size);
          const col = cell % size;
          const x = col;
          const y = row;
          if (col === 0 || cageOf[cell - 1] !== cageIndex) line(x, y, x, y + 1, "cage-line");
          if (col === size - 1 || cageOf[cell + 1] !== cageIndex) line(x + 1, y, x + 1, y + 1, "cage-line");
          if (row === 0 || cageOf[cell - size] !== cageIndex) line(x, y, x + 1, y, "cage-line");
          if (row === size - 1 || cageOf[cell + size] !== cageIndex) line(x, y + 1, x + 1, y + 1, "cage-line");
        }
        const first = cage.cells.slice().sort((a, b) => a - b)[0];
        const point = center(first);
        const label = svgElement("text", { x: point.x - 0.36, y: point.y - 0.28, class: "cage-sum" });
        label.textContent = String(cage.sum);
        overlay.appendChild(label);
      });
    }

    if (spec.thermos.length) {
      for (const path of spec.thermos) {
        for (let i = 1; i < path.length; i += 1) {
          const a = center(path[i - 1]);
          const b = center(path[i]);
          line(a.x, a.y, b.x, b.y, "thermo-line");
        }
        const bulb = center(path[0]);
        overlay.appendChild(svgElement("circle", {
          cx: bulb.x, cy: bulb.y, r: 0.24, class: "thermo-bulb"
        }));
      }
    }

    if (spec.consecutiveEdges.size) {
      for (const key of spec.consecutiveEdges) {
        const [a, b] = key.split("-").map(Number);
        const ca = center(a);
        const cb = center(b);
        const horizontal = Math.floor(a / size) === Math.floor(b / size);
        if (horizontal) {
          line((ca.x + cb.x) / 2, ca.y - 0.22, (ca.x + cb.x) / 2, ca.y + 0.22, "consecutive-bar");
        } else {
          line(ca.x - 0.22, (ca.y + cb.y) / 2, ca.x + 0.22, (ca.y + cb.y) / 2, "consecutive-bar");
        }
      }
    }

    if (spec.arrows.length) {
      for (const arrow of spec.arrows) {
        const circle = center(arrow.circle);
        overlay.appendChild(svgElement("circle", {
          cx: circle.x, cy: circle.y, r: 0.22, class: "arrow-circle"
        }));
        for (const cell of arrow.cells) {
          const point = center(cell);
          line(circle.x, circle.y, point.x, point.y, "arrow-line");
        }
      }
    }
  }

  function update(state) {
    if (!state || !spec) return;
    const selected = state.cursor;
    const selectedValue = selected >= 0 ? state.values[selected] : 0;
    const conflicts = state.getConflicts();
    const wrong = state.getWrongCells();
    const peers = new Set(selected >= 0 ? spec.peers[selected] : []);
    const hints = new Set(state.hintCells);

    for (const cell of spec.activeCells) {
      const element = cells[cell];
      if (!element) continue;
      const value = state.values[cell];
      const valueSpan = element.querySelector(".cell-value");
      const notesSpan = element.querySelector(".cell-notes");
      valueSpan.textContent = value ? labelFor(spec.size, value) : "";
      element.classList.toggle("user-value", Boolean(value) && !spec.givens[cell]);
      element.classList.toggle("selected", cell === selected);
      element.classList.toggle("peer", peers.has(cell) && cell !== selected);
      element.classList.toggle("same-value", Boolean(selectedValue) && value === selectedValue && cell !== selected);
      element.classList.toggle("conflict", conflicts.has(cell));
      element.classList.toggle("wrong", wrong.has(cell));
      element.classList.toggle("hint", hints.has(cell));

      if (notesSpan) {
        const notes = state.notes[cell] ?? [];
        notesSpan.textContent = notes.map(note => labelFor(spec.size, note)).join(" ");
        notesSpan.classList.toggle("visible", !value && notes.length > 0);
      }
      element.setAttribute("aria-label", `${cell} ${value ? labelFor(spec.size, value) : "empty"}`);
    }
  }

  function getCell(index) {
    return cells[index] ?? null;
  }

  function focusCell(index) {
    const cell = cells[index];
    if (cell && !cell.disabled) cell.focus({ preventScroll: true });
  }

  return { build, update, getCell, focusCell, getSpec: () => spec };
}
