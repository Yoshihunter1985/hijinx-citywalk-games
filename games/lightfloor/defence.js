// PLANET DEFENCE — ported from the Light Floor Room Sim.
// UFOs patrol the top of the walls and fire missiles that run down the wall and across the
// floor toward a spinning planet in the middle of the floor. Stamp on a missile to destroy it.
// One missile reaching the planet ends the game.
import { THREE } from '../../core/room.js';

const CONTINENTS = [[0, 0.3, 0.6], [2.2, -0.2, 0.62], [4.0, 0.4, 0.5], [5.0, -0.5, 0.4]];
const K = { ocean: '#2f7fff', land: '#3ddc84', ship: '#b56cff', charge: '#ffb547', missile: '#ff3b30', trail: '#ff7a1a', pop: '#ffffff', boom: '#ff7a1a' };

export function createDefence(api) {
  const S = api.S, at = api.at, put = api.put;
  const g = {
    id: 'defence', state: 'off', t: 0, destroyed: 0, fired: 0,
    // tune: { stepStart, stepAt2min, fireStart, fireAt2min } from the difficulty preset
    start(tune, players) {
      this.tune = { overtime: 120, overtimeRate: 0.035, minStep: 0.12, minFire: 0.3, ...tune };
      this.players = players;
      this.path = [];
      if (S.walls.left) for (let c = S.sideCols - 1; c >= 0; c--) this.path.push({ s: 'left', c });
      if (S.walls.back) for (let c = 0; c < S.backCols; c++) this.path.push({ s: 'back', c });
      if (S.walls.right) for (let c = 0; c < S.sideCols; c++) this.path.push({ s: 'right', c });
      this.R = S.wallRows - 1;
      this.ok = this.path.length >= 5 && S.wallRows >= 4 && S.nx >= 5 && S.nz >= 5;
      this.pc = (S.nx - 1) / 2; this.pr = (S.nz - 1) / 2; this.prad = Math.min(S.nx, S.nz) * 0.26;
      this.planet = new Set(api.tiles.filter(t => t.surface === 'floor' && Math.hypot(t.c - this.pc, t.r - this.pr) <= this.prad));
      const floor = api.tiles.filter(t => t.surface === 'floor');
      this.entry = this.path.map(p => {
        const w = at(p.s, 0, p.c); let best = null, bd = 1e9;
        if (w) for (const f of floor) { const d = Math.hypot(f.pos.x - w.pos.x, f.pos.z - w.pos.z); if (d < bd) { bd = d; best = f; } }
        return best;
      });
      this.state = 'ready'; this.t = 0; this.fired = 0; this.destroyed = 0; this.missiles = []; this.pops = []; this.boom = null; this.readyT = 3;
      const n = this.ships();
      this.fleet = Array.from({ length: n }, (_, i) => ({ p: (i + 0.5) * this.path.length / n, dir: i % 2 ? -1 : 1, fireT: 1.5 + i * 0.8 }));
    },
    ships() { const p = this.players; return p <= 3 ? 1 : p <= 5 ? 2 : 3; },
    rateMult() { return 0.6 + 0.2 * this.players; },
    pace() {
      const T = this.tune, over = Math.max(0, this.t - T.overtime), od = Math.pow(1 - T.overtimeRate, over);
      const k = Math.min(this.t, T.overtime) / T.overtime;
      return {
        step: Math.max(T.minStep, T.stepStart * Math.pow(T.stepAt2min / T.stepStart, k) * od),
        fire: Math.max(T.minFire, T.fireStart * Math.pow(T.fireAt2min / T.fireStart, k) * this.ships() / this.rateMult() * od),
        speed: Math.min(7, 2 + 2.5 * k + over * 0.05),
      };
    },
    moveFleet(speed, dt, wander) {
      const lo = 2, hi = this.path.length - 3, W = 5;
      for (const sh of this.fleet) {
        sh.p += sh.dir * speed * dt;
        if (wander && Math.random() < dt * 0.25) sh.dir *= -1;
        if (sh.p < lo) { sh.p = lo; sh.dir = 1; } if (sh.p > hi) { sh.p = hi; sh.dir = -1; }
      }
      const f = [...this.fleet].sort((a, b) => a.p - b.p);
      for (let pass = 0; pass < 3; pass++) for (let i = 0; i < f.length - 1; i++) {
        const a = f[i], b = f[i + 1], gap = b.p - a.p; if (gap >= W) continue;
        const push = (W - gap) / 2; a.p -= push; b.p += push;
        if (a.p < lo) { b.p += lo - a.p; a.p = lo; } if (b.p > hi) { a.p -= b.p - hi; b.p = hi; }
        if (a.dir === 1 || b.dir === -1) {
          a.dir = -1; b.dir = 1;
          const mid = this.path[Math.round((a.p + b.p) / 2)], t = mid && at(mid.s, this.R - 1, mid.c);
          if (t) this.pops.push({ o: t.pos.clone(), t: 0 });
        }
      }
    },
    fire(ship) {
      const i = Math.round(ship.p), p = this.path[i]; if (!p) return;
      this.missiles.push({ stage: 'wall', s: p.s, c: p.c, r: this.R - 2, pi: i, tile: at(p.s, this.R - 2, p.c), prev: null, trail: [], stepT: 0 });
      this.fired++;
    },
    stepMissile(m) {
      m.trail.unshift(m.tile); m.trail.length = Math.min(m.trail.length, 2); m.prev = m.tile;
      if (m.stage === 'wall') {
        m.r--;
        if (m.r >= 0) { m.tile = at(m.s, m.r, m.c); return; }
        const e = this.entry[m.pi]; if (!e) { m.dead = true; return; }
        m.stage = 'floor'; m.fx = e.c; m.fz = e.r; m.tile = e;
      } else {
        const dx = this.pc - m.fx, dz = this.pr - m.fz, d = Math.hypot(dx, dz) || 1;
        m.fx += dx / d; m.fz += dz / d;
        m.tile = at('floor', Math.round(m.fz), Math.round(m.fx)) || m.tile;
      }
      if (this.planet.has(m.tile)) { this.state = 'over'; this.boom = { o: m.tile.pos.clone(), t: 0 }; this.lostAt = this.t; this.onLose && this.onLose(); }
    },
    press(t) {
      if (this.state !== 'playing') return false;
      let hit = false;
      for (const m of this.missiles) if (!m.dead && (m.tile === t || m.prev === t)) { m.dead = true; hit = true; }
      if (hit) { this.destroyed++; this.pops.push({ o: t.pos.clone(), t: 0 }); this.missiles = this.missiles.filter(m => !m.dead); }
      return hit;
    },
    // stop where it is (time up = planet saved)
    win() { this.state = 'won'; this.missiles = []; },
    update(dt, time) {
      if (!this.ok) return;
      if (this.state === 'ready') {
        this.readyT -= dt; this.moveFleet(1.2, dt, false);
        if (this.readyT <= 0) { this.state = 'playing'; this.onPlay && this.onPlay(); }
      } else if (this.state === 'playing') {
        this.t += dt;
        const P = this.pace();
        this.moveFleet(P.speed, dt, true);
        for (const sh of this.fleet) { sh.fireT -= dt; if (sh.fireT <= 0) { this.fire(sh); sh.fireT = P.fire * (0.75 + Math.random() * 0.5); } }
        for (const m of this.missiles) { m.stepT += dt; while (m.stepT >= P.step && this.state === 'playing' && !m.dead) { m.stepT -= P.step; this.stepMissile(m); } }
        this.missiles = this.missiles.filter(m => !m.dead);
      } else if (this.state === 'won') this.moveFleet(1.5, dt, false);

      // planet: tiles as points on a sphere seen from above; continents drift as it spins
      const lost = this.state === 'over', spin = time * 0.45, nr = this.prad + 0.5;
      for (const t of this.planet) {
        const x = (t.c - this.pc) / nr, y = (t.r - this.pr) / nr, d = Math.hypot(x, y);
        if (lost) { put(t, Math.sin(time * 14 + d * 6) > 0 ? '#ff3b30' : '#3a0d0a', 0.9); continue; }
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
        const lat = Math.asin(Math.max(-1, Math.min(1, y))), lon = Math.atan2(x, z) + spin, shade = 0.45 + 0.5 * z;
        let land = false;
        for (const [clon, clat, size] of CONTINENTS) {
          const dl = Math.atan2(Math.sin(lon - clon), Math.cos(lon - clon));
          if (Math.hypot(dl * Math.cos(lat), lat - clat) < size) { land = true; break; }
        }
        put(t, land ? K.land : K.ocean, shade);
      }
      for (const m of this.missiles) { m.trail.forEach((tt, i) => put(tt, K.trail, i ? 0.25 : 0.5)); put(m.tile, K.missile, 1); }
      // UFOs: 3-wide dome over a 5-wide saucer; the middle glows amber just before firing
      if (!lost || this.boom.t < 0.6) for (const sh of this.fleet) {
        const i = Math.round(sh.p), tileAt = (o, row) => { const p = this.path[i + o]; return p ? at(p.s, row, p.c) : null; };
        for (const o of [-1, 0, 1]) put(tileAt(o, this.R), K.ship, 0.95);
        for (const o of [-2, -1, 0, 1, 2]) put(tileAt(o, this.R - 1), K.ship, 0.95);
        if (this.state === 'playing' && sh.fireT < 0.45) put(tileAt(0, this.R - 1), K.charge, 1);
      }
      this.pops.forEach(p => p.t += dt); this.pops = this.pops.filter(p => p.t < 0.35);
      for (const p of this.pops) for (const t of api.tiles) { const d = t.pos.distanceTo(p.o); if (d < 0.5) put(t, d < 0.1 ? K.pop : '#ffd60a', (1 - p.t / 0.35) * (d < 0.1 ? 1 : 0.6)); }
      if (this.boom) {
        this.boom.t += dt; const b = this.boom, r = b.t * 3.2;
        if (r < 6) for (const t of api.tiles) { const d = t.pos.distanceTo(b.o); const v = Math.max(0, 1 - Math.abs(d - r) / 0.45) * (1 - r / 6); if (v > 0.05) put(t, d < r * 0.5 ? '#ffd60a' : K.boom, v); }
      }
      // ready: 3-2-1 on the back wall
      if (this.state === 'ready') digitOnBack(api, Math.max(1, Math.ceil(this.readyT)), '#ffffff');
    },
  };
  return g;
}

export const DIGITS = { 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'] };
export function digitOnBack(api, digit, hex) {
  const S = api.S, rows = S.wallRows, cols = S.backCols;
  const dR0 = Math.floor((rows - 5) / 2), dC0 = Math.floor((cols - 3) / 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const top = rows - 1 - r, dr = top - dR0, dc = c - dC0;
    if (dr >= 0 && dr < 5 && dc >= 0 && dc < 3 && DIGITS[digit][dr][dc] === '#') api.put(api.at('back', r, c), hex, 1);
  }
}
