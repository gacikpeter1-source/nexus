/**
 * Alarm-clock-style audio for the Training Timer tool — synthesized via the
 * Web Audio API rather than a bundled sound file, so there's nothing to
 * host and it works the same everywhere. Browsers block audio until a user
 * gesture has happened on the page at least once, so call
 * unlockTrainingTimerAudio() from the Start button's own click handler —
 * after that the AudioContext stays usable for the rest of the session.
 */

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!(getAudioContext as any)._ctx) (getAudioContext as any)._ctx = new Ctor();
  return (getAudioContext as any)._ctx as AudioContext;
}

export function unlockTrainingTimerAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function beep(ctx: AudioContext, atTime: number, freq: number, durationSec: number, volume: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, atTime);
  gain.gain.linearRampToValueAtTime(volume, atTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, atTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(atTime);
  osc.stop(atTime + durationSec + 0.02);
}

/** Short double-beep — the "N minutes left" heads-up before a work interval ends. */
export function playTrainingTimerWarning(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  beep(ctx, now, 880, 0.15, 0.35);
  beep(ctx, now + 0.22, 880, 0.15, 0.35);
}

/** Longer alternating-tone ring, like a phone alarm — a phase has just ended. */
export function playTrainingTimerAlarm(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const toneA = 988; // B5
  const toneB = 784; // G5
  for (let i = 0; i < 6; i++) {
    beep(ctx, now + i * 0.3, i % 2 === 0 ? toneA : toneB, 0.25, 0.5);
  }
}
