# Dogfight — design notes

**Status (2026-11-08):** the single-player adventure below is built:
the story, ten planets and the route map, the wingmates, every boss,
Mittens and the ending (see HANDOFF.md, and `web/levels.js` for the
script). The cast are placeholders until the real pets go into
`web/cast.js`. Multiplayer is not built yet. Tone, from Jon: silly all the
way.

Written 2026-11-08 from Jon's asks: more levels and a story,
the family's pets as the cast, a cat as the final boss, and multiplayer
without players getting too far ahead or behind. Names marked *(name?)* are
placeholders waiting for the real pets.

## The story

**The pitch.** Emperor Mittens *(name?)* was the most pampered cat in the
galaxy, until the day she knocked one too many things off the table and was
banished to the dark side of the Litterbelt. She's back with an empire of
cats, the Hiss, and a plan: knock every planet in the Dog Star system off
its orbit, one by one, because she can. Only Good Boy Squadron stands in
her way.

That one motive — *a cat knocking things off the table* — gives the whole
game its jokes and its set pieces. The Hiss tip moons out of orbit, swat
asteroids at you, and the final boss bats planets across the sky with a
giant paw.

**The beats.**

1. **Red Canyon.** The Hiss have dug in on the edge of home. A first
   mission, a first boss (the Brute). Teddy and Rosie at base. *(built)*
2. **The squad assembles.** Each early level frees or picks up a squadmate,
   one family pet each, with their own plane and their own way of getting
   into trouble.
3. **The Alley Cats.** A rival squadron of four Hiss aces who turn up
   mid-game, trash-talk on the radio, and fight you in the clearings. They
   come back, and each time they've upgraded.
4. **The table edge.** The Hiss start tipping planets. Levels become a race
   to stop a moon falling, a station spinning out, a sun-shade being
   knocked off.
5. **Scratchpost.** The Hiss homeworld: a fortress planet wrapped in a
   tower of carpet and steel. The last rail run is a trench into its core.
6. **Mittens.** A giant cat face in the dark, with paws. Phase one, she
   swats planets and asteroids at you (shoot the paws). Phase two, the face
   cracks open and the real cat inside flees in a tiny ship — a chase.
7. **The ending.** She's caught, put in a carrier, and taken to the vet.
   The worst fate a cat can imagine.

## The cast

The heroes are the family's pets. For each one we need: **name**, **what
they are** (breed or animal), **colours and markings**, a **photo** or two,
and **one sentence about their personality**. That's enough for a ship in
their colours, a 3D head in the cockpit, a portrait for the radio, and how
they talk.

| Role | Who | What they do in the game |
|---|---|---|
| Leader | **Teddy** (Bernedoodle) | The player. Brave, goofy, food-motivated. |
| Wingmate 1 | *(pet?)* | The steady one: covers you, shares bones. |
| Wingmate 2 | *(pet?)* | The hothead: charges in, needs rescuing. |
| Wingmate 3 | *(pet?)* | The clever one: spots weak points and secret routes. |
| Base | Rosie the corgi *(or a family pet?)* | Mission control: briefings, warnings. |
| Mechanic | *(a non-dog pet? a rabbit, a parrot, a lizard?)* | Upgrades between missions. |
| Villain | **Emperor Mittens** *(a family cat?)* | The final boss. |
| Rivals | The Alley Cats (four cat aces) | Recurring dogfights. |

If anyone in the family has a cat, that cat should be Mittens, lovingly.
Non-dog pets work well as the crew who don't fly.

**How wingmates play** (borrowed from the genre because it works): they fly
with you, call out threats, and get into trouble. "Teddy, get this cat off
my tail!" Save them and they help later: one hands you a bomb, another opens
a secret route. Let one get shot down and they sit out the next mission. It
makes the clearings matter and gives the radio its personality.

## The levels

Each level runs about 3 to 5 minutes: a rail run, at least one free-flight
clearing, and a boss. A **route map** branches, so one playthrough is about
7 levels out of 12–14. Easy routes, hard routes, and secret routes opened
by doing something special in a level (saving a wingmate, finding all the
golden bones, a hidden target).

