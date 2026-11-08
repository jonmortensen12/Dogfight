/* Dogfight - everything that happens. Pure: no drawing, no DOM, no clock.

   step(sim, dt, input) moves the world on by dt seconds. The page calls it
   every frame; simcheck.mjs calls it from Node with a computer pilot
   (autopilot, below) to find out whether each level is fair.

   A level (levels.js) is flown in two ways, one ship:
   - RAIL: the camera's frame runs along the level by itself; the stick
     moves the ship about inside a box in that frame. The ship points where
     it is moving, and shots go where it points.
   - FREE (the clearing): the ship flies itself, in one of two styles:
       'level' - the horizon stays level; the turn swings the nose round
       'full'  - real aircraft: turn, pitch and roll about the ship's axes
   Most levels end in a clearing: waves, then a boss. Scratchpost's boss is
   met on the rail, which stops for the fight.

   Bosses (BOSS, below) are a body and parts. The parts (engine pods, deck
   guns, lightning rods, locks, vents, petals, shield panels, paws) are
   ordinary enemies placed round the body each step; while any part is
   left, the body is shielded.

   Wingmates (allies) fly with you: in formation on the rail, dogfighting in
   the clearing. One in a wave will call for help with a cat on their tail;
   save them and they'll return the favour. Shot down, they go home for a
   nap and sit out the next level.

   Units are metres and seconds; y is up; every level runs along -z.

   Input: {sx, sy, sr} the stick in -1..1 (turn right, nose up, roll
   right), fire, boost, brake (held), and the one-shot presses bomb, loop,
   uturn, roll (a barrel roll: -1 left, +1 right). */
import {rng, height, normalAt, hitObstacle, railFrame, halfW, OBSTACLES, archUnder, setLevel, railPoint, lateralAt, spireTop, setBranch, BRANCH,
  RAIL_END, ARENA, ARENA_LIMIT, CEILING, FLOOR, RAIL_TOP, RAIL_FLOOR, WALL_MARGIN, GROUND} from './terrain.js';
import {LEVELS} from './levels.js';
import {CAST, ACES, lineFor} from './cast.js';
export {railPoint};

export const SKILLS = {
  pup:  {name: 'Pup',      fire: 1.8, dmg: 0.6, spread: 0.07, assist: 0.11, hp: 0.8, ai: 0.8},
  good: {name: 'Good Boy', fire: 1.0, dmg: 1.0, spread: 0.035, assist: 0.075, hp: 1.0, ai: 1.0},
  top:  {name: 'Top Dog',  fire: 0.65, dmg: 1.45, spread: 0.014, assist: 0.04, hp: 1.4, ai: 1.15},
};

export const SPEED = {rail: 60, railBoost: 100, railBrake: 32, free: 62, freeBoost: 108, freeBrake: 34};
/* How hard the ship answers the stick (raised 2026-11-08: "more responsive,
   tighter turns"). Rail: the fastest slide across and up the box (m/s) and
   how quickly it gets there. Free: turn rates in rad/s. Banking into a turn
   (the wheel or a bank button) adds bankBoost: the classic tight turn. */
export const HANDLING = {railX: 60, railY: 46, railAccel: 9, levelTurn: 2.1, levelPitch: 1.7, fullPitch: 2.1, fullTurn: 1.8, fullRoll: 3.4, bankBoost: 0.6};
const PICKUP_R = 11;
/* A wingmate's shot does half what Teddy's does: they help, he wins. */
const ALLY_DMG = 0.5;
// lasers fly about four times the ship's rail speed (Star Fox 64's fly 3.3x
// its Arwing's): fast, but you can watch them go
const SHOT_SPEED = 300, BOLT_SPEED = 125;
const SHIP_R = 2.2;
/* The charged shot: starts charging after holding FIRE this long, full after
   this much more; locks within this cone (radians); its hit and burst. */
export const CHARGE = {start: 0.22, time: 0.75, cone: 0.21, dmg: 7, blast: 42};
/* The combo: anything a charged burst destroys goes off too (CHAIN.blast m,
   CHAIN.dmg), so a pack of fighters goes up together, and every kill past
   the first in one chain is a bonus hit, as in the old rail shooters. */
export const CHAIN = {blast: 24, dmg: 6};

/* What every kind of enemy starts with. */
const KINDS = {
  dart: {hp: 2, r: 4.6, speed: 66},
  raider: {hp: 5, r: 5, speed: 78},
  ace: {hp: 14, r: 4.8, speed: 84},
  turret: {hp: 3, r: 5, speed: 0},
  torpedo: {hp: 1, r: 3.6, speed: 42},
  planet: {hp: 2, r: 8, speed: 46},
  cage: {hp: 2, r: 5, speed: 0},
  part: {hp: 8, r: 6, speed: 0},
  mittensShip: {hp: 18, r: 5, speed: 86},
  boss: {hp: 30, r: 14, speed: 0},
  mine: {hp: 1, r: 4.2, speed: 0},
  buoy: {hp: 1, r: 5.5, speed: 0},
};

/* The bosses. Part offsets are [right, up, forward] from the body, in the
   body's frame (forward is where it faces). */
export const BOSS = {
  brute: {hp: 30, r: 13, move: 'orbit', orbitR: 260, alt: 150, speed: 30,
    parts: [{off: [21, -1.5, -3], hp: 11, r: 7, kind: 'pod'}, {off: [-21, -1.5, -3], hp: 11, r: 7, kind: 'pod'}],
    fan: 3.0, torp: [8.5, 6.5]},
  carrier: {hp: 32, r: 18, move: 'orbit', orbitR: 230, alt: 10, speed: 16,
    // the guns face aft: it is chased, so they are the end you can reach
    parts: [[12, 9, -38], [-12, 9, -38], [13, 16, -20], [-13, 16, -20]].map(off => ({off, hp: 7, r: 5, kind: 'gun'})),
    launch: 9, gunFire: 2.2},
  tower: {hp: 30, r: 14, move: 'fixed', alt: 150,
    parts: [[24, 12, 0], [-12, 12, 21], [-12, 12, -21]].map(off => ({off, hp: 9, r: 6, kind: 'rod'})),
    strike: 2.8, fan: 4.4, fanN: 4},
  warden: {hp: 32, r: 16, move: 'fixed', alt: 40, spin: 0.45, spinAxis: 'up',
    parts: [0, 1, 2, 3].map(i => ({off: [Math.cos(i * Math.PI / 2) * 38, 0, Math.sin(i * Math.PI / 2) * 38], hp: 8, r: 6, kind: 'lock'})),
    fan: 3.2, launch: 11},
  snowball: {hp: 32, r: 22, move: 'roll', alt: 22, speed: 26,
    parts: [[20, 12, 16], [-20, 12, 16], [20, -8, 16], [-20, -8, 16]].map(off => ({off, hp: 9, r: 6, kind: 'vent'})),
    fan: 2.7, fanN: 7},
  queen: {hp: 30, r: 12, move: 'hover', alt: 70, spin: 0.25, spinAxis: 'fwd',
    parts: [0, 1, 2, 3, 4].map(i => ({off: [Math.cos(i * 1.2566) * 26, Math.sin(i * 1.2566) * 26, 2], hp: 8, r: 7, kind: 'petal'})),
    nip: 4.2, fan: 3.6},
  core: {hp: 30, r: 14, move: 'fixed', spin: 0.45, spinAxis: 'fwd',
    parts: [0, 1, 2, 3].map(i => ({off: [Math.cos(i * Math.PI / 2) * 24, Math.sin(i * Math.PI / 2) * 24, 4], hp: 8, r: 7, kind: 'panel'})),
    fan: 2.8},
  mittens: {hp: 24, r: 30, move: 'hover', alt: 60,
    parts: [{off: [62, -22, 18], hp: 14, r: 14, kind: 'paw'}, {off: [-62, -22, 18], hp: 14, r: 14, kind: 'paw'}],
    bat: 5.2, fan: 3.8},
};

