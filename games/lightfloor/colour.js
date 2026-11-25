// COLOUR CALL — ported from the Light Floor Room Sim.
// The back wall is a face. It calls a colour, counts 3-2-1, and after 1 at least one tile on
// the called colour must be pressed and no tile anywhere else. Sections are on the floor,
// on the side walls, or a mix (never spanning floor and wall). Lose a life on a fail.
import { DIGITS } from './defence.js';

const FACE_HEX = '#af52de'; // the face is always purple; purple is never a game colour
const COLOURS = [['Red', '#ff3b30'], ['Blue', '#2f7fff'], ['Green', '#34c759'], ['Yellow', '#ffd60a'], ['Orange', '#ff9500'], ['Pink', '#ff4fa3'], ['White', '#f2f6ff']];
const FACE = {
  eyes: ['...........', '..##...##..', '..##...##..', '...........', '...........', '...........', '...........', '...........'],
  closed: ['...........', '...........', '...........', '...........', '...........', '...#####...', '...........', '...........'],
  open: ['...........', '...........', '...........', '...........', '....###....', '....###....', '....###....', '...........'],
  smile: ['...........', '...........', '...........', '...........', '..#.....#..', '...#####...', '...........', '...........'],
  frown: ['...........', '...........', '...........', '...........', '...........', '...#####...', '..#.....#..', '...........'],
};

