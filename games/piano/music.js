// Generated placeholder music + hard-mode distortions.
// renderSong() builds a ~20 s tune for a song in its decade's style, offline, so it can
// be cached, reversed, bit-crushed, etc. play() applies the chosen distortion live.

const SR = 44100;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGS = [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 4, 3], [0, 5, 1, 4], [3, 4, 0, 5], [0, 6, 5, 4], [5, 4, 3, 4]];

// Decade styles. bpm ranges + which voices to use.
const STYLES = {
  '80s': [
    { name: 'synthpop', bpm: [110, 124], swing: 0, pad: 'pad', arp: 'square', bass: 'saw8', lead: 'square', drums: 'gated' },
    { name: 'power ballad', bpm: [84, 96], swing: 0, pad: 'pad', arp: null, bass: 'saw4', lead: 'saw', drums: 'gated' },
  ],
  '90s': [
    { name: 'eurodance', bpm: [124, 134], swing: 0, pad: 'stab', arp: null, bass: 'offbeat', lead: 'saw', drums: 'four' },
    { name: 'rnb', bpm: [86, 96], swing: 0.18, pad: 'rhodes', arp: null, bass: 'sub', lead: 'tri', drums: 'boombap' },
  ],
  '2000s': [
    { name: 'pop-rock', bpm: [140, 156], swing: 0, pad: 'dist', arp: null, bass: 'saw8', lead: 'pluck', drums: 'rock' },
    { name: 'club pop', bpm: [122, 130], swing: 0, pad: 'pump', arp: 'pluck', bass: 'sub', lead: 'pluck', drums: 'four' },
  ],
};

export function describeStyle(song) {
  const r = rng(song.seed); r(); // same order as renderSong: minor flag, then style
  return pick(r, STYLES[song.genre]).name;
}

