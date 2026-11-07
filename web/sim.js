/* Dogfight - everything that happens. Pure: no drawing, no DOM, no clock.

   step(sim, dt, input) moves the world on by dt seconds. The page calls it
   every frame; simcheck.mjs calls it from Node with a computer pilot
   (autopilot, below) to find out whether the level is fair.

   Two ways of flying, one ship:
   - RAIL (the canyon): the camera's frame runs along the canyon by itself;
     the stick moves the ship about inside a box in that frame. The ship
     points where it is moving, and shots go where it points.
   - FREE (the clearing): the ship flies itself. Two styles, because that
     is the open question:
       'level' - bank to turn, the horizon always stays level, the stick
                 pitches up and down and lets go back to level flight.
       'full'  - real aircraft: the stick rolls and pitches the ship about
                 its own axes. Loops, inverted flight, everything.
   Units are metres and seconds; y is up; the level runs along -z.

   Input: {sx, sy, sr} the stick in -1..1 (turn right, nose up, roll
   right), fire, boost, brake (held), and the one-shot presses bomb, loop,
   uturn, roll (a barrel roll: -1 left, +1 right). */
import {height, normalAt, hitObstacle, railFrame, halfW, cx, OBSTACLES, archUnder,
  CANYON_END, ARENA, ARENA_U, ARENA_LIMIT, CEILING, RAIL_TOP, RAIL_FLOOR, WALL_MARGIN} from './terrain.js';

export const SKILLS = {
  pup:  {name: 'Pup',      fire: 1.8, dmg: 0.6, spread: 0.07, assist: 0.11, hp: 0.8, ai: 0.8},
  good: {name: 'Good Boy', fire: 1.0, dmg: 1.0, spread: 0.035, assist: 0.075, hp: 1.0, ai: 1.0},
  top:  {name: 'Top Dog',  fire: 0.65, dmg: 1.35, spread: 0.014, assist: 0.045, hp: 1.25, ai: 1.15},
};

export const SPEED = {rail: 60, railBoost: 100, railBrake: 32, free: 62, freeBoost: 108, freeBrake: 34};
const SHOT_SPEED = 430, BOLT_SPEED = 125;
const SHIP_R = 2.2;
/* The charged shot: starts charging after holding FIRE this long, full after
   this much more; locks within this cone (radians); its hit and burst. */
export const CHARGE = {start: 0.22, time: 0.75, cone: 0.21, dmg: 7, blast: 22};