const len = (x, y, z) => Math.hypot(x, y, z);
/* ---------- small vector help ---------- */
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
/* Closest approach of segment a->b to point c, squared. */
function segDist2(ax, ay, az, bx, by, bz, cx_, cy, cz){
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l2 = dx * dx + dy * dy + dz * dz || 1;
  const t = clamp(((cx_ - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / l2, 0, 1);
  const px = ax + dx * t - cx_, py = ay + dy * t - cy, pz = az + dz * t - cz;
  return px * px + py * py + pz * pz;
}


/* ---------- a new game ----------
   opts: level (an id in levels.js), skill, style, pace, seed,
   start ('arena' to begin at the clearing), allies (wingmate ids flying). */
export function newSim(opts){
  opts = opts || {};
  const id = LEVELS[opts.level] ? opts.level : 'canyon';
  const L = setLevel(LEVELS[id]);
  const sk = SKILLS[opts.skill] ? opts.skill : 'good';
  const pace = clamp(+opts.pace || 1, 0.5, 2.5);
  const s = {
    level: id, L, t: 0, skill: sk, K: SKILLS[sk], style: opts.style === 'full' ? 'full' : 'level', pace,
    steer: opts.steer === 'slide' ? 'slide' : 'point',
    rand: rng(opts.seed || 7), nextId: 1,
    phase: 'rail', mode: 'rail', wave: 0, waveT: 0, clearT: 0, done: false, failed: false, failWhy: '',
    p: null, enemies: [], shots: [], bolts: [], missiles: [], bombs: [], pickups: [], events: [], hazards: [], allies: [],
    script: [], stats: {kills: 0, shots: 0, hits: 0, gold: 0, goldTotal: 0, damage: 0, time: 0, bombs: 0, charged: 0, rescued: 0, saved: 0},
    boss: null, bossKind: null, warn: '', arena: ARENA, checkpoint: opts.start === 'arena' ? 'arena' : 'rail',
    timer: null, storm: false, stormT: 3, railHold: false, downed: [], joined: [],
    branch: 0, forkDecided: false, hard: !!opts.hard,
    secret: L.secret ? {type: L.secret.type, need: L.secret.need || 1, got: 0, done: false} : null,
  };
  setBranch(0);
  s.cpU = checkpointU(L);
  const mid = opts.start === 'mid' && s.cpU && opts.carry;
  const u0 = opts.start === 'arena' ? (L.railBossU || RAIL_END) - 160 : mid ? s.cpU : 0;
  s.p = {
    x: 0, y: 30, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, vx: 0, vy: 0, vz: 0,
    speed: SPEED.rail * pace, shield: 100, maxShield: 100, boost: 1, bombs: 3, twin: false,
    rail: {u: u0, ox: 0, oy: GROUND === 'space' ? 10 : 30, vx: 0, vy: 0, side: 0},
    yaw: 0, pitch: 0, bank: 0, rollT: 0, rollDir: 0, spin: 0, man: null, charge: 0, holdT: 0, fireHeld: false,
    hitT: 0, fireT: 0, lock: null, dead: false, deadT: 0, behind: 0, confused: 0,
  };
  placeRail(s, 0);
  if(L.start === 'arena'){
    // an all-range level: straight into the clearing, flying in from its edge
    const p = s.p;
    p.x = ARENA.x; p.z = ARENA.z + ARENA_LIMIT * 0.72; p.y = GROUND === 'space' ? (ARENA.y || 0) + 30 : height(ARENA.x, p.z) + 120;
    p.fx = 0; p.fy = 0; p.fz = -1;
  }
  for(const w of opts.allies || []) addAlly(s, w, true);
  if(L.start === 'arena'){ s.script = []; startArena(s); }
  else {
    buildScript(s, u0);
    if(opts.start === 'arena') say(s, 'rosie', 'Starting you near the end of the rail, {teddy}.', 2.5);
    if(mid){
      // back at the checkpoint, with what you had when you passed it
      const c = opts.carry;
      s.stats.kills = c.kills; s.stats.combo = c.combo; s.stats.gold = c.gold; s.stats.goldTotal = c.goldTotal;
      if(s.secret) s.secret.got = c.secretGot;
      s.cpPassed = c;
      say(s, 'rosie', 'Back at the checkpoint. Shake it off, {teddy}!', 2.2);
    }
  }
  return s;
}
/* The checkpoint (Star Fox 64 has one halfway down each rail: pass it and a
   crash sends you back there, not to the start). Halfway along the rail,
   kept clear of a fork and of a boss the rail runs into; none on a level
   that starts in the clearing. L.checkpoint overrides it. */
export function checkpointU(L){
  if(L.start === 'arena') return 0;
  if(L.checkpoint != null) return L.checkpoint;
  const end = Math.min(L.railChase ? L.railChase.u : 1e9, L.railBossU || 1e9, L.railEnd || 1e9);
  let u = Math.round(end * 0.5 / 50) * 50;
  if(L.fork && u > L.fork.u0 - 250 && u < L.fork.u1 + 150) u = L.fork.u0 - 250;
  return u > 600 && u < end - 400 ? u : 0;
}

function ev(s, k, o){ o = o || {}; o.k = k; s.events.push(o); return o; }
function say(s, who, text, dur){ ev(s, 'say', {who, text: lineFor(text), dur: dur || Math.max(2.2, Math.min(4.5, text.length / 22))}); }
/* A wingmate's line, if they are flying. */
function sayAlly(s, who, key){
  const a = s.allies.find(a => a.id === who);
  if(!a || a.gone) return;
  const ln = CAST[who] && CAST[who].lines && CAST[who].lines[key];
  if(ln) say(s, who, ln);
}

/* ---------- the level's script: things that happen as the rail passes u ---------- */
function buildScript(s, u0){
  const S = [];
  const A = {
    at: (u, fn, branch) => { if(u >= u0) S.push({u, fn, branch}); },
    say: (who, text, dur) => { if(who.startsWith('wing') && !s.allies.some(a => a.id === who && !a.gone) && !s.L.joins?.includes(who)) return; say(s, who, text, dur); },
    formation: (n, u, o) => formation(s, n, u, o),
    swoop: n => swoop(s, n),
    cross: (u, side, y) => crossing(s, u, side, y),
    turret: (u, side) => turret(s, u, side),
    turretOn: u => turretOn(s, u),
    pickup: (type, u, ox, y) => pickup(s, type, u, ox, y),
    storm: on => { s.storm = on; },
    cloud: (u, ox, y) => { const q = railPoint(u, ox, y); s.hazards.push({kind: 'nip', x: q.x, y, z: q.z, r: 13, life: 999, vx: 0, vy: 0, vz: 0}); },
    join: who => addAlly(s, who),
    aces: (n, u) => railAces(s, n, u),
    mines: (u, n) => mines(s, u, n),
    buoy: (u, ox) => { const q = railPoint(u, ox, 6); newEnemy(s, 'buoy', {x: q.x, y: 6, z: q.z, ru: u, rail: true, secret: true, fireT: 999}); },
  };
  s.L.script && s.L.script(A);
  S.sort((a, b) => a.u - b.u);
  s.script = S;
  // the golden bones still ahead: count them by placing them on a scratch copy
  const real = s.pickups;
  s.pickups = [];
  const quiet = {say: A.say, formation: A.formation, swoop: A.swoop, cross: A.cross, turret: A.turret, turretOn: A.turretOn, cloud: A.cloud, join: A.join, aces: A.aces, storm: A.storm, mines: A.mines, buoy: A.buoy};
  for(const k of Object.keys(quiet)) A[k] = () => {};
  const goldOn = br => { s.pickups = []; for(const S1 of S) if(!S1.branch || S1.branch === br) S1.fn(); return s.pickups.filter(k => k.type === 'gold').length; };
  s.goldAlt = goldOn('alt');
  s.stats.goldTotal = goldOn('main');
  Object.assign(A, quiet);
  s.pickups = real;
}

function newEnemy(s, type, o){
  const K = s.K;
  const e = Object.assign({id: s.nextId++, type, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, vx: 0, vy: 0, vz: 0,
    t: 0, fireT: 1 + s.rand() * 1.5, burst: 0, state: '', ph: s.rand() * 6.28, flash: 0, bank: 0}, KINDS[type] || {}, o || {});
  if(!(o && o.fixedHp)) e.hp = Math.ceil(e.hp * (type === 'torpedo' || type === 'cage' || type === 'planet' ? 1 : K.hp));
  e.maxHp = e.hp;
  s.enemies.push(e);
  return e;
}

/* Rail enemies keep their own place in the rail's frame (ru, rox, roy). */
function formation(s, n, u, o){
  const base = GROUND === 'space' ? 0 : 24;
  const slots = [[0, 6], [-14, 14], [14, 14], [-28, 22], [28, 22]];
  const group = squad(s, n);
  for(let i = 0; i < n; i++){
    newEnemy(s, 'dart', {state: 'oncoming', ru: u + i * 18, rox: slots[i][0] * (n > 3 ? 1 : 1.3), roy: base + slots[i][1], rail: true, group});
  }
}
/* A squad: shoot down every one of them yourself and the last one drops a
   present (Star Fox 64's group drops: a whole formation is worth an item). */
function squad(s, n){
  if(n < 3) return 0;
  const id = s.nextId++;
  (s.squads || (s.squads = {}))[id] = {n, got: 0};
  return id;
}
function drop(s, type, e){
  // on the rail it lands a little ahead, where you'll be
  let x = e.x, y = e.y, z = e.z, u = -z;
  if(s.mode === 'rail'){
    const q = railPoint(Math.max(e.ru || 0, s.p.rail.u + 70), clamp(e.rox != null ? e.rox : s.p.rail.ox, -halfW(s.p.rail.u) + WALL_MARGIN, halfW(s.p.rail.u) - WALL_MARGIN), 0);
    u = Math.max(e.ru || 0, s.p.rail.u + 70); x = q.x; z = q.z; y = clamp(e.y, RAIL_FLOOR + 6, RAIL_TOP - 6);
  }
  s.pickups.push({id: s.nextId++, type, x, y, z, u, taken: false, t: 0, dropped: true});
  ev(s, 'drop', {type, x, y, z});
}
/* What a squad or a milestone gives: what you need most. */
function present(s){
  const p = s.p;
  if(p.shield < p.maxShield * 0.6) return 'bone';
  if(!p.twin) return 'ball';
  return p.bombs < 3 ? 'bomb' : 'bone';
}
function swoop(s, n, type){
  const base = GROUND === 'space' ? -10 : 22;
  const group = squad(s, n);
  for(let i = 0; i < n; i++){
    const side = i % 2 ? 1 : -1;
    newEnemy(s, type || 'dart', {state: 'swoopIn', rel: -70 - i * 14, rox: side * (8 + i * 7), roy: base + 48, holdY: base + i * 7, holdX: side * (6 + i * 9), rail: true, t: -i * 0.3, group});
  }
}
/* Alley Cats on the rail: they swoop in like the others, stay longer, and talk. */
function railAces(s, n, u){
  const base = GROUND === 'space' ? -10 : 24;
  for(let i = 0; i < n; i++){
    const side = i % 2 ? 1 : -1;
    const who = ACES[(s.aceNext = ((s.aceNext || 0) % 4) + 1) - 1];
    newEnemy(s, 'ace', {state: 'swoopIn', rel: -80 - i * 16, rox: side * 12, roy: base + 50, holdY: base + 4 + i * 8, holdX: side * (10 + i * 8), rail: true, t: -i * 0.4, who, holdFor: 12, hp: 6});
  }
}
/* A field of floating mines across the rail at u: shoot them or go round. */
function mines(s, u, n){
  const base = GROUND === 'space' ? 0 : 26;
  for(let i = 0; i < n; i++){
    const lim = halfW(u) - WALL_MARGIN;
    const q = railPoint(u + (s.rand() - 0.5) * 60, (s.rand() * 2 - 1) * lim, base + (s.rand() - 0.5) * 50);
    newEnemy(s, 'mine', {x: q.x, y: q.y, z: q.z, ru: u, rail: true, fireT: 999});
  }
}
function crossing(s, u, side, y){
  const base = GROUND === 'space' ? 0 : 0;
  newEnemy(s, 'raider', {state: 'cross', ru: u, rox: side * (halfW(u) + 30), roy: base + y, dir: -side, rail: true});
}
function turret(s, u, side){
  const ox = side * (halfW(u) - 8);
  const p = railPoint(u, ox, 0);
  const y = GROUND === 'space' ? 0 : height(p.x, p.z);
  newEnemy(s, 'turret', {x: p.x, y: y + 4, z: p.z, ru: u, rail: true, ground: y});
}
/* A turret on top of the rock nearest u (Tidewater's sea stacks). */
function turretOn(s, u){
  let best = null, bd = 150;
  for(const o of OBSTACLES) if(o.type === 'spire' && Math.abs(o.u - u) < bd){ bd = Math.abs(o.u - u); best = o; }
  if(!best) return turret(s, u, s.rand() < 0.5 ? -1 : 1);
  newEnemy(s, 'turret', {x: best.x, y: spireTop(best) + 4, z: best.z, ru: best.u, rail: true, ground: spireTop(best)});
}
function pickup(s, type, u, ox, y){
  const p = railPoint(u, ox, y);
  s.pickups.push({id: s.nextId++, type, x: p.x, y, z: p.z, u, taken: false, t: 0});
}

/* ---------- wingmates ---------- */
const SLOTS = {wing1: [-20, 2, 8], wing2: [20, 5, 12], wing3: [-34, 10, 2]};
function addAlly(s, who, quiet){
  if(s.allies.some(a => a.id === who)) return;
  const p = s.p, sl = SLOTS[who] || [0, 0, -20];
  // they fly in from behind, out to the side and above the camera (which
  // sits 38 m back) rather than through it
  const rx = -p.fz, rz = p.fx, side = sl[0] >= 0 ? 1 : -1;
  const a = {id: who, x: p.x - p.fx * 60 + rx * side * 30, y: p.y + 24, z: p.z - p.fz * 60 + rz * side * 30, fx: p.fx, fy: p.fy, fz: p.fz, bank: 0,
    vx: 0, vy: 0, vz: 0, hp: 100, slot: sl, fireT: 1, t: 0, gone: false, goneT: 0, chased: null, ffT: 0, giftT: 0, target: null};
  s.allies.push(a);
  if(!quiet){ s.joined.push(who); ev(s, 'join', {who}); sayAlly(s, who, 'hello'); }
}

/* ---------- the clearing ---------- */
function startArena(s){
  s.phase = 'arena'; s.mode = 'free'; s.wave = 0; s.waveT = 1.5;
  const p = s.p;
  p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1)); p.bank = 0;
  p.speed = SPEED.free * s.pace;
  s.storm = false;
  s.enemies = s.enemies.filter(e => !e.rail);
  s.pickups = s.pickups.filter(k => !k.taken && k.u > RAIL_END - 50);
  s.hazards = s.hazards.filter(h => h.kind !== 'nip' || h.life < 900);
  if(s.L.timer){ s.timer = s.L.timer; }
  // an all-range level's pickups float round the clearing
  for(const [type, a, r, alt] of s.L.arenaPickups || []){
    const x = ARENA.x + Math.cos(a) * r, z = ARENA.z + Math.sin(a) * r;
    s.pickups.push({id: s.nextId++, type, x, y: GROUND === 'space' ? (ARENA.y || 0) + alt : height(x, z) + 40 + alt, z, u: -z, taken: false, t: 0});
    if(type === 'gold') s.stats.goldTotal++;
  }
  ev(s, 'free');
}
/* A boss you chase: it runs ahead down the rail and you fly after it,
   shooting. If the rail runs out first, it gets away. */
function startChase(s){
  s.phase = 'chase';
  spawnBoss(s);
}
/* The fork: where the rail splits, whichever channel Teddy is in when the
   two pull apart is the one the rail follows. The ship's place on the
   screen does not jump: its offset is re-measured from the new line. */
function fork(s){
  const F = s.L.fork, p = s.p, r = p.rail;
  if(!F || p.dead) return;
  if(!s.forkDecided && r.u >= F.u0 + 110){
    s.forkDecided = true;
    if(r.ox * F.side > (halfW(r.u) - WALL_MARGIN) * 0.35){
      setBranch(1); s.branch = 1;
      r.ox = lateralAt(r.u, p.x, p.z);
      ev(s, 'fork', {branch: 1});
      if(s.goldAlt != null) s.stats.goldTotal = s.goldAlt;
      if(F.say) say(s, F.say[0], F.say[1]);
      if(s.secret && s.secret.type === 'fork') secretStep(s, 1);
    }
  }
  if(s.branch === 1 && r.u >= F.u1){
    setBranch(0); s.branch = 0;
    r.ox = lateralAt(r.u, p.x, p.z);
  }
}
/* A step towards the level's secret (all the buoys, all the rings, the fork...). */
function secretStep(s, n){
  const S = s.secret;
  if(!S || S.done) return;
  S.got = Math.min(S.need, S.got + n);
  ev(s, 'secretStep', {got: S.got, need: S.need});
  if(S.got >= S.need){
    S.done = true;
    ev(s, 'secret');
    const F = s.L.secret.found;
    if(F) say(s, F[0], F[1], 3.6);
  }
}
function startRailBoss(s){
  s.phase = 'railboss'; s.railHold = true; s.wave = 1;
  s.enemies = s.enemies.filter(e => !e.rail || e.type === 'turret');
  spawnBoss(s);
}
/* Where something in the clearing appears: an angle from the way Teddy is
   facing, a distance, a height, kept inside the clearing. */
