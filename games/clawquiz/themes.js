// Collage themes. Placeholder pictures are emoji so the sim needs no image files;
// swap in real artwork later by replacing the drawing in collage.js.
// Each item: [emoji, singular name, plural name (optional, defaults to name + 's')]

export const THEMES = {
  sport: { label: 'Sport', items: [
    ['⚽', 'football'], ['🏀', 'basketball'], ['🏈', 'gridiron ball'], ['⚾', 'baseball'], ['🎾', 'tennis ball'],
    ['🏐', 'volleyball'], ['🏉', 'rugby ball'], ['🎱', 'pool ball'], ['🏓', 'ping pong bat'], ['🏸', 'shuttlecock'],
    ['🥊', 'boxing glove'], ['🏆', 'trophy', 'trophies'], ['🥇', 'gold medal'], ['🛹', 'skateboard'], ['⛳', 'golf flag'], ['🏒', 'hockey stick'],
  ] },
  emoji: { label: 'Emoji', items: [
    ['😀', 'grinning face'], ['😂', 'laughing face'], ['😍', 'heart-eyes face'], ['😎', 'sunglasses face'], ['🤔', 'thinking face'],
    ['😴', 'sleepy face'], ['😡', 'angry face'], ['🥳', 'party face'], ['🤯', 'mind-blown face'], ['😱', 'screaming face'],
    ['🤠', 'cowboy'], ['👻', 'ghost'], ['🤖', 'robot'], ['👽', 'alien'], ['🤡', 'clown'],
  ] },
  teddies: { label: 'Teddies', items: [
    ['🧸', 'teddy bear'], ['🪀', 'yo-yo'], ['🪁', 'kite'], ['🎈', 'balloon'], ['🎁', 'present'], ['🧩', 'jigsaw piece'],
    ['🪆', 'nesting doll'], ['🦄', 'unicorn'], ['🐼', 'panda'], ['🐰', 'bunny', 'bunnies'], ['🐥', 'chick'], ['🎀', 'bow'],
    ['🚂', 'toy train'], ['🪅', 'piñata'], ['🐨', 'koala'],
  ] },
  space: { label: 'Space', items: [
    ['🚀', 'rocket'], ['🛸', 'flying saucer'], ['🪐', 'ringed planet'], ['🌙', 'moon'], ['⭐', 'star'], ['☄️', 'comet'],
    ['🌍', 'Earth', 'Earths'], ['👨‍🚀', 'astronaut'], ['🛰️', 'satellite'], ['🌞', 'sun'], ['🔭', 'telescope'], ['👾', 'space invader'],
    ['🌠', 'shooting star'],
  ] },
  food: { label: 'Food', items: [
    ['🍕', 'pizza slice'], ['🍔', 'burger'], ['🌭', 'hot dog'], ['🍟', 'fries', 'fries'], ['🍩', 'doughnut'], ['🍦', 'ice cream', 'ice creams'],
    ['🍓', 'strawberry', 'strawberries'], ['🍉', 'watermelon'], ['🌮', 'taco'], ['🍣', 'sushi', 'sushi'], ['🥑', 'avocado'],
    ['🍪', 'cookie'], ['🧁', 'cupcake'], ['🍌', 'banana'],
  ] },
  animals: { label: 'Animals', items: [
    ['🐶', 'dog'], ['🐱', 'cat'], ['🦊', 'fox', 'foxes'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🦁', 'lion'], ['🐷', 'pig'],
    ['🐙', 'octopus', 'octopuses'], ['🦀', 'crab'], ['🐢', 'turtle'], ['🦒', 'giraffe'], ['🐘', 'elephant'], ['🦉', 'owl'], ['🐧', 'penguin'],
  ] },
};

export const THEME_IDS = Object.keys(THEMES);
export const item = (arr) => ({ e: arr[0], name: arr[1], plural: arr[2] || arr[1] + 's' });
