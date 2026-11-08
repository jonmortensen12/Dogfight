# Dogfight — handoff

A silly space adventure for phones in the rail-shooter genre, with free 3D
dogfights. Hold the phone sideways in both hands like a controller; it is
the ship. The hero is Teddy, a black, tan and white Bernedoodle, with a
squadron of the family's pets. The villain is Emperor Mittens, a cat
banished for knocking things off tables, back with an empire of cats (the
Hiss) to knock planets out of orbit.

History: a feel prototype (2026-11-07, Red Canyon only), then the controls
(the phone as the ship, a charge shot, loops), then own music, a speed
setting and a new camera, then (2026-11-08, "silly all the way, build the
whole adventure, placeholders for the pets") the full adventure: ten
planets on a branching route, wingmates, bosses, the ending.

## Files

| File | What it is |
|---|---|
| `web/cast.js` | **The cast. Where the family's pets go.** Names, animal, colours, ears, an optional photo, their lines. Everyone but Teddy is a placeholder. |
| `web/levels.js` | **The adventure, as data**: every level's ground, look, script, waves, boss, briefing, outro, the route. The story is told at its top. |
| `web/index.html` | The page: canvases, thumb buttons, the title / settings / map / free play / briefing / count / pause / results / ending screens. |
| `web/main.js` | The adventure (the map, briefings, saved progress), the loop, sound for each event, settings, adaptive quality. |
| `web/sim.js` | Everything that happens. Pure, deterministic (seeded), no drawing. The bosses (`BOSS`), wingmates, hazards, and the computer pilot (`autopilot`). |
| `web/terrain.js` | The ground for whichever level is loaded: `setLevel(def)`, then `height(x, z)`, the rail's line, obstacles. Shared by the sim and the renderer. |
| `web/scenery.js` | Each level's world drawn: sky (day / storm / space), ground meshes, sea, stream, rocks / ice / trees / asteroids / yarn / the Moon, the ringed or home planet. |
| `web/models.js` | Every model: Teddy's ship and each wingmate's (their colours, their head in the cockpit), the Hiss, the Alley Cats, every boss and boss part, pickups, cages, Mittens' planets. |
| `web/world.js` | three.js: loads a level's scenery, draws the entities and effects, lightning, catnip, weather, the camera. |
| `web/hud.js` | The 2D overlay: reticle and charge, markers and edge arrows, radar, shield/boost/bombs, wingmates' health, the boss bar, the Moon's clock, warnings, and the radio with portraits drawn from the cast. |
| `web/input.js` | Tilt (the phone's whole orientation from the centred grip), thumb buttons, swipes, keyboard, a drag stick without a sensor. |
| `web/sound.js` | Night Watch's sound module, plus a whoosh and an engine rumble. |
| `web/lib/` | three.js r170 and its bloom passes, copied from Night Watch. |
| `web/music/` | Rendered by `tools/music.py`: eight pieces and two cues of Dogfight's own; a few short cues (count, wave, clear, pickup, game over) still borrowed from Night Watch. |
| `tools/music.py`, `tools/samples.py` | The music, written as notes and rendered from FluidR3 recordings (the engine is Night Watch's). `samples.py` downloads the recordings to `tools/samples/` (about 70 MB, not committed) first. |
| `DESIGN.md` | The design: story, cast, levels, multiplayer. |
| `simcheck.mjs`, `playcheck.mjs` | The checks. |
| `tools/serve.mjs` | A plain file server for the checks and for playing on a laptop. |

**Borrowed from Night Watch:** the particle system, beams, glow textures,
the Hiss's basic ships (dart, raider, the Brute's body, torpedo, turret —
with cat ears added), the planet and ring shaders, the
deviceorientation-to-quaternion maths, the sound module, some cues, and
the music engine.

## Putting the pets in

Everything about a pet is in `web/cast.js`: `wing1`, `wing2`, `wing3` are
the three wingmates (placeholders Biscuit, Pepper and Ziggy), `rosie` is
mission control, `hops` the mechanic, `mittens` the villain (a family cat,
ideally). Change `name`, `kind` ('dog' / 'cat' / 'rabbit'), `fur`, `patch`,
`muzzle`, `ears` ('floppy' / 'pointy' / 'round'), `eyes`, the `ship`
colours, and their `lines`. A `photo` (a file put in `web/cast/`, e.g.
`'cast/biscuit.jpg'`) replaces their drawn portrait on the radio. Names in
the story (`levels.js`) are written as `{wing1}`, `{teddy}` and so on and
filled in from the cast, so renaming is one edit. The 3D head in the
cockpit and the ship's paint follow the colours and ears.

## Playing it

- Phone: open the page. **ADVENTURE** opens the route map: tap a glowing
  planet, **FLY THERE**, listen to the briefing (or skip it), then hold
  the phone the way that's comfortable for the three-second count: that
  grip becomes "straight and level". **CENTRE** (top) re-takes it any time.
  Progress is saved on the phone. **Free play** flies any planet, with the
  wingmates you'd have by then. **Settings**: difficulty, clearing style,
  speed, tilt.
- Laptop: the keys are under the controls below. No sensor: a thumb
  dragged on the left half of the screen is a stick.
- URL options: `?level=ID` (straight to a planet's briefing; ids in
  levels.js), `?start=arena` (near the end of the rail), `?skill=pup|good|top`,
  `?pace=1.5`, `?style=level|full`, `?auto=1` (the computer flies),
  `?low=1`, `?seed=N`.

## The controls (`input.js`)

The phone is a little model of the ship (changed 2026-11-08 at Jon's
request; the first version steered with the steering-wheel turn):

- **Turn** — pull the left side of the phone towards you to turn left, the
  right side to turn right: a turn about the phone's own up-and-down line.
  Full at 20°.
- **Nose** — tip the top edge away to dive, towards you to climb. Full at
  20°. "Invert" swaps it.
- **Roll** — turn it like a steering wheel. On the rail and in level flying
  the roll is a lean (full lean, 75°, at 32°); in full 3D it is a roll
  *rate* (2.6 rad/s at 32°), so you can roll right over.

All three come from the whole orientation the phone reports, relative to
the grip when it was CENTRED (`q0⁻¹ · q`), split **roll first** (Euler
order `ZYX`): the wheel turn about the screen's z, then the turn and the
tip about the phone's own axes *as it is now rolled*. Until round 4 it was
split yaw-first (`YXZ`), and Jon found that once the phone was rolled like
a wheel, the other two went the wrong way: rolled 30°, "tip the top away"
came out as part dive, part turn. With roll first, "pull the left side
closer" and "tip the top away" mean the same thing however far over the
wheel is. `playcheck` rolls the phone 30° and then steers to prove it.

**Wheel setting** (title and pause, *Wheel on/off*). Off, turning like a
wheel does nothing and two **BANK** buttons appear (left thumb, above the
left buttons, and right thumb, above FIRE): hold one to lean full over
that way (or roll, in full 3D). For anyone who still finds the wheel
fighting the other two. Gravity alone cannot see the
turn when the phone is upright, so the compass part is used, and it
wanders slowly on some phones: while the turn is within 4° of centre it is
bled away at 25% a second, and CENTRE resets everything. 2° dead zone,
then 35% linear + 65% squared.

`playcheck` builds real phone poses (held sideways, tipped back, facing
some compass way, then turned about the screen's own axes) in the W3C
earth frame, converts them to alpha/beta/gamma and checks each turn moves
only the control it should. Use it after touching the maths.

**Thumbs.** Left: BOOST over BRAKE (both use the blue meter), LOOP, and
U-TURN in the clearing. Right: FIRE, BOMB, TARGET in the clearing.

- **FIRE**: a tap is a shot (two with twin lasers), at most 10 a second.
  A tap between two frames still counts. **Hold** it: after 0.22 s it
  starts charging, full 0.75 s later (a green glow on the nose, a ring on
  the reticle). Once charged, the reticle locks on to whatever is within
  12° of the nose (sticky until it is 34° off). Let go: a charged shot,
  230 m/s, homing if locked, 7 damage plus a 42 m burst (Star Fox 64's
  is 5½ Arwing wingspans; this is about that in Teddy's). **Only a charged
  shot locks on.** **Combos** (round 5): the burst hits every small enemy
  inside it for the full 7, and anything it destroys goes off in turn (a
  24 m, 6-damage blast, `CHAIN` in `sim.js`), so a pack goes up together.
  Every kill past the first in one chain is a bonus hit, shown as "+N
  COMBO". Boss parts take the burst with falloff and don't chain. Seven
  or more in one shot and a wingmate shouts about it, as at +7 in SF64.
- **BOMB**: straight ahead, no lock; bursts after 1.3 s or on contact,
  50 m, and clears enemy bolts inside it.
- **Swipe** sideways anywhere else (< 450 ms, > 40 px): a barrel roll. It
  sidesteps, and for its 0.55 s it knocks away any enemy bolt that comes
  within 8 m ("DEFLECTED!").
- Keyboard: arrows turn and pitch, A/D roll, Space fire (hold to charge),
  Shift boost, Z brake, X bomb, Q/E barrel roll, L loop, C or U U-turn,
  T target, P pause.

## Flying (`sim.js`)

**Handling** is one table, `HANDLING` in `sim.js` (round 4, "more
responsive, tighter turns"): rail slide 60 m/s sideways and 46 up/down,
easing in at 9/s (was 42, 34, 6); level flying turns at 2.1 rad/s and
pitches at 1.7 (was 1.5, 1.25); full 3D pitch 2.1, turn 1.8, roll 3.4.
**Leaning into a turn tightens it**: leaning (wheel or BANK) the way the
stick is pushing adds up to 60% (`bankBoost`) to the slide on the rail and
the turn in level flying, like banking a plane. Leaning against it adds
nothing.

**The rail (the canyon).** The frame runs along the canyon's centre line
by itself at 60 m/s (boost 100, brake 32). The stick moves the ship about a
box in that frame, one of two ways (the **Rail** setting):

- **Point the nose** (default, round 6, taken from Star Fox 64's
  `Player_MoveArwingOnRails`): the stick aims the nose up to 54° off the
  rail, and the ship goes where it points, sideways at 1.4 × speed ×
  sin(angle) — at full point a little faster than it flies forward. The
  nose eases there (10% of the gap per 30th of a second) no faster than
  69°/s; banked into the turn, twice that; in a barrel roll, three times.
  Near the floor the nose won't go down. Pointing into a wall, the nose
  comes back round. `POINT` in `sim.js`.
- **Slide**: the old way, see Handling above. The box is the canyon floor's half width minus 13 m sideways, and 6 to
58 m up (and never below the ground + 4 m). The nose points along the
ship's motion in the box, so the shots go where you are sliding: classic
rail-shooter feel. The wheel leans the ship up to 90° (plus a little lean from
sliding sideways); on its own it does not steer, but it tightens a turn.

**LOOP on the rail**: a somersault of radius 24 m in 1.9 s. The rail waits
while the ship goes up, over (facing backwards at the top, so its shots go
back down the canyon) and down to where it started. Enemies keep moving, so
anything sitting behind you ends up ahead. The camera hangs back and
watches. Nothing stops you looping into an arch.

**Free (the clearing).** The rail lets go at u = 3700. Speed 62 (boost
108, brake 34). Two styles, chosen on the title or the pause screen, and
switchable mid-flight:

- **Level horizon** — the turn swings the nose round the world's up
  (1.5 rad/s); the nose control pitches at 1.25 rad/s up to ±66° and
  levels out when let go; the wheel only leans the ship. The horizon never
  tips over.
- **Full 3D** — turn (1.3 rad/s), pitch (1.55) and roll (2.6) all about
  the ship's own axes. Loops, inverted flight, everything; the camera
  rolls with you.

**LOOP** (both styles): a full 360° pitch loop in 2.2 s, back on the
same heading, the right way up. **U-TURN** (clearing only, both styles):
pitch up 180° in 1.1 s, which leaves you upside down facing back, then
half a barrel roll (0.55 s) to come out the right way up — an Immelmann,
ending about 40 m higher. Controls are ignored during either.

Both: the clearing's edge (radius 820 from its centre) turns you back in,
with a TURN BACK warning from 700. The ceiling is 460 m. PULL UP under
35 m. ON YOUR TAIL when a fighter within 220 m is pointing at you.

**Crashing** costs 12 shield and bounces you off (0.9 s before it can
happen again). In the canyon a spire knocks you sideways, an arch down.

**Lasers** fly 300 m/s × the speed setting (were 430), about four times
the rail speed (SF64's: 3.3 times), and live 1.65 s so the range is the
same. **Guns.** See FIRE above. Aim assist bends a tapped shot towards an
enemy within 6.3° / 4.3° / 2.6° of the nose (Pup / Good Boy / Top Dog),
leading it. Three bombs; the blue capsule gives two.

## Star Fox 64's design, borrowed (round 6)

Read out of the fan decompilation (github.com/sonicdcer/sf64, the game's
logic as C; no art or sound from it is used, only how it plays):

- **Squads** (its group drops): darts that come as a formation or swoop of
  3 or more are a squad. Shoot every one yourself and the last drops a
  present: a bone if your shield is under 60%, else the ball if you
  haven't got twin lasers, else a bomb if you're short. Rosie says so.
- **Kill milestones in the clearing** (it drops a gold ring on the 5th,
  10th, 20th, 30th all-range kill and lasers on the 15th): your 5th
  fighter drops a bone, the 10th a bomb, the 15th the ball, the 20th and
  30th bones.
- **Golden bones are gold rings**: each tops the shield up 12, and the
  third makes the shield bigger (140) for the rest of the planet; the bar
  grows. ("SHIELD UPGRADE")
- **The checkpoint** (its mid-level ring): a green gate halfway down each
  rail (`checkpointU` in `sim.js`, kept clear of forks and bosses; none on
  clearing-only planets). Fly past it for +50 shield; crash after it and
  "Retry from the checkpoint" starts you there with your hits, golden
  bones, secret progress and wingmates as they were.
- **Medals** (150 hits on Corneria, 200 on Meteo...): `MEDALS` in
  `levels.js`, a hit target per planet set a little above the sharp
  computer pilot (combo bonus hits count). Win with that many and the map
  shows 🏅 instead of ✓; free play counts too.

## The adventure (`levels.js`)

Ten planets; a playthrough flies seven. **The route is earned, not
picked** (round 4, after the Star Fox 64 walkthroughs, where the path
splits on what you do inside a level). Each early planet has a secret;
find it and the next planet is the HARD one, miss it and it's the normal
one. The map shows the open planet and the secret routes as dashed lines.

```
Red Canyon    -- take the left fork in the canyon -----------> Thunder Peaks, else Tidewater
Tidewater     -- shoot all 8 sonar buoys on the sea ---------> Frost Fang,    else The Kennel
Thunder Peaks -- fly through all 6 lightning rings ----------> Frost Fang,    else The Kennel
The Kennel    -- open all 8 cages, rescue every pup ---------> Yarn Nebula,   else Catnip Jungle
Frost Fang    -- take the right-hand ice cave ---------------> Yarn Nebula,   else Catnip Jungle
then Moonfall -> Scratchpost -> Mittens' Lair
```

Two or more secrets found makes it the **hard route**: the Alley Cats are
waiting again in Mittens' Lair (`hardWaves`) and the ending has extra
lines. The HUD counts the secret (e.g. "BUOYS 5/8", a ★ when done) and
Rosie says when it's found. The save keeps `secrets` and `next`.

**Forks** (`fork: {u0, u1, side, off, width}`): between u0 and u1 the rail
has a second channel `off` m to one side (ramping out over 320 m). 110 m
in, if the ship is more than 35% of the box out that side, it's committed:
`BRANCH` (in `terrain.js`) flips to 1, the centre line, walls and box all
follow the side channel, and script calls tagged `'alt'` run instead of
`'main'`. The ship's offset is re-measured so nothing jumps.

**Level shapes** — not every planet is canyon-then-clearing any more:

| Shape | Planets | How |
|---|---|---|
| rail, then clearing | Red Canyon, Thunder Peaks, Catnip Jungle, Moonfall, Mittens' Lair | `railEnd`, `arenaU` |
| **rail only, boss runs** | Tidewater | `arena: false`, `railChase {u, len}`: the carrier steams away up the rail; sink it in 4600 m or it escapes (a fail) |
| **rail only, boss on the rail** | Frost Fang, Scratchpost | `railBossU`: the rail stops and the boss is fought in the box |
| **clearing only** | The Kennel, Yarn Nebula | `start: 'arena'`: a free-flight fight from the first second |

| # | Planet | Ground | What's new | Boss |
|---|---|---|---|---|
| 1 | Red Canyon | canyon | the basics | **The Brute**: two engine pods shield its core; torpedoes, bolt fans |
| 2 | Tidewater | ocean, rail only | low over the sea, turrets on sea stacks, sea mines, sonar buoys; Pepper joins | **The Big Tabby**: a carrier that runs; four guns aft, then the bridge; launches fighters. Catch it before it gets away |
| 2 | Thunder Peaks (hard) | canyon, tall | lightning, lightning rings; Pepper joins | **The Storm Tower**: three lightning rods; strikes where you'll be, then fans of bolts |
| 3 | The Kennel | space, clearing only | asteroids; shoot open cages to rescue pups; Ziggy is in one | **The Warden**: four locks spinning round it; it carries off unopened cages |
| 3 | Frost Fang (hard) | canyon, ice, rail only | ice spikes and arches, an ice-cave fork; Ziggy found | **The Snowball**: rolls down the canyon at you — climb over it; four vents on its face |
| 4 | Catnip Jungle | canyon, jungle | trees; catnip clouds turn your controls backwards | **Queen Nip**: five petals; puffs catnip at you |
| 4 | Yarn Nebula (hard) | space, clearing only | yarn balls, mines; the Alley Cats taunt you | **The Alley Cats**: four aces, no shields, tougher and better shots |
| 5 | Moonfall | space | two aces in the debris; a 150 s clock | **The Moon Engines**: four rockets on the Moon; the Moon falls if the clock runs out |
| 6 | Scratchpost (hard) | trench | a trench of wall guns and beams; two aces | **The Fortress Core**, met on the rail (it stops): four spinning panels |
| 7 | Mittens' Lair | space | a field of junk, mines; aces (and the Alley Cats again on the hard route) | **Emperor Mittens**: two paws swat when you're close, planets batted at you (roll to bat them back); her face is only open while her **mouth** is open (every 7 s, for 3.5 s, with a hissed fan of bolts); then the face breaks and she flees in a tiny ship: catch her |

Then the epilogue: she's in an escape pod that Ziggy reprogrammed to fly
her to the vet.

A level is: the rail (`path`, `width`, `rim`, `railEnd`), the obstacles
(`lay.spire`, `lay.arch`, `lay.rock` ...), a `theme` (palette, sky, fog,
weather flags), the `script` (calls at each u: `formation`, `swoop`,
`cross`, `turret`, `turretOn`, `pickup`, `cloud`, `storm`, `join`, `aces`,
`say`), `waves` for the clearing (`spawn`, `say`, `help`, `cages`,
`rescue`), the `boss`, `briefing`, `outro`, `next`. Red Canyon's original
script is unchanged, just moved there.

**Wingmates** fly with you: in formation beside and ahead of you on the
rail (taking potshots), dogfighting in the clearings. One wave per level
sends a cat after one of them ("Teddy! There's a cat on my tail!"):
shoot it and they say thanks, and a few seconds later bring a bomb. Shot
down, they go home for a nap and sit out the next level. Your shots can hit
them, and they'll mention it. Bones heal them too. Biscuit is there from
the start; Pepper joins on planet 2; Ziggy on planet 3.

**Bosses** (`BOSS` in `sim.js`) are a body and parts. The parts are
ordinary enemies placed round the body each step (they can spin with it);
while any is left the body is shielded. Shots test unshielded things first,
so a part tucked against a shielded body is still hittable — the Storm
Tower's rods were unbeatable until this. Attacks: fans of bolts, the
Brute's torpedoes, launched fighters, lightning strikes, catnip puffs,
batted planets, swatting paws, the carrier's and the Moon's guns.

**The Kennel's cages**: when the guards are down but pups are still
caged, the Warden waits up to 14 s (Rosie says to hurry) instead of 2.5.

**Hazards**: lightning (a glowing column marks where it'll hit in 1.3 s; 8
damage), catnip clouds (3.5 s of backwards controls), Mittens' planets (8
damage, shootable, a barrel roll bats them away), mines (blow up within
11 m for 10 damage; shot, they burst like a bomb and take enemies with
them).

**Wingmates hit for half** (`ALLY_DMG = 0.5`) and fire every 0.6–1.1 s:
at full strength they won Yarn Nebula for you.

**Enemies in the clearing** fly a real dogfight: chase with lead, overshoot
inside 85 m and extend away, jink when you sit on their tail, fire bursts
when you're near their nose. Some go after the wingmates instead of you.
Aces are faster, tougher and better shots. They avoid the ground, the rocks
and the edge.

**Difficulty** (`SKILLS` in `sim.js`): enemy fire interval ×1.8 / ×1 /
×0.65, damage ×0.6 / ×1 / ×1.35, aim spread 0.07 / 0.035 / 0.014,
enemy toughness ×0.8 / ×1 / ×1.25, dogfighter speed and turn ×0.8 / ×1 /
×1.15.

**What simcheck says today** (three games per planet, 1.25×, the computer
tapping about six times a second like a person): a sharp pilot wins every
planet on Good Boy (at least 2 of 3, mostly 3 of 3); a sloppy one wins
every planet on Pup. On Top Dog a sharp pilot wins 5 of 9 (canyon,
thunder, lair). Full 3D wins 9 of 9. A pilot looking for secrets finds
every one (the Kennel's pups only 1 of 3 — it's meant to be hard), and one
that stays in the main channel never takes a fork by accident. Things found and fixed on the way:
the pilot circled still bosses too tightly to aim (it now flies out and
comes back on a run), chased Mittens' planets for minutes, dodged
lightning so hard it never fired; the Scratchpost boss restarted after
being beaten; shots aimed at a part were stopped by its shielded body.

## Speed

A **Speed** setting on the title and pause screens (1×, 1.25×, 1.5×,
1.75×, 2×; 1.25× by default) multiplies everything that moves: Teddy on the
rail and in the clearing, the enemies, their bolts (whose range stays the
same), your shots and charged shots. Turning rates stay the same, so faster
also means wider turns. It is `s.pace` in the sim and can change mid-game.
simcheck plays Good Boy at 1.25× and 1.5× as well as 1×. It is there to dial
in; once it feels right it can become the game's own speed and go away.

## The music (`tools/music.py`)

Original pieces in the manner of a 90s console space shooter: a rock kit
(synthesised kick, snare and hats), a synth bass jumping octaves in
eighths, synth brass stabs, trumpets and horns on big leaping tunes, with
the flattened sixth and seventh chords that make it sound heroic. Nothing
is copied from any game, only the style.

| Piece | Where | |
|---|---|---|
| Dogfight | title, map, briefings | C, 126 bpm, a march |
| Red Canyon | land rails | D, 152 |
| Among the Rocks | space rails | A minor, 146, a synth arpeggio under brass |
| Open Sky | clearings | E minor, 156 |
| The Brute | bosses | E phrygian, 162 |
| Alley Cats | the aces | F minor swing, 168: walking bass, vibes, muted trumpet and sax |
| Emperor Mittens | the final boss | D minor waltz, 176: harpsichord, organ, choir |
| Good Dogs | the ending | the title tune, slow and grand |

A level picks its pieces with `music: {rail, free, boss}`. Balanced by
rendering each instrument alone against the whole mix: the band about
8 dB under the tune, hats about 18 dB under. Re-render with `python3
tools/samples.py` (once) then `python3 tools/music.py [name ...]`.

## Drawing it (`world.js`)

- **Each level** is built by `scenery.js` when it loads, and the last one
  thrown away. Ground kinds: canyon, trench, ocean (a wave shader over a
  sea floor with islands), space (none: stars and nebula, asteroids, the
  Moon, yarn balls, station modules, floating mugs).
- **The ground** is `height()` sampled into meshes: the rail as 150 m
  strips that follow the rail, sampled finely across the walls (2.5-3 m)
  and coarsely on the floor and the plateau; the clearing as one 190×190
  grid. Vertex colours: rock strata by height, sand and scrub where it is
  flat, darker deep in the canyon. A grain texture over the top. Strips
  outside -350..+1500 m of the camera are not drawn.
- The **sky** is a gradient with the sun and streaky high cloud; the
  ringed planet from Night Watch hangs in it, washed out by the day.
  A PMREM of the sky lights and reflects off the ships and the stream.
- **Teddy's ship**: black hull, white nose and blaze, tan trim, a red
  collar band with a gold tag, wings whose tips droop like his ears, twin
  white fins, cyan engines. Teddy sits in the cockpit (a lumpy black head,
  floppy ears, tan eyebrows and cheeks, white blaze, tongue out). Each
  wingmate flies the same airframe in their own `ship` colours, with their
  own head in the cockpit; pointy-eared pets get wing tips that stand up.
- **Weather**: rain and lightning (Thunder Peaks), snow (Frost Fang),
  spores (Catnip Jungle).
- **Enemies are big** (round 5, "make all the enemies bigger like they are
  in Star Fox"): fighters are drawn at about 2× their old size (darts
  3.2, aces 3.4, raiders and Mittens' ship 3.2 in `models.js`), turrets,
  torpedoes and mines 1.35–1.4×, and their hit zones grew to match (dart
  4.6 m, raider 5, ace 4.8). That made Top Dog easy, so Top Dog enemies
  are tougher (hp ×1.4, damage ×1.45, less aim assist).
- **No boxes round enemies** (round 5: "very non-Star-Foxy"). Only those
  that need a word get one (TORPEDO, PUP!, PLANET!, a named ace, a cat on
  a wingmate's tail), and health bars only on boss parts and named aces.
  The edge arrows in the clearing stay.
- **Sharpness** (round 5): the screen's own pixels up to 2× (was 1.5×),
  and anisotropic filtering on the ground's grain. Too slow for 2 s steps
  down: 1.5×, 1.25×, 1×, then no bloom at 0.8×. 4× multisampling was
  tried and dropped: it halved the frame rate in the check browser (13 to
  6 fps), and changing it mid-game didn't take.
- **Sizes** (round 4, "make my ship smaller so I can see more"): the
  ship is drawn at 0.85 and the camera sits further back (`CAM` in
  `world.js`: 25 m behind and 9 up on the rail, 24 and 6.5 in the chase
  view), so Teddy is noticeably smaller on screen. Pickups are drawn
  1.6× and caught within 11 m (rings 13).
- A blob shadow under the ship (depth), dust when flying low, engine
  trails, speed specks in the air, a wider view on boost.
- **The lens** (round 6, from SF64's camera code): 48° (was 68°, and 74°
  at 1.25×) from further back (`CAM` in `world.js`: 38 m behind on the
  rail, 36 in the chase view). Teddy is the same size on screen, but
  everything further away looks much bigger, as in Star Fox. On the rail
  the camera follows 78% of the ship's slide (SF64: 77.7%), so the ship
  moves about the screen; it leans a little the other way to the stick;
  it tilts 30% of the ship's roll (20% in space). Wingmates fly in from
  behind, wide and high, so they don't pass through the lens.
- **The camera** (rewritten 2026-11-08 after "a noticeable jump" in rolls
  and loops). Everything is smoothed as an offset from the ship, so the
  ship's own speed never makes the picture lag. On the rail it is the
  classic view behind the rail. In the clearing, and during the rail's
  loop, it is a chase rig bolted behind the ship whose turning is smoothed
  as a rotation (a quaternion slerp), so going over the top of a loop is
  one swing with nothing to flip. The old camera's "up" came from a
  sideways vector that flipped as the nose passed vertical. The two views
  blend, and the rail view travels with the ship once the rail lets go.
  On the rail, a barrel roll's sidestep is kept apart from the stick's
  sliding, so it no longer swings the nose (it used to, by up to 50°).
  `playcheck` measures how far Teddy's ship moves on the screen in a frame
  through each move: now under 10 px. The old camera jumped 40–70 px.
- Adaptive quality: more than 2 s of slow frames steps the pixel ratio
  down (1.25, 1, 0.8), then drops the bloom.

## Not built yet / open questions

- **Nothing has been flown on a real phone** past the first two versions.
  Tilt ranges (20° turn, 20° nose, 32° roll), `HANDLING` and the speed are
  the first things to tune by hand. Whether Wheel on (now roll-first) is
  good enough to drop the BANK buttons is Jon's call.
- **More secrets** later in the game (Moonfall, Scratchpost) and a warp
  like Sector X's; medals for hitting a kill count.
- Frost Fang is heavy to draw (about 330k triangles with the cave fork).
- **The pets**: placeholders until `cast.js` is filled in.
- **Balance by hand**: the checks prove every level can be won, not that
  each is fun. Scratchpost and Moonfall look easy for the computer.
- **Loops on the rail through arches**: you can loop into the rock.
- **The target camera** (TARGET) only aims the chase camera between you
  and the target.
- **Co-op and versus** (see DESIGN.md), a score table, medals, upgrades
  between missions (Professor Hops is in the cast for it).
- A few cues (count, wave, clear, pickup, game over) are still Night Watch's.
- Icons and a link preview image (`tools/art.mjs` in Night Watch is the
  pattern).