// ---------- render ----------
export async function renderSong(song, seconds) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const len = Math.ceil(seconds * SR);
  const ctx = new OAC(2, len, SR);
  const r = rng(song.seed);
  const minor = r() < 0.45, scale = minor ? MINOR : MAJOR;
  const style = pick(r, STYLES[song.genre]);
  const bpm = style.bpm[0] + r() * (style.bpm[1] - style.bpm[0]);
  const beat = 60 / bpm, bar = beat * 4;
  const root = 45 + Math.floor(r() * 8); // A2..E3
  const prog = pick(r, PROGS);

  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  const master = ctx.createGain(); master.gain.value = 0.7;
  master.connect(comp).connect(ctx.destination);
  const noise = makeNoise(ctx);
  // simple feedback delay as "room"
  const delay = ctx.createDelay(1); delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.22;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  const send = (node) => { node.connect(master); const s = ctx.createGain(); s.gain.value = 1; node.connect(s).connect(delay); };

  const deg = (d, oct = 0) => root + scale[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
  const triad = (d) => [deg(d, 1), deg(d + 2, 1), deg(d + 4, 1)];

  // melody motif: 8 eighth-note steps per bar, reused with variation
  const motif = [];
  for (let i = 0; i < 16; i++) motif.push(r() < 0.22 ? null : Math.floor(r() * 5) * (r() < 0.5 ? 1 : 2) % 7);
  const lens = []; for (let i = 0; i < 16; i++) lens.push(r() < 0.25 ? 2 : 1);

  const bars = Math.ceil(seconds / bar) + 1;
  const sw = (i) => (i % 2 ? style.swing * beat * 0.5 : 0);
  const pumpGain = ctx.createGain(); pumpGain.connect(master);
  // shared buses keep the node count (and render time) down
  const distBus = ctx.createWaveShaper(); distBus.curve = driveCurve(18);
  const distLp = ctx.createBiquadFilter(); distLp.type = 'lowpass'; distLp.frequency.value = 2600;
  distBus.connect(distLp).connect(master);
  const bassBus = ctx.createBiquadFilter(); bassBus.type = 'lowpass'; bassBus.frequency.value = 700; bassBus.connect(master);
  const toDist = (n) => n.connect(distBus), toBass = (n) => n.connect(bassBus);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar; if (t0 > seconds) break;
    const chord = prog[b % 4], notes = triad(chord);
    const intro = b === 0;

    // chords
    if (style.pad === 'pad') notes.forEach(n => voice(ctx, 'pad', send, t0, bar * 0.98, mtof(n), 0.07));
    if (style.pad === 'rhodes') [0, 2.5].forEach(o => notes.forEach(n => voice(ctx, 'rhodes', send, t0 + o * beat, beat * 1.4, mtof(n), 0.09)));
    if (style.pad === 'stab') for (let i = 0; i < 8; i++) if (i % 2 === 1 || i === 0) notes.forEach(n => voice(ctx, 'stab', send, t0 + i * beat / 2, beat * 0.3, mtof(n + 12), 0.06));
    if (style.pad === 'dist') for (let i = 0; i < 8; i++) [0, 7].forEach(iv => voice(ctx, 'dist', toDist, t0 + i * beat / 2, beat * 0.45, mtof(deg(chord) + 12 + iv), 0.022));
    if (style.pad === 'pump') notes.forEach(n => voice(ctx, 'pad', (x) => x.connect(pumpGain), t0, bar, mtof(n), 0.08));
    if (style.pad === 'pump') for (let i = 0; i < 4; i++) { const t = t0 + i * beat; pumpGain.gain.setValueAtTime(0.15, t); pumpGain.gain.linearRampToValueAtTime(1, t + beat * 0.6); }

    // arpeggio
    if (style.arp && !intro) for (let i = 0; i < 16; i++) {
      const n = notes[[0, 1, 2, 1][i % 4]] + 12;
      voice(ctx, style.arp, send, t0 + i * beat / 4, beat / 4 * 0.9, mtof(n), 0.035);
    }

    // bass
    const bn = deg(chord, -1);
    if (style.bass === 'saw8') for (let i = 0; i < 8; i++) voice(ctx, 'bass', toBass, t0 + i * beat / 2 + sw(i), beat / 2 * 0.85, mtof(bn), 0.16);
    if (style.bass === 'saw4') for (let i = 0; i < 4; i++) voice(ctx, 'bass', toBass, t0 + i * beat, beat * 0.9, mtof(bn), 0.16);
    if (style.bass === 'offbeat') for (let i = 0; i < 4; i++) voice(ctx, 'bass', toBass, t0 + i * beat + beat / 2, beat * 0.4, mtof(bn), 0.18);
    if (style.bass === 'sub') [0, 1.5, 2.5].forEach(o => voice(ctx, 'sub', (n) => n.connect(master), t0 + o * beat, beat * 0.9, mtof(bn), 0.3));

    // drums
    drums(ctx, style.drums, master, noise, t0, beat, sw, intro);

    // melody (from bar 2)
    if (!intro) {
      const half = (b - 1) % 2, varied = (b - 1) % 4 >= 2;
      for (let i = 0; i < 8; i++) {
        const k = half * 8 + i, step = motif[k]; if (step == null) continue;
        const d = chord + step + (varied && i >= 6 ? 1 : 0);
        voice(ctx, style.lead, send, t0 + i * beat / 2 + sw(i), beat / 2 * lens[k] * 0.92, mtof(deg(d, 2)), 0.075);
      }
    }
  }
  const buf = await ctx.startRendering();
  // fade out the last half-second
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c), f = Math.floor(SR * 0.5);
    for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
  }
  return buf;
}

function makeNoise(ctx) {
  const b = ctx.createBuffer(1, SR, SR), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(ctx, g, t, dur, vol, a = 0.005, rel = 0.08) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - rel));
  g.gain.linearRampToValueAtTime(0, t + dur);
}