/* ---------- small vector help (arrays would be tidier; objects are faster to read) ---------- */
const len = (x, y, z) => Math.hypot(x, y, z);
function norm(v){ const l = len(v.x, v.y, v.z) || 1; v.x /= l; v.y /= l; v.z /= l; return v; }
function cross(a, b){ return {x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x}; }
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => { while(a > Math.PI) a -= 2 * Math.PI; while(a < -Math.PI) a += 2 * Math.PI; return a; };
/* Turn unit vector f towards unit vector d by at most ang radians. */
function turnToward(f, d, ang){
  const c = clamp(dot(f, d), -1, 1), a = Math.acos(c);
  if(a < 1e-5) return;
  const k = Math.min(1, ang / a);
  if(a > 3.1){ // straight behind: pick a way round
    const s = Math.abs(f.y) < 0.9 ? {x: 0, y: 1, z: 0} : {x: 1, y: 0, z: 0};
    d = norm({x: f.x * -0.9 + s.x, y: f.y * -0.9 + s.y, z: f.z * -0.9 + s.z});
    return turnToward(f, d, ang);
  }
  // slerp
  const t = k * a, sa = Math.sin(a);
  const w1 = Math.sin(a - t) / sa, w2 = Math.sin(t) / sa;
  f.x = f.x * w1 + d.x * w2; f.y = f.y * w1 + d.y * w2; f.z = f.z * w1 + d.z * w2;
  norm(f);
}
function rng(seed){
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* Closest approach of segment a->b to point c, squared. */
function segDist2(ax, ay, az, bx, by, bz, cx_, cy, cz){
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz || 1;
  const t = clamp(((cx_ - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2, 0, 1);
  const px = ax + dx * t - cx_, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz;
}

/* A point in the rail's frame: u along, ox to the right, at height y. */
export function railPoint(u, ox, y){ const f = railFrame(u); return {x: f.x + f.rx * ox, y, z: f.z + f.rz * ox}; }

/* ---------- a new game ---------- */
export function newSim(opts){
  opts = opts || {};
  const sk = SKILLS[opts.skill] ? opts.skill : 'good';
  const s = {
    t: 0, skill: sk, K: SKILLS[sk], style: opts.style === 'full' ? 'full' : 'level',
    rand: rng(opts.seed || 7), nextId: 1,
    phase: 'canyon', mode: 'rail', wave: 0, waveT: 0, clearT: 0, done: false, failed: false,
    p: null, enemies: [], shots: [], bolts: [], missiles: [], bombs: [], pickups: [], events: [],
    script: [], stats: {kills: 0, shots: 0, hits: 0, gold: 0, goldTotal: 0, damage: 0, time: 0, bombs: 0, charged: 0},
    boss: null, warn: '', arena: ARENA, checkpoint: opts.start === 'arena' ? 'arena' : 'canyon',
  };
  const u0 = opts.start === 'arena' ? CANYON_END - 120 : 0;
  s.p = {
    x: 0, y: 30, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, vx: 0, vy: 0, vz: 0,
    speed: SPEED.rail, shield: 100, boost: 1, bombs: 3, twin: false,
    rail: {u: u0, ox: 0, oy: 30, vx: 0, vy: 0},
    yaw: 0, pitch: 0, bank: 0, rollT: 0, rollDir: 0, spin: 0, man: null, charge: 0, holdT: 0, fireHeld: false,
    hitT: 0, fireT: 0, lock: null, dead: false, deadT: 0, scrape: 0,
    behind: 0,
  };
  placeRail(s, 0);
  buildScript(s, u0);
  if(opts.start === 'arena') say(s, 'rosie', 'Starting you at the clearing, Teddy.', 2.5);
  return s;
}

function ev(s, k, o){ o = o || {}; o.k = k; s.events.push(o); return o; }
function say(s, who, text, dur){ ev(s, 'say', {who, text, dur: dur || 3.2}); }

/* ---------- the canyon's script: things that happen at u ---------- */
function buildScript(s, u0){
  const S = [];
  const at = (u, fn) => { if(u >= u0) S.push({u, fn}); };
  at(60, () => say(s, 'rosie', 'Teddy, the Hiss have dug into Red Canyon. Clear it out.', 3.6));
  at(200, () => say(s, 'teddy', 'On it! Point the phone to steer. Tap to bark, hold for a big one.', 3));
  at(330, () => formation(s, 'oncoming', 3, 330 + 420));
  at(560, () => { turret(s, 1050, -1); turret(s, 1080, 1); });
  at(620, () => pickup(s, 'bone', 760, 0, 14));
  at(700, () => say(s, 'rosie', 'Rocks ahead - weave through.', 2.4));
  at(1000, () => { swoop(s, 3); say(s, 'rosie', 'Bandits behind you!', 2.2); });
  at(1060, () => { pickup(s, 'ball', 1250, 0, 22); say(s, 'teddy', 'Ooh - a ball under that arch.', 2.4); });
  at(1360, () => { turret(s, 1750, -1); turret(s, 1780, 1); turret(s, 1820, -1); formation(s, 'oncoming', 2, 1800); });
  at(1600, () => { crossing(s, 2050, -1, 34); crossing(s, 2110, 1, 26); });
  at(1700, () => { pickup(s, 'gold', 1990, 18, 12); say(s, 'rosie', "It's tight through the narrows.", 2.4); });
  at(2150, () => formation(s, 'oncoming', 5, 2150 + 430));
  at(2300, () => say(s, 'teddy', 'Arches! Stay low!', 2));
  at(2550, () => { turret(s, 2980, -1); turret(s, 3000, 1); turret(s, 3040, 1); turret(s, 3070, -1); pickup(s, 'bomb', 2850, -12, 20); });
  at(2700, () => pickup(s, 'gold', 2860, 22, 46));
  at(2950, () => { swoop(s, 4); });
  at(3150, () => pickup(s, 'bone', 3320, 0, 20));
  at(3250, () => say(s, 'rosie', 'The canyon opens up ahead. Once you are out, you are free to fly - anywhere.', 3.8));
  at(3500, () => pickup(s, 'gold', 3640, -30, 50));
  S.sort((a, b) => a.u - b.u);
  s.script = S;
  s.stats.goldTotal = 3;
}

function newEnemy(s, type, o){
  const K = s.K;
  const base = {
    dart: {hp: 2, r: 3.2, score: 100, speed: 66},
    raider: {hp: 5, r: 3.6, score: 200, speed: 78},
    turret: {hp: 3, r: 4.2, score: 100, speed: 0},
    torpedo: {hp: 1, r: 2.6, score: 50, speed: 42},
    pod: {hp: 11, r: 7, score: 500, speed: 0},
    brute: {hp: 30, r: 13, score: 2000, speed: 30},
  }[type];
  const e = Object.assign({id: s.nextId++, type, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0,
    t: 0, fireT: 1 + s.rand() * 1.5, burst: 0, state: '', ph: s.rand() * 6.28, flash: 0, bank: 0}, base, o || {});
  e.hp = Math.ceil(e.hp * (type === 'torpedo' ? 1 : K.hp));
  e.maxHp = e.hp;
  s.enemies.push(e);
  return e;
}

/* Rail enemies keep their own place in the rail's frame (ru, rox, roy). */
function formation(s, kind, n, u){
  const slots = [[0, 30], [-14, 38], [14, 38], [-28, 46], [28, 46]];
  for(let i = 0; i < n; i++){
    newEnemy(s, 'dart', {state: 'oncoming', ru: u + i * 18, rox: slots[i][0] * (n > 3 ? 1 : 1.3), roy: slots[i][1] - 6, rail: true});
  }
}
function swoop(s, n){
  for(let i = 0; i < n; i++){
    const side = i % 2 ? 1 : -1;
    newEnemy(s, 'dart', {state: 'swoopIn', rel: -70 - i * 14, rox: side * (8 + i * 7), roy: 70, holdY: 22 + i * 7, holdX: side * (6 + i * 9), rail: true, t: -i * 0.3});
  }
}
function crossing(s, u, side, y){ newEnemy(s, 'raider', {state: 'cross', ru: u, rox: side * (halfW(u) + 30), roy: y, dir: -side, rail: true}); }
function turret(s, u, side){
  const ox = side * (halfW(u) - 8);
  const p = railPoint(u, ox, 0);
  const y = height(p.x, p.z);
  newEnemy(s, 'turret', {x: p.x, y: y + 4, z: p.z, ru: u, rail: true, ground: y});
}
function pickup(s, type, u, ox, y){
  const p = railPoint(u, ox, y);
  s.pickups.push({id: s.nextId++, type, x: p.x, y, z: p.z, u, taken: false, t: 0});
}

/* ---------- the clearing's waves ---------- */
function startArena(s){
  s.phase = 'arena'; s.mode = 'free'; s.wave = 0; s.waveT = 1.5;
  const p = s.p;
  p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1)); p.bank = 0;
  p.speed = SPEED.free;
  // the canyon's leftovers stay behind
  s.enemies = s.enemies.filter(e => !e.rail);
  s.pickups = s.pickups.filter(k => !k.taken && k.u > CANYON_END - 50);
  ev(s, 'free');
  say(s, 'rosie', 'You are in the clearing. Free flight - go get them!', 3);
}
function nextWave(s){
  s.wave++;
  const p = s.p, f = norm({x: p.fx, y: 0, z: p.fz});
  const around = (ang, dist, alt) => {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const dx = f.x * c - f.z * sn, dz = f.z * c + f.x * sn;
    const x = p.x + dx * dist, z = p.z + dz * dist;
    // keep them inside the clearing
    const ax = x - ARENA.x, az = z - ARENA.z, r = Math.hypot(ax, az), k = r > 600 ? 600 / r : 1;
    const X = ARENA.x + ax * k, Z = ARENA.z + az * k;
    return {x: X, y: Math.max(height(X, Z) + 40, alt), z: Z};
  };
  const fly = (type, pos) => {
    const e = newEnemy(s, type, {x: pos.x, y: pos.y, z: pos.z, state: type === 'raider' ? 'setup' : 'attack', wave: s.wave});
    const d = norm({x: p.x - e.x, y: 0, z: p.z - e.z});
    e.fx = d.x; e.fz = d.z; e.fy = 0;
    e.fireT = 2 + s.rand() * 2;
    return e;
  };
  if(s.wave === 1){
    for(let i = 0; i < 5; i++) fly('dart', around((i - 2) * 0.35, 650 + i * 30, 70 + i * 22));
    say(s, 'teddy', 'Five of them. Here we go!', 2.4);
  } else if(s.wave === 2){
    for(let i = 0; i < 3; i++) fly('dart', around(Math.PI * 0.6 + i * 0.4, 600, 90 + i * 30));
    fly('raider', around(-Math.PI * 0.5, 650, 140));
    fly('raider', around(Math.PI, 600, 60));
    say(s, 'rosie', 'More coming - from all sides. Use the U-turn!', 3);
  } else if(s.wave === 3){
    ev(s, 'bosswarn');
    say(s, 'rosie', 'Something big is coming over the ridge...', 3.2);
    const c = {x: ARENA.x, z: ARENA.z};
    const a = Math.atan2(p.z - c.z, p.x - c.x) + Math.PI;
    const b = newEnemy(s, 'brute', {x: c.x + Math.cos(a) * 520, y: 210, z: c.z + Math.sin(a) * 520, state: 'boss', orbitA: a, wave: 3, shielded: true});
    b.fireT = 4; b.torpT = 6;
    s.boss = b;
    for(const side of [-1, 1]) newEnemy(s, 'pod', {parent: b.id, side, wave: 3, fireT: 99});
    placePods(s, b);
    for(let i = 0; i < 2; i++) fly('dart', around(Math.PI + (i ? 0.5 : -0.5), 500, 160));
    s.waveT = -1;
  }
}

/* ---------- the step ---------- */
export function step(s, dt, inp){
  inp = inp || {};
  dt = Math.min(dt, 1 / 20);
  s.t += dt;
  if(!s.done) s.stats.time += dt;
  const p = s.p;
  s.warn = '';

  if(p.dead){
    p.deadT += dt;
    if(p.deadT > 2.5 && !s.failed){ s.failed = true; ev(s, 'failed'); }
  } else {
    if(s.mode === 'rail') flyRail(s, dt, inp); else flyFree(s, dt, inp);
    ship(s, dt, inp);
  }
  if(s.mode === 'rail'){
    while(s.script.length && s.script[0].u <= p.rail.u){ s.script.shift().fn(); }
    if(p.rail.u >= CANYON_END && !p.dead) startArena(s);
  } else if(s.phase === 'arena'){
    const left = s.enemies.filter(e => e.wave === s.wave && e.type !== 'torpedo').length;
    if(s.waveT > 0){ s.waveT -= dt; if(s.waveT <= 0) nextWave(s); }
    else if(s.wave > 0 && left === 0 && s.wave < 3){ s.waveT = 2.5; if(s.wave === 1) say(s, 'rosie', 'Nice flying! Wave two inbound.', 2.4); }
  }
  enemies(s, dt);
  projectiles(s, dt);
  pickups(s, dt);
  if(s.phase === 'won'){ s.clearT += dt; if(s.clearT > 4 && !s.done){ s.done = true; ev(s, 'done'); } }
}

/* ---------- flying: the rail ---------- */
export const LOOP = {railR: 24, railDur: 1.9, freeDur: 2.2, uturnUp: 1.1, uturnRoll: 0.55};
function flyRail(s, dt, inp){
  const p = s.p, r = p.rail;
  const want = inp.boost && p.boost > 0.02 ? SPEED.railBoost : inp.brake && p.boost > 0.02 ? SPEED.railBrake : SPEED.rail;
  if(inp.loop && !p.man){
    // a somersault: the rail waits while the ship goes up, over (facing
    // backwards at the top) and down again. Whatever was behind is now ahead.
    p.man = {kind: 'loop', t: 0, dur: LOOP.railDur, u0: r.u, ox0: r.ox, oy0: r.oy};
    r.vx = r.vy = 0;
    ev(s, 'loop');
  }
  if(p.man){ railLoop(s, dt); return; }
  meter(p, dt, want !== SPEED.rail);
  p.speed += (want - p.speed) * Math.min(1, 2.5 * dt);
  r.u += p.speed * dt;
  const sx = clamp(inp.sx || 0, -1, 1), sy = clamp(inp.sy || 0, -1, 1);
  r.vx += (sx * 42 - r.vx) * Math.min(1, 6 * dt);
  r.vy += (sy * 34 - r.vy) * Math.min(1, 6 * dt);
  if(p.rollT > 0) r.vx += p.rollDir * 70 * dt;          // a roll is a sidestep too
  r.ox += r.vx * dt; r.oy += r.vy * dt;
  const lim = halfW(r.u) - WALL_MARGIN;
  if(r.ox > lim){ r.ox = lim; r.vx = Math.min(0, r.vx); }
  if(r.ox < -lim){ r.ox = -lim; r.vx = Math.max(0, r.vx); }
  if(r.oy > RAIL_TOP){ r.oy = RAIL_TOP; r.vy = Math.min(0, r.vy); }
  const q = railPoint(r.u, r.ox, 0);
  const floor = Math.max(RAIL_FLOOR, height(q.x, q.z) + 4);
  if(r.oy < floor){ r.oy = floor; r.vy = Math.max(0, r.vy); }
  // the wheel rolls the ship; sliding sideways leans it a little too
  const bankT = clamp((inp.sr || 0) * 1.3 + r.vx / 42 * 0.35, -1.45, 1.45);
  p.bank += (bankT - p.bank) * Math.min(1, 8 * dt);
  placeRail(s, dt);
}
function railLoop(s, dt){
  const p = s.p, r = p.rail, m = p.man;
  m.t += dt;
  const k = Math.min(1, m.t / m.dur);
  const th = Math.PI * 2 * (k - Math.sin(Math.PI * 2 * k) * 0.08);     // a touch slower over the top
  const R = LOOP.railR, f = railFrame(m.u0);
  const along = R * Math.sin(th), up = R * (1 - Math.cos(th));
  const ox = p.x, oy = p.y, oz = p.z;
  p.x = f.x + f.tx * along + f.rx * m.ox0; p.y = m.oy0 + up; p.z = f.z + f.tz * along + f.rz * m.ox0;
  if(dt > 0){ p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; p.vz = (p.z - oz) / dt; }
  const c = Math.cos(th), sn = Math.sin(th);
  p.fx = f.tx * c; p.fy = sn; p.fz = f.tz * c;
  p.ux = -f.tx * sn; p.uy = c; p.uz = -f.tz * sn;
  p.bank = 0;
  p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1));
  if(k >= 1){ p.man = null; r.oy = m.oy0; r.ox = m.ox0; placeRail(s, 0); }
}
function placeRail(s, dt){
  const p = s.p, r = p.rail, f = railFrame(r.u);
  const ox = p.x, oy = p.y, oz = p.z;
  p.x = f.x + f.rx * r.ox; p.y = r.oy; p.z = f.z + f.rz * r.ox;
  if(dt > 0){ p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; p.vz = (p.z - oz) / dt; }
  // the nose points where the ship is going in the box
  const k = 1.15 / Math.max(30, p.speed);
  const fwd = norm({x: f.tx + f.rx * r.vx * k, y: r.vy * k, z: f.tz + f.rz * r.vx * k});
  p.fx = fwd.x; p.fy = fwd.y; p.fz = fwd.z;
  orient(p);
  p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1));
}
/* up from forward and bank (level flying) */
function orient(p){
  const right = norm({x: -p.fz, y: 0, z: p.fx});
  const f = {x: p.fx, y: p.fy, z: p.fz};
  const up0 = cross(right, f);
  const c = Math.cos(p.bank), sn = Math.sin(p.bank);
  p.ux = up0.x * c + right.x * sn; p.uy = up0.y * c + right.y * sn; p.uz = up0.z * c + right.z * sn;
}
function meter(p, dt, using){
  if(using) p.boost = Math.max(0, p.boost - dt / 2.2);
  else p.boost = Math.min(1, p.boost + dt / 4);
}

