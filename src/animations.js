/** Lightweight visual feedback helpers. Honours prefers-reduced-motion via CSS. */

export function flashCell(element, kind = "pop") {
  if (!element) return;
  const className = kind === "error" ? "cell-shake" : kind === "hint" ? "cell-hint-pop" : "cell-pop";
  element.classList.remove("cell-shake", "cell-hint-pop", "cell-pop");
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 420);
}

export function celebrate(element) {
  if (!element) return;
  element.classList.add("celebrate");
  window.setTimeout(() => element.classList.remove("celebrate"), 900);
}

export function revealPanel(element) {
  if (!element) return;
  element.classList.remove("panel-enter");
  void element.offsetWidth;
  element.classList.add("panel-enter");
}

export function clearAnimations(root = document) {
  root.querySelectorAll(".cell-pop, .cell-shake, .cell-hint-pop, .celebrate, .panel-enter")
    .forEach(element => element.classList.remove(
      "cell-pop", "cell-shake", "cell-hint-pop", "celebrate", "panel-enter"
    ));
}
