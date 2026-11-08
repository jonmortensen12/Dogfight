/* Dogfight - the adventure: every level, as data.

   A level is: the ground (terrain.js reads ground, path, width, rim...),
   how it looks (theme, read by world.js), what happens along the rail
   (script, run by sim.js as the rail passes each u), the clearing's
   waves, the boss, the music, and what everyone says.

   THE STORY. Emperor Mittens was the most pampered cat in the galaxy,
   until she knocked one too many things off the table and was banished to
   the dark side of the Litterbelt. She is back, with an empire of cats,
   the Hiss, and a plan: knock every planet in the Dog Star system off its
   orbit, one by one, because she can. Good Boy Squadron - Teddy and his
   wingmates - stand in her way.

   THE ROUTE. Ten planets; a playthrough flies seven. After each level the
   route map offers the next ones (`next`); the first of each pair is the
   gentler.
        Red Canyon -> Tidewater | Thunder Peaks -> The Kennel | Frost Fang
        -> Catnip Jungle | Yarn Nebula -> Moonfall -> Scratchpost -> Mittens' Lair

   The squad: Teddy and {wing1} from the start; {wing2} joins on the
   second planet; {wing3} on the third (rescued from the Kennel, or found
   on Frost Fang). Names come from cast.js. */
import {smooth} from './terrain.js';

const S = (u, a, b) => smooth(a, b, u);
const wave = (u, base, amp, len, ph) => base + amp * Math.sin(u / len + (ph || 0));

/* A rail's worth of rocks, laid out from a seeded dice roll. */
function scatter(R, lay, from, to, every, fn){
  const out = [];
  for(let u = from; u < to; u += every * (0.6 + R() * 0.8)) out.push(fn(u, R));
  return out;
}