/* ---------- flying: free ----------
   The stick: sx turns the nose left/right, sy up/down, sr rolls.
   'level': the nose turns about the world's up and the roll is only a lean
   (the horizon stays put). 'full': all three about the ship's own axes.
   The LOOP and the U-TURN are flown the same way in both: a whole loop, or
   half a loop and then half a roll, about the ship's own axes. */
function flyFree(s, dt, inp){
  const p = s.p;
  const want = inp.boost && p.boost > 0.02 ? SPEED.freeBoost : inp.brake && p.boost > 0.02 ? SPEED.freeBrake : SPEED.free;
  meter(p, dt, want !== SPEED.free);
  p.speed += (want - p.speed) * Math.min(1, 2 * dt);
  let sx = clamp(inp.sx || 0, -1, 1), sy = clamp(inp.sy || 0, -1, 1), sr = clamp(inp.sr || 0, -1, 1);

  if(!p.man && (inp.loop || inp.uturn)){
    const u = {x: p.ux, y: p.uy, z: p.uz};
    if(s.style === 'level'){ p.bank = 0; orient(p); }      // start the maneuver from wings level
    p.man = inp.loop ? {kind: 'loop', t: 0, dur: LOOP.freeDur} : {kind: 'uturn', t: 0, dur: LOOP.uturnUp + LOOP.uturnRoll, dir: (s.style === 'full' && u.y < 0) ? 1 : (p.bank >= 0 ? 1 : -1)};
    ev(s, inp.loop ? 'loop' : 'uturn');
  }
  // the clearing's edges: turn the ship back in
  const ax = p.x - ARENA.x, az = p.z - ARENA.z, rr = Math.hypot(ax, az);
  let home = 0;
  if(rr > ARENA_LIMIT - 120){ s.warn = 'TURN BACK'; home = clamp((rr - (ARENA_LIMIT - 120)) / 120, 0, 1); }
  if(p.y > CEILING - 40) s.warn = 'TOO HIGH';

  if(p.man){
    const f = {x: p.fx, y: p.fy, z: p.fz}, u = {x: p.ux, y: p.uy, z: p.uz};
    const m = p.man; m.t += dt;
    // how much of each part of the maneuver falls in this step, so it
    // lands exactly: a loop is 360 degrees of pitch; a U-turn is 180 of
    // pitch (over the top, upside down) then 180 of roll (right way up)
    const span = (a, b) => Math.max(0, Math.min(m.t, b) - Math.max(m.t - dt, a));
    if(m.kind === 'loop') rot(f, u, null, Math.PI * 2 / m.dur * span(0, m.dur), 0, 0);
    else {
      rot(f, u, null, Math.PI / LOOP.uturnUp * span(0, LOOP.uturnUp), 0, 0);
      rot(f, u, null, 0, Math.PI / LOOP.uturnRoll * m.dir * span(LOOP.uturnUp, m.dur), 0);
    }
    p.fx = f.x; p.fy = f.y; p.fz = f.z; p.ux = u.x; p.uy = u.y; p.uz = u.z;
    p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1));
    if(m.t >= m.dur){
      p.man = null;
      if(s.style === 'level'){ p.pitch = clamp(p.pitch, -1.15, 1.15); p.bank = 0; levelFrame(p); }
    }
  } else if(s.style === 'level'){
    if(home > 0){
      const toYaw = Math.atan2(-ax, az);
      sx = clamp(sx + clamp(wrap(toYaw - p.yaw) * 2, -1, 1) * home * 1.5, -1, 1);
    }
    p.yaw += sx * 1.5 * dt;
    if(Math.abs(sy) > 0.06) p.pitch += sy * 1.25 * dt;
    else p.pitch -= p.pitch * Math.min(1, 0.6 * dt);     // let go and it levels out
    if(p.y > CEILING - 40) p.pitch = Math.min(p.pitch, -0.1);
    p.pitch = clamp(p.pitch, -1.15, 1.15);
    // the roll is a lean: the wheel, plus a little into the turn
    const bankT = clamp(sr * 1.3 + sx * 0.45, -1.45, 1.45);
    p.bank += (bankT - p.bank) * Math.min(1, 6 * dt);
    levelFrame(p);
  } else {
    // full: about the ship's own axes
    const f = {x: p.fx, y: p.fy, z: p.fz}, u = {x: p.ux, y: p.uy, z: p.uz};
    if(home > 0){
      const d = norm({x: -ax, y: 0.15 * rr, z: -az});
      turnToward(f, d, home * 0.9 * dt);
    }
    if(p.y > CEILING - 40 && f.y > 0) turnToward(f, norm({x: f.x, y: -0.3, z: f.z}), 1.0 * dt);
    rot(f, u, null, sy * 1.55 * dt, sr * 2.6 * dt, sx * 1.3 * dt);
    p.fx = f.x; p.fy = f.y; p.fz = f.z; p.ux = u.x; p.uy = u.y; p.uz = u.z;
    p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1));
    const rt = norm({x: -p.fz, y: 0, z: p.fx});
    p.bank = Math.atan2(dot(u, rt), u.y);
  }
  // roll dodge pushes sideways
  const side = norm(cross({x: p.fx, y: p.fy, z: p.fz}, {x: p.ux, y: p.uy, z: p.uz}));
  const push = p.rollT > 0 ? p.rollDir * 26 : 0;
  p.vx = p.fx * p.speed + side.x * push; p.vy = p.fy * p.speed + side.y * push; p.vz = p.fz * p.speed + side.z * push;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if(p.y > CEILING) p.y = CEILING;
}
function levelFrame(p){
  const cp = Math.cos(p.pitch);
  p.fx = Math.sin(p.yaw) * cp; p.fy = Math.sin(p.pitch); p.fz = -Math.cos(p.yaw) * cp;
  orient(p);
}
/* Rotate the ship's frame: pitch about right, roll about forward, yaw about up. */
function rot(f, u, r, pitch, roll, yaw){
  if(pitch){ const c = Math.cos(pitch), s = Math.sin(pitch); const nf = {x: f.x * c + u.x * s, y: f.y * c + u.y * s, z: f.z * c + u.z * s}; const nu = {x: u.x * c - f.x * s, y: u.y * c - f.y * s, z: u.z * c - f.z * s}; Object.assign(f, nf); Object.assign(u, nu); }
  if(roll){ const r2 = cross(f, u), c = Math.cos(roll), s = Math.sin(roll); const nu = {x: u.x * c + r2.x * s, y: u.y * c + r2.y * s, z: u.z * c + r2.z * s}; Object.assign(u, nu); }
  if(yaw){ const r2 = cross(f, u), c = Math.cos(yaw), s = Math.sin(yaw); const nf = {x: f.x * c + r2.x * s, y: f.y * c + r2.y * s, z: f.z * c + r2.z * s}; Object.assign(f, nf); }
  norm(f);
  const rr = norm(cross(f, u));
  const nu = norm(cross(rr, f));
  Object.assign(u, nu);
}

