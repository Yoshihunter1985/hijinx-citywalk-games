// A question pack per theme: ONE fixed collage across the wall screens, plus every question
// that collage can answer. The collage is seeded, so a theme looks the same every game
// (teams can learn it and get faster) until the seed is changed in admin.
import { THEMES, item } from './themes.js';

export const TYPES = [
  { id: 'count', label: 'How many…' },
  { id: 'not', label: 'Which is NOT on the screens' },
  { id: 'most', label: 'Which is there the most of' },
];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * cfg: { countMin, countMax, size, rotate, seed, screens: ['Left wall','Right wall'], uniques, absent }
 */
export function makePack(themeId, cfg) {
  const R = rng(hash(`${themeId}|${cfg.seed}|${cfg.countMin}|${cfg.countMax}`));
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const names = cfg.screens, nS = names.length;

  const pool = shuffle(THEMES[themeId].items.map(item));
  const nAbsent = Math.min(cfg.absent ?? 3, pool.length - 6), nUnique = Math.min(cfg.uniques ?? 0, pool.length - nAbsent - 4);
  const absent = pool.slice(0, nAbsent), uniques = pool.slice(nAbsent, nAbsent + nUnique), counted = pool.slice(nAbsent + nUnique);
  const counts = new Map();
  uniques.forEach(p => counts.set(p, 1));
  counted.forEach(p => counts.set(p, ri(cfg.countMin, cfg.countMax)));

  // place every copy on a screen (uniques sit on one screen; the rest are spread)
  const screens = Array.from({ length: nS }, () => []), where = new Map();
  uniques.forEach(p => { const s = ri(0, nS - 1); where.set(p, s); screens[s].push({ it: p }); });
  counted.forEach(p => { for (let i = 0; i < counts.get(p); i++) screens[ri(0, nS - 1)].push({ it: p }); });
  screens.forEach(list => { shuffle(list); place(list, cfg, R); });

  // every question this collage answers
  const pack = [];
  const opts = (k) => { const s = new Set([k]); while (s.size < 4) { const n = k + ri(-3, 3); if (n >= 1) s.add(n); } return [...s].sort((a, b) => a - b); };
  for (const p of counted) {
    const k = counts.get(p), answers = opts(k);
    pack.push({ type: 'count', subject: p, text: `How many ${p.plural} can you find?`, answers: answers.map(n => ({ label: String(n) })), correct: answers.indexOf(k), keys: [p] });
  }
  const present = [...uniques, ...counted];
  for (const a of absent) {
    const four = shuffle([a, ...shuffle(present.slice()).slice(0, 3)]);
    pack.push({ type: 'not', text: 'Which one is NOT on the screens?', answers: four.map(p => ({ label: cap(p.name), e: p.e })), correct: four.indexOf(a), keys: [] });
  }
  for (let tries = 0, made = 0; tries < 40 && made < 4; tries++) {
    const four = shuffle(counted.slice()).slice(0, 4), c = four.map(p => counts.get(p));
    if (four.length < 4 || new Set(c).size < 4) continue;
    const top = four[c.indexOf(Math.max(...c))];
    pack.push({ type: 'most', text: 'Which of these is there the most of?', answers: four.map(p => ({ label: cap(p.plural), e: p.e })), correct: four.indexOf(top), keys: [top] });
    made++;
  }
  // fixed (seeded) order, so taking the first N of a type mix gives the same pack every game
  return { theme: themeId, screens, pack: shuffle(pack), counts };
}

// Lay items out as a collage: mixed sizes that fill the screen and overlap a little.
// Every picture keeps its centre clear of the others, so nothing is ever fully hidden
// (counts stay fair). Big pictures are drawn first, small ones on top.
function place(list, cfg, R) {
  const W = 1280, H = 720, n = Math.max(1, list.length);
  // average size: big enough to fill the screen, but no more than ~2× the 'picture size' setting
  const avg = Math.min(cfg.size * 1.9, Math.max(cfg.size, Math.sqrt((W * H * 1.15) / n)));
  list.forEach(p => { p.size = avg * (0.55 + R() * 0.95); });
  list.sort((a, b) => b.size - a.size);
  const placed = [];
  for (const p of list) {
    const r = p.size / 2;
    let best = null, bestScore = -Infinity;
    for (let t = 0; t < 80; t++) {
      const x = r * 0.85 + R() * (W - r * 1.7), y = r * 0.85 + R() * (H - r * 1.7);
      // score = worst clearance ratio to anything already placed (>= 0.55 means centres stay clear)
      let worst = Infinity;
      for (const q of placed) worst = Math.min(worst, Math.hypot(q.x - x, q.y - y) / ((q.size + p.size) / 2));
      if (worst >= 0.72) { best = { x, y }; break; }
      if (worst > bestScore) { bestScore = worst; best = { x, y }; }
    }
    p.x = best.x; p.y = best.y;
    p.rot = (R() - 0.5) * (cfg.rotate ? 1.2 : 0.45);
    placed.push(p);
  }
}
