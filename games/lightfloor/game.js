// LIGHT FLOOR (R8) — light-up tile room running two games, picked on the outside screen:
// Planet Defence and Colour Call (both from the Light Floor Room Sim), each with Easy/Hard.
import { GameShell, THREE } from '../../core/shell.js';
import { fitLayout, buildFloor } from './floor.js';
import { createDefence } from './defence.js';
import { createColour } from './colour.js';

const MODES = [
  { id: 'defence', label: 'Planet Defence', blurb: 'Stamp on the missiles before they reach the planet.' },
  { id: 'colour', label: 'Colour Call', blurb: 'Get the team onto the called colour before the count hits 1.' },
];

const SCHEMA = [
  { key: 'defLength', label: 'Planet Defence time limit', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game', help: 'Survive to the end to win; a missile hitting the planet ends it early.' },
  { key: 'colLength', label: 'Colour Call time limit', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game', help: 'Hard stop to keep things moving; running out of lives ends it early.' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'teamSize', label: 'Team size (sim)', type: 'number', min: 2, max: 6, step: 1, default: 4, group: 'Game', help: 'Planet Defence adds ships and fire rate for bigger teams. Colour Call simulates this many players.' },
  { key: 'voice', label: 'Colour Call voice callouts', type: 'bool', default: true, group: 'Game' },
  { key: 'defPtsHit', label: 'Defence: points per missile destroyed', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'defPtsSec', label: 'Defence: points per second survived', type: 'number', min: 0, max: 100, step: 1, default: 10, group: 'Scoring' },
  { key: 'colPtsRound', label: 'Colour: points per round cleared', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'colPtsSection', label: 'Colour: points per section on the board', type: 'number', min: 0, max: 200, step: 5, default: 25, group: 'Scoring' },
  // per-difficulty
  { key: 'defStepStart', label: 'Missile step at start', type: 'number', min: 0.1, max: 2, step: 0.01, unit: 's/tile', default: 0.9, preset: true, group: 'Planet Defence' },
  { key: 'defStepEnd', label: 'Missile step at 2:00', type: 'number', min: 0.1, max: 2, step: 0.01, unit: 's/tile', default: 0.3, preset: true, group: 'Planet Defence' },
  { key: 'defFireStart', label: 'Time between shots at start', type: 'number', min: 0.3, max: 10, step: 0.1, unit: 's', default: 3.6, preset: true, group: 'Planet Defence' },
  { key: 'defFireEnd', label: 'Time between shots at 2:00', type: 'number', min: 0.3, max: 10, step: 0.1, unit: 's', default: 1.3, preset: true, group: 'Planet Defence' },
  { key: 'colLives', label: 'Lives', type: 'number', min: 1, max: 9, step: 1, default: 3, preset: true, group: 'Colour Call' },
  { key: 'colBeatStart', label: 'Count speed, round 1', type: 'number', min: 0.4, max: 2, step: 0.05, unit: 's/count', default: 1.2, preset: true, group: 'Colour Call' },
  { key: 'colBeatDecay', label: 'Count speed-up per round', type: 'number', min: 0.8, max: 1, step: 0.01, unit: '×', default: 0.96, preset: true, group: 'Colour Call' },
  { key: 'colStartSections', label: 'Colour sections, round 1', type: 'number', min: 2, max: 7, step: 1, default: 2, preset: true, group: 'Colour Call' },
  { key: 'colMaxSections', label: 'Colour sections, max', type: 'number', min: 2, max: 7, step: 1, default: 5, preset: true, group: 'Colour Call' },
];
const PRESETS = {
  easy: { defStepStart: 0.9, defStepEnd: 0.3, defFireStart: 3.6, defFireEnd: 1.3, colLives: 3, colBeatStart: 1.2, colBeatDecay: 0.96, colStartSections: 2, colMaxSections: 5 },
  // Hard = the tuning from the original Light Floor Room Sim, plus fewer lives / more sections
  hard: { defStepStart: 0.75, defStepEnd: 0.21, defFireStart: 3.0, defFireEnd: 0.9, colLives: 2, colBeatStart: 0.9, colBeatDecay: 0.93, colStartSections: 3, colMaxSections: 7 },
};

class LightFloorGame {
  constructor() { this.time = 0; this.active = null; this.ripples = []; }

  setup(shell) {
    this.shell = shell;
    this.S = fitLayout(shell.room.spec);
    this.api = buildFloor(shell.room, this.S);
    this.defence = createDefence(this.api);
    this.colour = createColour(this.api);
    shell.setInputs([]);
    shell.setLegend([['#6fa8dc', `${this.S.counts.total} tiles · 300 mm`], ['#ffb547', 'Entry zone (carpet)'], ['#9d8bff', 'Vinyl'], ['#ff7a59', 'Power / conduit']]);
    this.playersEl = shell.addCard('Players (sim)', 'click a tile to place the highlighted one');
    this.playersEl.parentElement.hidden = true;
    const S = this.S, c = S.counts;
    this.layoutText = `Floor ${S.nx} × ${S.nz} (${c.floor}) · back ${S.backCols} × ${S.wallRows} (${c.back}) · sides ${S.sideCols} × ${S.wallRows} (${c.left} each)`;
    const note = shell.addCard('Tile layout', 'max fit with a 2.07 m entry zone');
    note.innerHTML = `<p class="note">${this.layoutText} · <b>${c.total} tiles</b></p>`;
  }

  // ---------- flow ----------
  clockLength(mode, s) { return mode === 'defence' ? s.defLength : s.colLength; }
  begin(run) {
    const s = run.settings; this.run = run; this.endT = null; this.won = false;
    this.api.clear();
    if (run.mode === 'defence') {
      const g = this.active = this.defence;
      g.onPlay = () => this.shell.startClock(s.defLength);
      g.onLose = () => { this.endT = 1.8; this.shell.beep(110, 0.6, 'sawtooth', 0.15); };
      g.start({ stepStart: s.defStepStart, stepAt2min: s.defStepEnd, fireStart: s.defFireStart, fireAt2min: s.defFireEnd }, s.teamSize);
    } else {
      const g = this.active = this.colour;
      g.onLose = () => { this.endT = 1.0; };
      g.onClear = () => [784, 1047].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.12), i * 90));
      g.onFail = () => this.shell.beep(140, 0.4, 'sawtooth', 0.12);
      g.start({ lives: s.colLives, beatStart: s.colBeatStart, beatDecay: s.colBeatDecay, startSections: s.colStartSections, maxSections: Math.max(s.colStartSections, s.colMaxSections), voice: s.voice }, s.teamSize);
      this.shell.startClock(s.colLength);
    }
    this.renderPlayers();
  }
  pick(id) {
    const t = this.api.byId.get(id); if (!t) return;
    if (this.shell.state === 'inroom' && this.active) {
      if (this.active.press(t) && this.active === this.defence) this.shell.beep(1200, 0.05, 'square', 0.08);
      this.renderPlayers();
    } else if (!this.active) {
      this.ripples.push({ o: t.pos.clone(), t: 0, col: ['#ff4fa3', '#3fd0ff', '#ffb547', '#9d8bff'][this.ripples.length % 4] });
    }
  }
  score() {
    const s = this.shell.settings, a = this.active;
    if (a === this.defence) return a.destroyed * s.defPtsHit + Math.floor(a.t) * s.defPtsSec;
    if (a === this.colour) return a.cleared * s.colPtsRound + a.sectionsCleared * s.colPtsSection;
    return 0;
  }
  onTimeUp() {
    const a = this.active; if (!a) return;
    this.won = true;
    if (a === this.defence) a.win(); else { a.state = 'over'; a.won = true; }
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.18, 'square', 0.1), i * 120));
    this._finish();
  }
  _finish() {
    const a = this.active, s = this.shell.settings;
    const line = a === this.defence
      ? `${this.won ? 'Planet saved!' : 'Planet lost'} · ${a.destroyed} missiles destroyed`
      : `${a.cleared} round${a.cleared === 1 ? '' : 's'} cleared · ${this.won ? 'beat the clock' : 'out of lives'}`;
    this.shell.finish({ score: this.score(), line });
    this.renderPlayers();
  }
  tick(dt) {
    this.time += dt;
    const api = this.api; api.begin();
    if (this.active && this.shell.state !== 'idle') {
      this.active.update(dt, this.time);
      if (this.endT != null) { this.endT -= dt; if (this.endT <= 0) { this.endT = null; if (this.shell.state === 'inroom') this._finish(); } }
    } else this._attract(dt);
    api.flush();
  }
  _attract(dt) {
    const api = this.api, tmp = this._tmp || (this._tmp = new THREE.Color()), time = this.time;
    for (const t of api.tiles) {
      const v = Math.sin(time * 2.2 - (t.pos.x * 1.7 + t.pos.z * 1.2 + t.pos.y * 1.9));
      tmp.setHSL(((time * 0.05 + t.pos.z * 0.06 + t.pos.y * 0.05) % 1 + 1) % 1, 0.85, 0.6);
      const l = Math.pow(Math.max(0, v), 4) * 0.7; if (l > 0.02) api.put(t, '#' + tmp.getHexString(), l);
    }
    this.ripples.forEach(w => w.t += dt); this.ripples = this.ripples.filter(w => w.t * 2.4 < 7);
    for (const w of this.ripples) { const r = w.t * 2.4; for (const t of api.tiles) { const v = Math.max(0, 1 - Math.abs(t.pos.distanceTo(w.o) - r) / 0.38) * (1 - r / 7); if (v > 0.05) api.put(t, w.col, v); } }
  }
  reset() { this.active = null; this.endT = null; this.api.clear(); this.renderPlayers(); }
  scoreboard() {
    const a = this.active; if (!a) return { score: 0 };
    if (a === this.defence) return { score: this.score(), sub: `${a.destroyed} DESTROYED`, footer: `Planet Defence · ${a.ships()} ship${a.ships() > 1 ? 's' : ''}${a.state === 'ready' ? ' · get ready' : ''}` };
    return { score: this.score(), sub: `ROUND ${a.round + 1} · ${'♥'.repeat(Math.max(0, a.lives))}`, footer: `Colour Call · ${a.called ? 'calling ' + a.called.name : ''}` };
  }

  // ---------- Colour Call player simulator ----------
  renderPlayers() {
    const card = this.playersEl.parentElement, g = this.colour;
    const show = this.active === g && this.shell.state === 'inroom';
    card.hidden = !show; if (!show) return;
    this.playersEl.innerHTML = `<div class="inputs" style="grid-template-columns:repeat(3,1fr)">${g.players.map((t, i) => {
      const s = t && g.byTile.get(t), where = !t ? 'off the floor' : s ? s.name : 'unlit';
      return `<button data-p="${i}" aria-pressed="${i === g.sel}" title="P${i + 1}: ${where}" style="font-size:13px;padding:8px"><i style="background:${s ? s.hex : 'transparent'};color:${s ? s.hex : '#8094ae'}"></i>P${i + 1}</button>`;
    }).join('')}<button id="lf-off" style="font-size:12px;padding:8px">Step off</button></div>
    <p class="note" style="margin-top:6px">The tiles only know pressed or not. Pass = someone on the called colour and nobody anywhere else.</p>`;
    this.playersEl.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { g.sel = +b.dataset.p; this.renderPlayers(); });
    this.playersEl.querySelector('#lf-off').onclick = () => { g.stepOff(); this.renderPlayers(); };
  }

  // ---------- admin ----------
  adminInfo() {
    const a = this.active, rows = [['Tiles', `${this.S.counts.total} (${this.layoutText})`], ['Game', a ? (a === this.defence ? 'Planet Defence' : 'Colour Call') : 'attract']];
    if (a === this.defence) {
      const P = a.state === 'playing' ? a.pace() : null;
      rows.push(['State', a.state], ['Ships', a.ships()], ['Missiles live', a.missiles.length], ['Destroyed', a.destroyed],
        ['Missile step', P ? P.step.toFixed(2) + ' s/tile' : '—'], ['Fire gap', P ? P.fire.toFixed(2) + ' s' : '—']);
    } else if (a === this.colour) {
      rows.push(['Round', a.round + 1], ['Phase', a.phase], ['Called', a.called ? a.called.name : '—'], ['Lives', a.lives],
        ['Sections', a.sectionsNow ? a.sectionsNow.length : '—'], ['Count speed', a.beat(a.round).toFixed(2) + ' s']);
    }
    rows.push(['Score', this.score()]);
    return rows;
  }
  adminActions() {
    return [
      { label: 'Defence: destroy all missiles', fn: () => { const d = this.defence; if (this.active === d) { d.destroyed += d.missiles.length; d.missiles = []; } } },
      { label: 'Colour: put everyone on the call', fn: () => { const g = this.colour; if (this.active === g && g.called) { g.players = g.players.map((_, i) => g.called.tiles[i % g.called.tiles.length]); this.renderPlayers(); } } },
      { label: 'Colour: everyone step off', fn: () => { const g = this.colour; if (this.active === g) { g.players = g.players.map(() => null); this.renderPlayers(); } } },
    ];
  }
}

const shell = new GameShell({
  id: 'lightfloor', title: 'Light Floor', roomId: 'R8',
  schema: SCHEMA, presets: PRESETS, modes: MODES,
  instructions: [
    'Tap your card, then pick a game: Planet Defence or Colour Call.',
    'Pick Easy or Hard.',
    'The floor and three walls light up. Step on tiles to play.',
    'Work as a team. Beat the clock!',
  ],
  blurbs: {
    defence: { easy: 'Slower missiles, more time between shots.', hard: 'Faster missiles and a fleet that fires more often.' },
    colour: { easy: '3 lives, slower counts, up to 5 colours.', hard: '2 lives, quicker counts, up to 7 colours.' },
  },
  footnote: 'Click tiles in the 3D room to step on them. Colour Call simulates each player: pick one in the Players card, then click where they stand.',
  game: new LightFloorGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