/* ---------- the ship: guns, rolls, the ground, locks ---------- */
function ship(s, dt, inp){
  const p = s.p;
  p.hitT = Math.max(0, p.hitT - dt);
  p.fireT -= dt;
  if(inp.roll && p.rollT <= 0){ p.rollT = 0.55; p.rollDir = inp.roll > 0 ? 1 : -1; ev(s, 'roll'); }
  if(p.rollT > 0){ p.rollT -= dt; p.spin = p.rollDir * (1 - Math.max(0, p.rollT) / 0.55) * Math.PI * 2; if(p.rollT <= 0) p.spin = 0; }

  // the ground, the walls, the rocks
  const g = height(p.x, p.z);
  const ob = hitObstacle(p.x, p.y, p.z, SHIP_R);
  if(p.y < g + SHIP_R || ob){
    if(p.hitT <= 0){ damage(s, 12, 'crash'); p.hitT = 0.9; }
    ev(s, 'scrape', {x: p.x, y: p.y, z: p.z});
    if(s.mode === 'free'){
      const n = ob ? norm({x: p.x - (ob.x != null ? ob.x : p.x), y: 0.6, z: p.z - (ob.z != null ? ob.z : p.z)}) : (() => { const q = normalAt(p.x, p.z); return {x: q[0], y: q[1], z: q[2]}; })();
      p.x += n.x * 5; p.y = Math.max(p.y + n.y * 5, g + SHIP_R + 2); p.z += n.z * 5;
      // bounce the nose off
      const f = {x: p.fx, y: p.fy, z: p.fz};
      const d = dot(f, n);
      if(d < 0.3){ turnToward(f, norm({x: f.x + n.x * 1.2, y: f.y + n.y * 1.2, z: f.z + n.z * 1.2}), 0.8); p.fx = f.x; p.fy = f.y; p.fz = f.z; p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1)); if(s.style === 'full') fixUp(p); else { p.pitch = clamp(p.pitch, -1.15, 1.15); levelFrame(p); } }
    } else {
      // in the canyon an arch or a spire knocks you aside
      if(ob && ob.type === 'arch'){ p.rail.oy -= 6; p.rail.vy = -20; }
      else if(ob){ const side = Math.sign(p.rail.ox - railLat(ob)) || 1; p.rail.vx = side * 40; p.rail.ox += side * 3; }
      else { p.rail.oy += 3; p.rail.vy = 15; }
    }
  }
  if(s.mode === 'free' && p.y - g < 35) s.warn = s.warn || 'PULL UP';

  // guns. A tap shoots. Holding on charges a shot (about a second); once
  // it is charged the reticle locks on to whatever the nose is near, and
  // letting go fires it - homing if it has a lock. Only a charged shot locks.
  const f = {x: p.fx, y: p.fy, z: p.fz};
  if(inp.fire && !p.fireHeld){
    p.holdT = 0;
    if(p.fireT <= 0){
      p.fireT = 0.1;
      const d = assist(s, f);
      const side = norm(cross(f, {x: p.ux, y: p.uy, z: p.uz}));
      const guns = p.twin ? [-1.7, 1.7] : [0];
      for(const o of guns){
        s.shots.push({x: p.x + f.x * 3 + side.x * o, y: p.y + f.y * 3 + side.y * o - 0.3, z: p.z + f.z * 3 + side.z * o,
          vx: d.x * SHOT_SPEED + p.vx, vy: d.y * SHOT_SPEED + p.vy, vz: d.z * SHOT_SPEED + p.vz, life: 1.15});
        s.stats.shots++;
      }
      ev(s, 'fire', {twin: p.twin});
    }
  }
  if(inp.fire){
    p.holdT += dt;
    if(p.holdT > CHARGE.start){
      const was = p.charge;
      p.charge = Math.min(1, p.charge + dt / CHARGE.time);
      if(was < 1 && p.charge >= 1) ev(s, 'charged');
    }
  } else if(p.fireHeld){
    if(p.charge >= 1){
      s.missiles.push({x: p.x + f.x * 4, y: p.y + f.y * 4, z: p.z + f.z * 4, fx: f.x, fy: f.y, fz: f.z, speed: 230, target: p.lock, life: 2.6, charged: true});
      ev(s, 'chargeShot', {lock: !!p.lock});
      s.stats.charged++;
    }
    p.charge = 0; p.lock = null;
  }
  p.fireHeld = !!inp.fire;
  if(p.charge >= 1){
    let lockE = p.lock && s.enemies.find(e => e.id === p.lock);
    if(lockE){
      const dx = lockE.x - p.x, dy = lockE.y - p.y, dz = lockE.z - p.z, d = len(dx, dy, dz);
      if(Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / d, -1, 1)) > 0.6 || d > 900) lockE = null;
    }
    if(!lockE){
      p.lock = null;
      let bestA = CHARGE.cone;
      for(const e of s.enemies){
        if((e.type === 'brute' && e.shielded) || e.x < -9e4) continue;
        const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = len(dx, dy, dz);
        if(d > 750 || d < 15) continue;
        const a = Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / d, -1, 1));
        if(a < bestA){ bestA = a; p.lock = e.id; }
      }
      if(p.lock) ev(s, 'lock');
    }
  } else p.lock = null;
  // bombs go straight: no lock
  if(inp.bomb && p.bombs > 0){
    p.bombs--; s.stats.bombs++;
    s.bombs.push({x: p.x, y: p.y - 1, z: p.z, vx: f.x * 170 + p.vx * 0.5, vy: f.y * 170 + p.vy * 0.5, vz: f.z * 170 + p.vz * 0.5, life: 1.3});
    ev(s, 'missile');
  }

  // anybody sitting on your tail?
  p.behind = 0;
  if(s.mode === 'free') for(const e of s.enemies){
    if(e.type !== 'dart' && e.type !== 'raider') continue;
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = len(dx, dy, dz);
    if(d < 220 && (dx * e.fx + dy * e.fy + dz * e.fz) / d > 0.9 && (dx * f.x + dy * f.y + dz * f.z) / d > 0.3) p.behind = Math.max(p.behind, 1 - d / 220);
  }
  if(p.behind > 0.2) s.warn = s.warn || 'ON YOUR TAIL';
}
function fixUp(p){
  const f = {x: p.fx, y: p.fy, z: p.fz}, u = {x: p.ux, y: p.uy, z: p.uz};
  const r = norm(cross(f, u)), nu = norm(cross(r, f));
  p.ux = nu.x; p.uy = nu.y; p.uz = nu.z;
}
function railLat(o){ const f = railFrame(o.u); return (o.x - f.x) * f.rx + (o.z - f.z) * f.rz; }

