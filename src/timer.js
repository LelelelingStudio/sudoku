/** Simple monotonic timer with optional countdown (Time Attack). */
export function createTimer(options = {}) {
  const durationMs = Number(options.durationMs) || 0;
  const onTick = typeof options.onTick === "function" ? options.onTick : () => {};
  const onEnd = typeof options.onEnd === "function" ? options.onEnd : () => {};

  let elapsedMs = 0;
  let running = false;
  let last = 0;
  let interval = null;

  function remainingMs() {
    return durationMs > 0 ? Math.max(0, durationMs - elapsedMs) : Infinity;
  }

  function emit() {
    onTick(elapsedMs, remainingMs());
    if (durationMs > 0 && elapsedMs >= durationMs) {
      stop();
      onEnd();
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = Date.now();
    interval = setInterval(() => {
      const now = Date.now();
      elapsedMs += now - last;
      last = now;
      emit();
    }, 250);
  }

  function stop() {
    if (interval) clearInterval(interval);
    interval = null;
    if (running && last) elapsedMs += Date.now() - last;
    running = false;
    last = 0;
  }

  function pause() {
    stop();
  }

  function resume() {
    if (!running) start();
  }

  function reset(value = 0) {
    stop();
    elapsedMs = Number(value) || 0;
    emit();
  }

  return {
    start,
    stop,
    pause,
    resume,
    reset,
    isRunning: () => running,
    getElapsed: () => elapsedMs,
    getRemaining: remainingMs,
    setElapsed(value) { elapsedMs = Number(value) || 0; emit(); }
  };
}

export function formatTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
