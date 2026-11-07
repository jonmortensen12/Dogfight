# Dogfight — handoff

A phone flying game in the rail-shooter genre, with free 3D dogfights. Hold
the phone sideways in both hands like a controller; tilting it is the stick,
and a few thumb buttons do the rest. The hero is Teddy, a black, tan and
white Bernedoodle. The enemy is the Hiss, a cat air force (their ships have
ears). Working title.

Built from the plan agreed in conversation (2026-11-07): solo for now with
co-op later, landscape with two thumbs, animal characters, Teddy as the
lead, and "try both" level-horizon and full-3D flying. This is the **feel
prototype**: one level (a canyon on rails, then a clearing with free flight
and a boss), to find out whether flying by tilt is fun before building more.

## Files

| File | What it is |
|---|---|
| `web/index.html` | The page: the canvases, the thumb buttons, the title / count / pause / results screens. |
| `web/main.js` | The loop, the screens, settings (kept in localStorage), sound for each event, adaptive quality. |
| `web/sim.js` | Everything that happens. Pure, deterministic (seeded), no drawing. Also the computer pilot (`autopilot`). |
| `web/terrain.js` | The ground: one `height(x, z)` function, plus spires and arches. Shared by the sim and the renderer. |
| `web/world.js` | three.js: the ground meshes, sky, ringed planet, Teddy's ship, enemy ships, effects, the camera. |
| `web/hud.js` | The 2D overlay: reticle, lock, markers and edge arrows, radar, shield/boost/bombs, boss bar, warnings, the radio with drawn portraits of Teddy and Rosie. |
| `web/input.js` | Tilt (the phone's whole orientation from the centred grip), the thumb buttons, swipes, the keyboard, the drag stick when there is no sensor. |
| `web/sound.js` | Night Watch's sound module, plus a whoosh and an engine rumble. |
| `web/lib/` | three.js r170 and its bloom passes, copied from Night Watch. |
| `web/music/` | Five pieces and some cues copied from Night Watch's `web/music/` (rendered by its `tools/music.py`). |
| `simcheck.mjs`, `playcheck.mjs` | The checks. |
| `tools/serve.mjs` | A plain file server for the checks and for playing on a laptop. |

**Borrowed from Night Watch:** the particle system, beams, glow textures,
the enemy ship models (dart, raider, the bomber as the Brute, torpedo,
turret — with cat ears added), the planet and ring shaders, the
deviceorientation-to-quaternion maths, the sound module and music.

## Playing it

- Phone: open the page, pick options, **FLY!** iOS asks for motion access
  on that tap. Then a three-second count while you hold the phone however
  is comfortable: that grip becomes "straight and level". **CENTRE** (top)
  re-takes it at any time.
- Laptop: the keys are listed under the controls below.
  No sensor: a thumb dragged on the left half of the screen is a stick.
- URL options: `?start=arena` (skip the canyon), `?skill=pup|good|top`,
  `?style=level|full`, `?auto=1` (the computer flies), `?low=1`, `?seed=N`.

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
the grip when it was CENTRED (`q0⁻¹ · q`, split as yaw about the screen's
y, then pitch about x, then roll about z). Gravity alone cannot see the
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
  230 m/s, homing if locked, 7 damage plus a 22 m burst. **Only a charged
  shot locks on.**
- **BOMB**: straight ahead, no lock; bursts after 1.3 s or on contact,
  50 m, and clears enemy bolts inside it.
- **Swipe** sideways anywhere else (< 450 ms, > 40 px): a barrel roll. It
  sidesteps, and for its 0.55 s it knocks away any enemy bolt that comes
  within 8 m ("DEFLECTED!").
- Keyboard: arrows turn and pitch, A/D roll, Space fire (hold to charge),
  Shift boost, Z brake, X bomb, Q/E barrel roll, L loop, C or U U-turn,
  T target, P pause.

## Flying (`sim.js`)

**The rail (the canyon).** The frame runs along the canyon's centre line
by itself at 60 m/s (boost 100, brake 32). The stick moves the ship about a
box in that frame: up to 42 m/s sideways and 34 m/s up/down, easing in at
6/s. The box is the canyon floor's half width minus 13 m sideways, and 6 to
58 m up (and never below the ground + 4 m). The nose points along the
ship's motion in the box, so the shots go where you are sliding: classic
rail-shooter feel. The wheel leans the ship (plus a little lean from
sliding sideways); it does not steer.

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

**Guns.** See FIRE above. Aim assist bends a tapped shot towards an
enemy within 6.3° / 4.3° / 2.6° of the nose (Pup / Good Boy / Top Dog),
leading it. Three bombs; the blue capsule gives two.

## The level

Red Canyon, 3700 m (about a minute), then the clearing. Teddy's base
(Rosie the corgi) and Teddy talk on the radio as it goes.

| u (m) | What |
|---|---|
| 330 | three darts head-on |
| 560 | two turrets, a repair bone at 760 |
| 800-960 | three spires to weave through |
| 1000 | three darts swoop in from behind and sit ahead, shooting |
| 1250 | an arch, with the tennis ball (twin lasers) under it |
| 1360 | three turrets and two darts |
| 1600 | two raiders cross the canyon |
| 1750-2250 | the narrows (16 m narrower), three spires, a golden bone |
| 2150 | five darts head-on |
| 2420, 2520 | two arches |
| 2550 | four turrets, bombs at 2850, a golden bone up high |
| 2950 | four darts swoop |
| 3150-3700 | a repair bone, the canyon opens, the last golden bone |
| clearing | wave 1: five darts; wave 2: three darts and two raiders; wave 3: the **Brute** (two engine pods shield its core; launches torpedoes and fans of bolts) with two darts |

**Enemies in the clearing** fly a real dogfight: chase with lead, overshoot
inside 85 m and extend away for 3-4.5 s, jink when you sit on their tail,
fire 2-round bursts when you are within 14° of their nose. They avoid the
ground, the buttes and the edge. Raiders set up 480 m out, then make
strafing runs with 4-round bursts. Torpedoes home slowly (42 m/s, 0.62
rad/s) for 9 s, 10 damage; shoot them.

**Difficulty** (`SKILLS` in `sim.js`): enemy fire interval ×1.8 / ×1 /
×0.65, damage ×0.6 / ×1 / ×1.35, aim spread 0.07 / 0.035 / 0.014,
enemy toughness ×0.8 / ×1 / ×1.25, dogfighter speed and turn ×0.8 / ×1 /
×1.15.

**What simcheck says today** (three seeds each; the computer taps about
six times a second, like a person, and charges shots at raiders and the
Brute): a sharp pilot wins Good Boy 3/3 in level and 2/3 in full 3D, in
2-4 minutes; a sloppy one wins Pup 3/3 and Good Boy 1/3; a sharp one loses
Top Dog 3/3. The Brute went from 40 to 30 (pods 14 to 11) when holding
FIRE stopped being automatic fire. simcheck also flies each move (rail
loop, loop and U-turn in both styles), the charge and lock, and a barrel
roll deflecting a bolt.

## Drawing it (`world.js`)

- **The ground** is `height()` sampled into meshes: the canyon as 150 m
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
  floppy ears, tan eyebrows and cheeks, white blaze, tongue out).
- A blob shadow under the ship (depth), dust when flying low, engine
  trails, speed specks in the air, a wider view on boost.
- Adaptive quality: more than 2 s of slow frames steps the pixel ratio
  down (1.25, 1, 0.8), then drops the bloom.

## Not built yet / open questions

- **The question this prototype is for**: does tilt flying feel good on a
  real phone, and which clearing style is better, level horizon or full
  3D? Nothing here has been flown on a phone yet. Tuning to try first:
  the tilt ranges (22° and 20°), the curve, the rail's sideways speed.
- **Loops on the rail through arches**: you can loop into the rock.
  Maybe the loop should refuse (or shrink) when there is no room.
- **The target camera** (TARGET) only aims the chase camera between you
  and the target; a proper lock-on view is still to do.
- One level. More worlds (ocean, space, a capital ship's trench) would use
  the same `height()` + obstacles + script approach.
- Wingmen, co-op (other phones as wingmen, a TV view, like the other games).
- Hidden routes, medals, a score table.
- Music is borrowed from Night Watch; Dogfight should get its own themes.
- Icons and a link preview image (`tools/art.mjs` in Night Watch is the
  pattern).