/* Aim assist: bend a shot a little towards something the nose is nearly on. */
function assist(s, f){
  const p = s.p, A = s.K.assist;
  let best = null, bestA = A;
  for(const e of s.enemies){
    if(e.type === 'brute' && e.shielded) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = len(dx, dy, dz);
    if(d > 520) continue;
    const t = d / SHOT_SPEED;
    const lx = dx + (e.vx || 0) * t, ly = dy + (e.vy || 0) * t, lz = dz + (e.vz || 0) * t, ld = len(lx, ly, lz);
    const a = Math.acos(clamp((lx * f.x + ly * f.y + lz * f.z) / ld, -1, 1));
    if(a < bestA){ bestA = a; best = {x: lx / ld, y: ly / ld, z: lz / ld}; }
  }
  return best || f;
}

function damage(s, n, why){
  const p = s.p;
  if(p.dead || s.phase === 'won') return;
  n *= why === 'crash' ? 1 : s.K.dmg;
  p.shield = Math.max(0, p.shield - n);
  s.stats.damage += n;
  ev(s, 'hurt', {n, why});
  if(p.shield <= 0){
    p.dead = true; p.deadT = 0;
    ev(s, 'boom', {x: p.x, y: p.y, z: p.z, big: true, player: true});
  }
}

/* ---------- the enemies ---------- */
function enemies(s, dt){
  const p = s.p, K = s.K;
  for(const e of s.enemies){
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 4);
    const px = e.x, py = e.y, pz = e.z;
    if(e.type === 'turret') turretAI(s, e, dt);
    else if(e.rail) railAI(s, e, dt);
    else if(e.type === 'dart') dogfight(s, e, dt);
    else if(e.type === 'raider') strafer(s, e, dt);
    else if(e.type === 'torpedo') torpedo(s, e, dt);
    else if(e.type === 'brute') brute(s, e, dt);
    if(e.type !== 'pod'){ e.vx = (e.x - px) / dt; e.vy = (e.y - py) / dt; e.vz = (e.z - pz) / dt; }
  }
  for(const e of s.enemies) if(e.type === 'pod'){ const b = s.enemies.find(b => b.id === e.parent); if(b) placePods(s, b); }
  // gone: dead, escaped, or left behind
  s.enemies = s.enemies.filter(e => {
    if(e.hp <= 0) return false;
    if(e.gone) return false;
    if(s.mode === 'rail' && (e.type === 'turret' || e.state === 'oncoming' || e.state === 'cross') && e.ru < p.rail.u - 80) return false;
    return true;
  });
  void K;
}
function aimAt(s, e, speed){
  const p = s.p;
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = len(dx, dy, dz);
  const t = d / speed;
  let tx = dx + p.vx * t * 0.85, ty = dy + p.vy * t * 0.85, tz = dz + p.vz * t * 0.85;
  const l = len(tx, ty, tz), sp = s.K.spread;
  return norm({x: tx / l + (s.rand() - 0.5) * sp * 2, y: ty / l + (s.rand() - 0.5) * sp * 2, z: tz / l + (s.rand() - 0.5) * sp * 2});
}
function bolt(s, e, dir, dmg, from){
  const o = from || e;
  s.bolts.push({x: o.x + dir.x * (e.r + 1), y: o.y + dir.y * (e.r + 1), z: o.z + dir.z * (e.r + 1),
    vx: dir.x * BOLT_SPEED, vy: dir.y * BOLT_SPEED, vz: dir.z * BOLT_SPEED, life: 4, dmg: dmg || 7, src: e.type});
  ev(s, 'enemyShot', {x: o.x, y: o.y, z: o.z});
}
function distP(s, e){ const p = s.p; return len(p.x - e.x, p.y - e.y, p.z - e.z); }

function turretAI(s, e, dt){
  const p = s.p;
  // swivel to the ship
  const d = norm({x: p.x - e.x, y: p.y - e.y, z: p.z - e.z});
  e.fx = d.x; e.fy = d.y; e.fz = d.z;
  e.fireT -= dt;
  const ahead = s.mode === 'rail' ? e.ru - p.rail.u : 1;
  const dist = distP(s, e);
  if(e.fireT <= 0 && ahead > 50 && dist < 430){
    e.fireT = (1.7 + s.rand()) * s.K.fire;
    bolt(s, e, aimAt(s, e, BOLT_SPEED), 7);
  }
}

function railAI(s, e, dt){
  const p = s.p, pu = p.rail.u;
  let u, ox, oy;
  if(e.state === 'oncoming'){
    e.ru -= 42 * dt;
    u = e.ru; ox = e.rox + Math.sin(e.t * 1.7 + e.ph) * 9; oy = e.roy + Math.sin(e.t * 1.3 + e.ph) * 5;
    e.fireT -= dt;
    const ahead = e.ru - pu;
    if(!e.fired && ahead < 300 && ahead > 90){ e.fired = true; if(s.rand() < Math.min(1, 0.85 / s.K.fire)) bolt(s, e, aimAt(s, e, BOLT_SPEED), 7); }
  } else if(e.state === 'cross'){
    e.rox += e.dir * 46 * dt;
    u = e.ru; ox = e.rox; oy = e.roy + Math.abs(e.rox) * 0.25;
    e.fireT -= dt;
    if(Math.abs(e.rox) < 25 && e.burst === 0 && e.ru - pu > 80){ e.burst = 3; e.fireT = 0; }
    if(e.burst > 0 && e.fireT <= 0){ e.burst = e.burst > 1 ? e.burst - 1 : -1; e.fireT = 0.18; bolt(s, e, aimAt(s, e, BOLT_SPEED), 6); }
    if(Math.abs(e.rox) > halfW(e.ru) + 60) e.gone = true;
  } else {
    // swoop: in from behind, hold ahead and shoot, then out over the rim
    if(e.t < 0){ e.x = -1e5; return; }
    if(e.state === 'swoopIn'){
      e.rel += 95 * dt;
      e.roy += (e.holdY - e.roy) * Math.min(1, 1.6 * dt); e.rox += (e.holdX - e.rox) * Math.min(1, 1.2 * dt);
      if(e.rel > 150){ e.state = 'swoopHold'; e.holdT = 0; }
    } else if(e.state === 'swoopHold'){
      e.holdT += dt;
      e.rel = 150 + Math.sin(e.t * 0.9 + e.ph) * 18;
      e.fireT -= dt;
      if(e.fireT <= 0){ e.fireT = (1.6 + s.rand() * 1.2) * s.K.fire; bolt(s, e, aimAt(s, e, BOLT_SPEED), 6); }
      if(e.holdT > 8) e.state = 'swoopOut';
    } else {
      e.rel += 70 * dt; e.roy += 30 * dt;
      if(e.rel > 600 || e.roy > 160) e.gone = true;
    }
    u = pu + e.rel; e.ru = u;
    ox = e.rox + (e.state === 'swoopHold' ? Math.sin(e.t * 1.4 + e.ph) * 8 : 0);
    oy = e.roy + (e.state === 'swoopHold' ? Math.sin(e.t * 1.1 + e.ph) * 4 : 0);
    const lim = halfW(u) - 8;
    ox = clamp(ox, -lim, lim);
  }
  const q = railPoint(u, ox, oy);
  const vx = q.x - e.x, vy = q.y - e.y, vz = q.z - e.z, l = len(vx, vy, vz);
  if(l > 0.01 && l < 50){
    const want = e.state === 'swoopHold' || e.state === 'oncoming' ? norm({x: p.x - q.x, y: p.y - q.y, z: p.z - q.z}) : norm({x: vx, y: vy, z: vz});
    const f = {x: e.fx, y: e.fy, z: e.fz};
    turnToward(f, want, 3 * dt);
    e.fx = f.x; e.fy = f.y; e.fz = f.z;
  }
  e.x = q.x; e.y = q.y; e.z = q.z;
}

