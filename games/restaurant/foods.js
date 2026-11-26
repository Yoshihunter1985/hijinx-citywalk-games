// Foods for the Restaurant tables. Each table's lazy Susan holds 6 of these, one per dome.
// Placeholder pictures are emoji. `riddle` is the hard-mode description of the food itself.
export const FOODS = [
  { id: 'strawberry', e: '🍓', name: 'strawberry', colour: 'red', kind: 'fruit', riddle: "Wimbledon's favourite fruit" },
  { id: 'cherries', e: '🍒', name: 'cherries', colour: 'red', kind: 'fruit', riddle: 'They come in pairs, on stalks' },
  { id: 'lemon', e: '🍋', name: 'lemon', colour: 'yellow', kind: 'fruit', riddle: 'When life gives you these…' },
  { id: 'apple', e: '🍏', name: 'green apple', colour: 'green', kind: 'fruit', riddle: 'One a day keeps the doctor away' },
  { id: 'blueberries', e: '🫐', name: 'blueberries', colour: 'blue', kind: 'fruit', riddle: 'Tiny berries, the colour of a sad song' },
  { id: 'grapes', e: '🍇', name: 'grapes', colour: 'purple', kind: 'fruit', riddle: 'Grows on a vine and ends up as wine' },
  { id: 'orange', e: '🍊', name: 'orange', colour: 'orange', kind: 'fruit', riddle: 'A fruit that shares its name with its colour' },
  { id: 'croissant', e: '🥐', name: 'croissant', colour: 'golden', kind: 'pastry', riddle: 'A flaky French breakfast, bent like the moon' },
  { id: 'cupcake', e: '🧁', name: 'cupcake', colour: 'pink', kind: 'cake', riddle: 'A birthday treat in a paper cup' },
  { id: 'cake', e: '🍰', name: 'slice of cake', colour: 'white', kind: 'cake', riddle: 'A slice of something celebratory' },
  { id: 'doughnut', e: '🍩', name: 'doughnut', colour: 'brown', kind: 'cake', riddle: 'A sweet with a hole in the middle' },
  { id: 'cookie', e: '🍪', name: 'cookie', colour: 'tan', kind: 'biscuit', riddle: "A certain blue monster's favourite snack" },
];

export const COLOUR_RIDDLE = {
  red: 'the colour of a stop sign', yellow: 'the colour of the sun', green: 'the colour of grass',
  blue: 'the colour of the sky', purple: 'the colour of royalty', orange: 'the colour of a traffic cone',
  golden: 'the colour of a gold medal', pink: 'the colour of a flamingo', white: 'the colour of snow',
  brown: 'the colour of chocolate', tan: 'the colour of a paper bag',
};

// Animal portraits shown on any screen that isn't in use.
export const PORTRAITS = [
  { e: '🦊', name: 'Sir Reginald Fox', sub: 'Head Waiter, 1912' },
  { e: '🐶', name: 'Lady Biscuit', sub: 'Patron of the Pastry' },
  { e: '🦉', name: 'Professor Hoot', sub: 'Keeper of the Cellar' },
  { e: '🐷', name: 'Lord Truffle', sub: 'Founder of the Feast' },
  { e: '🐱', name: 'Duchess Whiskers', sub: 'Mistress of Desserts' },
  { e: '🐰', name: 'Count Clover', sub: 'Garden Supplier' },
];
