// Baut die kurzen App-Töne (assets/sounds/*.wav) – selbst erzeugt, keine fremden Dateien.
//   node scripts/build-sounds.mjs
// Weich und leise: wenig Obertöne, Tiefpass, kleiner Raum.
// tick = Umschalten/Klick, check = Häkchen, done = Luna hat es erledigt,
// money = Einnahme/bezahlt, success = Ziel/Phase geschafft.
import { Buffer } from 'node:buffer';
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

/** weicher Tiefpass (zweimal einpolig): nimmt die harten, hohen Anteile weg */
function lowpass(buf, cutoff) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < buf.length; i++) buf[i] = y += a * (buf[i] - y);
  }
  return buf;
}

/** kleiner, warmer Raum (Schroeder-Hall) – lässt die Töne weich ausklingen statt abzubrechen */
function room(buf, mix) {
  const combs = [1116, 1188, 1277, 1356].map((d) => ({ d, line: new Float64Array(d), i: 0, lp: 0 }));
  const allpasses = [556, 441].map((d) => ({ d, line: new Float64Array(d), i: 0 }));
  const wet = new Float64Array(buf.length);
  for (let n = 0; n < buf.length; n++) {
    const x = buf[n] * 0.25;
    let y = 0;
    for (const c of combs) {
      const out = c.line[c.i];
      c.lp = out * 0.6 + c.lp * 0.4; // Höhen im Nachhall dämpfen
      c.line[c.i] = x + c.lp * 0.72;
      c.i = (c.i + 1) % c.d;
      y += out;
    }
    for (const ap of allpasses) {
      const out = ap.line[ap.i];
      ap.line[ap.i] = y + out * 0.5;
      ap.i = (ap.i + 1) % ap.d;
      y = out - y * 0.5;
    }
    wet[n] = y;
  }
  for (let n = 0; n < buf.length; n++) buf[n] = buf[n] * (1 - mix) + wet[n] * mix;
  return buf;
}

/** sanft ausblenden, damit nichts am Ende knackt */
function fadeOut(buf, seconds) {
  const n = Math.min(buf.length, Math.floor(seconds * SR));
  for (let i = 0; i < n; i++) buf[buf.length - 1 - i] *= i / n;
  return buf;
}

/** weiche Glocke: wenig Obertöne, kein Klirren */
const SOFT_BELL = [
  [1, 1],
  [2, 0.18],
  [3, 0.05],
  [4.16, 0.025],
];
/** Holz: dumpfer Grundton mit einem kurzen Oberton (wie ein Klopfen) */
const WOOD = [
  [1, 1],
  [2.76, 0.22],
];

const SOUNDS = {
  // leises, dumpfes „Tock“ – fällt beim Klicken kaum auf
  tick() {
    const b = buffer(0.05);
    note(b, { at: 0, freq: 760, dur: 0.045, amp: 1, tau: 0.009, attack: 0.0008, glide: 0.06, partials: WOOD });
    noise(b, { at: 0, dur: 0.006, amp: 0.18, seed: 3, tone: 0.2 });
    lowpass(b, 2600);
    fadeOut(b, 0.012);
    return normalize(b, 0.16);
  },
  // Häkchen: zwei weiche Töne nach oben
  check() {
    const b = buffer(0.55);
    note(b, { at: 0, freq: 659.25, dur: 0.3, amp: 0.75, tau: 0.07, attack: 0.005, partials: SOFT_BELL });
    note(b, { at: 0.07, freq: 987.77, dur: 0.4, amp: 1, tau: 0.1, attack: 0.005, partials: SOFT_BELL });
    lowpass(b, 4200);
    room(b, 0.16);
    fadeOut(b, 0.12);
    return normalize(b, 0.26);
  },
  // Luna hat es erledigt: kurzer, heller Dreiklang
  done() {
    const b = buffer(1);
    [523.25, 659.25, 783.99].forEach((freq, i) =>
      note(b, { at: i * 0.07, freq, dur: 0.6 - i * 0.07, amp: 0.75 + i * 0.12, tau: 0.16, attack: 0.006, partials: SOFT_BELL }),
    );
    lowpass(b, 4200);
    room(b, 0.2);
    fadeOut(b, 0.2);
    return normalize(b, 0.28);
  },
  // Einnahme: leises Münz-Klimpern, dann zwei warme Glocken
  money() {
    const b = buffer(1.05);
    noise(b, { at: 0, dur: 0.03, amp: 0.22, seed: 7, tone: 0.4 });
    note(b, { at: 0.02, freq: 1174.66, dur: 0.4, amp: 0.7, tau: 0.11, attack: 0.004, partials: SOFT_BELL });
    note(b, { at: 0.1, freq: 1567.98, dur: 0.75, amp: 1, tau: 0.22, attack: 0.005, partials: SOFT_BELL, vibrato: 0.003 });
    lowpass(b, 5000);
    room(b, 0.2);
    fadeOut(b, 0.22);
    return normalize(b, 0.3);
  },
  // Ziel geschafft: Dur-Arpeggio mit etwas Glitzern
  success() {
    const b = buffer(1.5);
    const arp = [523.25, 659.25, 783.99, 1046.5];
    arp.forEach((freq, i) =>
      note(b, { at: i * 0.085, freq, dur: 1.15 - i * 0.085, amp: 0.65 + i * 0.12, tau: i === 3 ? 0.38 : 0.18, attack: 0.006, partials: SOFT_BELL }),
    );
    const r = rng(42);
    for (let i = 0; i < 5; i++) {
      note(b, { at: 0.36 + r() * 0.45, freq: 2093 + r() * 1100, dur: 0.14, amp: 0.06, tau: 0.04, attack: 0.003 });
    }
    lowpass(b, 4800);
    room(b, 0.22);
    fadeOut(b, 0.3);
    return normalize(b, 0.32);
  },
};

mkdirSync(out, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const file = join(out, `${name}.wav`);
  const data = wav(make());
  writeFileSync(file, data);
  console.log(`✓ assets/sounds/${name}.wav (${(data.length / 1024).toFixed(0)} KB)`);
}
