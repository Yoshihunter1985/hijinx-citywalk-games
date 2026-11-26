# Hijinx · Universal CityWalk · game room simulator

Playable wireframe test rooms for the Hijinx section of the Universal CityWalk Hollywood venue: 10 quickplay rooms over two levels, plus the mock-lift elevator. The simulator is for testing gameplay and for demoing it to others (you drive it, or screen-record it).

Spec, room allocation and decisions live in the **Game Room Spec** doc. This repo is the code.

## Open it

- **Venue page:** `index.html`, which lists every room and links to the playable ones.
- **Player mode:** add `?mode=player` to any URL. This hides the Admin button. It's for sharing, not security, so anyone who removes the parameter gets admin back.

It's a static site, so GitHub Pages serves it as-is. To run it locally, use any static server from the repo root, for example `python -m http.server`, then open `http://localhost:8000`. Opening the file directly won't work, because browsers block ES modules on `file://`.

## Layout

```
index.html              venue page (rooms by level, from core/venue.js)
core/
  venue.js              room sizes, doors, cabinets (plan SK21) + draft allocation
  room.js               wireframe 3D room: walls, door, cabinet, screens, props, picking
  shell.js              shared game shell: outside screen, RFID/queue, clock, inputs,
                        score screen, settings + easy/hard presets, admin drawer
  draw.js               canvas helpers for in-room screens
  core.css              shared look
  vendor/               three.js r170 + OrbitControls (MIT, vendored so nothing loads from a CDN)
games/
  piano/                R4 music quiz (game 1)
  lightfloor/           R8 light-up tile room: Planet Defence + Colour Call (game 2)
  clawquiz/             R9 search-the-collage quiz that earns claw machine credits (game 3)
```

## What every game gets from the core

- **A room at its real size.** Door, game cabinet, a 12" outside screen and a score screen above the door are drawn automatically.
- **The outside screen flow:** tap card (team name), then pick a game if the room has more than one, then pick Easy or Hard, then the game runs with the time left shown. Tapping more cards while a game runs queues those teams.
- **Inputs three ways:** click the prop in 3D, click the side-panel buttons, or use keys 1–4.
- **Admin drawer, in four tabs:**
  - **Demo:** live state plus room and game actions.
  - **Settings:** global settings.
  - **Easy / Hard:** the two presets side by side.
  - **Save & share:** export or import the settings JSON.

## Settings

Admin changes save in your browser straight away. To make them the default for everyone, including player mode on other devices, open **Save & share**, download `settings.json`, and commit it into that game's folder, for example `games/piano/settings.json`.

## Adding a game

Copy `games/piano/` as a template:

1. Define `SCHEMA` (settings, with `preset: true` for per-difficulty ones) and `PRESETS`.
2. Write a game class with these hooks: `setup`, `begin`, `press`, `tick`, `onTimeUp`, `reset`, `draw`, `scoreboard`, and optionally `adminInfo` and `adminActions`.
3. Build props in `setup()` with `room.wireMesh()`, `room.wallPose()` and `room.clickable()`.
4. Set `path` for the room in `core/venue.js`.

## Piano (R4)

- **Room:** four prop instruments (piano, drum, guitar, sax), each with one button, and one large question screen.
- **Start:** players pick a genre by pressing an instrument: Piano = Mixed Bag, Drum = 80s, Guitar = 90s, Sax = 2000s.
- **Rounds:** each song is a 20 s snippet with 4 answers, one per instrument. Points slide from 1,000 down to 100 over the snippet. A wrong answer scores nothing and the game moves on. The game lasts 3 minutes.
- **Hard mode:** every song plays through a different distortion: chipmunk, slow-mo, underwater, warped tape, bit-crushed, old radio or backwards. You choose which ones are used, and how strong, in admin.
- **Audio:** all songs are generated in the browser from made-up titles (`games/piano/songs.js`, `music.js`). There is no real music. To use real clips later, add `file: 'audio/name.mp3'` to a song. The game plays the file when it exists and falls back to the generated tune when it doesn't. Only commit clips you're licensed to use: this repo is public.

## Light Floor (R8)

- **Room:** the Light Floor Room Sim's rules at R8's size (3.9 × 7.0 m). It keeps the 2.07 m carpeted entry zone for the door swing and turning space, 300 mm tiles, cable gaps, power strip, skirting and conduit. That fits a 12 × 15 floor, a 12 × 8 back wall and 16 × 8 on each side wall: 532 tiles.
- **Choosing a game:** players pick Planet Defence or Colour Call, then Easy or Hard, on the outside screen.
- **Planet Defence:** stamp on missiles before they reach the planet. One hit ends the game. Surviving to the time limit (default 3:00) wins. Hard uses the original sim's tuning.
- **Colour Call:** get onto the called colour before the 3-2-1 count ends. Running out of lives ends the game early, and the time limit (default 3:00) is a hard stop. Pick a simulated player in the Players card, then click a tile to put them there.
- **Time limits** are set per game in admin. Any game can set its own limit with a `clockLength(mode, settings)` hook.
- **Clicking tiles when no team is playing** sends ripples across the room.

## Claw Quiz (R9)

- **Room:** a central block runs out from the back wall. The claw machine sits against the wall, then a walk-through tunnel gap, then the console facing the door, which has the question screen and buttons A–D. The credit display sits on the tunnel header. Collage screens: an 85" on each side wall, and two 75" on the back wall either side of the block (1.95 m free each side, so 75" is the biggest that fits).
- **Theme:** players pick one with buttons A–D. The four offered are chosen in admin from Sport, Emoji, Teddies, Space, Food and Animals.
- **Question pack:** each theme has one fixed collage and every question it can answer: how many, which is NOT on the screens, and (hard) which is there the most of. Each pack is short (8 questions on easy, 10 on hard). The collage and questions are the same every game, so teams can learn it. Change the "collage layout number" in admin, or press "New collage layout", to get a new one. Question order is shuffled each game.
- **Timing and scoring:** 20 s per question on easy and 15 s on hard, inside a 3-minute game. A wrong answer just moves on. Every 4 correct answers earns a claw credit, shown as a pop-up and on the credit display. The claw itself isn't simulated.
- **Placeholder pictures** are emoji, defined in `games/clawquiz/themes.js`. Click a collage thumbnail in the side panel to search it full size.
