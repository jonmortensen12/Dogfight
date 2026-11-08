# Dogfight

## Git workflow

Solo project, no collaborators — work directly on `main`. Commit and push
straight to `main`, no feature branches or PRs needed. Cloudflare Workers
deploys from `main` on every push, so anything on another branch is not
live, and a change has to work before it is committed.

## Start here

Read `HANDOFF.md` before making any non-trivial change — how the flying
works (the rail and the two free-flight styles), the tilt controls, the
level's layout, the tuning numbers and what is not built yet.

## The pets

The family's pets go in `web/cast.js` (names, colours, ears, photos,
lines); everyone but Teddy is a placeholder until Jon fills them in. The
story and every level are data in `web/levels.js`.

## The game lives in `web/`

`web/` is the only directory Cloudflare uploads. The check scripts and the
notes beside it stay in the repo and off the internet. Run the checks from
the repo root.

## Before shipping

```
node simcheck.mjs    # the simulation, headless: every rail flyable, the computer flies every planet (Good Boy and Pup), the story beats, the moves, every line voiced (~4 min)
node playcheck.mjs   # the page in Chromium: tilt maths, buttons, camera, the adventure flow, every planet loads (~3 min)
node tools/serve.mjs # play it on a laptop at http://localhost:8080/ (arrows, Space, Shift)
python3 tools/samples.py && python3 tools/music.py   # re-render web/music/ after changing a piece
python3 tools/voice.py --models DIR   # voice new or changed radio lines (simcheck says which are missing)
```

`web/sim.js` decides everything that happens and draws nothing;
`web/terrain.js` is the ground, shared by the sim (what you hit) and
`web/world.js` (what you see). Change difficulty or the level there and
`simcheck` says whether a sharp pilot still wins every planet, a sloppy
one still clears Pup, and Top Dog is still a fight.