/* Free flight enemies: chase, overshoot, extend, come round again. */
function steerSafe(s, e, d, look){
  // the ground, the rocks and the clearing's edge come first
  const ahead = {x: e.x + e.fx * look, y: e.y + e.fy * look, z: e.z + e.fz * look};
  const g = Math.max(height(ahead.x, ahead.z), height(e.x, e.z));
  if(ahead.y < g + 45 || e.y < g + 30) d = norm({x: d.x, y: Math.max(d.y, 0) + 1.2, z: d.z});
  const ob = hitObstacle(ahead.x, ahead.y, ahead.z, 25);
  if(ob && ob.type === 'spire'){ const a = norm({x: e.x - ob.x, y: 0, z: e.z - ob.z}); d = norm({x: d.x + a.x * 1.5, y: d.y + 0.6, z: d.z + a.z * 1.5}); }
  const rx = e.x - ARENA.x, rz = e.z - ARENA.z, r = Math.hypot(rx, rz);
  if(r > ARENA_LIMIT - 180) d = norm({x: d.x - rx / r * 1.5, y: d.y, z: d.z - rz / r * 1.5});
  if(e.y > CEILING - 60) d = norm({x: d.x, y: Math.min(d.y, -0.2), z: d.z});
  return d;
}
function moveFwd(e, d, turn, speed, dt){
  const f = {x: e.fx, y: e.fy, z: e.fz};
  const before = {x: f.x, z: f.z};
  turnToward(f, d, turn * dt);
  // bank into the turn, for the look of it
  const yawRate = (before.x * f.z - before.z * f.x) / Math.max(dt, 1e-4);
  e.bank += (clamp(-yawRate * 0.9, -1.2, 1.2) - e.bank) * Math.min(1, 4 * dt);
  e.fx = f.x; e.fy = f.y; e.fz = f.z;
  e.x += f.x * speed * dt; e.y += f.y * speed * dt; e.z += f.z * speed * dt;
}
function dogfight(s, e, dt){
  const p = s.p, K = s.K;
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, dist = len(dx, dy, dz);
  let d;
  if(e.state === 'attack'){
    const t = Math.min(2, dist / 140);
    d = norm({x: dx + p.vx * t, y: dy + p.vy * t, z: dz + p.vz * t});
    if(dist < 85){ e.state = 'extend'; e.extT = 3 + s.rand() * 1.5; const a = s.rand() * 6.28;
      e.goal = {x: ARENA.x + Math.cos(a) * 380, y: 80 + s.rand() * 170, z: ARENA.z + Math.sin(a) * 380}; }
    // being chased makes it jink
    const behind = (-dx * p.fx - dy * p.fy - dz * p.fz) / (dist || 1);
    if(behind > 0.95 && dist < 200 && s.rand() < dt * 0.5){ e.state = 'evade'; e.extT = 1.6; e.jink = s.rand() < 0.5 ? -1 : 1; }
  } else if(e.state === 'extend'){
    e.extT -= dt;
    d = norm({x: e.goal.x - e.x, y: e.goal.y - e.y, z: e.goal.z - e.z});
    if(e.extT <= 0) e.state = 'attack';
  } else {
    e.extT -= dt;
    const r = cross({x: e.fx, y: e.fy, z: e.fz}, {x: 0, y: 1, z: 0});
    d = norm({x: e.fx + r.x * e.jink * 1.5, y: e.fy + 0.3 * Math.sin(e.t * 3), z: e.fz + r.z * e.jink * 1.5});
    if(e.extT <= 0) e.state = 'attack';
  }
  d = steerSafe(s, e, d, 140);
  moveFwd(e, d, 1.25 * K.ai, e.speed * K.ai, dt);
  // guns
  e.fireT -= dt;
  const a = (dx * e.fx + dy * e.fy + dz * e.fz) / (dist || 1);
  if(e.fireT <= 0 && a > 0.97 && dist < 400 && dist > 30){
    if(e.burst <= 0) e.burst = 2;
    e.burst--; e.fireT = e.burst > 0 ? 0.2 : (1.3 + s.rand()) * K.fire;
    bolt(s, e, aimAt(s, e, BOLT_SPEED), 6);
  }
}
function strafer(s, e, dt){
  const p = s.p, K = s.K;
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, dist = len(dx, dy, dz);
  let d;
  if(e.state === 'setup'){
    if(!e.goal || e.t > e.goalT){
      const a = s.rand() * 6.28;
      e.goal = {x: p.x + Math.cos(a) * 480, y: Math.max(p.y + 40, 90), z: p.z + Math.sin(a) * 480}; e.goalT = e.t + 6;
    }
    d = norm({x: e.goal.x - e.x, y: e.goal.y - e.y, z: e.goal.z - e.z});
    if(len(e.goal.x - e.x, e.goal.y - e.y, e.goal.z - e.z) < 80 || e.t > e.goalT){ e.state = 'run'; e.goal = null; }
  } else {
    d = norm({x: dx + p.vx * 0.8, y: dy + p.vy * 0.8, z: dz + p.vz * 0.8});
    e.fireT -= dt;
    const a = (dx * e.fx + dy * e.fy + dz * e.fz) / (dist || 1);
    if(dist < 420 && a > 0.95 && e.fireT <= 0){
      if(e.burst <= 0) e.burst = 4;
      e.burst--; e.fireT = e.burst > 0 ? 0.13 : 2.5 * K.fire;
      bolt(s, e, aimAt(s, e, BOLT_SPEED), 6);
    }
    if(dist < 70){ e.state = 'setup'; e.goal = null; e.goalT = 0; }
  }
  d = steerSafe(s, e, d, 160);
  moveFwd(e, d, 1.0 * K.ai, e.speed * K.ai, dt);
}
function torpedo(s, e, dt){
  const p = s.p;
  e.life = (e.life == null ? 9 : e.life) - dt;
  const d = norm({x: p.x - e.x, y: p.y - e.y, z: p.z - e.z});
  moveFwd(e, d, 0.62, e.speed, dt);
  if(distP(s, e) < 4.5){ e.hp = 0; e.nokill = true; if(p.hitT <= 0){ damage(s, 10, 'torpedo'); p.hitT = 0.4; } ev(s, 'boom', {x: e.x, y: e.y, z: e.z}); }
  if(e.life <= 0 || e.y < height(e.x, e.z)){ e.hp = 0; e.nokill = true; ev(s, 'boom', {x: e.x, y: e.y, z: e.z}); }
}
function brute(s, e, dt){
  const p = s.p, K = s.K;
  // a slow circle round the clearing, bobbing
  e.orbitA += dt * 0.055;
  const R = 260, c = ARENA;
  const tx = c.x + Math.cos(e.orbitA) * R, tz = c.z + Math.sin(e.orbitA) * R, ty = 150 + Math.sin(e.t * 0.4) * 20;
  const d = norm({x: tx - e.x, y: (ty - e.y) * 0.3, z: tz - e.z});
  moveFwd(e, d, 0.25, e.speed, dt);
  e.bank *= 0.5;
  const pods = s.enemies.filter(q => q.type === 'pod' && q.parent === e.id && q.hp > 0);
  if(e.shielded && pods.length === 0){ e.shielded = false; ev(s, 'shieldDown', {x: e.x, y: e.y, z: e.z}); say(s, 'rosie', 'Its shield is down - hit the core!', 2.6); }
  const dist = distP(s, e);
  e.fireT -= dt; e.torpT -= dt;
  if(e.fireT <= 0 && dist < 520){
    e.fireT = 2.6 * K.fire;
    const base = aimAt(s, e, BOLT_SPEED);
    const r = norm(cross(base, {x: 0, y: 1, z: 0}));
    for(let i = -2; i <= 2; i++) bolt(s, e, norm({x: base.x + r.x * i * 0.06, y: base.y, z: base.z + r.z * i * 0.06}), 7);
  }
  if(e.torpT <= 0){
    e.torpT = (pods.length ? 8.5 : 6.5) * K.fire;
    for(const side of [-1, 1]){
      const r = norm(cross({x: e.fx, y: e.fy, z: e.fz}, {x: 0, y: 1, z: 0}));
      const t = newEnemy(s, 'torpedo', {x: e.x + r.x * side * 10, y: e.y - 4, z: e.z + r.z * side * 10, wave: 0});
      t.fx = r.x * side; t.fy = -0.2; t.fz = r.z * side;
    }
    ev(s, 'torpedo', {x: e.x, y: e.y, z: e.z});
  }
}
export function placePods(s, b){
  const r = norm(cross({x: b.fx, y: b.fy, z: b.fz}, {x: 0, y: 1, z: 0}));
  for(const q of s.enemies) if(q.type === 'pod' && q.parent === b.id){
    q.x = b.x + r.x * q.side * 19 - b.fx * 3; q.y = b.y - 1.5; q.z = b.z + r.z * q.side * 19 - b.fz * 3;
    q.fx = b.fx; q.fy = b.fy; q.fz = b.fz; q.vx = b.vx; q.vy = b.vy; q.vz = b.vz;
  }
}