function around(s, ang, dist, alt){
  const p = s.p, f = norm({x: p.fx, y: 0, z: p.fz});
  const c = Math.cos(ang), sn = Math.sin(ang);
  const dx = f.x * c - f.z * sn, dz = f.z * c + f.x * sn;
  const x = p.x + dx * dist, z = p.z + dz * dist;
  const ax = x - ARENA.x, az = z - ARENA.z, r = Math.hypot(ax, az), k = r > 600 ? 600 / r : 1;
  const X = ARENA.x + ax * k, Z = ARENA.z + az * k;
  const g = height(X, Z);
  return {x: X, y: GROUND === 'space' ? (ARENA.y || 0) + alt - 100 : Math.max(g + 40, alt), z: Z};
}
function flyIn(s, type, pos, o){
  const p = s.p;
  const e = newEnemy(s, type, Object.assign({x: pos.x, y: pos.y, z: pos.z, state: type === 'raider' ? 'setup' : 'attack', wave: s.wave}, o || {}));
  const d = norm({x: p.x - e.x, y: 0, z: p.z - e.z});
  e.fx = d.x; e.fz = d.z; e.fy = 0;
  e.fireT = 2 + s.rand() * 2;
  // some of them go for the wingmates
  const live = s.allies.filter(a => !a.gone);
  if((type === 'dart' || type === 'ace') && live.length && s.rand() < 0.3) e.tgt = live[Math.floor(s.rand() * live.length)].id;
  return e;
}
function nextWave(s){
  s.wave++;
  const W = (s.L.waves || []).concat(s.hard && s.L.hardWaves ? s.L.hardWaves : []);
  if(s.wave > W.length){ spawnBoss(s); return; }
  const w = W[s.wave - 1];
  if(w.say) say(s, w.say[0], w.say[1]);
  for(const g of w.spawn || []){
    const n = g.n || 1, ang = g.ang || 0, spread = g.spread || 0.35;
    for(let i = 0; i < n; i++) flyIn(s, g.type, around(s, ang + (i - (n - 1) / 2) * spread, (g.dist || 650) + i * 25, 70 + (i * 37 % 110)), g.type === 'ace' ? {who: ACES[i % 4]} : g.type === 'mine' ? {fireT: 999, state: 'float'} : undefined);
  }
  if(w.cages){
    // cages hang off the prison station's modules
    const mods = OBSTACLES.filter(o => o.look === 'module');
    for(let i = 0; i < w.cages; i++){
      const m = mods[(i * 3 + s.wave * 5) % Math.max(1, mods.length)] || {x: ARENA.x, y: 0, z: ARENA.z};
      const out = norm({x: m.x - ARENA.x, y: 0, z: m.z - ARENA.z});
      const c = newEnemy(s, 'cage', {x: m.x + out.x * 60, y: (m.y || 0) + (i % 2 ? 25 : -25), z: m.z + out.z * 60, wave: s.wave, fireT: 999});
      if(w.rescue && i === 0) c.rescue = w.rescue;
    }
  }
  if(w.help) callForHelp(s, w.help);
}
/* A wingmate with a cat on their tail. */
function callForHelp(s, who){
  const a = s.allies.find(a => a.id === who && !a.gone);
  if(!a) return;
  const b = newEnemy(s, 'dart', {x: a.x - a.fx * 120, y: a.y + 10, z: a.z - a.fz * 120, state: 'attack', wave: s.wave, hunt: who, hp: 4, fixedHp: true});
  b.fx = a.fx; b.fy = a.fy; b.fz = a.fz;
  a.chased = b.id; a.chasedT = 0;
  sayAlly(s, who, 'help');
  ev(s, 'help', {who});
}

/* ---------- bosses ---------- */
function spawnBoss(s){
  const L = s.L, B = L.boss, p = s.p;
  s.bossKind = B.type; s.waveT = -1;
  // any pups still caged are carried off
  const caged = s.enemies.filter(e => e.type === 'cage');
  if(caged.length){ s.enemies = s.enemies.filter(e => e.type !== 'cage'); ev(s, 'carried', {n: caged.length}); say(s, 'rosie', "They're hauling the last cages away! Too late for those pups...", 3); }
  if(B.warn) say(s, B.warn[0], B.warn[1]);
  ev(s, 'bosswarn');
  if(B.type === 'aces'){
    ACES.forEach((who, i) => flyIn(s, 'ace', around(s, Math.PI + (i - 1.5) * 0.5, 550, 120 + i * 30), {who, boss: true, hp: 24}));
    s.boss = {aces: true, name: B.name};
    return;
  }
  if(B.type === 'engines'){
    // four engines on the Moon's surface: no body, just parts, and the clock
    const moon = OBSTACLES.find(o => o.look === 'moon');
    s.boss = {engines: true, name: B.name};
    for(let i = 0; i < 4; i++){
      const a = i * Math.PI / 2 + 0.4, pol = 0.42;
      const n = {x: Math.sin(pol) * Math.cos(a), y: Math.cos(pol), z: Math.sin(pol) * Math.sin(a)};
      newEnemy(s, 'part', {kind: 'engine', x: moon.x + n.x * (moon.r + 20), y: moon.y + n.y * (moon.r + 20), z: moon.z + n.z * (moon.r + 20),
        fx: n.x, fy: n.y, fz: n.z, hp: 14, r: 10, wave: s.wave, standalone: true, fireT: 2 + i});
    }
  } else {
    const D = BOSS[B.type];
    let pos;
    if(B.type === 'core'){
      const q = railPoint(L.railBossU + 230, 0, 34);
      pos = q;
    } else if(s.phase === 'chase' || D.move === 'roll'){
      pos = railPoint(p.rail.u + 320, 0, D.alt);
    } else if(D.move === 'orbit'){
      const a = Math.atan2(p.z - ARENA.z, p.x - ARENA.x) + Math.PI;
      pos = {x: ARENA.x + Math.cos(a) * (D.orbitR + 200), y: D.alt + (GROUND === 'space' ? ARENA.y || 0 : 0), z: ARENA.z + Math.sin(a) * (D.orbitR + 200)};
    } else {
      pos = {x: ARENA.x, y: D.alt + (GROUND === 'space' ? (ARENA.y || 0) : 0), z: ARENA.z};
    }
    const b = newEnemy(s, 'boss', {kind: B.type, x: pos.x, y: pos.y, z: pos.z, hp: D.hp, r: D.r, speed: D.speed || 0, state: 'boss', wave: s.wave,
      shielded: true, orbitA: Math.atan2(pos.z - ARENA.z, pos.x - ARENA.x), spinA: 0, fireT: 3, t2: 4, t3: 5});
    if(B.type === 'core' || D.move === 'roll'){ const f = railFrame(p.rail.u); b.fx = -f.tx; b.fz = -f.tz; b.fy = 0; b.ru = p.rail.u + 320; }
    else if(s.phase === 'chase'){ const f = railFrame(p.rail.u); b.fx = f.tx; b.fz = f.tz; b.fy = 0; b.chase = true; b.ru = p.rail.u + 320; }
    else { const d = norm({x: p.x - b.x, y: 0, z: p.z - b.z}); b.fx = d.x; b.fz = d.z; }
    s.boss = b;
    D.parts.forEach((pt, i) => newEnemy(s, 'part', {kind: pt.kind, parent: b.id, off: pt.off, hp: pt.hp, r: pt.r, wave: s.wave, fireT: 2 + i * 0.7, idx: i}));
    placeParts(s, b, 0);
  }
  for(let i = 0; i < (B.escort || 0); i++) flyIn(s, 'dart', around(s, Math.PI + (i ? 0.6 : -0.6), 480, 140), {wave: s.wave});
  for(let i = 0; i < (B.aces || 0); i++) flyIn(s, 'ace', around(s, Math.PI * 0.5 * (i ? 1 : -1), 520, 160), {who: ACES[i], wave: s.wave});
}
/* The body's frame: forward, up, right. */
function bossFrame(b){
  const f = norm({x: b.fx, y: 0, z: b.fz});
  const up = {x: 0, y: 1, z: 0};
  const r = cross(f, up);
  return {f, up, r};
}
export function placeParts(s, b, dt){
  const D = BOSS[b.kind];
  if(!D) return;
  const F = bossFrame(b);
  const ca = Math.cos(b.spinA || 0), sa = Math.sin(b.spinA || 0);
  for(const q of s.enemies){
    if(q.parent !== b.id) continue;
    let [R, U, W] = q.off;
    if(D.spinAxis === 'up'){ const r2 = R * ca - W * sa, w2 = R * sa + W * ca; R = r2; W = w2; }
    else if(D.spinAxis === 'fwd'){ const r2 = R * ca - U * sa, u2 = R * sa + U * ca; R = r2; U = u2; }
    let x = b.x + F.r.x * R + F.up.x * U + F.f.x * W, y = b.y + F.r.y * R + F.up.y * U + F.f.y * W, z = b.z + F.r.z * R + F.up.z * U + F.f.z * W;
    // Mittens' paws reach out and swat
    if(q.kind === 'paw' && q.ext){
      const p = s.p, d = norm({x: p.x - x, y: p.y - y, z: p.z - z});
      x += d.x * 70 * q.ext; y += d.y * 70 * q.ext; z += d.z * 70 * q.ext;
    }
    if(dt > 0){ q.vx = (x - q.x) / dt; q.vy = (y - q.y) / dt; q.vz = (z - q.z) / dt; }
    q.x = x; q.y = y; q.z = z;
    q.fx = F.f.x; q.fy = 0; q.fz = F.f.z;
  }
}
function bossAI(s, b, dt){
  const D = BOSS[b.kind], p = s.p, K = s.K;
  // moving
  if(D.move === 'orbit' && !b.chase){
    b.orbitA += dt * (D.speed || 20) / D.orbitR * 0.6;
    const tx = ARENA.x + Math.cos(b.orbitA) * D.orbitR, tz = ARENA.z + Math.sin(b.orbitA) * D.orbitR;
    const ty = D.alt + (GROUND === 'space' ? ARENA.y || 0 : 0) + (b.kind === 'carrier' ? 0 : Math.sin(b.t * 0.4) * 15);
    const d = norm({x: tx - b.x, y: (ty - b.y) * 0.3, z: tz - b.z});
    moveFwd(b, d, 0.3, (D.speed || 20) * s.pace, dt);
    if(b.kind === 'carrier') b.y = ty;
    b.bank *= 0.5;
  } else if(b.chase){
    // running away down the rail, weaving, a few hundred metres ahead
    b.ru = p.rail.u + 260 + Math.sin(b.t * 0.3) * 40;
    const q = railPoint(b.ru, Math.sin(b.t * 0.23) * 22, D.alt);
    b.x = q.x; b.y = q.y; b.z = q.z;
    const g = railFrame(b.ru); b.fx = g.tx; b.fy = 0; b.fz = g.tz;
  } else if(D.move === 'roll'){
    // the Snowball: rolls down the canyon at Teddy, then back up it, swaying
    b.rollT = (b.rollT || 0) + dt;
    const cyc = (b.rollT % 9) / 9, k = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;   // 0 far .. 1 near
    const prevU = b.ru;
    b.ru = p.rail.u + 320 - 300 * k * k * (3 - 2 * k);
    const lim = halfW(b.ru) - D.r;
    const q = railPoint(b.ru, Math.sin(b.t * 0.5) * Math.max(0, lim) * 0.8, D.alt);
    b.x = q.x; b.y = q.y; b.z = q.z;
    b.roll = (b.roll || 0) + (b.ru - prevU) / D.r;
    const f = railFrame(b.ru); b.fx = -f.tx; b.fy = 0; b.fz = -f.tz;
    // run Teddy over if he is in the way
    if(distP(s, b) < D.r + 3 && p.hitT <= 0){ damage(s, 15, 'snowball'); p.hitT = 0.9; ev(s, 'swat', {x: p.x, y: p.y, z: p.z}); p.rail.vy = 30; }
  } else {
    // fixed or hovering: turn to face Teddy, slowly
    const d = norm({x: p.x - b.x, y: 0, z: p.z - b.z});
    if(b.kind !== 'core'){ const f = {x: b.fx, y: 0, z: b.fz}; norm(f); turnToward(f, d, 0.35 * dt); b.fx = f.x; b.fy = 0; b.fz = f.z; }
    if(D.move === 'hover') b.y += Math.sin(b.t * 0.8) * 4 * dt;
  }
  b.spinA = (b.spinA || 0) + (D.spin || 0) * dt;
  placeParts(s, b, dt);
  const parts = s.enemies.filter(q => q.parent === b.id && q.hp > 0);
  if(b.kind === 'mittens' && parts.length === 0){
    // her face is open only while she opens her mouth to hiss
    b.mouthT = (b.mouthT || 0) + dt;
    const c = b.mouthT % 7, open = c > 3.5;
    b.mouth = open ? Math.min(1, (c - 3.5) * 4) * Math.min(1, (7 - c) * 4) : 0;
    if(open && b.shielded){
      b.shielded = false;
      ev(s, 'hiss', {x: b.x, y: b.y, z: b.z});
      const base = aimAt(s, b, BOLT_SPEED * s.pace), r = norm(cross(base, {x: 0, y: 1, z: 0}));
      for(let i = -4; i <= 4; i++) bolt(s, b, norm({x: base.x + r.x * i * 0.07, y: base.y, z: base.z + r.z * i * 0.07}), 7, {x: b.x + b.fx * 30, y: b.y - 6, z: b.z + b.fz * 30});
      if(!b.saidMouth){ b.saidMouth = true; say(s, 'wing3', 'Her mouth! Shoot when she opens it to hiss!', 2.6); }
    } else if(!open && !b.shielded) b.shielded = true;
  } else if(b.shielded && parts.length === 0){
    b.shielded = false;
    ev(s, 'shieldDown', {x: b.x, y: b.y, z: b.z});
    if(b.kind === 'mittens') say(s, 'mittens', 'My PAWS! You... you naughty, naughty dogs!');
    else say(s, 'rosie', 'Its shield is down - hit the core!', 2.6);
    sayAlly(s, 'wing3', 'gift');
  }
  const dist = distP(s, b);
  const from = b.kind === 'mittens' ? {x: b.x, y: b.y + 8, z: b.z} : b;
  // a fan of bolts
  b.fireT -= dt;
  if(D.fan && b.fireT <= 0 && dist < 560){
    b.fireT = D.fan * K.fire * (parts.length ? 1 : 0.8);
    const base = aimAt(s, b, BOLT_SPEED * s.pace);
    const r = norm(cross(base, {x: 0, y: 1, z: 0}));
    const n = D.fanN || 5;
    for(let i = 0; i < n; i++){ const k = i - (n - 1) / 2; bolt(s, b, norm({x: base.x + r.x * k * 0.06, y: base.y, z: base.z + r.z * k * 0.06}), 7, from); }
  }
  // the Brute's torpedoes
  if(D.torp){
    b.t2 -= dt;
    if(b.t2 <= 0){
      b.t2 = (parts.length ? D.torp[0] : D.torp[1]) * K.fire;
      for(const side of [-1, 1]){
        const r = norm(cross({x: b.fx, y: b.fy, z: b.fz}, {x: 0, y: 1, z: 0}));
        const t = newEnemy(s, 'torpedo', {x: b.x + r.x * side * 10, y: b.y - 4, z: b.z + r.z * side * 10, wave: 0});
        t.fx = r.x * side; t.fy = -0.2; t.fz = r.z * side;
      }
      ev(s, 'torpedo', {x: b.x, y: b.y, z: b.z});
    }
  }
  // launching fighters
  if(D.launch){
    b.t3 -= dt;
    if(b.t3 <= 0){
      b.t3 = D.launch * K.fire;
      if(s.enemies.filter(e => e.type === 'dart').length < 4){
        if(s.mode === 'rail') swoop(s, 2);
        else { const e = flyIn(s, 'dart', {x: b.x + b.fx * 30, y: b.y + 15, z: b.z + b.fz * 30}, {wave: 0}); e.fx = b.fx; e.fz = b.fz; }
        ev(s, 'launch', {x: b.x, y: b.y, z: b.z});
      }
    }
  }
  // lightning: a ring where Teddy will be, then the strike
  if(D.strike){
    b.t2 -= dt;
    if(b.t2 <= 0){ b.t2 = D.strike * K.fire; strikeAt(s, 1.2); }
  }
  // catnip clouds puffed towards Teddy
  if(D.nip){
    b.t3 -= dt;
    if(b.t3 <= 0 && dist < 600){
      b.t3 = D.nip * K.fire;
      for(let i = -1; i <= 1; i++){
        const d = aimAt(s, b, 40);
        s.hazards.push({kind: 'nip', x: b.x, y: b.y, z: b.z, r: 12, life: 9, vx: (d.x + i * 0.25 * d.z) * 38 * s.pace, vy: d.y * 38 * s.pace, vz: (d.z - i * 0.25 * d.x) * 38 * s.pace});
      }
      ev(s, 'puff', {x: b.x, y: b.y, z: b.z});
    }
  }
  // Mittens bats planets at you, and swats with her paws
  if(D.bat){
    b.t2 -= dt;
    if(b.t2 <= 0){
      b.t2 = D.bat * K.fire * (parts.length ? 1 : 0.75);
      const side = s.rand() < 0.5 ? -1 : 1, r = bossFrame(b).r;
      const pl = newEnemy(s, 'planet', {x: b.x + r.x * side * 50, y: b.y + 30, z: b.z + r.z * side * 50, wave: 0, hue: s.rand(), life: 10});
      const d = aimAt(s, pl, 46 * s.pace); pl.fx = d.x; pl.fy = d.y; pl.fz = d.z;
      ev(s, 'bat', {x: pl.x, y: pl.y, z: pl.z});
      if(s.rand() < 0.3) say(s, 'mittens', ['Fetch THIS.', 'Oops. Did I knock that off?', 'Boop.', 'Off the table it goes!'][Math.floor(s.rand() * 4)], 1.8);
    }
  }
}
function partAI(s, q, dt){
  const p = s.p, K = s.K;
  if(q.kind === 'gun' || q.kind === 'engine'){
    q.fireT -= dt;
    if(q.fireT <= 0 && distP(s, q) < 520){ q.fireT = (BOSS.carrier.gunFire + s.rand()) * K.fire; bolt(s, q, aimAt(s, q, BOLT_SPEED * s.pace), 6); }
  }
  if(q.kind === 'paw'){
    // wind up when Teddy comes close, then swat
    const d = distP(s, q);
    q.swipe = q.swipe || 0;
    if(q.swipe <= 0 && d < 150 && (q.cool || 0) <= 0){ q.swipe = 1.4; ev(s, 'windup', {x: q.x, y: q.y, z: q.z}); }
    q.cool = Math.max(0, (q.cool || 0) - dt);
    if(q.swipe > 0){
      q.swipe -= dt;
      q.ext = q.swipe > 0.7 ? 0 : Math.sin((0.7 - q.swipe) / 0.7 * Math.PI);
      if(q.ext > 0.5 && d < q.r + 6 && p.hitT <= 0){ damage(s, 15, 'paw'); p.hitT = 0.8; ev(s, 'swat', {x: p.x, y: p.y, z: p.z}); }
      if(q.swipe <= 0){ q.ext = 0; q.cool = 2.5; }
    }
  }
}

