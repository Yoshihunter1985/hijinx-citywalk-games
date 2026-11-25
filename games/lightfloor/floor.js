// Light-up tile room, ported from the Light Floor Room Sim artifact.
// Same rules: tiles on the floor and three walls, a carpeted entry zone the full width of
// the room at the door end (door swing + wheelchair turning space, no tiles), cable gaps
// round the floor grid, a power strip between the floor grid and the carpet, skirting
// below the wall tiles and a conduit above them. Tile counts are the most that fit.
import { THREE } from '../../core/room.js';

export const LAYOUT = {
  tile: 0.30,      // tile size (m)
  th: 0.08,        // tile thickness (m)
  sideB: 0.10,     // cable gap each side of the floor grid
  backB: 0.10,     // cable gap at the back wall
  powerMin: 0.12,  // minimum power strip between floor grid and carpet
  skirt: 0.15,     // skirting below wall tiles
  conduit: 0.05,   // conduit above wall tiles
  wallTop: 2.7,    // wall tiles + conduit stay below this height
  clearD: 2.07,    // entry zone depth: door swing + turning space (from the earlier sim)
  walls: { left: true, right: true, back: true },
};
const EPS = 1e-6;
const COL = { base: '#6fa8dc', edge: '#3a6894', vinyl: '#9d8bff', power: '#ff7a59', cover: '#8094ae', door: '#ffb547' };

export function fitLayout(spec, L = LAYOUT) {
  const W = spec.w, D = spec.d, H = spec.h;
  const zoneD = Math.min(D, Math.max(L.clearD, spec.door.width));
  const f = v => Math.max(0, Math.floor(v / L.tile + EPS));
  const S = { ...L, W, L: D, H, zoneD,
    nx: f(W - 2 * L.sideB),
    nz: f(D - L.backB - L.powerMin - zoneD),
    wallRows: f(Math.min(H, L.wallTop) - L.th - L.skirt - L.conduit),
    backCols: f(W - (L.walls.left ? L.th : 0) - (L.walls.right ? L.th : 0)),
    sideCols: f(D - zoneD - (L.walls.back ? L.th : 0)),
  };
  const s = S.tile, hw = W / 2, hl = D / 2;
  S.g = {
    s, hw, hl, fx: S.nx * s / 2, gz0: -hl + S.backB, zoneZ: hl - zoneD,
    yBase: S.th + S.skirt, sideZ0: -hl + (S.walls.back ? S.th : 0),
  };
  S.g.gz1 = S.g.gz0 + S.nz * s;
  S.g.yTop = S.g.yBase + S.wallRows * s;
  const bx0 = -hw + (S.walls.left ? S.th : 0), bx1 = hw - (S.walls.right ? S.th : 0);
  S.g.bx0 = (bx0 + bx1) / 2 - S.backCols * s / 2;
  S.g.power = S.g.zoneZ - S.g.gz1;
  S.counts = {
    floor: S.nx * S.nz, back: S.walls.back ? S.wallRows * S.backCols : 0,
    left: S.walls.left ? S.wallRows * S.sideCols : 0, right: S.walls.right ? S.wallRows * S.sideCols : 0,
  };
  S.counts.total = S.counts.floor + S.counts.back + S.counts.left + S.counts.right;
  return S;
}

