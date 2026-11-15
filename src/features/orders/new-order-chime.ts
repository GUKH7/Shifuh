/**
 * A prominent, short, original two-pair alert for new restaurant orders.
 * Browser/device output volume still depends on the tab, system and speakers.
 */
export const NEW_ORDER_CHIME_NOTES = [
  { frequency: 784, start: 0, duration: 0.28 },
  { frequency: 1046.5, start: 0.34, duration: 0.38 },
  { frequency: 784, start: 1.0, duration: 0.28 },
  { frequency: 1174.7, start: 1.34, duration: 0.48 },
] as const;

let activeContext: AudioContext | null = null;
let cleanupTimer: number | null = null;

function closeQuietly(context: AudioContext) {
  void context.close().catch(() => {
    // The sound may have been stopped by the browser or navigation.
  });
}

export function playNewOrderChime(): boolean {
  if (typeof window === "undefined") return false;

  let context: AudioContext | null = null;
  try {
    const AudioContextCtor = window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return false;

    context = new AudioContextCtor();
    if (context.state === "suspended") {
      // Called from the activation button inside a user gesture. Resuming
      // also helps browsers that initially create suspended audio contexts.
      void context.resume().catch(() => {
        // Autoplay restrictions remain controlled by the browser.
      });
    }

    // A burst of orders should restart the alert, not stack multiple loud
    // audio contexts and produce clipping.
    if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
    if (activeContext) closeQuietly(activeContext);
    activeContext = context;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-8, context.currentTime);
    limiter.knee.setValueAtTime(6, context.currentTime);
    limiter.ratio.setValueAtTime(4, context.currentTime);
    limiter.attack.setValueAtTime(0.003, context.currentTime);
    limiter.release.setValueAtTime(0.18, context.currentTime);
    limiter.connect(context.destination);

    const now = context.currentTime;
    for (const note of NEW_ORDER_CHIME_NOTES) {
      const start = now + note.start;
      const end = start + note.duration;

      // Two complementary tones: a clearly audible fundamental and a small
      // upper harmonic. Both have short fades to avoid audible clicks.
      for (const voice of [
        { type: "triangle" as const, frequency: note.frequency, peak: 0.42 },
        { type: "sine" as const, frequency: note.frequency * 2, peak: 0.14 },
      ]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = voice.type;
        oscillator.frequency.setValueAtTime(voice.frequency, start);

        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(voice.peak, start + 0.018);
        envelope.gain.setValueAtTime(voice.peak, end - 0.09);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope);
        envelope.connect(limiter);
        oscillator.start(start);
        oscillator.stop(end);
      }
    }

    const totalDurationSeconds = Math.max(
      ...NEW_ORDER_CHIME_NOTES.map((note) => note.start + note.duration),
    );
    const scheduledContext = context;
    cleanupTimer = window.setTimeout(() => {
      if (activeContext !== scheduledContext) return;
      activeContext = null;
      cleanupTimer = null;
      closeQuietly(scheduledContext);
    }, Math.ceil((totalDurationSeconds + 0.3) * 1000));

    return true;
  } catch {
    if (context) {
      if (activeContext === context) activeContext = null;
      closeQuietly(context);
    }
    return false;
  }
}