/* ---------- hazards: lightning and catnip ---------- */
function strikeAt(s, delay){
  const p = s.p;
  // where Teddy will be, more or less
  const t = delay;
  const x = p.x + p.vx * t + (s.rand() - 0.5) * 16, z = p.z + p.vz * t + (s.rand() - 0.5) * 16;
  s.hazards.push({kind: 'strike', x, y: p.y + p.vy * t, z, r: 11, t: delay, ground: height(x, z)});
  ev(s, 'strikeWarn', {x, y: p.y, z});
}
function hazards(s, dt){
  const p = s.p;
  if(s.storm && s.mode === 'rail' && !s.railHold){
    s.stormT -= dt;
    if(s.stormT <= 0){ s.stormT = (3.4 + s.rand() * 2) * s.K.fire; strikeAt(s, 1.4); }
  }
  for(const h of s.hazards){
    if(h.kind === 'strike'){
      h.t -= dt;
      if(h.t <= 0 && !h.done){
        h.done = true; h.life = 0.4;
        ev(s, 'lightning', {x: h.x, y: h.y, z: h.z, ground: h.ground});
        if(!p.dead && Math.hypot(p.x - h.x, p.z - h.z) < h.r && p.hitT <= 0){ damage(s, 8, 'lightning'); p.hitT = 0.6; }
        for(const a of s.allies) if(!a.gone && Math.hypot(a.x - h.x, a.z - h.z) < h.r) hurtAlly(s, a, 10);
      }
      if(h.done) h.life -= dt;
    } else if(h.kind === 'nip'){
      h.life -= dt;
      h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
      if(!p.dead && len(p.x - h.x, p.y - h.y, p.z - h.z) < h.r + SHIP_R){
        if(p.confused <= 0){ ev(s, 'nip'); say(s, 'teddy', ['Whoa... everything is... sparkly...', 'Left is right! Up is down! Help!', 'Hee hee. Catnip.'][Math.floor(s.rand() * 3)], 2); }
        p.confused = 3.5;
      }
    }
  }
  s.hazards = s.hazards.filter(h => h.kind === 'strike' ? !(h.done && h.life <= 0) : h.life > 0);
  p.confused = Math.max(0, p.confused - dt);
}

/* ---------- the step ---------- */
export function step(s, dt, inp){
  inp = inp || {};
  dt = Math.min(dt, 1 / 20);
  s.t += dt;
  if(!s.done) s.stats.time += dt;
  const p = s.p;
  s.warn = '';
  if(p.confused > 0) inp = Object.assign({}, inp, {sx: -(inp.sx || 0), sy: -(inp.sy || 0), sr: -(inp.sr || 0)});

  if(p.dead){
    p.deadT += dt;
    if(p.deadT > 2.5 && !s.failed){ s.failed = true; s.failWhy = s.failWhy || 'shot down'; ev(s, 'failed'); }
  } else {
    if(s.mode === 'rail') flyRail(s, dt, inp); else flyFree(s, dt, inp);
    ship(s, dt, inp);
  }
  if(s.mode === 'rail'){
    while(s.script.length && s.script[0].u <= p.rail.u){ const S1 = s.script.shift(); if(!S1.branch || (S1.branch === 'alt') === (s.branch === 1)) S1.fn(); }
    fork(s);
    if(s.cpU && !s.cpPassed && !p.dead && p.rail.u >= s.cpU){
      s.cpPassed = {kills: s.stats.kills, combo: s.stats.combo || 0, gold: s.stats.gold, goldTotal: s.stats.goldTotal,
        secretGot: s.secret ? s.secret.got : 0, allies: s.allies.filter(a => !a.gone).map(a => a.id)};
      p.shield = Math.min(p.maxShield, p.shield + 50);   // and a top-up, as Star Fox 64's ring gives
      ev(s, 'checkpoint');
    }
    if(!p.dead && !s.railHold && s.phase === 'rail'){
      if(s.L.railChase && p.rail.u >= s.L.railChase.u) startChase(s);
      else if(s.L.railBossU && p.rail.u >= s.L.railBossU) startRailBoss(s);
      else if(!s.L.railBossU && !s.L.railChase && p.rail.u >= RAIL_END) startArena(s);
    }
    if(s.phase === 'chase' && !p.dead && p.rail.u > s.L.railChase.u + s.L.railChase.len){
      s.failWhy = s.L.railChase.escape || 'It got away!'; p.dead = true; p.deadT = 1.5; ev(s, 'escaped');
      if(s.L.railChase.say) say(s, s.L.railChase.say[0], s.L.railChase.say[1]);
    }
  } else if(s.phase === 'arena'){
    const left = s.enemies.filter(e => e.wave === s.wave && e.type !== 'torpedo' && e.type !== 'planet' && e.type !== 'cage' && e.type !== 'mine').length;
    if(s.waveT > 2.5 && !s.enemies.some(e => e.type === 'cage')) s.waveT = 2.5;   // all out: on with it
    if(s.waveT > 0){ s.waveT -= dt; if(s.waveT <= 0) nextWave(s); }
    else if(s.wave > 0 && left === 0 && !s.bossKind){
      // guards down but pups still caged: a little time to get them out first
      const caged = s.enemies.some(e => e.type === 'cage');
      s.waveT = caged ? 14 : 2.5;
      if(caged) say(s, 'rosie', "Guards are down - quick, open those cages before the Warden gets here!", 2.6);
    }
  }
  if(s.timer != null && s.phase !== 'won' && !p.dead){
    s.timer -= dt;
    if(s.timer <= 0){ s.timer = 0; s.failWhy = 'The Moon fell out of the sky!'; p.dead = true; p.deadT = 0; ev(s, 'timeout'); say(s, 'mittens', 'Whoops! There it goes! Off the table!', 3); }
  }
  enemies(s, dt);
  allies(s, dt);
  hazards(s, dt);
  projectiles(s, dt);
  pickups(s, dt);
  checkWin(s);
  if(s.phase === 'won'){ s.clearT += dt; if(s.clearT > 6 && !s.done){ s.done = true; ev(s, 'done'); } }
}
function checkWin(s){
  if(s.phase === 'won' || !s.boss) return;
  const b = s.boss;
  let over = false;
  if(b.aces) over = !s.enemies.some(e => e.boss && e.type === 'ace');
  else if(b.engines) over = !s.enemies.some(e => e.kind === 'engine');
  else if(b.type === 'mittensShip') over = b.hp <= 0;
  else if(b.hp <= 0){
    if(b.kind === 'mittens'){
      // phase two: the face cracks, the cat inside runs for it
      ev(s, 'boom', {x: b.x, y: b.y, z: b.z, big: true, type: 'mittensFace'});
      say(s, 'mittens', "You broke my FACE? Fine! I'll do it MYSELF!", 3);
      const m = flyIn(s, 'mittensShip', {x: b.x, y: b.y, z: b.z}, {who: 'mittens', wave: s.wave, state: 'extend', extT: 2, goal: {x: b.x + b.fx * -400, y: b.y + 60, z: b.z + b.fz * -400}});
      s.boss = m;
      return;
    }
    over = true;
  }
  if(!over) return;
  for(const o of s.enemies) if(o.hp > 0){ o.hp = 0; ev(s, 'boom', {x: o.x, y: o.y, z: o.z}); }
  s.phase = 'won'; s.clearT = 0; s.boss = null; s.timer = null; s.railHold = false;
  ev(s, 'won');
  say(s, 'teddy', ["Who's a good boy? This guy!", 'Good dogs, everybody!', 'AWOOOO!'][s.L.n % 3], 3);
  const winner = s.allies.find(a => !a.gone);
  if(winner) setTimeout0(s, 3.3, () => sayAlly(s, winner.id, 'win'));
}
/* Something to do a little later (dialogue after a win). */
function setTimeout0(s, t, fn){ (s.later = s.later || []).push({t: s.t + t, fn}); }