| Planet | The idea | What's new to play |
|---|---|---|
| **Red Canyon** (built) | Desert canyons, a clearing, the Brute. | The basics. |
| **Tidewater** | An ocean world in a storm, islands, waves. | Flying low over water; a cat aircraft carrier you take apart deck by deck. |
| **Thunder Peaks** | A mountain world in a thunderstorm (dogs hate thunder). | Lightning that strikes where it flashes; ridge-skimming. |
| **The Kennel** | An asteroid prison where the Hiss keep captured pups. | All free flight in space. Rescue: shoot open cages, escort the pups out. |
| **Frost Fang** | An ice planet with crevasses and ice caves. | Narrow ice tunnels; slippery boost. |
| **Catnip Jungle** | A jungle the Hiss farm catnip in. | The catnip clouds make enemies (and you) go loopy. |
| **The Yarn Nebula** | A space nebula strung with yarn-net mines. | Threading gaps; tangled-up enemies. |
| **Moonfall** | The Hiss are pushing a moon out of orbit. | A timed race: stop the engines before it falls. |
| **Scratchpost** | The Hiss homeworld fortress. | A long trench run into the core. |
| **Mittens' Lair** | The final boss arena. | The two-phase fight above. |

Each world reuses the same parts: the ground made from one height function,
rocks placed on it, and a script of what happens at each distance. A new
world mostly needs a new height function, a colour palette, a sky, and new
props. Space levels skip the ground entirely.

**Difficulty**, on two separate dials:

- **The route** you choose: easy, middle or hard planets.
- **The skill setting** (Pup / Good Boy / Top Dog): how often enemies fire,
  how much they hurt, how much aim assist you get.

The check scripts already have a computer pilot that plays at each skill
setting; it can tell us whether each new level is fair.

**Between missions:** a short briefing on the radio, the route map, and
bones spent on upgrades. Twin lasers stay once found, the boost meter can be
upgraded, and there are extra bombs.

## Multiplayer

The worry is real: in free flight, players spread out; on rails, if each
phone runs its own clock, they drift apart. The answer is to give everyone
one shared world and one shared clock, and to keep each kind of section in
bounds.

**Co-op, 2–4 players, a phone each** (the main mode, and the one to build):

- **The rail is shared.** One phone hosts. It owns the rail clock and
  everyone's rail position comes from it, so nobody can be ahead or behind.
  Each player still has their own spot in the box: four ships flying in
  formation down the same canyon.
- **Boost and brake** become moving forward or back within the formation,
  a window of about ±40 m around the shared rail point. You can push to the
  front of the pack, but you can't leave it.
- **A loop on the rail** can't stop everyone's rail. Your own ship does
  the loop and drops to the back of the window, then eases back into
  place. In single player the rail still waits.
- **Clearings and space levels** are naturally bounded: the arena has an
  edge. More players means bigger waves. The radar and edge arrows show
  your friends as well as enemies.
- **Leaving a clearing**: when the waves are clear, everyone is swept into
  formation (a brief autopilot, like the ending of an all-range section in
  the genre) and the rail picks you all up together.
- **Getting shot down**: you're back in 8 seconds at the formation, from a
  shared pool of lives. Or a friend flies through your parachute to bring
  you back sooner, which makes a rescue a moment worth having.

**How the phones talk** (the pattern the other games already use):

- Phones connect over WebRTC (PeerJS, with the Cloudflare TURN relay as a
  fallback).
- **Each phone flies its own ship**, so steering has no lag. It sends its
  position about 20 times a second. It's co-op, so there's nothing to cheat.
- **The host runs the enemies**, the shots, the rail clock and the score,
  and sends snapshots. The other phones draw enemies a moment behind and
  smoothed, the way Night Watch does.
- **Hits are judged the Night Watch way:** your phone says what you hit,
  and the host accepts it if that enemy is close enough on its own copy.
- **Clock sync:** everyone's rail position comes from one start time plus
  a measured clock offset, so the canyon matches on every phone to within
  a frame.

**A TV, if there is one**, could show a chase view of the whole squad, so
people watching on the couch can follow along. It's optional, like Night
Watch's TV.

**Versus, later**: a dogfight arena, free-for-all or dogs against cats.
Someone plays a Hiss ace in a cat ship. This is easier to build than co-op
(no rail, one arena) and a good way to test the networking first.

**Suggested order:** versus in one clearing first, to get the networking
right without the rail. Then co-op through Red Canyon on the shared rail.
Then co-op everywhere.

## Questions for Jon

1. **The pets.** Who's in? Name, animal, colours, a photo, and one line of
   personality for each. Does anyone have a cat to cast as Mittens?
2. **The tone.** Silly-funny all the way (the vet ending, catnip clouds),
   or a straight space opera that happens to have dogs in it?
3. **Players.** Is co-op for the family on phones in the same room the
   main case, or friends playing from different houses too? It changes how
   much the network has to cope with.
4. **Length.** A short route of about 7 levels (30–40 minutes, replayed on
   different routes), or a longer campaign with saving?
