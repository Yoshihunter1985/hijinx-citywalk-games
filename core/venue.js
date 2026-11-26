// Universal CityWalk Hollywood — Hijinx section, from plan SK21 (24 Nov 2026).
// Room coordinates: w = width across the door wall (m), d = depth from the door wall
// to the back wall (m), h = ceiling height (m, 2.7 assumed until confirmed).
// door.x and cabinet.x are measured from the left edge of the door wall,
// as seen from inside the room looking in from the doorway.

export const VENUE = {
  name: 'Universal CityWalk Hollywood',
  levels: ['Upper', 'Ground'],
};

export const ROOMS = {
  R1:  { level: 'Upper',  w: 3.5, d: 5.0, h: 2.7, door: { x: 2.0, width: 0.9 }, cabinet: { x: 0.45 } },
  R2:  { level: 'Upper',  w: 3.5, d: 5.0, h: 2.7, door: { x: 2.0, width: 0.9 }, cabinet: { x: 0.45 } },
  R3:  { level: 'Upper',  w: 3.5, d: 5.0, h: 2.7, door: { x: 2.0, width: 0.9 }, cabinet: { x: 0.45 } },
  R4:  { level: 'Upper',  w: 3.5, d: 5.0, h: 2.7, door: { x: 2.0, width: 0.9 }, cabinet: { x: 0.45 } },
  R5:  { level: 'Ground', w: 3.81, d: 5.0, h: 2.7, door: { x: 2.2, width: 0.9 }, cabinet: { x: 0.45 } },
  R6:  { level: 'Ground', w: 3.81, d: 5.0, h: 2.7, door: { x: 2.2, width: 0.9 }, cabinet: { x: 0.45 } },
  R7:  { level: 'Ground', w: 3.81, d: 5.0, h: 2.7, door: { x: 2.2, width: 0.9 }, cabinet: { x: 0.45 } },
  R8:  { level: 'Ground', w: 3.9, d: 7.0, h: 2.7, door: { x: 1.4, width: 0.9 }, cabinet: { x: 0.45 } },
  R9:  { level: 'Ground', w: 5.0, d: 3.5, h: 2.7, door: { x: 3.6, width: 0.9 }, cabinet: { x: 4.6 }, note: 'Door on the long wall' },
  R10: { level: 'Ground', w: 3.5, d: 5.0, h: 2.7, door: { x: 1.6, width: 0.9 }, cabinet: { x: 3.1 } },
  ELEV:{ level: 'Ground', w: 2.4, d: 2.6, h: 2.7, door: { x: 1.2, width: 1.0 }, cabinet: null, note: 'Mock lift by reception' },
};

// Clickable room outlines on assets/venue-map.png (pixels on the 1350 × 2020 image).
export const MAP = {
  image: 'assets/venue-map.png', w: 1350, h: 2020,
  rooms: {
    R1: [52, 120, 243, 393], R2: [243, 120, 433, 393], R3: [433, 120, 623, 393], R4: [623, 120, 815, 393],
    R5: [91, 721, 299, 995], R6: [299, 721, 506, 995], R7: [506, 721, 712, 995],
    R8: [91, 1137, 302, 1521], R9: [302, 1137, 575, 1329], R10: [302, 1329, 575, 1521],
    ELEV: [214, 1735, 366, 1889],
  },
};

// Draft allocation — matches the spec doc. Physical (P) vs thinking (T).
export const ALLOCATION = [
  { room: 'R1',  game: 'Titanic',          type: 'P', path: 'games/titanic/index.html' },
  { room: 'R2',  game: 'Abandoned Arcade', type: 'T', path: null },
  { room: 'R3',  game: 'Puck Slide',       type: 'P', path: null },
  { room: 'R4',  game: 'Piano',            type: 'T', path: 'games/piano/index.html' },
  { room: 'R5',  game: 'Submarine',        type: 'P', path: null },
  { room: 'R6',  game: 'Restaurant',       type: 'T', path: null },
  { room: 'R7',  game: 'Ball Pit (TBC)',   type: 'P', path: null },
  { room: 'R8',  game: 'Light Floor',      type: 'P', path: 'games/lightfloor/index.html' },
  { room: 'R9',  game: 'Claw Quiz',        type: 'T', path: 'games/clawquiz/index.html' },
  { room: 'R10', game: 'Escape Room',      type: 'T', path: null },
  { room: 'ELEV',game: 'Elevator',         type: '',  path: 'games/elevator/index.html' },
];