/* ---------- the enemies ---------- */
function enemies(s, dt){
  const p = s.p;
  for(const e of s.enemies){
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 4);
    const px = e.x, py = e.y, pz = e.z;
    if(e.type === 'mine') mineAI(s, e, dt);
    else if(e.type === 'buoy'){ e.y = 6 + Math.sin(e.t * 1.3 + e.ph) * 0.6; }
    else if(e.type === 'turret') turretAI(s, e, dt);
    else if(e.rail) railAI(s, e, dt);
    else if(e.type === 'dart' || e.type === 'ace' || e.type === 'mittensShip') dogfight(s, e, dt);
    else if(e.type === 'raider') strafer(s, e, dt);
    else if(e.type === 'torpedo' || e.type === 'planet') torpedo(s, e, dt);
    else if(e.type === 'boss') bossAI(s, e, dt);
    else if(e.type === 'part') partAI(s, e, dt);
    if(e.type !== 'part'){ e.vx = (e.x - px) / dt; e.vy = (e.y - py) / dt; e.vz = (e.z - pz) / dt; }
  }
  if(s.later){ for(const l of s.later) if(s.t >= l.t){ l.fn(); l.t = Infinity; } s.later = s.later.filter(l => l.t !== Infinity); }
  s.enemies = s.enemies.filter(e => {
    if(e.hp <= 0 || e.gone) return false;
    if(s.mode === 'rail' && (e.type === 'turret' || e.type === 'mine' || e.type === 'buoy' || e.state === 'oncoming' || e.state === 'cross') && e.ru < p.rail.u - 80) return false;
    return true;
  });
}
/* ---------- flying: the rail ---------- */
/* Pointing on the rail: the furthest the nose turns (rad), how fast it
   eases there (/s) and its fastest turn (rad/s), and the sideways speed
   at full point as a share of forward speed / sin(angle). */
export const POINT = {max: 0.94, ease: 3.2, rate: 1.2, side: 1.4};
export const LOOP = {railR: 24, railDur: 1.9, freeDur: 2.2, uturnUp: 1.1, uturnRoll: 0.55};
function flyRail(s, dt, inp){
  const p = s.p, r = p.rail;
  const want = s.pace * (inp.boost && p.boost > 0.02 ? SPEED.railBoost : inp.brake && p.boost > 0.02 ? SPEED.railBrake : SPEED.rail);
  if(inp.loop && !p.man){
    // a somersault: the rail waits while the ship goes up, over (facing
    // backwards at the top) and down again. Whatever was behind is now ahead.
    p.man = {kind: 'loop', t: 0, dur: LOOP.railDur, u0: r.u, ox0: r.ox, oy0: r.oy};
    r.vx = r.vy = 0;
    ev(s, 'loop');
  }
  if(p.man){ railLoop(s, dt); return; }
  meter(p, dt, !!((inp.boost || inp.brake) && p.boost > 0.02));
  p.speed += (want - p.speed) * Math.min(1, 2.5 * dt);
  if(!s.railHold) r.u += p.speed * dt;
  const sx = clamp(inp.sx || 0, -1, 1), sy = clamp(inp.sy || 0, -1, 1);
  const lean = clamp(p.bank / 1.3, -1, 1);
  if(s.steer === 'point'){
    // POINT (as Star Fox 64 flies its rail): the stick aims the nose, up to
    // 54 degrees off the rail, and the ship goes where it points - sideways
    // at up to 1.4 x speed x sin(angle). The nose swings there at 10% of
    // the way a 30th of a second, but no faster than 69 deg/s; banked into
    // the turn, twice that; in a barrel roll, three times.
    const A = POINT.max, k = 1 - Math.exp(-POINT.ease * dt);
    const into = Math.abs(p.bank) > 0.17 && sx * p.bank > 0;
    const cap = POINT.rate * (p.rollT > 0 ? 3 : into ? 2 : 1) * dt;
    r.aYaw = (r.aYaw || 0) + clamp((sx * A - (r.aYaw || 0)) * k, -cap, cap);
    // near the floor the nose won't go down (it eases up instead)
    const q0 = railPoint(r.u, r.ox, 0), low = r.oy < Math.max(RAIL_FLOOR, height(q0.x, q0.z) + 4) + 8;
    const pt = low && sy < 0 ? 0 : sy * A;
    const capP = POINT.rate * (low ? 2 : 1) * dt;
    r.aPitch = (r.aPitch || 0) + clamp((pt - (r.aPitch || 0)) * k, -capP, capP);
    const v = p.speed * POINT.side;
    r.vx = v * Math.sin(r.aYaw); r.vy = v * Math.sin(r.aPitch);
  } else {
    // SLIDE: the stick slides the ship about the box; banked into the slide
    // (wheel or bank button), it slides faster: a tight turn
    const tight = 1 + HANDLING.bankBoost * Math.max(0, sx * lean > 0 ? Math.abs(lean) : 0);
    r.vx += (sx * HANDLING.railX * tight - r.vx) * Math.min(1, HANDLING.railAccel * dt);
    r.vy += (sy * HANDLING.railY - r.vy) * Math.min(1, HANDLING.railAccel * dt);
    r.aYaw = r.aPitch = 0;
  }
  // a roll is a sidestep too - kept apart from the stick's sliding so the
  // nose does not swing with it
  if(p.rollT > 0) r.side += p.rollDir * 48 * dt;
  r.side *= Math.exp(-3 * dt);
  r.ox += (r.vx + r.side) * dt; r.oy += r.vy * dt;
  const lim = halfW(r.u) - WALL_MARGIN;
  if(r.ox > lim){ r.ox = lim; r.vx = Math.min(0, r.vx); r.side = Math.min(0, r.side); }
  if(r.ox < -lim){ r.ox = -lim; r.vx = Math.max(0, r.vx); r.side = Math.max(0, r.side); }
  if(r.oy > RAIL_TOP){ r.oy = RAIL_TOP; r.vy = Math.min(0, r.vy); }
  // pointing into a wall: the nose comes back round (it slides along)
  if(s.steer === 'point'){
    if(Math.abs(r.ox) >= lim && r.aYaw * r.ox > 0) r.aYaw *= Math.exp(-6 * dt);
    if(r.oy >= RAIL_TOP && r.aPitch > 0) r.aPitch *= Math.exp(-6 * dt);
  }
  const q = railPoint(r.u, r.ox, 0);
  const floor = Math.max(RAIL_FLOOR, height(q.x, q.z) + 4);
  if(r.oy < floor){ r.oy = floor; r.vy = Math.max(0, r.vy); }
  // the wheel rolls the ship; sliding sideways leans it a little too
  const bankT = clamp((inp.sr || 0) * 1.57 + clamp(r.vx / HANDLING.railX, -1.3, 1.3) * 0.35, -1.6, 1.6);
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
  const want = s.pace * (inp.boost && p.boost > 0.02 ? SPEED.freeBoost : inp.brake && p.boost > 0.02 ? SPEED.freeBrake : SPEED.free);
  meter(p, dt, !!((inp.boost || inp.brake) && p.boost > 0.02));
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
  if(p.y < FLOOR + 40) s.warn = 'TOO LOW';

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
    const lean = clamp(p.bank / 1.3, -1, 1);
    const tight = 1 + HANDLING.bankBoost * Math.max(0, sx * lean > 0 ? Math.abs(lean) : 0);
    p.yaw += sx * HANDLING.levelTurn * tight * dt;
    if(Math.abs(sy) > 0.06) p.pitch += sy * HANDLING.levelPitch * dt;
    else p.pitch -= p.pitch * Math.min(1, 0.6 * dt);     // let go and it levels out
    if(p.y > CEILING - 40) p.pitch = Math.min(p.pitch, -0.1);
    if(p.y < FLOOR + 40) p.pitch = Math.max(p.pitch, 0.1);
    p.pitch = clamp(p.pitch, -1.15, 1.15);
    // the roll is a lean: the wheel, plus a little into the turn
    const bankT = clamp(sr * 1.57 + sx * 0.45, -1.6, 1.6);
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
    if(p.y < FLOOR + 40 && f.y < 0) turnToward(f, norm({x: f.x, y: 0.3, z: f.z}), 1.0 * dt);
    rot(f, u, null, sy * HANDLING.fullPitch * dt, sr * HANDLING.fullRoll * dt, sx * HANDLING.fullTurn * dt);
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
  if(p.y < FLOOR) p.y = FLOOR;
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
      const n = ob ? (ob.type === 'rock' ? norm({x: p.x - ob.x, y: p.y - ob.y, z: p.z - ob.z}) : norm({x: p.x - (ob.x != null ? ob.x : p.x), y: 0.6, z: p.z - (ob.z != null ? ob.z : p.z)})) : (() => { const q = normalAt(p.x, p.z); return {x: q[0], y: q[1], z: q[2]}; })();
      p.x += n.x * 5; p.y = Math.max(p.y + n.y * 5, g + SHIP_R + 2); p.z += n.z * 5;
      if(ob && ob.type === 'rock'){ const d = len(p.x - ob.x, p.y - ob.y, p.z - ob.z); if(d < ob.r + SHIP_R + 1){ const k = (ob.r + SHIP_R + 2) / d; p.x = ob.x + (p.x - ob.x) * k; p.y = ob.y + (p.y - ob.y) * k; p.z = ob.z + (p.z - ob.z) * k; } }
      // bounce the nose off
      const f = {x: p.fx, y: p.fy, z: p.fz};
      const d = dot(f, n);
      if(d < 0.3){ turnToward(f, norm({x: f.x + n.x * 1.2, y: f.y + n.y * 1.2, z: f.z + n.z * 1.2}), 0.8); p.fx = f.x; p.fy = f.y; p.fz = f.z; p.yaw = Math.atan2(p.fx, -p.fz); p.pitch = Math.asin(clamp(p.fy, -1, 1)); if(s.style === 'full') fixUp(p); else { p.pitch = clamp(p.pitch, -1.15, 1.15); levelFrame(p); } }
    } else {
      // in the canyon an arch or a spire knocks you aside
      if(ob && ob.type === 'arch'){ p.rail.oy -= 6; p.rail.vy = -20; }
      else if(ob && ob.type === 'rock'){ const side = Math.sign(p.rail.ox - railLat(ob)) || 1, up = Math.sign(p.rail.oy - ob.y) || 1; p.rail.vx = side * 35; p.rail.vy = up * 25; p.rail.ox += side * 3; p.rail.oy += up * 3; }
      else if(ob){ const side = Math.sign(p.rail.ox - railLat(ob)) || 1; p.rail.vx = side * 40; p.rail.ox += side * 3; }
      else { p.rail.oy += 3; p.rail.vy = 15; }
    }
  }
  if(s.mode === 'free' && GROUND !== 'space' && p.y - g < 35) s.warn = s.warn || 'PULL UP';

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
          vx: d.x * SHOT_SPEED * s.pace + p.vx, vy: d.y * SHOT_SPEED * s.pace + p.vy, vz: d.z * SHOT_SPEED * s.pace + p.vz, life: 1.65});
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
      s.missiles.push({x: p.x + f.x * 4, y: p.y + f.y * 4, z: p.z + f.z * 4, fx: f.x, fy: f.y, fz: f.z, speed: 230 * s.pace, target: p.lock, life: 2.6, charged: true});
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
        if(e.shielded || e.x < -9e4) continue;
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
    s.bombs.push({x: p.x, y: p.y - 1, z: p.z, vx: f.x * 170 * s.pace + p.vx * 0.5, vy: f.y * 170 * s.pace + p.vy * 0.5, vz: f.z * 170 * s.pace + p.vz * 0.5, life: 1.3});
    ev(s, 'missile');
  }

  // anybody sitting on your tail?
  p.behind = 0;
  if(s.mode === 'free') for(const e of s.enemies){
    if(e.type !== 'dart' && e.type !== 'raider' && e.type !== 'ace' && e.type !== 'mittensShip') continue;
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
    if(e.shielded) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = len(dx, dy, dz);
    if(d > 520) continue;
    const t = d / (SHOT_SPEED * s.pace);
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
  if(why === 'crash' && s.L.final) n *= 0.8;
  p.shield = Math.max(0, p.shield - n);
  s.stats.damage += n;
  ev(s, 'hurt', {n, why});
  if(p.shield <= 0){
    p.dead = true; p.deadT = 0;
    ev(s, 'boom', {x: p.x, y: p.y, z: p.z, big: true, player: true});
  }
}