export function createColour(api) {
  const S = api.S, at = api.at, put = api.put;
  const g = {
    id: 'colour', state: 'off', round: 0, cleared: 0, lives: 3, players: [], sel: 0, sectionsCleared: 0,
    // tune: { lives, beatStart, beatDecay, startSections, maxSections, voice }
    start(tune, team) {
      this.tune = tune; this.team = team;
      this.ok = S.walls.back && S.backCols >= 7 && S.wallRows >= 6 && S.nx >= 2 && S.nz >= 2;
      this.hasWalls = (S.walls.left || S.walls.right) && S.sideCols >= 1;
      this.round = 0; this.cleared = 0; this.sectionsCleared = 0; this.lives = tune.lives; this.called = null; this.fail = '';
      this.placePlayers(); this.newLayout(0, 'floor');
      this.state = 'playing'; this.phase = 'show'; this.pt = 0; this.result = null; this.wrong = [];
    },
    sections(k) { return Math.min(this.tune.maxSections, this.tune.startSections + Math.floor(k / 3)); },
    beat(k) { return Math.max(0.4, this.tune.beatStart * Math.pow(this.tune.beatDecay, k)); },
    callDur(k) { return Math.max(0.6, 1.1 - k * 0.03); },
    say(text) {
      if (!this.tune.voice) return;
      try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { }
    },
    placePlayers() {
      const floor = api.tiles.filter(t => t.surface === 'floor').sort(() => Math.random() - 0.5);
      this.players = Array.from({ length: this.team }, (_, i) => floor[i % floor.length] || null); this.sel = 0;
    },
    splitFloor(n) {
      let rects = [{ r0: 0, r1: S.nz, c0: 0, c1: S.nx }];
      while (rects.length < n) {
        rects.sort((a, b) => (b.r1 - b.r0) * (b.c1 - b.c0) - (a.r1 - a.r0) * (a.c1 - a.c0));
        const R = rects.shift(), h = R.r1 - R.r0, w = R.c1 - R.c0;
        if (h < 2 && w < 2) { rects.push(R); break; }
        const alongRows = rects.length === 0 && h >= 2 && w >= 2 ? Math.random() < 0.5 : h > w ? true : h < w ? false : Math.random() < 0.5;
        const len = alongRows ? h : w, cut = Math.max(1, Math.min(len - 1, Math.round(len * (0.4 + Math.random() * 0.2))));
        if (alongRows) rects.push({ ...R, r1: R.r0 + cut }, { ...R, r0: R.r0 + cut });
        else rects.push({ ...R, c1: R.c0 + cut }, { ...R, c0: R.c0 + cut });
      }
      return rects.map(R => { const out = []; for (let r = R.r0; r < R.r1; r++) for (let c = R.c0; c < R.c1; c++) { const t = at('floor', r, c); if (t) out.push(t); } return out; });
    },
    splitWalls(n) {
      const walls = ['left', 'right'].filter(w => S.walls[w]);
      const per = walls.map((w, i) => Math.floor(n / walls.length) + (i < n % walls.length ? 1 : 0));
      if (Math.random() < 0.5) per.reverse();
      const out = [];
      walls.forEach((w, i) => {
        const k = Math.min(per[i], S.sideCols); if (!k) return;
        const edges = [0]; for (let j = 1; j < k; j++) edges.push(Math.round(j * S.sideCols / k)); edges.push(S.sideCols);
        for (let j = 0; j < k; j++) { const sec = []; for (let c = edges[j]; c < edges[j + 1]; c++) for (let r = 0; r < S.wallRows; r++) { const t = at(w, r, c); if (t) sec.push(t); } out.push(sec); }
      });
      return out;
    },
    newLayout(k, force) {
      const n = this.sections(k);
      let kind = force || (k < 3 ? 'floor' : k < 6 ? (Math.random() < 0.5 ? 'floor' : 'walls') : ['floor', 'walls', 'mix', 'mix'][Math.floor(Math.random() * 4)]);
      if (!this.hasWalls) kind = 'floor';
      let secs = kind === 'floor' ? this.splitFloor(n) : kind === 'walls' ? this.splitWalls(n)
        : [...this.splitFloor(Math.ceil(n / 2)), ...this.splitWalls(n - Math.ceil(n / 2))];
      secs = secs.filter(s => s.length);
      const pal = [...COLOURS].sort(() => Math.random() - 0.5);
      this.sectionsNow = secs.map((tiles, i) => ({ tiles, name: pal[i % pal.length][0], hex: pal[i % pal.length][1] }));
      this.byTile = new Map(); this.sectionsNow.forEach(s => s.tiles.forEach(t => this.byTile.set(t, s)));
      const options = this.sectionsNow.filter(s => !this.called || s.name !== this.called.name);
      const pool = options.length ? options : this.sectionsNow;
      this.called = pool[Math.floor(Math.random() * pool.length)];
    },
    // simulated players: clicking a tile moves the selected player there
    press(t) { this.players[this.sel] = t; this.sel = (this.sel + 1) % this.team; return true; },
    stepOff() { this.players[this.sel] = null; this.sel = (this.sel + 1) % this.team; },
    // The tiles only report pressed / not pressed. Pass = at least one pressed tile on the
    // called colour AND no pressed tiles anywhere else.
    judge() {
      const pressed = [...new Set(this.players.filter(Boolean))];
      const onCall = t => { const s = this.byTile.get(t); return s && s.name === this.called.name; };
      this.wrong = pressed.filter(t => !onCall(t));
      if (this.wrong.length) { this.fail = `Someone was detected off ${this.called.name}`; return false; }
      if (!pressed.some(onCall)) { this.fail = `Nobody was detected on ${this.called.name}`; return false; }
      this.fail = ''; return true;
    },
    update(dt, time) {
      if (!this.ok) return;
      const k = this.round;
      if (this.state === 'playing') {
        this.pt += dt;
        const beat = this.beat(k);
        if (this.phase === 'show' && this.pt >= 0.7) { this.phase = 'call'; this.pt = 0; this.say(this.called.name); }
        else if (this.phase === 'call' && this.pt >= this.callDur(k)) { this.phase = 'count'; this.pt = 0; this.lastDigit = null; }
        else if (this.phase === 'count') {
          const d = 3 - Math.floor(this.pt / beat);
          if (d !== this.lastDigit && d >= 1) { this.lastDigit = d; if (beat >= 0.6) this.say(String(d)); }
          if (this.pt >= beat * 3) {
            this.result = this.judge();
            if (this.result) { this.cleared++; this.sectionsCleared += this.sectionsNow.length; this.onClear && this.onClear(); } else { this.lives--; this.onFail && this.onFail(); }
            this.phase = 'judge'; this.pt = 0;
          }
        } else if (this.phase === 'judge' && this.pt >= 1.5) {
          if (this.lives <= 0) { this.state = 'over'; this.onLose && this.onLose(); }
          else { this.round++; this.newLayout(this.round); this.wrong = []; this.phase = 'show'; this.pt = 0; }
        }
      }
      const judging = this.phase === 'judge';
      for (const s of this.sectionsNow) {
        const isCalled = s.name === this.called.name;
        const lvl = judging ? (isCalled ? 0.7 + 0.3 * Math.sin(time * 18) : 0.12) : this.state !== 'playing' ? 0.15 : 0.8;
        for (const t of s.tiles) put(t, s.hex, lvl);
      }
      this.drawFace(time, k);
      const failZone = new Set();
      if (judging && this.wrong.length) for (const w of this.wrong) for (const t of api.tiles)
        if (t.surface === w.surface && t.pos.distanceTo(w.pos) < S.tile * 1.6) failZone.add(t);
      const pulse = 0.55 + 0.45 * Math.sin(time * 16);
      for (const t of failZone) put(t, '#ff3b30', pulse);
      this.players.forEach((t, i) => { if (!t || failZone.has(t)) return; if (i === this.sel || Math.sin(time * 9) > 0) put(t, '#ffffff', 1); });
    },
    drawFace(time, k) {
      const live = this.state === 'playing' ? this.phase : 'over';
      const call = this.called, faceLvl = live === 'over' || live === 'show' ? 0.35 : 0.8;
      let parts = ['eyes', 'closed'], eyeHex = null, digit = null;
      if (live === 'call') { parts = ['eyes', Math.floor(time * 7) % 2 ? 'open' : 'closed']; eyeHex = call.hex; }
      else if (live === 'count') digit = Math.max(1, 3 - Math.floor(this.pt / this.beat(k)));
      else if (live === 'judge') { parts = ['eyes', this.result ? 'smile' : 'frown']; eyeHex = this.result ? call.hex : null; }
      else if (live === 'over') parts = ['eyes', this.won ? 'smile' : 'frown'];
      const rows = S.wallRows, cols = S.backCols;
      const dR0 = Math.floor((rows - 5) / 2), dC0 = Math.floor((cols - 3) / 2);
      const digitHex = call && call.name === 'White' ? null : '#ffffff';
      const offR = Math.max(0, Math.floor((rows - 8) / 2)), offC = Math.floor((cols - 11) / 2);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const t = at('back', r, c); if (!t) continue;
        const top = rows - 1 - r;
        if (digit) {
          const dr = top - dR0, dc = c - dC0;
          if (dr >= 0 && dr < 5 && dc >= 0 && dc < 3 && DIGITS[digit][dr][dc] === '#') { if (digitHex) put(t, digitHex, 1); continue; }
          if (c < 2 || c >= cols - 2) { put(t, call.hex, 1); continue; }
          put(t, FACE_HEX, faceLvl); continue;
        }
        const pr = top - offR, pc = c - offC;
        const feat = pr >= 0 && pr < 8 && pc >= 0 && pc < 11 && parts.find(p => FACE[p][pr][pc] === '#');
        if (feat === 'eyes' && eyeHex) { put(t, eyeHex, 1); continue; }
        if (feat) continue;
        put(t, FACE_HEX, faceLvl);
      }
    },
  };
  return g;
}