function hurtEnemy(s, e, n, x, y, z){
  if(e.type === 'brute' && e.shielded){ ev(s, 'deflect', {x, y, z}); return; }
  e.hp -= n; e.flash = 1;
  ev(s, 'hit', {x, y, z, id: e.id});
  if(e.hp <= 0){
    s.stats.kills++;
    const big = e.type === 'brute' || e.type === 'pod';
    ev(s, 'boom', {x: e.x, y: e.y, z: e.z, big, type: e.type});
    if(e.type === 'pod') say(s, 'teddy', 'Got an engine!', 1.8);
    if(e.type === 'brute'){
      for(const o of s.enemies) if(o !== e && o.hp > 0){ o.hp = 0; ev(s, 'boom', {x: o.x, y: o.y, z: o.z}); }
      s.phase = 'won'; s.clearT = 0; s.boss = null;
      ev(s, 'won');
      say(s, 'teddy', 'Who\'s a good boy? This guy!', 3.5);
    }
  }
}

/* ---------- shots, bolts, missiles, bombs ---------- */
function projectiles(s, dt){
  const p = s.p;
  for(const b of s.shots){
    b.life -= dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
    for(const e of s.enemies){
      if(e.x < -9e4) continue;
      const r = e.r + 0.8;
      if(segDist2(b.x, b.y, b.z, nx, ny, nz, e.x, e.y, e.z) < r * r){ s.stats.hits++; hurtEnemy(s, e, 1, nx, ny, nz); b.life = 0; break; }
    }
    if(b.life > 0 && (ny < height(nx, nz) || hitObstacle(nx, ny, nz, 0.3))){ b.life = 0; ev(s, 'spark', {x: nx, y: ny, z: nz}); }
    b.x = nx; b.y = ny; b.z = nz;
  }
  s.shots = s.shots.filter(b => b.life > 0);

  for(const b of s.bolts){
    b.life -= dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
    if(!p.dead){
      const d2 = segDist2(b.x, b.y, b.z, nx, ny, nz, p.x, p.y, p.z);
      if(p.rollT > 0 && d2 < 8 * 8){ b.life = 0; ev(s, 'deflect', {x: nx, y: ny, z: nz}); }
      else if(d2 < SHIP_R * SHIP_R * 1.2){ b.life = 0; damage(s, b.dmg, b.src || 'shot'); ev(s, 'spark', {x: nx, y: ny, z: nz, hurt: true}); }
    }
    if(b.life > 0 && (ny < height(nx, nz) || hitObstacle(nx, ny, nz, 0.3))){ b.life = 0; ev(s, 'spark', {x: nx, y: ny, z: nz}); }
    b.x = nx; b.y = ny; b.z = nz;
  }
  s.bolts = s.bolts.filter(b => b.life > 0);

  for(const m of s.missiles){
    // charged shots: fast, homing if they have a lock, and they burst
    m.life -= dt;
    const e = m.target && s.enemies.find(e => e.id === m.target);
    const f = {x: m.fx, y: m.fy, z: m.fz};
    if(e) turnToward(f, norm({x: e.x - m.x, y: e.y - m.y, z: e.z - m.z}), 5 * dt);
    m.fx = f.x; m.fy = f.y; m.fz = f.z;
    const nx = m.x + f.x * m.speed * dt, ny = m.y + f.y * m.speed * dt, nz = m.z + f.z * m.speed * dt;
    let hit = null;
    for(const q of s.enemies){
      if(q.x < -9e4) continue;
      const r = q.r + 2.5;
      if(segDist2(m.x, m.y, m.z, nx, ny, nz, q.x, q.y, q.z) < r * r){ hit = q; break; }
    }
    m.x = nx; m.y = ny; m.z = nz;
    if(hit){ m.life = 0; s.stats.hits++; blast(s, m.x, m.y, m.z, CHARGE.blast, CHARGE.dmg, hit, 'charge'); }
    else if(m.y < height(m.x, m.z) || hitObstacle(m.x, m.y, m.z, 0.5) || m.life <= 0){ m.life = 0; blast(s, m.x, m.y, m.z, CHARGE.blast, 4, null, 'charge'); }
  }
  s.missiles = s.missiles.filter(m => m.life > 0);
  for(const b of s.bombs){
    b.life -= dt;
    b.vy -= 15 * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    let hit = b.life <= 0 || b.y < height(b.x, b.z) || hitObstacle(b.x, b.y, b.z, 0.5);
    for(const e of s.enemies) if(!hit && len(e.x - b.x, e.y - b.y, e.z - b.z) < e.r + 4) hit = true;
    if(hit){ b.life = 0; blast(s, b.x, b.y, b.z, 50, 9); }
  }
  s.bombs = s.bombs.filter(b => b.life > 0);
}
function blast(s, x, y, z, R, dmg, direct, kind){
  ev(s, kind === 'charge' ? 'burst' : 'bomb', {x, y, z, r: R});
  if(direct) hurtEnemy(s, direct, dmg, x, y, z);
  for(const e of s.enemies){
    if(e === direct || e.hp <= 0) continue;
    const d = len(e.x - x, e.y - y, e.z - z);
    if(d < R + e.r) hurtEnemy(s, e, Math.ceil(dmg * (1 - d / (R + e.r)) + 1), e.x, e.y, e.z);
  }
  s.bolts = s.bolts.filter(b => len(b.x - x, b.y - y, b.z - z) > R);
}