function aimAt(s, e, speed, T){
  const p = T || s.p;
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = len(dx, dy, dz);
  const t = d / speed;
  let tx = dx + (p.vx || 0) * t * 0.85, ty = dy + (p.vy || 0) * t * 0.85, tz = dz + (p.vz || 0) * t * 0.85;
  const l = len(tx, ty, tz), sp = s.K.spread * (e.type === 'ace' || e.type === 'mittensShip' ? 0.7 : 1);
  return norm({x: tx / l + (s.rand() - 0.5) * sp * 2, y: ty / l + (s.rand() - 0.5) * sp * 2, z: tz / l + (s.rand() - 0.5) * sp * 2});
}
function bolt(s, e, dir, dmg, from){
  const o = from || e;
  s.bolts.push({x: o.x + dir.x * (e.r + 1), y: o.y + dir.y * (e.r + 1), z: o.z + dir.z * (e.r + 1),
    vx: dir.x * BOLT_SPEED * s.pace, vy: dir.y * BOLT_SPEED * s.pace, vz: dir.z * BOLT_SPEED * s.pace, life: 4 / s.pace, dmg: dmg || 7, src: e.type});
  ev(s, 'enemyShot', {x: o.x, y: o.y, z: o.z});
}
function distP(s, e){ const p = s.p; return len(p.x - e.x, p.y - e.y, p.z - e.z); }

/* A mine: bobs where it was left, and goes off if anything comes close. */
function mineAI(s, e, dt){
  const p = s.p;
  e.y += Math.sin(e.t * 1.1 + e.ph) * 2 * dt;
  if(!p.dead && distP(s, e) < 11){
    e.hp = 0; e.nokill = true;
    ev(s, 'bomb', {x: e.x, y: e.y, z: e.z, r: 14});
    if(p.hitT <= 0){ damage(s, 10, 'mine'); p.hitT = 0.5; }
  }
}
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
    bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace), 7);
  }
}

function railAI(s, e, dt){
  const p = s.p, pu = p.rail.u;
  let u, ox, oy;
  if(e.state === 'oncoming'){
    e.ru -= 42 * s.pace * dt;
    u = e.ru; ox = e.rox + Math.sin(e.t * 1.7 + e.ph) * 9; oy = e.roy + Math.sin(e.t * 1.3 + e.ph) * 5;
    e.fireT -= dt;
    const ahead = e.ru - pu;
    if(!e.fired && ahead < 300 && ahead > 90){ e.fired = true; if(s.rand() < Math.min(1, 0.85 / s.K.fire)) bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace), 7); }
  } else if(e.state === 'cross'){
    e.rox += e.dir * 46 * s.pace * dt;
    u = e.ru; ox = e.rox; oy = e.roy + Math.abs(e.rox) * 0.25;
    e.fireT -= dt;
    if(Math.abs(e.rox) < 25 && e.burst === 0 && e.ru - pu > 80){ e.burst = 3; e.fireT = 0; }
    if(e.burst > 0 && e.fireT <= 0){ e.burst = e.burst > 1 ? e.burst - 1 : -1; e.fireT = 0.18; bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace), 6); }
    if(Math.abs(e.rox) > halfW(e.ru) + 60) e.gone = true;
  } else {
    // swoop: in from behind, hold ahead and shoot, then out over the rim
    if(e.t < 0){ e.x = -1e5; return; }
    if(e.state === 'swoopIn'){
      e.rel += 95 * s.pace * dt;
      e.roy += (e.holdY - e.roy) * Math.min(1, 1.6 * dt); e.rox += (e.holdX - e.rox) * Math.min(1, 1.2 * dt);
      if(e.rel > 150){ e.state = 'swoopHold'; e.holdT = 0; }
    } else if(e.state === 'swoopHold'){
      e.holdT += dt;
      e.rel = 150 + Math.sin(e.t * 0.9 + e.ph) * 18;
      e.fireT -= dt;
      if(e.fireT <= 0){ e.fireT = (1.6 + s.rand() * 1.2) * s.K.fire; bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace), 6); }
      if(e.holdT > (e.holdFor || 8)) e.state = 'swoopOut';
    } else {
      e.rel += 70 * s.pace * dt; e.roy += 30 * dt;
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
  else if(ob && ob.type === 'rock'){ const a = norm({x: e.x - ob.x, y: e.y - ob.y, z: e.z - ob.z}); d = norm({x: d.x + a.x * 2, y: d.y + a.y * 2, z: d.z + a.z * 2}); }
  const rx = e.x - ARENA.x, rz = e.z - ARENA.z, r = Math.hypot(rx, rz);
  if(s.mode === 'free' && r > ARENA_LIMIT - 180) d = norm({x: d.x - rx / r * 1.5, y: d.y, z: d.z - rz / r * 1.5});
  if(e.y > CEILING - 60) d = norm({x: d.x, y: Math.min(d.y, -0.2), z: d.z});
  if(e.y < FLOOR + 60) d = norm({x: d.x, y: Math.max(d.y, 0.2), z: d.z});
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
/* Who a dogfighter is after: a wingmate it was sent for, or Teddy. */
function quarry(s, e){
  const id = e.hunt || e.tgt;
  if(id){ const a = s.allies.find(a => a.id === id && !a.gone); if(a) return a; e.hunt = e.tgt = null; }
  return s.p;
}
function dogfight(s, e, dt){
  const p = quarry(s, e), K = s.K;
  const fast = e.type === 'ace' ? 1.12 : e.type === 'mittensShip' ? 1.2 : 1;
  const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, dist = len(dx, dy, dz);
  let d;
  if(e.state === 'attack'){
    const t = Math.min(2, dist / 140);
    d = norm({x: dx + p.vx * t, y: dy + p.vy * t, z: dz + p.vz * t});
    if(dist < 85){ e.state = 'extend'; e.extT = 3 + s.rand() * 1.5; const a = s.rand() * 6.28;
      e.goal = {x: ARENA.x + Math.cos(a) * 380, y: 80 + s.rand() * 170, z: ARENA.z + Math.sin(a) * 380}; }
    // being chased makes it jink
    const behind = (-dx * p.fx - dy * p.fy - dz * p.fz) / (dist || 1);
    if(behind > 0.95 && dist < 200 && s.rand() < dt * (e.type === 'dart' ? 0.5 : 1.2)){ e.state = 'evade'; e.extT = 1.6; e.jink = s.rand() < 0.5 ? -1 : 1; }
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
  moveFwd(e, d, 1.25 * K.ai * fast, e.speed * K.ai * s.pace, dt);
  // guns
  e.fireT -= dt;
  const a = (dx * e.fx + dy * e.fy + dz * e.fz) / (dist || 1);
  if(e.fireT <= 0 && a > (e.type === 'dart' ? 0.97 : 0.94) && dist < (e.type === 'dart' ? 400 : 480) && dist > 30){
    if(e.burst <= 0) e.burst = e.type === 'dart' ? 2 : 3;
    e.burst--; e.fireT = e.burst > 0 ? 0.2 : (1.3 + s.rand()) * K.fire;
    bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace, p), 6);
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
      bolt(s, e, aimAt(s, e, BOLT_SPEED * s.pace), 6);
    }
    if(dist < 70){ e.state = 'setup'; e.goal = null; e.goalT = 0; }
  }
  d = steerSafe(s, e, d, 160);
  moveFwd(e, d, 1.0 * K.ai, e.speed * K.ai * s.pace, dt);
}
function torpedo(s, e, dt){
  const p = s.p, planet = e.type === 'planet';
  e.life = (e.life == null ? 9 : e.life) - dt;
  const d = norm({x: p.x - e.x, y: p.y - e.y, z: p.z - e.z});
  moveFwd(e, d, planet ? 0.22 : 0.62, e.speed * s.pace, dt);
  // a barrel roll bats a planet away
  if(planet && p.rollT > 0 && distP(s, e) < e.r + 12){ e.hp = 0; e.nokill = true; ev(s, 'deflect', {x: e.x, y: e.y, z: e.z}); ev(s, 'boom', {x: e.x, y: e.y, z: e.z}); return; }
  if(distP(s, e) < e.r + 2.5){ e.hp = 0; e.nokill = true; if(p.hitT <= 0){ damage(s, planet ? 8 : 8, e.type); p.hitT = 0.4; } ev(s, 'boom', {x: e.x, y: e.y, z: e.z, big: planet}); }
  if(e.life <= 0 || e.y < height(e.x, e.z) || (planet && hitObstacle(e.x, e.y, e.z, e.r))){ e.hp = 0; e.nokill = true; ev(s, 'boom', {x: e.x, y: e.y, z: e.z, big: planet}); }
}

