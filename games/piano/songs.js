// Placeholder song library. Every title and artist is made up, and every tune is
// generated in the browser (see music.js) from the song's seed — no real music.
// To use real clips later, add `file: 'audio/<name>.mp3'` to a song; the game plays
// the file when it exists and falls back to the generated tune when it doesn't.

const raw = {
  '80s': [
    ['Neon Highway', 'The Static Hearts'], ['Cassette Summer', 'Vera Glow'], ['Laser Tag Love', 'Midnight Arcade'],
    ['Shoulder Pad Shuffle', 'The Holograms'], ['Synth City Nights', 'Rio Velvet'], ['Walkman Daydream', 'Kim Starling'],
    ['Electric Leg Warmers', 'Pulse Theory'], ['Rubik Heart', 'The New Romantix'], ['VHS Kiss', 'Chrome Valentine'],
    ['Delorean Drive', 'Nova Sunset'], ['Big Hair Big Dreams', 'The Mixtape Kids'], ['Pastel Thunder', 'Max Volt'],
  ],
  '90s': [
    ['Dial-Up Romance', 'Modem Kings'], ['Frosted Tips', 'Boy Bandwidth'], ['Tamagotchi Tears', 'Pixel Sisters'],
    ['Rollerblade Rebel', 'Grunge Avenue'], ['Pager Me Later', 'DJ Flannel'], ['Slap Bracelet', 'Eurobeat Express'],
    ['Rewind Friday', 'The Rewinders'], ['Chunky Sneakers', 'MC Overall'], ['Floppy Disk Heart', 'Daisy Data'],
    ['Mixtape Monday', 'The Flannels'], ['Windbreaker Weather', 'Jade Jelly'], ['Bucket Hat Groove', 'Sunny Beeper'],
  ],
  '2000s': [
    ['Flip Phone Feelings', 'Glitter Sidekick'], ['Ringtone Romance', 'T9 Tina'], ['Low Rise Love', 'The Trucker Hats'],
    ['Top 8 Friends', 'Emo Elevator'], ['Frosted Lip Gloss', 'Butterfly Clip'], ['Burned CD Summer', 'The Downloaders'],
    ['Bluetooth Breakup', 'Razor Edge'], ['Bling Bling Hotline', 'Lil Pixel'], ['Side Fringe Serenade', 'Eyeliner Avenue'],
    ['Y2K Panic Party', 'Millennium Bugs'], ['Click Wheel Crush', 'The Pod People'], ['Velour Tracksuit Strut', 'Diamante Dreams'],
  ],
};

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const SONGS = Object.entries(raw).flatMap(([genre, list]) =>
  list.map(([title, artist]) => ({ id: hash(title).toString(36), genre, title, artist, seed: hash(title + artist) })));

export const GENRES = [
  { id: 'mixed', label: 'Mixed Bag' },
  { id: '80s', label: '80s' },
  { id: '90s', label: '90s' },
  { id: '2000s', label: '2000s' },
];

export function songsFor(genre) { return genre === 'mixed' ? SONGS : SONGS.filter(s => s.genre === genre); }
