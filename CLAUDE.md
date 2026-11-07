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

## The game lives in `web/`

`web/` is the only directory Cloudflare uploads. The check scripts and the
notes beside it stay in the repo and off the internet. Run the checks from
the repo root.

## Before shipping

```
node simcheck.mjs    # the simulation, headless: the canyon is flyable, a computer pilot at each difficulty and both styles (seconds)
node playcheck.mjs   # the page in Chromium: title, the tilt maths, the thumb buttons, the clearing flown by the computer (~1 min)
node tools/serve.mjs # play it on a laptop at http://localhost:8080/ (arrows, Space, Shift)
```

`web/sim.js` decides everything that happens and draws nothing;
`web/terrain.js` is the ground, shared by the sim (what you hit) and
`web/world.js` (what you see). Change difficulty or the level there and
`simcheck` says whether a sharp pilot still wins, a sloppy one still
clears Pup, and Top Dog is still a fight.