/* ---------- wingmates in flight ---------- */
function allies(s, dt){
  const p = s.p;
  for(const a of s.allies){
    a.t += dt; a.ffT = Math.max(0, a.ffT - dt);
    const ox = a.x, oy = a.y, oz = a.z;
    if(a.gone){
      // off home for a nap: up and away
      a.goneT += dt;
      const f = {x: a.fx, y: a.fy, z: a.fz};
      turnToward(f, norm({x: a.fx, y: 1, z: a.fz}), 1.2 * dt);
      a.fx = f.x; a.fy = f.y; a.fz = f.z;
      a.x += f.x * 90 * dt; a.y += f.y * 90 * dt; a.z += f.z * 90 * dt;
    } else if(s.mode === 'rail'){
      // in formation: a slot behind and beside Teddy
      // (it eases towards the slot at 2.5/s, which on its own trails the
      // slot by speed / 2.5 - 30 m at 75 m/s, right beside the camera - so
      // aim that much further on)
      const r = p.rail, sl = a.slot;
      const u = r.u + sl[2] + p.speed / 2.5, lim = halfW(u) - WALL_MARGIN;
      const q = railPoint(u, clamp(r.ox * 0.6 + sl[0], -lim, lim), Math.max(RAIL_FLOOR + 2, Math.min(RAIL_TOP, r.oy + sl[1])));
      const k = 1 - Math.exp(-2.5 * dt);
      a.x += (q.x - a.x) * k; a.y += (q.y - a.y) * k; a.z += (q.z - a.z) * k;
      const f = railFrame(u);
      a.fx = f.tx; a.fy = 0; a.fz = f.tz;
      a.bank += (Math.sin(a.t * 0.9 + sl[0]) * 0.15 - a.bank) * Math.min(1, 3 * dt);
      // potshots at whatever is ahead
      a.fireT -= dt;
      if(a.fireT <= 0){
        a.fireT = 0.7 + s.rand() * 0.6;
        const tgt = s.enemies.find(e => e.x > -9e4 && e.type !== 'part' && e.type !== 'cage' && distP(s, e) < 380 && ((e.x - a.x) * a.fx + (e.z - a.z) * a.fz) > 40);
        if(tgt) allyShot(s, a, tgt);
      }
    } else {
      // dogfighting: chase the nearest cat, unless one is chasing you
      let d;
      const chaser = a.chased && s.enemies.find(e => e.id === a.chased);
      if(chaser){
        a.chasedT += dt;
        const r = cross({x: a.fx, y: a.fy, z: a.fz}, {x: 0, y: 1, z: 0});
        d = norm({x: a.fx + r.x * Math.sin(a.t * 1.3) * 1.2, y: a.fy + Math.sin(a.t * 0.9) * 0.4, z: a.fz + r.z * Math.sin(a.t * 1.3) * 1.2});
      } else {
        if(a.chased) a.chased = null;     // the chaser left (or a wingmate shot it)
        let best = a.target && s.enemies.find(e => e.id === a.target);
        if(!best || s.rand() < dt * 0.3){
          let bd = 1e9; best = null;
          for(const e of s.enemies){
            if(e.x < -9e4 || (e.type === 'boss' && e.shielded) || e.type === 'planet') continue;
            const dd = len(e.x - a.x, e.y - a.y, e.z - a.z);
            if(dd < bd){ bd = dd; best = e; }
          }
          a.target = best && best.id;
        }
        if(best){
          const t = Math.min(1.5, distP2(a, best) / 300);
          d = norm({x: best.x + (best.vx || 0) * t - a.x, y: best.y + (best.vy || 0) * t - a.y, z: best.z + (best.vz || 0) * t - a.z});
          const al = (d.x * a.fx + d.y * a.fy + d.z * a.fz);
          a.fireT -= dt;
          if(a.fireT <= 0 && al > 0.985 && distP2(a, best) < 380){ a.fireT = 0.6 + s.rand() * 0.5; allyShot(s, a, best); }
          if(distP2(a, best) < 60) d = norm({x: d.x + a.fy, y: d.y + 0.8, z: d.z - a.fx});
        } else {
          // nothing to chase: fly loose formation off Teddy's wing
          const sl = a.slot;
          const q = {x: p.x - p.fx * 30 + (-p.fz) * sl[0], y: p.y + sl[1], z: p.z - p.fz * 30 + p.fx * sl[0]};
          d = norm({x: q.x - a.x + p.fx * 40, y: q.y - a.y, z: q.z - a.z + p.fz * 40});
        }
      }
      d = steerSafe(s, a, d, 120);
      moveFwd(a, d, 1.3, SPEED.free * s.pace * (chaser ? 1.05 : 1), dt);
      if(a.giftT > 0){ a.giftT -= dt; if(a.giftT <= 0){ sayAlly(s, a.id, 'gift'); if(a.id !== 'wing3'){ p.bombs = Math.min(9, p.bombs + 1); ev(s, 'gift', {who: a.id}); } } }
      // a cat left on your tail too long starts to hurt
      if(chaser && a.chasedT > 18 && s.rand() < dt * 0.5) hurtAlly(s, a, 6);
    }
    if(dt > 0){ a.vx = (a.x - ox) / dt; a.vy = (a.y - oy) / dt; a.vz = (a.z - oz) / dt; }
    const g = height(a.x, a.z);
    if(a.y < g + 4) a.y = g + 4;
  }
  s.allies = s.allies.filter(a => !(a.gone && a.goneT > 4));
}
function distP2(a, e){ return len(e.x - a.x, e.y - a.y, e.z - a.z); }
function allyShot(s, a, e){
  const t = distP2(a, e) / (SHOT_SPEED * s.pace);
  const d = norm({x: e.x + (e.vx || 0) * t - a.x + (s.rand() - 0.5) * 6, y: e.y + (e.vy || 0) * t - a.y + (s.rand() - 0.5) * 6, z: e.z + (e.vz || 0) * t - a.z + (s.rand() - 0.5) * 6});
  s.shots.push({x: a.x + d.x * 3, y: a.y + d.y * 3, z: a.z + d.z * 3, vx: d.x * SHOT_SPEED * s.pace + a.vx, vy: d.y * SHOT_SPEED * s.pace + a.vy, vz: d.z * SHOT_SPEED * s.pace + a.vz, life: 1.4, ally: a.id});
  ev(s, 'allyFire', {x: a.x, y: a.y, z: a.z});
}
function hurtAlly(s, a, n){
  if(a.gone || s.phase === 'won') return;
  a.hp -= n;
  ev(s, 'allyHit', {who: a.id, x: a.x, y: a.y, z: a.z});
  if(a.hp <= 0){
    a.gone = true; a.goneT = 0;
    s.downed.push(a.id);
    sayAlly0(s, a.id, 'down');
    ev(s, 'allyDown', {who: a.id, x: a.x, y: a.y, z: a.z});
    // whoever was chasing them goes for Teddy instead
    for(const e of s.enemies) if(e.hunt === a.id || e.tgt === a.id){ e.hunt = null; e.tgt = null; }
  }
}
function sayAlly0(s, who, key){ const ln = CAST[who] && CAST[who].lines && CAST[who].lines[key]; if(ln) say(s, who, ln); }
/* ---------- hurting things ---------- */
function hurtEnemy(s, e, n, x, y, z, by){
  if(e.shielded){ ev(s, 'deflect', {x, y, z}); return; }
  if(e.hp <= 0) return;
  e.hp -= n; e.flash = 1;
  ev(s, 'hit', {x, y, z, id: e.id});
  if(e.hp > 0) return;
  const big = e.type === 'boss' || e.type === 'part' || e.type === 'mittensShip';
  ev(s, 'boom', {x: e.x, y: e.y, z: e.z, big, type: e.type, kind: e.kind});
  if(e.secret){ secretStep(s, 1); if(s.secret && !s.secret.done) say(s, 'rosie', `Radar buoy down - ${s.secret.got} of ${s.secret.need}.`, 1.6); return; }
  if(e.type === 'mine'){ ev(s, 'bomb', {x: e.x, y: e.y, z: e.z, r: 14}); return; }
  if(e.type === 'cage'){
    s.stats.rescued++;
    if(s.secret && s.secret.type === 'pups') secretStep(s, 1);
    ev(s, 'rescue', {x: e.x, y: e.y, z: e.z});
    if(e.rescue) addAlly(s, e.rescue);
    else if(s.stats.rescued % 2 === 1) say(s, 'teddy', ['Go on, pups - run home!', 'You are free, little guy!', 'Out you come!'][s.stats.rescued % 3], 1.8);
    return;
  }
  if(!by){
    s.stats.kills++;
    // a whole squad down: a present
    const q = e.group && s.squads && s.squads[e.group];
    if(q && ++q.got === q.n){ drop(s, present(s), e); say(s, 'rosie', 'Whole squad down! They dropped something.', 1.8); }
    // milestones in the clearing (Star Fox 64 drops a gold ring on its 5th,
    // 10th, 20th and 30th kills in all-range mode, lasers on the 15th)
    if(s.mode === 'free' && (e.type === 'dart' || e.type === 'raider' || e.type === 'ace')){
      s.freeKills = (s.freeKills || 0) + 1;
      const m = {5: 'bone', 10: 'bomb', 15: 'ball', 20: 'bone', 30: 'bone'}[s.freeKills];
      if(m) drop(s, m === 'ball' && s.p.twin ? 'bomb' : m, e);
    }
  }
  if(e.type === 'part') say(s, 'teddy', {pod: 'Got an engine!', gun: 'One gun down!', rod: 'Rod down!', lock: 'Lock smashed!', vent: 'Vent plugged!', petal: 'Petal popped!', panel: 'Panel down!', paw: 'Paw down! Ha!', engine: 'Engine down!'}[e.kind] || 'Got it!', 1.6);
  if(e.type === 'ace' && e.who){
    const L = {ace1: "Grr! I'll get you next time, dog!", ace2: 'Ack! Hairball!', ace3: 'How DARE you. This fur was groomed!', ace4: 'Not bad, pup. Not bad...'};
    say(s, e.who, L[e.who] || 'Hiss!', 2.2);
  }
  if(e.hunt){
    // the cat on a wingmate's tail is gone: they say thanks, and later bring a present
    const a = s.allies.find(a => a.id === e.hunt);
    if(a && a.chased === e.id && !a.gone){ a.chased = null; s.stats.saved++; sayAlly(s, a.id, 'saved'); a.giftT = 6; ev(s, 'saved', {who: a.id}); }
  }
}