// Builds the tiles + room details into a Room3D and returns the tile API games use.
export function buildFloor(room, S) {
  const scene = room.scene, G = S.g, { s, hw, hl } = G, th = S.th, H = S.H;
  const extras = new THREE.Group(); scene.add(extras);

  // ---- room details ----
  const lines = (pairs, color, opacity = 1, dashed = false) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pairs.flat(2), 3));
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.LineSegments(geo, mat); if (dashed) l.computeLineDistances(); extras.add(l); return l;
  };
  const rect = (x0, x1, z0, z1, y) => { const a = [x0, y, z0], b = [x1, y, z0], c = [x1, y, z1], d = [x0, y, z1]; return [[a, b], [b, c], [c, d], [d, a]]; };
  const flat = (rects, y, color, opacity) => {
    const p = []; rects.forEach(([x0, x1, z0, z1]) => p.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    extras.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
  };
  const plane = (w, h, color, opacity, pos, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(pos); m.rotation.y = rotY; extras.add(m);
  };
  const zz = Math.max(-hl, G.zoneZ);
  // tiled platform outline (stops at the carpet)
  lines([[[-hw, th, -hl], [hw, th, -hl]], [[-hw, th, -hl], [-hw, th, zz]], [[hw, th, -hl], [hw, th, zz]], [[-hw, th, zz], [hw, th, zz]],
    [[-hw, 0, zz], [-hw, th, zz]], [[hw, 0, zz], [hw, th, zz]]], COL.cover, 0.8);
  // cable gaps, power strip, carpet
  const cable = [];
  if (G.gz0 > -hl) cable.push([-hw, hw, -hl, G.gz0]);
  if (G.fx < hw) cable.push([-hw, -G.fx, G.gz0, G.gz1], [G.fx, hw, G.gz0, G.gz1]);
  flat(cable, th + 0.001, COL.cover, 0.14);
  if (G.power > 0.001) flat([[-hw, hw, G.gz1, zz]], th + 0.001, COL.power, 0.22);
  flat([[-hw, hw, zz, hl]], 0.002, COL.door, 0.10);
  // vinyl on side walls in the entry zone
  for (const x of [-hw + 0.003, hw - 0.003]) {
    plane(hl - zz, H, COL.vinyl, 0.08, new THREE.Vector3(x, H / 2, (zz + hl) / 2), Math.PI / 2);
    lines([[[x, 0, zz], [x, H, zz]]], COL.vinyl, 0.8, true);
  }
  // skirting + conduit
  const cd = 0.05;
  const box = (x0, x1, y0, y1, z0, z1) => [...rect(x0, x1, z0, z1, y0), ...rect(x0, x1, z0, z1, y1),
    [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x0, y0, z1], [x0, y1, z1]], [[x1, y0, z1], [x1, y1, z1]]];
  if (S.wallRows) {
    if (S.walls.back && S.backCols) {
      const x0 = G.bx0, x1 = G.bx0 + S.backCols * s;
      plane(x1 - x0, S.skirt, COL.cover, 0.12, new THREE.Vector3((x0 + x1) / 2, th + S.skirt / 2, -hl + 0.004));
      lines(box(x0, x1, G.yTop, G.yTop + S.conduit, -hl, -hl + cd), COL.power, 0.8);
    }
    for (const side of ['left', 'right']) {
      if (!S.walls[side] || !S.sideCols) continue;
      const xw = side === 'left' ? -hw : hw, xi = side === 'left' ? -hw + cd : hw - cd, z0 = G.sideZ0, z1 = z0 + S.sideCols * s;
      plane(z1 - z0, S.skirt, COL.cover, 0.12, new THREE.Vector3(xw + (side === 'left' ? 0.004 : -0.004), th + S.skirt / 2, (z0 + z1) / 2), Math.PI / 2);
      lines(box(Math.min(xw, xi), Math.max(xw, xi), G.yTop, G.yTop + S.conduit, z0, z1), COL.power, 0.8);
    }
  }
  room.label('ENTRY ZONE · CARPET', new THREE.Vector3(hw * 0.45, 0.15, (zz + hl) / 2 - 0.2), { color: COL.door, size: 0.09 });
  if (G.power > 0.001) room.label('POWER', new THREE.Vector3(0, th + 0.1, (G.gz1 + zz) / 2), { color: COL.power, size: 0.08 });
  room.label('VINYL', new THREE.Vector3(-hw + 0.05, 1.5, (zz + hl) / 2), { color: COL.vinyl, size: 0.09 });
  room.label('VINYL', new THREE.Vector3(hw - 0.05, 1.5, (zz + hl) / 2), { color: COL.vinyl, size: 0.09 });

  // ---- tiles ----
  const tiles = [], map = {};
  const gap = Math.min(0.008, s * 0.03);
  const geo = { floor: new THREE.BoxGeometry(s - gap, th, s - gap), back: new THREE.BoxGeometry(s - gap, s - gap, th), side: new THREE.BoxGeometry(th, s - gap, s - gap) };
  const edges = { floor: new THREE.EdgesGeometry(geo.floor), back: new THREE.EdgesGeometry(geo.back), side: new THREE.EdgesGeometry(geo.side) };
  const group = new THREE.Group(); scene.add(group);
  const add = (surface, r, c, kind, x, y, z) => {
    const mesh = new THREE.Mesh(geo[kind], new THREE.MeshBasicMaterial({ color: COL.base, transparent: true, opacity: 0.05, depthWrite: false }));
    mesh.position.set(x, y, z);
    const edge = new THREE.LineSegments(edges[kind], new THREE.LineBasicMaterial({ color: COL.edge }));
    mesh.add(edge); group.add(mesh);
    const t = { id: `${surface}:${r}:${c}`, idx: tiles.length, surface, r, c, mesh, edge, pos: mesh.position, level: 0, color: new THREE.Color(COL.base) };
    tiles.push(t); ((map[surface] ||= [])[r] ||= [])[c] = t;
    room.clickable(mesh, t.id, `${surface} · row ${r + 1} · col ${c + 1}`);
  };
  // floor: r from back wall toward the door, c left -> right
  for (let r = 0; r < S.nz; r++) for (let c = 0; c < S.nx; c++) add('floor', r, c, 'floor', -G.fx + s * (c + .5), th / 2, G.gz0 + s * (r + .5));
  // back wall: r bottom -> top, c left -> right
  if (S.walls.back) for (let r = 0; r < S.wallRows; r++) for (let c = 0; c < S.backCols; c++)
    add('back', r, c, 'back', G.bx0 + s * (c + .5), G.yBase + s * (r + .5), -hl + th / 2);
  // side walls: c from the back corner toward the door
  for (const side of ['left', 'right']) {
    if (!S.walls[side]) continue;
    const x = side === 'left' ? -hw + th / 2 : hw - th / 2;
    for (let r = 0; r < S.wallRows; r++) for (let c = 0; c < S.sideCols; c++) add(side, r, c, 'side', x, G.yBase + s * (r + .5), G.sideZ0 + s * (c + .5));
  }

  const BASE = new THREE.Color(COL.base), EDGE = new THREE.Color(COL.edge), WHITE = new THREE.Color('#ffffff'), tmp = new THREE.Color();
  const paint = (t) => {
    const m = t.mesh.material, e = t.edge.material;
    if (t.level <= 0.002) { m.color.copy(BASE); m.opacity = 0.05; e.color.copy(EDGE); }
    else { m.color.copy(t.color); m.opacity = 0.1 + 0.82 * t.level; e.color.copy(tmp.copy(t.color).lerp(WHITE, 0.35)); }
  };
  // frame buffer: games put() layers each frame, then flush() once
  const fbCol = [], fbLvl = new Float32Array(tiles.length);
  const api = {
    S, tiles, byId: new Map(tiles.map(t => [t.id, t])),
    at(surface, r, c) { const m = map[surface]; return m && m[r] ? m[r][c] || null : null; },
    set(t, color, level = 1) { t.color.set(color); t.level = level; paint(t); },
    off(t) { t.level = 0; paint(t); },
    clear() { tiles.forEach(t => { t.level = 0; paint(t); }); },
    begin() { fbLvl.fill(0); },
    put(t, color, lvl = 1) { if (!t) return; fbCol[t.idx] = color; fbLvl[t.idx] = lvl; },
    flush() { for (const t of tiles) { const l = fbLvl[t.idx]; if (l > 0) api.set(t, fbCol[t.idx], l); else if (t.level) api.off(t); } },
  };
  return api;
}