export const LEVELS = {

/* ================================================================ 1 */
canyon: {
  name: 'Red Canyon', planet: 'Rusthound', n: 1,
  blurb: 'The Hiss have dug in at the edge of home.',
  ground: 'canyon', railEnd: 3700, arenaU: 4250,
  /* SECRET: past the two arches the canyon splits - the left-hand channel
     is a dry riverbed, narrower, with gold in it, and it opens the hard
     route (Thunder Peaks). Stay right for Tidewater. */
  fork: {u0: 2600, u1: 3400, side: -1, off: 150, width: 32, say: ['wing1', 'The old riverbed! Rosie said nobody comes down here...']},
  secret: {type: 'fork', need: 1, label: 'SECRET ROUTE', found: ['rosie', "You found the old riverbed! It comes out right under their noses. The hard route to Thunder Peaks is open!"]},
  path: {a: [70, 34, 12], l: [420, 170, 73], p: [0, 1.3, 0.4]},
  width: u => 50 + 12 * Math.sin(u / 260 + 0.5) - 16 * S(u, 1750, 1850) * (1 - S(u, 2150, 2250)) + 30 * S(u, 3300, 3650),
  rim: u => 88 + 14 * Math.sin(u / 600) + 20 * S(u, 3200, 3600),
  theme: {kind: 'day', haze: [0.93, 0.70, 0.52], zenith: [0.20, 0.38, 0.70], sun: [-0.45, 0.42, -0.78], fog: [260, 1700],
    strata: [0xa8502a, 0xc46a38, 0x8e4022, 0xd88a50, 0xb05a32, 0xe3a46a, 0x9c4a2a, 0xcf7c44], sand: 0xd8a46c, scrub: 0x7d8040, wet: 0x7a5232, top: 0xe2b47c,
    water: 0x2c5f6e, planet: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  obstacles: (lay) => [
    lay.spire(800, -18, 7, 70), lay.spire(880, 16, 7, 80), lay.spire(960, -10, 8, 65),
    lay.arch(1250, 34, 14),
    lay.spire(1900, 12, 6, 60), lay.spire(1990, -9, 6, 72), lay.spire(2080, 8, 6, 66),
    lay.arch(2420, 30, 12), lay.arch(2520, 38, 16),
    lay.spire(3000, 0, 9, 75),
    ...lay.onFork(() => [lay.spire(2950, -6, 5, 50), lay.arch(3100, 26, 10), lay.spire(3250, 7, 5, 55)]),
    ...[[0.45, 140, 38, 150], [2.2, 330, 46, 190], [3.7, 250, 32, 120], [5.2, 380, 52, 210], [1.2, 420, 30, 135]].map(([a, r, rad, h]) =>
      lay.spireAt(lay.arenaX + Math.cos(a) * r, lay.arenaZ + Math.sin(a) * r, rad, h)),
  ],
  briefing: [
    ['rosie', "Good Boy Squadron, this is base. Emperor Mittens is back - and she's brought an army of cats."],
    ['rosie', "Her Hiss have dug in at Red Canyon, right on our doorstep. Fly the canyon, clear the basin at the end."],
    ['wing1', "I'll stick to your tail, {teddy}. Just like at the park."],
    ['teddy', "Let's go! ...Is there a snack after?"],
  ],
  script: A => {
    A.at(60, () => A.say('rosie', 'Point the phone where you want to go. Tap to bark, hold for a big one.', 3.4));
    A.at(200, () => A.say('wing1', "Biscuit here. I've got your tail, {teddy}.", 3));
    A.at(330, () => A.formation(3, 750));
    A.at(560, () => { A.turret(1050, -1); A.turret(1080, 1); });
    A.at(620, () => A.pickup('bone', 760, 0, 14));
    A.at(700, () => A.say('rosie', 'Rocks ahead - weave through.', 2.4));
    A.at(1000, () => { A.swoop(3); A.say('rosie', 'Bandits behind you! LOOP to get behind them!', 3); });
    A.at(1060, () => { A.pickup('ball', 1250, 0, 22); A.say('teddy', 'Ooh - a ball under that arch.', 2.4); });
    A.at(1360, () => { A.turret(1750, -1); A.turret(1780, 1); A.turret(1820, -1); A.formation(2, 1800); });
    A.at(1600, () => { A.cross(2050, -1, 34); A.cross(2110, 1, 26); });
    A.at(1700, () => { A.pickup('gold', 1990, 18, 12); A.say('wing1', "It's tight through the narrows. Keep your ears in.", 2.6); });
    A.at(2150, () => A.formation(5, 2580));
    A.at(2300, () => A.say('teddy', 'Arches! Stay low!', 2));
    A.at(2450, () => A.say('wing1', "Is that a side canyon over on the LEFT? Looks like an old riverbed...", 3));
    A.at(2750, () => { A.turret(2980, -1); A.turret(3000, 1); A.turret(3040, 1); A.turret(3070, -1); A.pickup('bomb', 2850, -12, 20); }, 'main');
    A.at(2750, () => A.pickup('gold', 2860, 22, 46), 'main');
    A.at(2750, () => { A.formation(3, 3050); A.pickup('gold', 2900, 0, 14); A.pickup('bomb', 3000, 0, 20); }, 'alt');
    A.at(2950, () => A.swoop(4));
    A.at(3150, () => A.pickup('bone', 3320, 0, 20));
    A.at(3250, () => A.say('rosie', 'The canyon opens up ahead. Once you are out, you are free to fly - anywhere.', 3.8));
    A.at(3500, () => A.pickup('gold', 3640, -30, 50));
  },
  waves: [
    {say: ['teddy', 'Five of them. Here we go!'], spawn: [{type: 'dart', n: 5}]},
    {say: ['rosie', 'More coming - from all sides. Use the U-turn!'], spawn: [{type: 'dart', n: 3, ang: 1.9}, {type: 'raider', n: 2, ang: -1.6}], help: 'wing1'},
  ],
  boss: {type: 'brute', name: 'THE BRUTE', warn: ['rosie', 'Something big is coming over the ridge...'], escort: 2},
  outro: [['rosie', 'Red Canyon is clear! Mittens will not be happy.'], ['mittens', 'Hmph. Lucky dog. Enjoy it - I have SO many more things to knock over.']],
  next: {normal: 'tidewater', secret: 'thunder'},
  joins: ['wing1'],
},

/* ================================================================ 2a */
/* All rail. Low over the sea, past sea stacks. SECRET: shoot all eight of
   the Hiss's radar buoys bobbing on the water (fly low) - the hard route,
   to Frost Fang. The boss is a chase: the Big Tabby carrier steams away
   down the rail; take out its deck guns, then its bridge, before it gets
   away. */
tidewater: {
  name: 'Tidewater', planet: 'Splashdown', n: 2,
  blurb: 'An ocean world. Catch the Big Tabby before it gets away.',
  ground: 'ocean', railEnd: 3300, arenaU: 99999, arena: false,
  railChase: {u: 3300, len: 4600, escape: 'The Big Tabby got away!', say: ['mittens', 'Bye-bye, doggies! Full steam ahead!']},
  path: {a: [90, 40, 10], l: [500, 200, 80], p: [0.3, 0.8, 0]},
  width: u => 75 + 15 * Math.sin(u / 300),
  railTop: 60, railFloor: 7,
  theme: {kind: 'day', haze: [0.78, 0.86, 0.95], zenith: [0.18, 0.42, 0.85], sun: [0.35, 0.55, -0.75], fog: [300, 1900], clouds: 0.9,
    strata: [0x8a8478, 0x6e6a62, 0x9c968a, 0x7a746a, 0xa8a090], sand: 0xe8d6a8, scrub: 0x4a8a3a, wet: 0xb8a878, top: 0x5a9a42,
    water: 0x1a6a8a, ocean: true, planet: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  secret: {type: 'buoys', need: 8, label: 'RADAR BUOYS', found: ['rosie', "That's every radar buoy! They're blind - and I've found a back way to Frost Fang. Hard route, here we come!"]},
  obstacles: (lay, R) => [
    ...scatter(R, lay, 500, 3100, 140, (u, R) => lay.spire(u, (R() - 0.5) * 100, 6 + R() * 6, 40 + R() * 60, 'stack')),
    lay.arch(1400, 28, 16, 'stack'), lay.arch(2600, 32, 14, 'stack'),
    ...scatter(R, lay, 3500, 7800, 260, (u, R) => lay.spire(u, (R() < 0.5 ? -1 : 1) * (45 + R() * 30), 6 + R() * 5, 30 + R() * 50, 'stack')),
  ],
  briefing: [
    ['rosie', "The Hiss are on Tidewater, and their aircraft carrier - the Big Tabby - is about to leave port."],
    ['wing1', "Cats. On a boat. In the water. That's... brave of them."],
    ['rosie', "Catch it before it gets away. And keep an eye on the water: the Hiss float radar buoys. Sink them ALL and they'll never see us coming."],
    ['teddy', "Then let's go. Splash!"],
  ],
  script: A => {
    A.at(150, () => A.say('rosie', 'Radar buoys on the water - the blinking ones. Fly low and pop them!', 3));
    A.at(200, () => { A.buoy(420, -20); A.buoy(700, 35); });
    A.at(300, () => A.formation(4, 760));
    A.at(500, () => { A.turretOn(900); A.turretOn(1100); A.buoy(1050, -45); });
    A.at(800, () => A.say('wing2', "Is that the squadron? About time! I've been fighting these cats all morning!", 3.4));
    A.at(900, () => { A.join('wing2'); A.swoop(3); A.buoy(1300, 30); });
    A.at(1000, () => A.pickup('ball', 1400, 0, 18));
    A.at(1250, () => A.say('wing2', "Pepper reporting! Point me at a cat!", 2.6));
    A.at(1500, () => { A.cross(1900, 1, 26); A.cross(1960, -1, 34); A.formation(3, 1980); A.buoy(1850, -55); });
    A.at(1700, () => A.pickup('bone', 1900, -20, 12));
    A.at(2000, () => { A.turretOn(2300); A.turretOn(2400); A.turretOn(2450); A.buoy(2350, 50); });
    A.at(2100, () => A.pickup('gold', 2300, 40, 10));
    A.at(2400, () => { A.formation(5, 2900); A.say('wing1', 'Big wave of them ahead!', 2); A.buoy(2700, -10); });
    A.at(2700, () => A.pickup('gold', 2600, 0, 22));
    A.at(2800, () => { A.swoop(3); A.pickup('bomb', 3050, 10, 20); A.buoy(3150, 40); });
    A.at(3000, () => A.say('rosie', "There's the carrier - it's making a run for it! After it!", 3));
    A.at(3150, () => A.pickup('gold', 3250, -35, 45));
    A.at(4300, () => A.pickup('bone', 4500, 0, 14));
    A.at(5600, () => A.say('rosie', "Faster, {teddy}! It's nearly out of range!", 2.4));
  },
  waves: [],
  boss: {type: 'carrier', name: 'THE BIG TABBY', warn: ['rosie', "Deck guns first, then the bridge - before it gets away!"], escort: 0},
  outro: [['wing2', 'Did you see me? I bit a battleship!'], ['rosie', 'Tidewater is safe. Welcome to the squadron, {wing2}.'], ['mittens', 'My BOAT. You sank my lovely boat. You will PAY for that, dogs.']],
  next: {normal: 'kennel', secret: 'frost'},
  joins: ['wing2'],
},

/* ================================================================ 2b */
thunder: {
  name: 'Thunder Peaks', planet: 'Boomworld', n: 2, hard: true,
  blurb: 'A mountain world in a never-ending thunderstorm. Every dog\'s nightmare.',
  ground: 'canyon', railEnd: 3500, arenaU: 4100,
  path: {a: [80, 40, 14], l: [380, 160, 70], p: [1, 0.2, 2]},
  width: u => 46 + 14 * Math.sin(u / 230 + 1) - 10 * S(u, 2400, 2500) * (1 - S(u, 2800, 2900)) + 30 * S(u, 3100, 3450),
  rim: u => 150 + 30 * Math.sin(u / 500),
  groundParams: {wall: 40, steps: 3, mountains: 220, roll: 40},
  theme: {kind: 'storm', haze: [0.32, 0.36, 0.44], zenith: [0.10, 0.12, 0.18], sun: [0.2, 0.6, -0.7], fog: [180, 1300], clouds: 1.4,
    strata: [0x4a5048, 0x5a6258, 0x3e443c, 0x6a7064, 0x525a50], sand: 0x5a6a48, scrub: 0x3a5a30, wet: 0x30382a, top: 0x6a7a58,
    water: 0x3a4a50, rain: true, lightning: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  /* SECRET: six glowing storm rings hang high in the pass. Fly through
     every one and the storm opens a way to Frost Fang (the hard route). */
  secret: {type: 'rings', need: 6, label: 'STORM RINGS', found: ['rosie', "All six storm rings! The storm's opened a path - next stop, Frost Fang. Hard route!"]},
  obstacles: (lay, R) => [
    lay.spire(700, 15, 8, 110), lay.spire(780, -15, 8, 120),
    lay.arch(1150, 36, 16), lay.arch(1900, 32, 14),
    ...scatter(R, lay, 2400, 2900, 110, (u, R) => lay.spire(u, (R() - 0.5) * 30, 6, 90)),
    ...[[0.3, 160, 42, 230], [1.9, 300, 50, 260], [3.4, 220, 36, 180], [4.8, 380, 56, 280]].map(([a, r, rad, h]) =>
      lay.spireAt(lay.arenaX + Math.cos(a) * r, lay.arenaZ + Math.sin(a) * r, rad, h)),
  ],
  briefing: [
    ['rosie', 'Thunder Peaks. The storms there never stop, and the Hiss have built a weather tower to make them worse.'],
    ['teddy', '...Thunder? Like, the loud sky thing?'],
    ['wing1', "It's okay, {teddy}. Pretend it's just the vacuum cleaner. A really big vacuum cleaner."],
    ['rosie', "Watch the ground for glowing rings - that's where the lightning will hit. Someone out there needs help, too."],
  ],
  script: A => {
    A.at(100, () => { A.storm(true); A.say('rosie', 'Lightning! Watch for the rings and get out of them!', 3); });
    A.at(300, () => A.formation(4, 760));
    A.at(500, () => { A.turret(900, -1); A.turret(960, 1); A.turret(1000, -1); });
    A.at(850, () => A.say('wing2', "Hey! Whoever you are - I could use a hand here!", 2.8));
    A.at(950, () => { A.join('wing2'); A.swoop(4); });
    A.at(1000, () => A.pickup('ball', 1150, 0, 18));
    A.at(1100, () => { A.say('rosie', 'See those glowing rings, high up? Fly through every one - storm rings mean a way through.', 3.2); for(const [u, ox, y] of [[1300, -20, 50], [1500, 15, 48], [1700, 25, 44], [1950, -10, 46], [2150, 0, 48], [3000, -15, 46]]) A.pickup('ring', u, ox, y); });
    A.at(1300, () => A.say('wing2', "Pepper reporting! Point me at a cat! Not at the thunder!", 3));
    A.at(1400, () => { A.formation(5, 1850); A.cross(1900, 1, 30); });
    A.at(1700, () => { A.turret(2100, 1); A.turret(2150, -1); A.turret(2200, 1); A.pickup('bone', 2000, 0, 14); });
    A.at(2100, () => { A.say('rosie', 'The pass narrows - and the rocks are close.', 2.6); A.pickup('gold', 2650, 0, 50); });
    A.at(2300, () => A.swoop(4));
    A.at(2600, () => { A.cross(3000, -1, 28); A.cross(3060, 1, 40); A.pickup('bomb', 2900, 0, 20); });
    A.at(2900, () => { A.formation(5, 3300); A.pickup('gold', 3100, -25, 10); });
    A.at(3200, () => { A.say('rosie', "The tower's in the valley ahead. It's what makes the storm.", 3); A.pickup('gold', 3300, 30, 40); });
  },
  waves: [
    {say: ['wing2', 'More of them! This weather is the WORST!'], spawn: [{type: 'dart', n: 5}, {type: 'raider', n: 1, ang: 3}]},
    {say: ['rosie', 'Raiders coming in over the peaks!'], spawn: [{type: 'raider', n: 3, ang: 1.5}, {type: 'dart', n: 2, ang: -1.5}], help: 'wing2'},
  ],
  boss: {type: 'tower', name: 'THE STORM TOWER', warn: ['rosie', 'The weather tower! Break its three lightning rods and the core will open!'], escort: 2},
  outro: [['teddy', 'The thunder stopped! ...I was never scared.'], ['wing2', 'You were a LITTLE scared.'], ['mittens', 'My beautiful storm! Fine. FINE. I have other toys.']],
  next: {normal: 'kennel', secret: 'frost'},
  joins: ['wing2'],
},

/* ================================================================ 3a */
/* All-range: straight into the prison's asteroid field, round the station.
   Two waves of guards, cages to shoot open, then the Warden. SECRET: free
   every one of the eight pups before the Warden arrives (any still caged
   are carried off) - the hard route, to the Yarn Nebula. */
kennel: {
  name: 'The Kennel', planet: 'Asteroid Pound', n: 3, start: 'arena',
  blurb: 'An asteroid prison where the Hiss keep captured pups.',
  ground: 'space', railEnd: 200, arenaU: 900, arenaR: 600, arenaLimit: 760,
  path: {a: [0, 0, 0], l: [400, 150, 100], p: [0, 0, 0]},
  width: u => 70,
  railTop: 70, railFloor: -50, ceiling: 380, floor: -380,
  theme: {kind: 'space', nebula: [[0.10, 0.25, 0.55], [0.35, 0.10, 0.45]], sunColor: 0xfff0e0, sun: [-0.5, 0.5, -0.7], fog: [600, 2400]},
  music: {rail: 'space', free: 'clearing', boss: 'boss'},
  secret: {type: 'pups', need: 8, label: 'PUPS FREED', found: ['wing3', 'Every pup is out! And they told me a secret way into the Yarn Nebula. Hard route!']},
  arenaPickups: [['gold', 0.8, 380, 60], ['gold', 3.2, 450, -120], ['gold', 4.9, 300, 150], ['ball', 0, 300, 0], ['bone', 2.2, 250, 40], ['bomb', 4.0, 330, -40]],
  obstacles: (lay, R) => [
    // the prison station: a ring of modules round the middle
    ...Array.from({length: 10}, (_, i) => { const a = i / 10 * Math.PI * 2; return lay.rockAt(lay.arenaX + Math.cos(a) * 160, 0, lay.arenaZ + Math.sin(a) * 160, 22, 'module'); }),
    // and rocks everywhere else
    ...Array.from({length: 46}, () => { const a = R() * 6.283, r = 260 + R() * 420; return lay.rockAt(lay.arenaX + Math.cos(a) * r, (R() - 0.5) * 500, lay.arenaZ + Math.sin(a) * r, 6 + R() * 22); }),
  ],
  briefing: [
    ['rosie', 'The Kennel: an asteroid prison. The Hiss lock up every pup they catch there.'],
    ['rosie', "Open every cage you can - they'll haul the rest away when the Warden shows up. And {teddy}... one of the prisoners is a pilot."],
    ['wing2', "A JAILBREAK? Oh, I love a jailbreak."],
  ],
  waves: [
    {say: ['rosie', 'Shoot open the cages! And watch out for the guards!'], spawn: [{type: 'dart', n: 4}, {type: 'mine', n: 5, ang: 0.4, dist: 380, spread: 0.3}], cages: 4},
    {say: ['wing3', "You came for me! Ziggy here - get me out of this cage and I'll get you through that Warden."], spawn: [{type: 'dart', n: 3, ang: 2}, {type: 'raider', n: 2, ang: -2}], cages: 4, rescue: 'wing3', help: 'wing2'},
  ],
  boss: {type: 'warden', name: 'THE WARDEN', warn: ['wing3', "That's the Warden. Its locks spin round - hit them when they come past!"], escort: 2},
  outro: [['wing3', "Free! Ziggy online. Scanners up - I'll tell you where to bite."], ['rosie', 'The squadron is complete!'], ['mittens', 'You let out my prisoners?! Do you know how long it took to catch them?!']],
  next: {normal: 'jungle', secret: 'yarn'},
  joins: ['wing3'],
},

/* ================================================================ 3b */
/* All rail. Ice spikes and three ice arches. SECRET: at the frozen
   waterfall the canyon splits - the right-hand channel is the old frozen
   river, narrow and full of ice, and it leads to the hard route (the Yarn
   Nebula). The boss is met on the rail, which stops: the Snowball rolls
   down the canyon at you and back - climb over it, plug its four vents,
   then hit the core. */
frost: {
  name: 'Frost Fang', planet: 'Brrr', n: 3, hard: true,
  blurb: 'An ice planet. The Hiss are freezing it into one big snowball.',
  ground: 'canyon', railEnd: 3400, arena: false, railBossU: 3400, arenaU: 99999,
  fork: {u0: 2000, u1: 2900, side: 1, off: 150, width: 30, say: ['wing3', 'The old frozen river! Ice everywhere - stay sharp.']},
  path: {a: [65, 38, 16], l: [400, 150, 60], p: [2, 1, 0]},
  width: u => 44 + 12 * Math.sin(u / 200) + 30 * S(u, 3150, 3450),
  rim: u => 110 + 20 * Math.sin(u / 400),
  railTop: 58,
  groundParams: {wall: 22, steps: 5, mountains: 190, crag: 0.7},
  theme: {kind: 'day', haze: [0.86, 0.92, 0.98], zenith: [0.45, 0.62, 0.88], sun: [0.5, 0.35, -0.8], fog: [200, 1500], clouds: 0.6,
    strata: [0xdde8f2, 0xb8d0e8, 0xeef4fa, 0x9ab8d8, 0xcfe0f0, 0x88a8cc], sand: 0xf4f8fc, scrub: 0xd8e4f0, wet: 0x8ab0d0, top: 0xffffff,
    water: 0x6aa0c8, snow: true, ice: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  secret: {type: 'fork', need: 1, label: 'SECRET ROUTE', found: ['rosie', 'The frozen river comes out behind their lines - the hard route to the Yarn Nebula is open!']},
  obstacles: (lay, R) => [
    ...scatter(R, lay, 600, 1400, 90, (u, R) => lay.spire(u, (R() - 0.5) * 50, 5, 50 + R() * 40, 'ice')),
    lay.arch(1550, 30, 14, 'ice'), lay.arch(1680, 36, 12, 'ice'), lay.arch(1800, 28, 14, 'ice'),
    ...scatter(R, lay, 2350, 3000, 110, (u, R) => lay.spire(u, (R() - 0.5) * 40, 5, 70, 'ice')),
    ...lay.onFork(() => [lay.spire(2400, -8, 4, 60, 'ice'), lay.spire(2500, 9, 4, 70, 'ice'), lay.arch(2600, 24, 10, 'ice'), lay.spire(2700, -6, 4, 60, 'ice')]),
  ],
  briefing: [
    ['rosie', "Frost Fang. The Hiss are freezing the whole planet into one big snowball, to roll it out of orbit."],
    ['wing1', 'Snow! I love snow. I hate cold. I love snow.'],
    ['rosie', "There's a pilot stranded down there, too. Ziggy. Find them. And our maps show an old frozen river somewhere off to the right..."],
  ],
  script: A => {
    A.at(100, () => A.say('rosie', 'Ice spikes ahead. Weave!', 2.2));
    A.at(300, () => A.formation(4, 750));
    A.at(700, () => { A.turret(1100, -1); A.turret(1150, 1); });
    A.at(900, () => A.say('wing3', "Is someone there? This is Ziggy. My ship's frozen to a glacier - but my guns still work!", 3.4));
    A.at(1100, () => { A.join('wing3'); A.swoop(3); A.pickup('ball', 1300, 0, 16); });
    A.at(1350, () => A.say('rosie', 'Ice arches. Three of them. Stay low!', 2.4));
    A.at(1500, () => A.pickup('gold', 1680, 0, 12));
    A.at(1850, () => A.say('wing3', "Look - the canyon splits up ahead. The right channel is the old frozen river. Tight, but it goes somewhere.", 3.6));
    A.at(2100, () => { A.formation(5, 2500); A.cross(2550, -1, 30); }, 'main');
    A.at(2300, () => { A.turret(2650, -1); A.turret(2700, 1); A.pickup('bone', 2600, 0, 14); }, 'main');
    A.at(2150, () => { A.swoop(3); A.pickup('gold', 2450, 0, 20); }, 'alt');
    A.at(2400, () => { A.turret(2700, -1); A.turret(2720, 1); A.pickup('bone', 2650, 0, 12); A.pickup('gold', 2800, 0, 40); }, 'alt');
    A.at(2700, () => { A.swoop(4); A.pickup('bomb', 2900, 0, 20); });
    A.at(3000, () => { A.formation(4, 3300); A.say('wing3', "Something enormous is rolling round the valley ahead... CLIMB if it comes at you!", 3.4); });
  },
  waves: [],
  boss: {type: 'snowball', name: 'THE SNOWBALL', warn: ['wing3', 'A giant ice ball with four cooling vents. Hit the vents - and get OVER it when it rolls at you!'], escort: 0},
  outro: [['wing3', 'The freezing has stopped. My ship has thawed. I would like a warm blanket.'], ['mittens', 'You MELTED my snowball? I was going to bowl with that planet!']],
  next: {normal: 'jungle', secret: 'yarn'},
  joins: ['wing3'],
},

/* ================================================================ 4a */
jungle: {
  name: 'Catnip Jungle', planet: 'Purrdise', n: 4,
  blurb: 'The Hiss farm catnip here. The clouds of it make everyone loopy.',
  ground: 'canyon', railEnd: 3400, arenaU: 4000,
  path: {a: [60, 40, 15], l: [350, 160, 66], p: [0.5, 1.5, 1]},
  width: u => 52 + 10 * Math.sin(u / 280) + 30 * S(u, 3050, 3350),
  rim: u => 70 + 10 * Math.sin(u / 300),
  groundParams: {wall: 34, steps: 2, mountains: 140, roll: 16, stream: true},
  theme: {kind: 'day', haze: [0.80, 0.86, 0.62], zenith: [0.30, 0.55, 0.62], sun: [0.4, 0.6, -0.7], fog: [160, 1300], clouds: 0.5,
    strata: [0x4a6a2a, 0x5a7a30, 0x3a5a22, 0x6a8a3a, 0x7a5a3a, 0x4a7030], sand: 0x8a6a3a, scrub: 0x3a7a2a, wet: 0x4a3a22, top: 0x4a8a2a,
    water: 0x3a6a4a, spores: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  obstacles: (lay, R) => [
    ...scatter(R, lay, 300, 3100, 70, (u, R) => lay.spire(u, (R() - 0.5) * 70, 2.5 + R() * 2, 30 + R() * 40, 'tree')),
    ...Array.from({length: 26}, (_, i) => { const a = i * 2.39, r = 120 + (i * 37 % 400); return lay.spireAt(lay.arenaX + Math.cos(a) * r, lay.arenaZ + Math.sin(a) * r, 4 + (i % 3), 40 + (i * 13 % 40), 'tree'); }),
  ],
  briefing: [
    ['rosie', "Catnip Jungle. The Hiss grow catnip here - it's what keeps their pilots so... energetic."],
    ['wing3', "Warning: if you fly through a catnip cloud, your controls will go backwards for a bit. Avoid the green puffs."],
    ['wing2', "Backwards? Like, left is right? That sounds fun."],
    ['wing3', 'It is not fun.'],
  ],
  script: A => {
    A.at(100, () => A.say('rosie', 'Trees! The jungle is thick - weave through them.', 2.6));
    A.at(250, () => { A.formation(4, 700); A.cloud(600, -15, 25); A.cloud(640, 20, 30); });
    A.at(500, () => { A.turret(900, -1); A.turret(950, 1); A.cloud(1000, 0, 20); });
    A.at(900, () => { A.swoop(3); A.pickup('ball', 1100, 0, 14); });
    A.at(1200, () => { A.formation(5, 1650); A.cloud(1500, -20, 30); A.cloud(1520, 10, 15); A.cloud(1560, 30, 35); });
    A.at(1500, () => { A.cross(1900, -1, 30); A.cross(1950, 1, 20); A.pickup('gold', 1800, -30, 12); });
    A.at(1900, () => { A.turret(2300, -1); A.turret(2320, 1); A.turret(2360, -1); A.pickup('bone', 2200, 0, 16); A.cloud(2300, 0, 25); });
    A.at(2300, () => { A.swoop(4); A.pickup('gold', 2600, 20, 45); });
    A.at(2600, () => { A.formation(5, 3050); A.cloud(2900, -10, 20); A.cloud(2950, 15, 28); A.pickup('bomb', 2900, 0, 30); });
    A.at(3000, () => { A.say('wing3', "Huge reading ahead. It's... a flower?", 2.6); A.pickup('gold', 3200, 0, 8); });
  },
  waves: [
    {say: ['wing2', "Here they come - and they're all loopy on catnip!"], spawn: [{type: 'dart', n: 5}, {type: 'raider', n: 1, ang: 2.6}]},
    {say: ['rosie', 'Another wave over the treetops!'], spawn: [{type: 'dart', n: 3, ang: 1.8}, {type: 'raider', n: 2, ang: -1.8}], help: 'wing2'},
  ],
  boss: {type: 'queen', name: 'QUEEN NIP', warn: ['wing3', "The catnip queen! Shoot the five petals and then the middle. Don't breathe in!"], escort: 2},
  outro: [['wing2', "I flew through ONE cloud and now everything is purple and I love everyone."], ['rosie', 'The catnip supply is cut off. The Hiss will be grumpy.'], ['mittens', 'My CATNIP. You monsters. Do you know what a cat is without catnip? A CAT.']],
  next: {normal: 'moonfall', secret: 'moonfall'},
},

/* ================================================================ 4b */
/* All-range: a dogfight among the yarn balls, against the Alley Cats. */
yarn: {
  name: 'Yarn Nebula', planet: 'The Tangle', n: 4, hard: true, start: 'arena',
  blurb: "A nebula strung with giant balls of yarn. The Alley Cats' home turf.",
  ground: 'space', railEnd: 200, arenaU: 900, arenaR: 620, arenaLimit: 780,
  path: {a: [0, 0, 0], l: [380, 160, 100], p: [0, 0, 0]},
  width: u => 66,
  railTop: 70, railFloor: -50, ceiling: 380, floor: -380,
  theme: {kind: 'space', nebula: [[0.55, 0.15, 0.45], [0.25, 0.10, 0.55]], sunColor: 0xffe0f0, sun: [0.4, 0.4, -0.8], fog: [500, 2400]},
  music: {rail: 'space', free: 'alley', boss: 'alley'},
  arenaPickups: [['gold', 1.0, 420, 100], ['gold', 2.9, 380, -160], ['gold', 5.0, 520, 40], ['ball', 0, 280, 10], ['bone', 3.8, 300, 0], ['bomb', 1.9, 350, -60]],
  obstacles: (lay, R) => [
    ...Array.from({length: 40}, () => { const a = R() * 6.283, r = 120 + R() * 560; return lay.rockAt(lay.arenaX + Math.cos(a) * r, (R() - 0.5) * 520, lay.arenaZ + Math.sin(a) * r, 10 + R() * 26, 'yarn'); }),
  ],
  briefing: [
    ['rosie', 'The Yarn Nebula. Giant balls of yarn, as far as the scanners can see.'],
    ['wing3', "It's the hideout of the Alley Cats - the Hiss's ace squadron. Four of the best pilots Mittens has."],
    ['wing2', 'Aces, schmaces. I want a go at them.'],
    ['ace1', "Well, well. The Good Boys. Come to play with yarn?"],
  ],
  waves: [
    {say: ['rosie', "Regular Hiss first - the aces are watching. And mind the mines."], spawn: [{type: 'dart', n: 5}, {type: 'raider', n: 2, ang: 2.4}, {type: 'mine', n: 6, ang: 0, dist: 350, spread: 0.25}]},
    {say: ['ace2', "Hairball here. Let's see what you've got."], spawn: [{type: 'raider', n: 3, ang: -2}, {type: 'dart', n: 3, ang: 2}], help: 'wing2'},
  ],
  boss: {type: 'aces', name: 'THE ALLEY CATS', warn: ['ace1', "Enough warm-up. Alley Cats - let's teach these pups some manners!"], escort: 0},
  outro: [['ace1', "Grr. You got lucky, dogs. We'll see you at the Moon."], ['wing2', "We beat the ACES! Somebody write that down!"]],
  next: {normal: 'moonfall', secret: 'moonfall'},
},

/* ================================================================ 5 */
moonfall: {
  name: 'Moonfall', planet: 'The Moon', n: 5,
  blurb: "Mittens is pushing the Moon out of orbit. Stop the engines before it falls!",
  ground: 'space', railEnd: 2800, arenaU: 3600, arenaR: 640, arenaLimit: 820, arenaY: 0,
  path: {a: [50, 25, 0], l: [400, 170, 100], p: [0, 1, 0]},
  width: u => 70,
  railTop: 80, railFloor: -40, ceiling: 420, floor: -300,
  timer: 150,
  theme: {kind: 'space', nebula: [[0.15, 0.20, 0.40], [0.40, 0.20, 0.15]], sunColor: 0xfff4e0, sun: [-0.6, 0.4, -0.6], fog: [700, 3000], moon: true, home: true},
  music: {rail: 'space', free: 'clearing', boss: 'boss'},
  obstacles: (lay, R) => [
    ...scatter(R, lay, 300, 2700, 60, (u, R) => lay.rock(u, (R() < 0.5 ? -1 : 1) * (25 + R() * 100), (R() - 0.5) * 120, 4 + R() * 12)),
    lay.rockAt(lay.arenaX, -360, lay.arenaZ, 300, 'moon'),
  ],
  briefing: [
    ['rosie', "Emergency! Mittens has strapped four rocket engines to the Moon. She's going to push it right out of the sky!"],
    ['mittens', "Oh, it's just a little nudge. Like a glass on a table. Push... push... push..."],
    ['rosie', 'You have two and a half minutes once you reach it. Destroy all four engines!'],
    ['wing1', "No Moon means no howling at the Moon. This is personal."],
  ],
  script: A => {
    A.at(100, () => A.say('rosie', 'Debris field ahead. Get to the Moon, fast!', 2.6));
    A.at(250, () => A.formation(5, 700));
    A.at(600, () => { A.swoop(4); A.pickup('bone', 800, 0, 0); });
    A.at(900, () => A.mines(1150, 8));
    A.at(1000, () => { A.formation(5, 1450); A.cross(1500, 1, 10); A.pickup('ball', 1300, 0, 10); });
    A.at(1400, () => { A.say('ace1', 'Told you we would see you here, pups!', 2.4); A.aces(2, 1900); });
    A.at(1800, () => { A.swoop(4); A.pickup('gold', 2000, -40, 20); A.pickup('bomb', 2100, 0, 0); });
    A.at(2200, () => { A.formation(5, 2650); A.pickup('gold', 2400, 40, -20); });
    A.at(2500, () => { A.say('rosie', 'There it is. The engines are on the surface. GO!', 2.8); A.pickup('gold', 2700, 0, 40); });
  },
  waves: [],
  boss: {type: 'engines', name: 'THE MOON ENGINES', warn: ['rosie', 'Four engines! The clock is running!'], escort: 3, aces: 2},
  outro: [['rosie', "The engines are down - the Moon is back where it belongs!"], ['teddy', 'AWOOOOOO!'], ['mittens', "NO! My Moon! ...Fine. You want to play? Come to Scratchpost. Come and get me, dogs."]],
  next: {normal: 'scratchpost', secret: 'scratchpost'},
},

/* ================================================================ 6 */
scratchpost: {
  name: 'Scratchpost', planet: 'Scratchpost', n: 6, hard: true,
  blurb: "The Hiss homeworld. A trench run to the fortress's core.",
  ground: 'trench', railEnd: 3600, arena: false, railBossU: 3600,
  path: {a: [8, 4, 0], l: [600, 250, 100], p: [0, 0, 0]},
  width: u => 34 + 10 * S(u, 3300, 3550) * 3,
  rim: u => 120,
  railTop: 70, railFloor: 6, wallMargin: 10,
  theme: {kind: 'storm', haze: [0.30, 0.18, 0.36], zenith: [0.08, 0.04, 0.14], sun: [0.3, 0.7, -0.6], fog: [200, 1600], clouds: 0.3,
    strata: [0x5a4a6a, 0x6a2a3a, 0x4a3a5a, 0x7a3a4a, 0x5a5a6a], sand: 0x3a3040, scrub: 0x6a2a3a, wet: 0x2a2030, top: 0x6a5a7a, metal: true},
  music: {rail: 'canyon', free: 'clearing', boss: 'boss'},
  obstacles: (lay, R) => [
    // beams across the trench: fly under them
    ...[600, 1100, 1450, 1900, 2350, 2700, 3000].map((u, i) => lay.arch(u, 26 + (i % 3) * 8, 8, 'beam')),
  ],
  briefing: [
    ['rosie', "This is it. Scratchpost, the Hiss homeworld. There's one way into the fortress: the trench."],
    ['wing3', "At the end of the trench is the fortress's power core. Knock it out and Mittens' shields go down."],
    ['wing1', "Stay close, everybody. Like a walk. A very long, very dangerous walk."],
    ['teddy', 'Walk?! ...Sorry. Focus. Let\'s go.'],
  ],
  script: A => {
    A.at(100, () => A.say('rosie', 'Guns on both walls. Keep moving!', 2.4));
    A.at(200, () => { for(const u of [500, 560, 620, 700, 760]) A.turret(u, u % 120 < 60 ? -1 : 1); });
    A.at(400, () => A.formation(4, 900));
    A.at(800, () => { A.swoop(3); A.pickup('ball', 1000, 0, 14); });
    A.at(1000, () => { for(const u of [1300, 1350, 1400, 1480, 1550]) A.turret(u, u % 100 < 50 ? 1 : -1); A.pickup('bone', 1250, 0, 14); });
    A.at(1300, () => { A.formation(5, 1800); A.say('ace1', "You won't get through the trench, dogs!", 2.4); });
    A.at(1600, () => { A.aces(2, 2100); A.pickup('gold', 1800, 18, 50); });
    A.at(2000, () => { for(const u of [2300, 2330, 2380, 2440, 2500, 2560]) A.turret(u, u % 60 < 30 ? -1 : 1); A.pickup('bomb', 2200, 0, 20); });
    A.at(2400, () => { A.swoop(4); A.pickup('gold', 2600, -18, 10); });
    A.at(2800, () => { A.formation(5, 3200); A.pickup('bone', 3000, 0, 20); });
    A.at(3100, () => { A.say('wing3', 'The core is dead ahead. The rail stops there - we hold and fight!', 3); A.pickup('gold', 3300, 0, 50); });
  },
  waves: [],
  boss: {type: 'core', name: 'THE FORTRESS CORE', warn: ['wing3', "Four shield panels spinning round it. Break them, then the core!"], escort: 0},
  outro: [['rosie', "The core is down! Mittens' fortress has no shields!"], ['mittens', "You... you BROKE my house. You know what happens now? I come out myself."]],
  next: {normal: 'lair', secret: 'lair'},
},

/* ================================================================ 7 */
lair: {
  name: "Mittens' Lair", planet: 'The Litterbelt', n: 7, final: true,
  blurb: 'The dark side of the Litterbelt. Emperor Mittens herself.',
  ground: 'space', railEnd: 2400, arenaU: 3200, arenaR: 640, arenaLimit: 800,
  path: {a: [40, 20, 0], l: [400, 170, 100], p: [0, 1, 0]},
  width: u => 70,
  railTop: 70, railFloor: -50, ceiling: 380, floor: -380,
  theme: {kind: 'space', nebula: [[0.45, 0.05, 0.12], [0.20, 0.05, 0.35]], sunColor: 0xffd0e0, sun: [0.3, 0.3, -0.9], fog: [600, 2600]},
  music: {rail: 'space', free: 'mittens', boss: 'mittens'},
  obstacles: (lay, R) => [
    // litter: a field of floating junk the cats knocked off tables
    ...scatter(R, lay, 300, 2300, 50, (u, R) => lay.rock(u, (R() < 0.5 ? -1 : 1) * (20 + R() * 100), (R() - 0.5) * 120, 5 + R() * 14, R() < 0.3 ? 'mug' : 'asteroid')),
  ],
  briefing: [
    ['rosie', "This is it, Good Boy Squadron. Mittens' lair, at the dark side of the Litterbelt."],
    ['mittens', "Welcome, little dogs. Do you know what I do with things that annoy me? I knock them. Off. The. TABLE."],
    ['wing2', "She's a lot bigger than I pictured."],
    ['wing3', 'Her paws first. Then the face. Then... we improvise.'],
    ['teddy', "Everybody - for every couch we were told to get off. LET'S GO!"],
  ],
  script: A => {
    A.at(100, () => A.say('mittens', 'Oh, look. They brought snacks. Themselves.', 2.6));
    A.at(250, () => A.formation(5, 700));
    A.at(600, () => { A.swoop(4); A.pickup('ball', 800, 0, 0); });
    A.at(900, () => { A.aces(2, 1400); A.say('ace4', "Last chance to turn back, pups.", 2.4); });
    A.at(1200, () => { A.formation(5, 1650); A.pickup('bone', 1400, 0, 0); A.pickup('bomb', 1500, 0, 10); A.mines(1550, 9); });
    A.at(1500, () => { A.aces(2, 2000); A.say('ace3', "The Emperor will not be disturbed.", 2.4); });
    A.at(1800, () => { A.swoop(4); A.pickup('gold', 2000, 0, 40); A.pickup('gold', 2100, -40, -20); });
    A.at(2100, () => { A.say('rosie', "That's her. That's ALL her. Good luck, {teddy}.", 2.8); A.pickup('gold', 2300, 40, 20); A.pickup('bone', 2350, 0, 0); });
  },
  waves: [],
  /* On the hard route (two or more secrets found) the Alley Cats are
     waiting for a rematch before Mittens. */
  hardWaves: [{say: ['ace1', "Rematch time, pups! The Emperor's orders."], spawn: [{type: 'ace', n: 4, dist: 600, spread: 0.5}]}],
  boss: {type: 'mittens', name: 'EMPEROR MITTENS', warn: ['mittens', 'Shall we play a game? It is called: I swat, you fall.'], escort: 0},
  outro: [],
  ending: [
    ['rosie', "She's... she's in the escape pod! It's heading for... the vet?!"],
    ['wing3', "I may have reprogrammed it. She's booked in for a check-up, a bath, and a nail trim."],
    ['mittens', 'NOOOOOOOOOOOO! Not the VEEEEEEET!'],
    ['wing2', 'HA! Bath time!'],
    ['wing1', 'Every planet is back where it belongs. Nothing got knocked off any tables.'],
    ['rosie', "Good Boy Squadron... you did it. You are, all of you, very good dogs."],
    ['teddy', "...So is there a snack now?"],
  ],
  next: {},
},
};

export const START = 'canyon';
export const ORDER = ['canyon', 'tidewater', 'thunder', 'kennel', 'frost', 'jungle', 'yarn', 'moonfall', 'scratchpost', 'lair'];
/* Where each level sits on the route map: column (step) and row. */
export const MAP = {
  canyon: [0, 1], tidewater: [1, 0], thunder: [1, 2], kennel: [2, 0], frost: [2, 2],
  jungle: [3, 0], yarn: [3, 2], moonfall: [4, 1], scratchpost: [5, 1], lair: [6, 1],
};

/* Medals (as Star Fox 64 gives one per planet for enough hits: 150 on
   Corneria, 200 on Meteo...): win with at least this many HITS. Combo bonus
   hits count. Set a little above what simcheck's sharp computer pilot
   manages on Good Boy, so a medal means flying better than it. */
export const MEDALS = {canyon: 45, tidewater: 25, thunder: 30, kennel: 25, frost: 20, jungle: 35, yarn: 20, moonfall: 30, scratchpost: 20, lair: 45};