/* ---------- shots, bolts, missiles, bombs ---------- */
function projectiles(s, dt){
  const p = s.p;
  for(const b of s.shots){
    b.life -= dt;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
    // anything that can be hurt first, then shields (a part tucked against
    // a shielded body is still hittable)
    for(let pass = 0; pass < 2 && b.life > 0; pass++) for(const e of s.enemies){
      if(e.x < -9e4 || !!e.shielded !== (pass === 1)) continue;
      const r = e.r + 0.8;
      if(segDist2(b.x, b.y, b.z, nx, ny, nz, e.x, e.y, e.z) < r * r){ if(!b.ally && !e.shielded) s.stats.hits++; hurtEnemy(s, e, b.ally ? ALLY_DMG : 1, nx, ny, nz, b.ally); b.life = 0; break; }
    }
    // Teddy's shots can hit a wingmate. They will mention it.
    if(b.life > 0 && !b.ally) for(const a of s.allies){
      if(a.gone || segDist2(b.x, b.y, b.z, nx, ny, nz, a.x, a.y, a.z) > 2.6 * 2.6) continue;
      b.life = 0; hurtAlly(s, a, 1); ev(s, 'spark', {x: nx, y: ny, z: nz});
      if(a.ffT <= 0){ a.ffT = 8; sayAlly(s, a.id, 'ff'); }
      break;
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
    if(b.life > 0) for(const a of s.allies){
      if(a.gone || segDist2(b.x, b.y, b.z, nx, ny, nz, a.x, a.y, a.z) > 2.8 * 2.8) continue;
      b.life = 0; hurtAlly(s, a, b.dmg * 0.6 * s.K.dmg); ev(s, 'spark', {x: nx, y: ny, z: nz, hurt: true});
      break;
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
  const charge = kind === 'charge';
  // a charged burst hits everything inside it in full (it is a combo shot);
  // a bomb falls off towards its edge
  const hit = (e, n) => { const was = e.hp; hurtEnemy(s, e, n, e.x, e.y, e.z); return was > 0 && e.hp <= 0; };
  const killed = [];
  if(direct && hit(direct, dmg)) killed.push(direct);
  for(const e of s.enemies){
    if(e === direct || e.hp <= 0) continue;
    const d = len(e.x - x, e.y - y, e.z - z);
    const full = charge && SMALL[e.type];
    if(d < R + e.r && hit(e, full ? dmg : Math.ceil(dmg * (1 - d / (R + e.r)) + 1))) killed.push(e);
  }
  s.bolts = s.bolts.filter(b => len(b.x - x, b.y - y, b.z - z) > R);
  if(charge) chain(s, killed, x, y, z);
}
/* The combo: what a charged burst destroys goes off in turn, and so on.
   Only the small fry go off; boss parts take the burst's usual falloff. */
const SMALL = {dart: 1, raider: 1, ace: 1, turret: 1, torpedo: 1, mine: 1, planet: 1};
function chain(s, killed, x, y, z){
  let n = killed.length;
  const queue = killed.filter(e => SMALL[e.type]);
  for(let i = 0; i < queue.length && i < 40; i++){
    const c = queue[i];
    ev(s, 'chain', {x: c.x, y: c.y, z: c.z, r: CHAIN.blast});
    for(const e of s.enemies){
      if(e.hp <= 0 || e.shielded) continue;
      if(len(e.x - c.x, e.y - c.y, e.z - c.z) < CHAIN.blast + e.r){
        const was = e.hp; hurtEnemy(s, e, CHAIN.dmg, e.x, e.y, e.z);
        if(was > 0 && e.hp <= 0){ n++; if(SMALL[e.type]) queue.push(e); }
      }
    }
    s.bolts = s.bolts.filter(b => len(b.x - c.x, b.y - c.y, b.z - c.z) > CHAIN.blast);
  }
  if(n >= 2){
    const bonus = n - 1;
    s.stats.kills += bonus; s.stats.combo = (s.stats.combo || 0) + bonus;
    ev(s, 'combo', {n: bonus, x, y, z});
    // seven or more in one shot: a wingmate notices (Star Fox 64 does this at +7)
    const fan = s.allies.filter(a => !a.gone);
    if(n >= 7 && fan.length){
      const a = fan[Math.floor(s.rand() * fan.length)];
      say(s, a.id, ['WOW! Did everyone see that?!', 'Seven in one go! Teach me that!', "That's my squad leader! Best boy!"][n % 3], 2.2);
    } else if(n >= 3) say(s, 'teddy', ['Woof! Got the whole pack!', 'Look at them all go!', 'Combo! Good boy, me!'][n % 3], 1.8);
  }
}

function pickups(s, dt){
  const p = s.p;
  for(const k of s.pickups){
    if(k.taken) continue;
    k.t += dt;
    if(len(k.x - p.x, k.y - p.y, k.z - p.z) < (k.type === 'ring' ? 13 : PICKUP_R) && !p.dead){
      k.taken = true;
      if(k.type === 'bone') { p.shield = Math.min(p.maxShield, p.shield + 30); for(const a of s.allies) if(!a.gone) a.hp = Math.min(100, a.hp + 20); say(s, 'teddy', 'Mmm, bone. Shields up!', 1.8); }
      else if(k.type === 'gold'){
        // golden bones work like Star Fox 64's gold rings: each one tops the
        // shield up a little, and the third makes the shield bigger
        s.stats.gold++;
        p.shield = Math.min(p.maxShield, p.shield + 12);
        if(s.stats.gold === 3 && p.maxShield < 140){ p.maxShield = 140; p.shield = Math.min(140, p.shield + 40); say(s, 'teddy', 'Three golden bones - BIGGER SHIELD!', 2.2); ev(s, 'upgrade'); }
        else say(s, 'teddy', 'Golden bone! ' + s.stats.gold + ' of ' + s.stats.goldTotal + '.', 2);
      }
      else if(k.type === 'ball') { p.twin = true; say(s, 'teddy', 'BALL! Twin lasers!', 2); }
      else if(k.type === 'bomb') { p.bombs = Math.min(9, p.bombs + 2); say(s, 'teddy', 'Two more bombs.', 1.6); }
      else if(k.type === 'ring') { secretStep(s, 1); }
      ev(s, 'pickup', {type: k.type, x: k.x, y: k.y, z: k.z});
    }
  }
}

/* ---------- a computer pilot ----------
   Flies the level the way a player would, from what a player could see.
   simcheck.mjs uses it to say whether the level is fair; ?auto=1 on the
   page lets it fly for you. skill 0..1: how quick and how accurate. */
export function autopilot(s, skill, opts){
  skill = skill == null ? 0.8 : skill;
  s.apSecret = opts && opts.secret != null ? opts.secret : skill >= 0.8;
  const p = s.p, inp = {sx: 0, sy: 0, sr: 0, fire: false, boost: false, brake: false, bomb: false, roll: 0, loop: false, uturn: false};
  if(p.dead || s.phase === 'won') return inp;
  const r = s.rand;   // shares the game's dice so a run is repeatable
  // a dodge, if something is about to hit
  for(const e of s.enemies) if(e.type === 'planet' && distP(s, e) < 60 && r() < skill * 0.2){ inp.roll = r() < 0.5 ? -1 : 1; break; }
  for(const b of s.bolts){
    const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z, d = len(dx, dy, dz);
    if(d < 45 * s.pace && (dx * b.vx + dy * b.vy + dz * b.vz) / (d * BOLT_SPEED * s.pace) > 0.97 && r() < skill * 0.5){ inp.roll = r() < 0.5 ? -1 : 1; break; }
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
  let tox = R.ox, toy = GROUND === 'space' ? 0 : 22, aimed = false;
  // a target ahead
  let best = null, bd = 1e9;
  for(const e of s.enemies){
    if(e.x < -9e4 || e.shielded) continue;
    const f = railFrame(R.u);
    const ahead = (e.x - p.x) * f.tx + (e.z - p.z) * f.tz;
    if(ahead < 40 || ahead > 420) continue;
    const score = ahead - (s.apSecret && e.type === 'buoy' ? 300 : 0);   // hunting the secret: buoys first
    if(score < (best ? best.score : 1e9)){ bd = ahead; best = e; best.score = score; }
  }
  if(best){
    const f = railFrame(R.u);
    tox = (best.x - f.x) * f.rx + (best.z - f.z) * f.rz;
    toy = best.y;
    // where the shots will be when they get that far: the nose tilts with the sliding
    const fwd = p.fx * f.tx + p.fz * f.tz, D = Math.max(1, bd);
    const hitLat = R.ox + (p.fx * f.rx + p.fz * f.rz) / fwd * D, hitY = R.oy + p.fy / fwd * D;
    if(Math.abs(tox - hitLat) < best.r + 3 && Math.abs(toy - hitY) < best.r + 3) aimed = true;
  } else {
    // something to pick up?
    for(const k of s.pickups){
      if(k.taken || k.u < R.u + 20 || k.u > R.u + 300) continue;
      if(k.type === 'bone' && p.shield > 85) continue;
      const f = railFrame(R.u);
      tox = (k.x - f.x) * f.rx + (k.z - f.z) * f.rz; toy = k.y; break;
    }
  }
  // the secret: rings to fly through, a fork to take
  let ringNear = false;
  if(s.apSecret){
    const ring = s.pickups.find(k => !k.taken && k.type === 'ring' && k.u > R.u + 10 && k.u < R.u + 260);
    ringNear = !!ring && ring.u < R.u + 150;
    if(ring){ const f = railFrame(R.u); tox = (ring.x - f.x) * f.rx + (ring.z - f.z) * f.rz; toy = ring.y; }
    const F = s.L.fork;
    if(F && !s.forkDecided && R.u > F.u0 - 300) tox = F.side * (halfW(R.u) - WALL_MARGIN - 3);
  } else if(s.L.fork && !s.forkDecided && R.u > s.L.fork.u0 - 300) tox = -s.L.fork.side * 10;   // stay in the main channel
  // a snowball rolling at us: get over it
  if(s.boss && s.boss.kind === 'snowball' && s.boss.ru - R.u < 140) toy = RAIL_TOP - 3;
  // the rocks come first
  for(const o of OBSTACLES){
    const ahead = o.u - R.u;
    if(ahead < -10 || ahead > 190) continue;
    if(o.type === 'arch'){ const under = archUnder(o, R.ox) - 9; if(toy > under) toy = under; }
    else if(o.type === 'rock'){
      const lat = railLat(o), clear = o.r + 10;
      if(Math.abs(tox - lat) < clear && Math.abs(toy - o.y) < clear){
        // round it whichever way is shorter: sideways or over/under
        const dx = clear - Math.abs(tox - lat), dy = clear - Math.abs(toy - o.y);
        if(dx < dy) tox = lat + (tox >= lat ? clear : -clear); else toy = o.y + (toy >= o.y ? clear : -clear);
      }
    } else {
      const lat = railLat(o), clear = o.r + 12;
      if(Math.abs(tox - lat) < clear && toy < spireTop(o) + 6){ const lim = halfW(o.u) - WALL_MARGIN; tox = lat + (tox >= lat ? clear : -clear); if(Math.abs(tox) > lim) tox = lat - Math.sign(tox - lat) * clear; }
    }
  }
  // lightning rings and catnip clouds
  for(const h of s.hazards){
    const ahead = lateralAhead(s, h);
    if(h.kind === 'strike' && !h.done && !ringNear){ const lat = railLat({x: h.x, z: h.z, u: -h.z}); if(Math.abs(tox - lat) < h.r + 8) tox = lat + (tox >= lat ? 1 : -1) * (h.r + 10); }
    if(h.kind === 'nip' && ahead > -10 && ahead < 200){ const lat = railLat({x: h.x, z: h.z, u: -h.z}); if(Math.abs(tox - lat) < h.r + 8 && Math.abs(toy - h.y) < h.r + 8) toy = h.y + (toy >= h.y ? 1 : -1) * (h.r + 10); }
  }
  const lim = halfW(R.u) - WALL_MARGIN;
  tox = clamp(tox, -lim, lim); toy = clamp(toy, RAIL_FLOOR + (best && best.type === 'buoy' ? 0 : 3), RAIL_TOP - 2);
  const jit = (1 - skill) * 4;
  if(s.steer === 'point'){
    // pointing: aim the nose so the slide it makes closes the gap
    // (the nose takes a moment to swing, so steer for where the ship will be)
    const g = 1.6 * (0.6 + skill * 0.6), v = s.p.speed * POINT.side, ahead = 0.3;
    const ang = want => Math.asin(clamp(want / v, -1, 1)) / POINT.max;
    inp.sx = clamp(ang((tox - R.ox - R.vx * ahead) * g) + (s.rand() - 0.5) * jit * 0.05, -1, 1);
    inp.sy = clamp(ang((toy - R.oy - R.vy * ahead) * g), -1, 1);
  } else {
    inp.sx = clamp((tox - R.ox) * 0.09 * (0.6 + skill * 0.6) - R.vx * 0.02 + (s.rand() - 0.5) * jit * 0.05, -1, 1);
    inp.sy = clamp((toy - R.oy) * 0.09 * (0.6 + skill * 0.6) - R.vy * 0.02, -1, 1);
  }
  trigger(s, inp, aimed || (best && bd < 300 && s.rand() < 0.3), false);
  return inp;
}
function lateralAhead(s, h){ const f = railFrame(s.p.rail.u); return (h.x - s.p.x) * f.tx + (h.z - s.p.z) * f.tz; }
function freePilot(s, inp, skill){
  const p = s.p;
  let best = null, bd = 1e9;
  for(const e of s.enemies){
    if(e.shielded) continue;
    let d = len(e.x - p.x, e.y - p.y, e.z - p.z);
    if(e.type === 'torpedo') d *= d < 200 ? 0.3 : 3;
    if(e.type === 'planet'){
      // only worth shooting if it is close and in front
      const inFront = ((e.x - p.x) * p.fx + (e.y - p.y) * p.fy + (e.z - p.z) * p.fz) / (d || 1);
      if(d > 160 || inFront < 0.6) continue;
      d *= 0.4;
    }
    if(e.type === 'part' || e.type === 'boss') d *= 0.7;
    if(e.hunt) d *= 0.5;   // a wingmate in trouble comes first
    if(e.type === 'cage' && s.apSecret) d *= 0.6;   // looking for the secret: the pups
    if(d < bd){ bd = d; best = e; }
  }
  let d = {x: p.fx, y: 0, z: p.fz};
  if(!best){
    // nothing yet: circle the middle
    d = {x: ARENA.x - p.x, y: 0, z: ARENA.z - p.z};
  } else {
    const t = bd / (SHOT_SPEED * s.pace);
    d = {x: best.x + (best.vx || 0) * t - p.x, y: best.y + (best.vy || 0) * t - p.y, z: best.z + (best.vz || 0) * t - p.z};
  }
  const dl = len(d.x, d.y, d.z) || 1;
  d = {x: d.x / dl, y: d.y / dl, z: d.z / dl};
  // a big target that sits still can't be circled into view: fly out, turn, come back on a run
  const ap = s.ap || (s.ap = {charging: false});
  const still = best && (best.type === 'boss' || best.type === 'part' || best.type === 'cage');
  if(still && bd < 110 && !ap.out){ ap.out = true; }
  if(ap.out && (!still || bd > 300)) ap.out = false;
  if(ap.out) d = norm({x: -d.x, y: 0.15, z: -d.z});
  // the ground and the rocks
  const g = Math.max(height(p.x, p.z), height(p.x + p.fx * 120, p.z + p.fz * 120));
  if(p.y < g + 55) d = norm({x: d.x, y: Math.max(d.y, 0.5), z: d.z});
  if(p.y < FLOOR + 70) d = norm({x: d.x, y: Math.max(d.y, 0.4), z: d.z});
  if(p.y > CEILING - 70) d = norm({x: d.x, y: Math.min(d.y, -0.3), z: d.z});
  // out of the lightning, away from the catnip
  for(const h of s.hazards){
    const dx = p.x - h.x, dz = p.z - h.z, dh = Math.hypot(dx, dz) || 1;
    if(h.kind === 'strike' && !h.done && h.t < 0.9 && dh < h.r + 10) d = norm({x: d.x + dx / dh * 1.1, y: d.y, z: d.z + dz / dh * 1.1});
    if(h.kind === 'nip'){ const dy = p.y - h.y, dd = len(dx, dy, dz) || 1; if(dd < h.r + 40) d = norm({x: d.x + dx / dd * 2, y: d.y + dy / dd * 2, z: d.z + dz / dd * 2}); }
  }
  // the rocks: look a second or two ahead, and go round (or over) the first one in the way
  for(const k of [0.5, 1, 1.6, 2.3]){
    const L = p.speed * k;
    if(best && L > bd - 25 && k > 0.5) break;     // nothing beyond what we're shooting at matters yet
    const ob = hitObstacle(p.x + p.fx * L, p.y + p.fy * L, p.z + p.fz * L, 22);
    if(ob && ob.type === 'rock'){
      const ax = p.x - ob.x, ay = p.y - ob.y, az = p.z - ob.z, al = len(ax, ay, az) || 1;
      d = norm({x: d.x + ax / al * 2.5 / k, y: d.y + ay / al * 2.5 / k, z: d.z + az / al * 2.5 / k});
      break;
    }
    if(ob && ob.type === 'spire'){
      const ax = p.x - ob.x, az = p.z - ob.z, al = Math.hypot(ax, az) || 1;
      // sideways, whichever way is already nearer, harder the closer it is
      const sideX = -p.fz, sideZ = p.fx, sgn = (ax * sideX + az * sideZ) >= 0 ? 1 : -1;
      const push = 2.5 / k;
      d = norm({x: d.x + sideX * sgn * push + ax / al * 0.5, y: Math.max(d.y, 0) + (p.y > spireTop(ob) - 40 ? 0.8 : 0.1), z: d.z + sideZ * sgn * push + az / al * 0.5});
      break;
    }
  }
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
  const big = best && (best.type === 'part' || best.type === 'boss' || best.type === 'raider' || best.type === 'ace' || best.type === 'mittensShip');
  trigger(s, inp, best && a < 0.06 + (1 - skill) * 0.04 && bd < 450, big && a < 0.3 && bd < 600 && s.rand() < 0.02 * skill);
  if(best && (best.type === 'part' || best.type === 'boss') && a < 0.05 && bd < 250 && p.bombs > 0 && s.rand() < 0.01) inp.bomb = true;
  return inp;
}
