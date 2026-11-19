// Baut die kurzen App-Töne (assets/sounds/*.wav) – selbst erzeugt, keine fremden Dateien.
//   node scripts/build-sounds.mjs
// tick = Umschalten/Klick, check = Häkchen, done = Luna hat es erledigt,
// money = Einnahme/bezahlt, success = Ziel/Phase geschafft.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/sounds');
const SR = 44100;

/** feste Zufallsfolge, damit jeder Lauf dieselben Dateien baut */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buffer(seconds) {
  return new Float64Array(Math.ceil(seconds * SR));
}

/** Ton mit Obertönen, kurzem Anschlag und weichem Ausklingen */
function note(buf, { at, freq, dur, amp, tau, partials = [[1, 1]], attack = 0.004, glide = 0, vibrato = 0 }) {
  const start = Math.floor(at * SR);
  const n = Math.floor(dur * SR);
  const phase = partials.map(() => 0);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const env = (t < attack ? t / attack : Math.exp(-(t - attack) / tau)) * Math.min(1, (n - i) / (0.012 * SR));
    const f = freq * (1 + glide * Math.exp(-t / 0.02)) * (1 + vibrato * Math.sin(2 * Math.PI * 6 * t));
    let v = 0;
    partials.forEach(([ratio, a], k) => {
      // höhere Obertöne klingen schneller aus (wie bei echten Instrumenten)
      phase[k] += (2 * Math.PI * f * ratio) / SR;
      v += a * Math.sin(phase[k]) * Math.exp(-t * (ratio - 1) * 3);
    });
    buf[start + i] += amp * env * v;
  }
}

/** kurzes Rauschen (für das „Ka“ beim Geld) */
function noise(buf, { at, dur, amp, seed = 1, tone = 0.6 }) {
  const r = rng(seed);
  const start = Math.floor(at * SR);
  const n = Math.floor(dur * SR);
  let last = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / SR;
    const white = r() * 2 - 1;
    // einfacher Hochpass: hell und kurz, kein Zischen
    const v = white - tone * last;
    last = white;
    buf[start + i] += amp * v * Math.exp(-t / (dur / 4));
  }
}

function normalize(buf, peak) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const k = max ? peak / max : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  return buf;
}

function wav(buf) {
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const BELL = [
  [1, 1],
  [2, 0.32],
  [3, 0.12],
  [4.16, 0.06],
];
const MARIMBA = [
  [1, 1],
  [3.9, 0.14],
];

const SOUNDS = {
  tick() {
    const b = buffer(0.06);
    note(b, { at: 0, freq: 1500, dur: 0.05, amp: 1, tau: 0.011, attack: 0.0015, glide: 0.35 });
    return normalize(b, 0.22);
  },
  check() {
    const b = buffer(0.36);
    note(b, { at: 0, freq: 880, dur: 0.22, amp: 0.8, tau: 0.06, partials: MARIMBA });
    note(b, { at: 0.065, freq: 1318.5, dur: 0.28, amp: 1, tau: 0.08, partials: MARIMBA });
    return normalize(b, 0.3);
  },
  done() {
    const b = buffer(0.85);
    [1046.5, 1318.5, 1568].forEach((freq, i) => note(b, { at: i * 0.085, freq, dur: 0.75 - i * 0.085, amp: 0.8 + i * 0.1, tau: 0.22, partials: BELL }));
    return normalize(b, 0.34);
  },
  money() {
    const b = buffer(0.95);
    noise(b, { at: 0, dur: 0.035, amp: 0.5, seed: 7 });
    note(b, { at: 0.03, freq: 1975.5, dur: 0.5, amp: 0.8, tau: 0.16, partials: BELL });
    note(b, { at: 0.1, freq: 2637, dur: 0.85, amp: 1, tau: 0.3, partials: BELL, vibrato: 0.004 });
    return normalize(b, 0.38);
  },
  success() {
    const b = buffer(1.3);
    const arp = [523.25, 659.25, 783.99, 1046.5];
    arp.forEach((freq, i) => note(b, { at: i * 0.09, freq, dur: 1.2 - i * 0.09, amp: 0.7 + i * 0.12, tau: i === 3 ? 0.42 : 0.2, partials: BELL }));
    // Funkeln am Ende
    const r = rng(42);
    for (let i = 0; i < 7; i++) {
      note(b, { at: 0.34 + r() * 0.55, freq: 3000 + r() * 2200, dur: 0.12, amp: 0.12, tau: 0.03 });
    }
    return normalize(b, 0.38);
  },
};

mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const file = join(out, `${name}.wav`);
  const data = wav(make());
  writeFileSync(file, data);
  console.log(`✓ assets/sounds/${name}.wav (${(data.length / 1024).toFixed(0)} KB)`);
}