function voice(ctx, type, out, t, dur, f, vol) {
  const g = ctx.createGain(); g.gain.value = 0;
  const osc = (wave, freq, det = 0) => { const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq; o.detune.value = det; o.start(t); o.stop(t + dur + 0.05); return o; };
  switch (type) {
    case 'pad': {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      osc('sawtooth', f, -9).connect(lp); osc('sawtooth', f, 9).connect(lp); lp.connect(g);
      env(ctx, g, t, dur, vol, 0.25, 0.3); break;
    }
    case 'square': osc('square', f).connect(g); env(ctx, g, t, dur, vol, 0.004, Math.min(0.06, dur * 0.5)); break;
    case 'saw': {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const o = osc('sawtooth', f); o.connect(lp).connect(g);
      const v = ctx.createOscillator(); v.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 12; v.connect(vg).connect(o.detune); v.start(t); v.stop(t + dur + 0.05);
      env(ctx, g, t, dur, vol, 0.01, 0.08); break;
    }
    case 'tri': osc('triangle', f).connect(g); env(ctx, g, t, dur, vol * 1.6, 0.01, 0.1); break;
    case 'pluck': {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(400, t + Math.min(0.25, dur));
      osc('sawtooth', f).connect(lp).connect(g);
      g.gain.setValueAtTime(vol * 1.4, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); break;
    }
    case 'rhodes': {
      osc('sine', f).connect(g); const o2 = osc('sine', f * 2); const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2).connect(g);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); break;
    }
    case 'stab': {
      osc('triangle', f).connect(g); osc('square', f * 2).connect(g);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); break;
    }
    case 'dist': {
      osc('sawtooth', f).connect(g); env(ctx, g, t, dur, vol, 0.004, 0.04); break; // drive + filter on the shared bus
    }
    case 'bass': {
      osc('sawtooth', f).connect(g); env(ctx, g, t, dur, vol, 0.004, 0.04); break; // filter on the shared bus
    }
    case 'sub': osc('sine', f).connect(g); env(ctx, g, t, dur, vol, 0.005, 0.08); break;
  }
  out(g);
}

function hit(ctx, out, noise, t, { f0, f1, tone = 0, hp = 0, bp = 0, dur = 0.15, vol = 0.5, hold = 0 }) {
  if (tone) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    g.gain.setValueAtTime(vol * tone, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  if (hp || bp) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    // one shared filter per drum sound keeps render time down
    const key = (hp ? 'h' : 'b') + (hp || bp); ctx._bus = ctx._bus || {};
    let flt = ctx._bus[key];
    if (!flt) {
      flt = ctx._bus[key] = ctx.createBiquadFilter();
      if (hp) { flt.type = 'highpass'; flt.frequency.value = hp; } else { flt.type = 'bandpass'; flt.frequency.value = bp; flt.Q.value = 1.2; }
      flt.connect(out);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    if (hold) { g.gain.setValueAtTime(vol * 0.7, t + hold); g.gain.linearRampToValueAtTime(0, t + hold + 0.02); }
    else g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(g).connect(flt); s.start(t, Math.random() * 0.5); s.stop(t + (hold || dur) + 0.05);
  }
}

function drums(ctx, kind, out, noise, t0, beat, sw, intro) {
  const kick = (t) => hit(ctx, out, noise, t, { f0: 150, f1: 42, tone: 1, dur: 0.35, vol: 0.9 });
  const snare = (t) => { hit(ctx, out, noise, t, { f0: 200, f1: 160, tone: 0.4, dur: 0.12, vol: 0.5 }); hit(ctx, out, noise, t, { hp: 1500, dur: 0.18, vol: 0.35 }); };
  const gated = (t) => { hit(ctx, out, noise, t, { f0: 210, f1: 170, tone: 0.4, dur: 0.12, vol: 0.5 }); hit(ctx, out, noise, t, { bp: 2200, hold: 0.24, vol: 0.4 }); };
  const clap = (t) => [0, 0.012, 0.026].forEach(o => hit(ctx, out, noise, t + o, { bp: 1500, dur: 0.09, vol: 0.32 }));
  const hat = (t, open) => hit(ctx, out, noise, t, { hp: 7500, dur: open ? 0.22 : 0.045, vol: open ? 0.14 : 0.12 });
  const b = (n) => t0 + n * beat;
  switch (kind) {
    case 'gated': [0, 2].forEach(i => kick(b(i))); kick(b(2.5)); if (!intro) [1, 3].forEach(i => gated(b(i))); for (let i = 0; i < 8; i++) hat(b(i / 2)); break;
    case 'four': [0, 1, 2, 3].forEach(i => kick(b(i))); if (!intro) [1, 3].forEach(i => clap(b(i))); for (let i = 0; i < 4; i++) hat(b(i + 0.5), true); break;
    case 'boombap': kick(b(0)); kick(b(1.75)); kick(b(2.5)); if (!intro) [1, 3].forEach(i => snare(b(i))); for (let i = 0; i < 8; i++) hat(b(i / 2) + sw(i)); break;
    case 'rock': kick(b(0)); kick(b(1.5)); kick(b(2)); if (!intro) [1, 3].forEach(i => snare(b(i))); for (let i = 0; i < 8; i++) hat(b(i / 2), i === 7); break;
  }
}

function driveCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
  return c;
}

