/** Tiny WebAudio sound manager. No audio assets, no network requests. */

const TONES = Object.freeze({
  select: [{ frequency: 520, duration: 0.05, gain: 0.05 }],
  input: [{ frequency: 660, duration: 0.07, gain: 0.06 }],
  error: [{ frequency: 180, duration: 0.16, gain: 0.07 }],
  hint: [{ frequency: 780, duration: 0.10, gain: 0.05 }, { frequency: 980, duration: 0.12, gain: 0.04, delay: 0.08 }],
  complete: [
    { frequency: 523, duration: 0.14, gain: 0.06 },
    { frequency: 659, duration: 0.14, gain: 0.06, delay: 0.12 },
    { frequency: 784, duration: 0.22, gain: 0.06, delay: 0.24 }
  ],
  button: [{ frequency: 420, duration: 0.04, gain: 0.04 }]
});

export function createSound(options = {}) {
  let enabled = options.enabled !== false;
  let context = null;

  function getContext() {
    if (!enabled) return null;
    try {
      const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!context) context = new AudioContextClass();
      if (context.state === "suspended") context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  function play(name) {
    if (!enabled) return;
    const notes = TONES[name];
    const ctx = getContext();
    if (!notes || !ctx) return;
    for (const note of notes) {
      try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = note.frequency;
        const start = ctx.currentTime + (note.delay ?? 0);
        const end = start + note.duration;
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(note.gain, start + 0.012);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gainNode).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.01);
      } catch {
        return;
      }
    }
  }

  return {
    play,
    setEnabled(value) { enabled = Boolean(value); },
    isEnabled: () => enabled
  };
}
