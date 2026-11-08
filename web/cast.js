/* Dogfight - the cast.

   ============================================================
   JON: THIS IS THE FILE TO EDIT TO PUT THE FAMILY'S PETS IN.
   ============================================================
   Everyone marked `placeholder: true` is waiting for a real pet. For each:

     name         what they're called on the radio and in the story
     kind         'dog', 'cat' or 'rabbit' (sets the drawn face and the head
                  in the cockpit)
     fur          main colour, as '#rrggbb'
     patch        a second colour: blaze, chest, or spots
     muzzle       the colour round the nose
     ears         'floppy', 'pointy' or 'round'
     eyes         eye colour
     photo        optional: a picture file put in web/cast/ (e.g.
                  'cast/biscuit.jpg'); it replaces the drawn face on the
                  radio. A square-ish photo of the face works best.
     personality  one line, for the notes (the lines below are what they say)
     lines        what they say at key moments. {teddy}, {wing1} and so on
                  are swapped for names, so renaming someone here renames
                  them everywhere.

   Changing a name or colours here changes the radio, the portrait, the
   ship's paint and the head in the cockpit. Nothing else needs touching.
   Then add the pet's details to the cast table in DESIGN.md. */

export const CAST = {
  teddy: {
    name: 'Teddy', kind: 'dog', role: 'Leader', fixed: true,
    fur: '#16161b', patch: '#efece6', muzzle: '#b97c46', ears: 'floppy', eyes: '#3a1c0c',
    ship: {hull: 0x1b1c22, trim: 0xc4874a, nose: 0xeeeae2, engine: 0x5ad8ff},
    personality: 'A Bernedoodle. Brave, goofy, extremely food-motivated.',
  },
  wing1: {
    name: 'Biscuit', kind: 'dog', role: 'Wingmate', placeholder: true,
    fur: '#c98f4a', patch: '#f3e6cf', muzzle: '#f3e6cf', ears: 'floppy', eyes: '#2a1608',
    ship: {hull: 0xc98f4a, trim: 0xf3e6cf, nose: 0xf3e6cf, engine: 0xffb24a},
    personality: 'The steady one. Covers your tail and always shares the last bone.',
    lines: {
      hello: "Biscuit here. I've got your tail, {teddy}.",
      help: "{teddy}! There's a cat on my tail - a little help?",
      saved: 'Thanks, {teddy}. I owe you a biscuit.',
      down: "I'm hit! Heading home for a nap - you'll have to manage without me.",
      ff: 'Ow! I am ON your side, {teddy}!',
      gift: 'Found a spare bomb. Catch!',
      win: 'Nice flying, everybody. Treats on me.',
    },
  },
  wing2: {
    name: 'Pepper', kind: 'dog', role: 'Wingmate', placeholder: true,
    fur: '#2b2b30', patch: '#e8e2d8', muzzle: '#8a8a8a', ears: 'pointy', eyes: '#3a2008',
    ship: {hull: 0x30303a, trim: 0xe23b3b, nose: 0xe8e2d8, engine: 0xff6a4a},
    personality: 'The hothead. Charges in first, barks later, needs rescuing a lot.',
    lines: {
      hello: "Pepper reporting! Point me at a cat!",
      help: 'Okay, okay, there are MORE cats than I thought! Help!',
      saved: "I had him. ...Thanks, {teddy}.",
      down: "Argh! My tail's on fire! I'm out!",
      ff: 'HEY! Watch where you point that thing!',
      gift: 'I told you I could find the shortcut! Follow me!',
      win: 'WOO! Did you see that? Did EVERYBODY see that?',
    },
  },
  wing3: {
    name: 'Ziggy', kind: 'dog', role: 'Wingmate', placeholder: true,
    fur: '#e8e8e4', patch: '#9a9aa4', muzzle: '#e8e8e4', ears: 'round', eyes: '#1a3a6a',
    ship: {hull: 0xe8e8e4, trim: 0x4a7ae0, nose: 0x9a9aa4, engine: 0x7ab0ff},
    personality: 'The clever one. Spots weak points, reads maps, sniffs out secrets.',
    lines: {
      hello: "Ziggy online. Scanners up - I'll tell you where to bite.",
      help: 'My shields are failing! Someone shoo this cat away!',
      saved: 'Excellent shooting. Statistically, I owe you one.',
      down: "I'm going down - I'll analyse what went wrong from the couch.",
      ff: 'That was me. I am the dog-shaped ship.',
      gift: 'Weak point found - aim for the glowing bits!',
      win: 'Mission parameters: exceeded. Good dogs, all of us.',
    },
  },
  rosie: {
    name: 'Rosie', kind: 'dog', role: 'Base', placeholder: true,
    fur: '#d98a3a', patch: '#fbf6ee', muzzle: '#fbf6ee', ears: 'pointy', eyes: '#20140c', headset: true,
    personality: 'Mission control. A corgi with a headset and a clipboard.',
  },
  hops: {
    name: 'Professor Hops', kind: 'rabbit', role: 'Mechanic', placeholder: true,
    fur: '#b8aa98', patch: '#f4efe8', muzzle: '#f4efe8', ears: 'pointy', eyes: '#3a1c10',
    personality: 'The squadron mechanic. Fixes anything. Chews the wiring.',
  },
  mittens: {
    name: 'Emperor Mittens', kind: 'cat', role: 'Villain', placeholder: true,
    fur: '#9a9aa2', patch: '#f4f2ee', muzzle: '#f4f2ee', ears: 'pointy', eyes: '#7ad040',
    personality: 'Banished for knocking things off tables. Wants to knock off planets.',
  },
  // the Alley Cats: the Hiss's ace squadron (cats, so not family pets - unless there are cats!)
  ace1: {name: 'Scratch', kind: 'cat', role: 'Ace', fur: '#e08a2a', patch: '#f4e2c8', muzzle: '#f4e2c8', ears: 'pointy', eyes: '#e0c020', ship: {hull: 0xe08a2a}},
  ace2: {name: 'Hairball', kind: 'cat', role: 'Ace', fur: '#3a3a3a', patch: '#f0f0f0', muzzle: '#f0f0f0', ears: 'pointy', eyes: '#60e060', ship: {hull: 0x3a3a3a}},
  ace3: {name: 'Duchess', kind: 'cat', role: 'Ace', fur: '#f0ece4', patch: '#c8a080', muzzle: '#f0ece4', ears: 'pointy', eyes: '#4ab0ff', ship: {hull: 0xf0ece4}},
  ace4: {name: 'Tom', kind: 'cat', role: 'Ace', fur: '#8a6a4a', patch: '#4a3a2a', muzzle: '#d8c8b0', ears: 'pointy', eyes: '#e0a020', ship: {hull: 0x8a6a4a}},
};

export const WINGS = ['wing1', 'wing2', 'wing3'];
export const ACES = ['ace1', 'ace2', 'ace3', 'ace4'];

/* Fill in {names} in a line. */
export function lineFor(text){
  return text.replace(/\{(\w+)\}/g, (m, k) => CAST[k] ? CAST[k].name : m);
}
