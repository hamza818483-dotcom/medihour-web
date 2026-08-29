// Shared sound-effect engine for quiz-style features (Home "Quick Practice" and
// readymade-exam "Quick Practice Mode"). Extracted so both use the exact same
// sounds/behavior instead of duplicating logic.

let audioCtx: AudioContext | null = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

function sweep(ctx: AudioContext, f1: number, f2: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(f1, ctx.currentTime + start);
  osc.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + start + dur);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

export const RIGHT_PACKS: Record<string, { label: string; play: (ctx: AudioContext, v: number) => void }> = {
  kahoot: { label: "Kahoot Ding", play: (ctx, v) => { tone(ctx, 1046.5, 0, 0.12, "sine", v); tone(ctx, 1318.5, 0.08, 0.12, "sine", v); tone(ctx, 1568, 0.16, 0.22, "sine", v); } },
  coin: { label: "Mario Coin", play: (ctx, v) => { tone(ctx, 988, 0, 0.08, "square", v * 0.7); tone(ctx, 1568, 0.06, 0.25, "square", v * 0.7); } },
  tada: { label: "Ta-Da!", play: (ctx, v) => { tone(ctx, 523, 0, 0.1, "triangle", v); tone(ctx, 659, 0.06, 0.1, "triangle", v); tone(ctx, 784, 0.12, 0.1, "triangle", v); tone(ctx, 1047, 0.18, 0.3, "triangle", v); } },
  correct: { label: "Duolingo", play: (ctx, v) => { tone(ctx, 1318, 0, 0.1, "sine", v); tone(ctx, 1760, 0.09, 0.2, "sine", v); } },
  bell: { label: "Bell Chime", play: (ctx, v) => { tone(ctx, 1760, 0, 0.35, "sine", v * 0.8); tone(ctx, 2637, 0.02, 0.3, "sine", v * 0.5); } },
};

export const WRONG_PACKS: Record<string, { label: string; play: (ctx: AudioContext, v: number) => void }> = {
  ayhay: { label: "আয়হায়!", play: (ctx, v) => { tone(ctx, 330, 0, 0.16, "sawtooth", v * 0.8); tone(ctx, 220, 0.12, 0.16, "sawtooth", v * 0.8); tone(ctx, 150, 0.24, 0.22, "sawtooth", v * 0.8); } },
  buzzer: { label: "Buzzer", play: (ctx, v) => { tone(ctx, 180, 0, 0.35, "sawtooth", v); } },
  wompwomp: { label: "Womp Womp", play: (ctx, v) => { sweep(ctx, 300, 150, 0, 0.3, "triangle", v); sweep(ctx, 300, 120, 0.28, 0.35, "triangle", v); } },
  fail: { label: "Sad Trombone", play: (ctx, v) => { tone(ctx, 392, 0, 0.18, "sawtooth", v * 0.8); tone(ctx, 349, 0.16, 0.18, "sawtooth", v * 0.8); tone(ctx, 294, 0.32, 0.18, "sawtooth", v * 0.8); tone(ctx, 262, 0.48, 0.35, "sawtooth", v * 0.8); } },
  vine: { label: "Vine Boom", play: (ctx, v) => { sweep(ctx, 150, 40, 0, 0.35, "sine", v); } },
};

export function playPack(packMap: typeof RIGHT_PACKS, key: string, v: number) {
  const ctx = getCtx();
  const pack = packMap[key] || Object.values(packMap)[0];
  pack.play(ctx, v);
}

export function playSound(correct: boolean, vol: number, rightPack: string, wrongPack: string) {
  if (vol <= 0) return;
  try {
    const v = 0.6 * vol;
    if (correct) playPack(RIGHT_PACKS, rightPack, v);
    else playPack(WRONG_PACKS, wrongPack, v);
  } catch {
    /* audio unavailable, ignore */
  }
}