function pickups(s, dt){
  const p = s.p;
  for(const k of s.pickups){
    if(k.taken) continue;
    k.t += dt;
    if(len(k.x - p.x, k.y - p.y, k.z - p.z) < 8 && !p.dead){
      k.taken = true;
      if(k.type === 'bone') { p.shield = Math.min(100, p.shield + 30); say(s, 'teddy', 'Mmm, bone. Shields up!', 1.8); }
      else if(k.type === 'gold') { s.stats.gold++; say(s, 'teddy', 'Golden bone! ' + s.stats.gold + ' of ' + s.stats.goldTotal + '.', 2); }
      else if(k.type === 'ball') { p.twin = true; say(s, 'teddy', 'BALL! Twin lasers!', 2); }
      else if(k.type === 'bomb') { p.bombs = Math.min(9, p.bombs + 2); say(s, 'teddy', 'Two more bombs.', 1.6); }
      ev(s, 'pickup', {type: k.type, x: k.x, y: k.y, z: k.z});
    }
  }
}

/* ---------- a computer pilot ----------
   Flies the level the way a player would, from what a player could see.
   simcheck.mjs uses it to say whether the level is fair; ?auto=1 on the
   page lets it fly for you. skill 0..1: how quick and how accurate. */
export function autopilot(s, skill){
  skill = skill == null ? 0.8 : skill;
  const p = s.p, inp = {sx: 0, sy: 0, sr: 0, fire: false, boost: false, brake: false, bomb: false, roll: 0, loop: false, uturn: false};
  if(p.dead || s.phase === 'won') return inp;
  const r = s.rand;   // shares the game's dice so a run is repeatable
  // a dodge, if something is about to hit
  for(const b of s.bolts){
    const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z, d = len(dx, dy, dz);
    if(d < 45 && (dx * b.vx + dy * b.vy + dz * b.vz) / (d * BOLT_SPEED) > 0.97 && r() < skill * 0.5){ inp.roll = r() < 0.5 ? -1 : 1; break; }
  }
  if(p.man) return inp;
  if(s.mode === 'rail') return railPilot(s, inp, skill);
  return freePilot(s, inp, skill);
}
/* The trigger, as a person works it: about six taps a second when lined
   up, or hold to charge, wait for the lock, and let go. */
function trigger(s, inp, shoot, charge){
  const p = s.p, ap = s.ap || (s.ap = {charging: false});
  if(ap.charging){
    const done = (p.charge >= 1 && p.lock) || p.holdT > 2.6;
    inp.fire = !done;
    if(done) ap.charging = false;
  } else if(charge){ ap.charging = true; inp.fire = true; }
  else inp.fire = !!shoot && Math.floor(s.t * 12) % 2 === 0;
}
function railPilot(s, inp, skill){
  const p = s.p, R = p.rail;
  let tox = R.ox, toy = 22, aimed = false;
  // a target ahead
  let best = null, bd = 1e9;
  for(const e of s.enemies){
    if(e.x < -9e4) continue;
    const f = railFrame(R.u);
    const ahead = (e.x - p.x) * f.tx + (e.z - p.z) * f.tz;
    if(ahead < 40 || ahead > 420) continue;
    if(ahead < bd){ bd = ahead; best = e; }
  }
  if(best){
    const f = railFrame(R.u);
    tox = (best.x - f.x) * f.rx + (best.z - f.z) * f.rz;
    toy = best.y;
    if(Math.abs(tox - R.ox) < best.r + 2.5 && Math.abs(toy - R.oy) < best.r + 2.5) aimed = true;
  } else {
    // something to pick up?
    for(const k of s.pickups){
      if(k.taken || k.u < R.u + 20 || k.u > R.u + 300) continue;
      if(k.type === 'bone' && p.shield > 85) continue;
      const f = railFrame(R.u);
      tox = (k.x - f.x) * f.rx + (k.z - f.z) * f.rz; toy = k.y; break;
    }
  }
  // the rocks come first
  for(const o of OBSTACLES){
    const ahead = o.u - R.u;
    if(ahead < -10 || ahead > 190) continue;
    if(o.type === 'arch'){ const under = archUnder(o, R.ox) - 9; if(toy > under) toy = under; }
    else {
      const lat = railLat(o), clear = o.r + 12;
      if(Math.abs(tox - lat) < clear){ const lim = halfW(o.u) - WALL_MARGIN; tox = lat + (tox >= lat ? clear : -clear); if(Math.abs(tox) > lim) tox = lat - Math.sign(tox - lat) * clear; }
    }
  }
  const jit = (1 - skill) * 4;
  inp.sx = clamp((tox - R.ox) * 0.09 * (0.6 + skill * 0.6) - R.vx * 0.02 + (s.rand() - 0.5) * jit * 0.05, -1, 1);
  inp.sy = clamp((toy - R.oy) * 0.09 * (0.6 + skill * 0.6) - R.vy * 0.02, -1, 1);
  trigger(s, inp, aimed || (best && bd < 300 && s.rand() < 0.3), false);
  return inp;
}
function freePilot(s, inp, skill){
  const p = s.p;
  let best = null, bd = 1e9;
  for(const e of s.enemies){
    if(e.type === 'brute' && e.shielded) continue;
    let d = len(e.x - p.x, e.y - p.y, e.z - p.z);
    if(e.type === 'torpedo') d *= d < 200 ? 0.3 : 3;
    if(e.type === 'pod' || e.type === 'brute') d *= 0.7;
    if(d < bd){ bd = d; best = e; }
  }
  let d = {x: p.fx, y: 0, z: p.fz};
  if(!best){
    // nothing yet: circle the middle
    d = {x: ARENA.x - p.x, y: 0, z: ARENA.z - p.z};
  } else {
    const t = bd / SHOT_SPEED;
    d = {x: best.x + (best.vx || 0) * t - p.x, y: best.y + (best.vy || 0) * t - p.y, z: best.z + (best.vz || 0) * t - p.z};
  }
  const dl = len(d.x, d.y, d.z) || 1;
  d = {x: d.x / dl, y: d.y / dl, z: d.z / dl};
  // the ground and the rocks
  const g = Math.max(height(p.x, p.z), height(p.x + p.fx * 120, p.z + p.fz * 120));
  if(p.y < g + 55) d = norm({x: d.x, y: Math.max(d.y, 0.5), z: d.z});
  const ob = hitObstacle(p.x + p.fx * 110, p.y + p.fy * 110, p.z + p.fz * 110, 20);
  if(ob && ob.type === 'spire') d = norm({x: d.x + (p.x - ob.x) / 50, y: d.y + 0.7, z: d.z + (p.z - ob.z) / 50});
  const f = {x: p.fx, y: p.fy, z: p.fz};
  const a = Math.acos(clamp(dot(f, d), -1, 1));
  if(s.style === 'level'){
    const yawD = Math.atan2(d.x, -d.z), err = wrap(yawD - p.yaw);
    inp.sx = clamp(err * 2.4, -1, 1);
    inp.sy = clamp((Math.asin(clamp(d.y, -1, 1)) - p.pitch) * 3, -1, 1);
  } else {
    // full: point the nose with turn and pitch, and keep the wings level with the roll
    const u = {x: p.ux, y: p.uy, z: p.uz}, rt = cross(f, u);
    const lx = dot(d, rt), ly = dot(d, u), lz = dot(d, f);
    inp.sx = clamp(Math.atan2(lx, Math.max(0.1, lz)) * 2.5, -1, 1);
    inp.sy = clamp(Math.atan2(ly, Math.max(0.1, lz)) * 2.5, -1, 1);
    if(lz < 0) inp.sy = 1;
    inp.sr = clamp(Math.atan2(rt.y, u.y) * 1.5, -1, 1);
  }
  if(best && dot(f, d) < -0.4 && bd > 140 && !p.man && s.rand() < skill * 0.03) inp.uturn = true;
  if(p.behind > 0.5 && !p.man && s.rand() < skill * 0.02) inp.loop = true;
  inp.boost = bd > 520;
  const big = best && (best.type === 'pod' || best.type === 'brute' || best.type === 'raider');
  trigger(s, inp, best && a < 0.06 + (1 - skill) * 0.04 && bd < 450, big && a < 0.3 && bd < 600 && s.rand() < 0.02 * skill);
  if(best && (best.type === 'pod' || best.type === 'brute') && a < 0.05 && bd < 250 && p.bombs > 0 && s.rand() < 0.01) inp.bomb = true;
  return inp;
}