// ---------- hard-mode distortions ----------
export const EFFECTS = [
  { id: 'chipmunk', label: 'Chipmunk' },
  { id: 'slowmo', label: 'Slow-mo' },
  { id: 'underwater', label: 'Underwater' },
  { id: 'wobble', label: 'Warped tape' },
  { id: 'bitcrush', label: 'Bit-crushed' },
  { id: 'radio', label: 'Old radio' },
  { id: 'reverse', label: 'Backwards' },
];

// How long to render so playback lasts `seconds` after any speed change.
export function renderLength(effect, strength, seconds) { return seconds * playbackRate(effect, strength); }
function playbackRate(effect, s) { return effect === 'chipmunk' ? 1 + 0.45 * s : effect === 'slowmo' ? 1 - 0.32 * s : 1; }

// Copy + transform a buffer for buffer-level effects.
export function processBuffer(ac, buf, effect, s) {
  if (!['reverse', 'bitcrush', 'radio'].includes(effect)) return buf;
  const out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  const hold = Math.round(2 + s * 14), levels = Math.pow(2, Math.round(8 - s * 5));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c), n = src.length;
    if (effect === 'reverse') for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
    else if (effect === 'bitcrush') { let v = 0; for (let i = 0; i < n; i++) { if (i % hold === 0) v = Math.round(src[i] * levels) / levels; dst[i] = v; } }
    else if (effect === 'radio') { for (let i = 0; i < n; i++) dst[i] = src[i] + (Math.random() < 0.0008 * s ? (Math.random() - 0.5) * 0.6 : (Math.random() - 0.5) * 0.03 * s); }
  }
  return out;
}

// Play a buffer through the effect chain. Returns { stop() }.
export function play(ac, dest, buf, effect, s, vol = 0.8) {
  const src = ac.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = playbackRate(effect, s);
  const g = ac.createGain(); g.gain.value = vol;
  let head = src; const extra = [];
  if (effect === 'underwater') {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 - 650 * s; lp.Q.value = 5;
    head.connect(lp); head = lp; lfo(ac, src.detune, 0.6, 25 * s, extra);
  } else if (effect === 'wobble') {
    lfo(ac, src.detune, 2.2 + s, 40 + 110 * s, extra);
  } else if (effect === 'radio') {
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2 + 2 * s;
    const ws = ac.createWaveShaper(); ws.curve = driveCurve(4 + 20 * s);
    head.connect(bp); bp.connect(ws); head = ws; g.gain.value = vol * 0.8;
  }
  head.connect(g).connect(dest);
  src.start();
  return { stop() { try { src.stop(); } catch { } extra.forEach(o => { try { o.stop(); } catch { } }); }, source: src };
}
function lfo(ac, param, rate, depth, list) {
  const o = ac.createOscillator(); o.frequency.value = rate; const g = ac.createGain(); g.gain.value = depth;
  o.connect(g).connect(param); o.start(); list.push(o);
}
