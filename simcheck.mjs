/* Dogfight - the simulation, headless. node simcheck.mjs

   1. Every level's rail is flyable: no rock inside the rail's box, room
      under every arch, and a gap through every row of spires or asteroids.
   2. The computer pilot (sim.js autopilot) flies every level of the
      adventure, with the wingmates who would be along by then, at the
      game's default speed: a sharp pilot clears Good Boy and a sloppy one
      clears Pup, on every planet. Top Dog is a real fight. Full 3D works.
   3. The story happens: wingmates join where they should, call for help
      and get saved, pups get rescued at the Kennel, Mittens has a second
      phase, the Moon can fall.
   4. The moves (loops, U-turns, the charge and lock, barrel rolls).
   5. The same seed plays the same game.
   Exits non-zero if anything that should hold does not. Takes a minute or two. */
import {newSim, step, autopilot, SKILLS, LOOP, CHARGE} from './web/sim.js';
import {setLevel, height, halfW, railFrame, railPoint, archUnder, spireR, spireTop, hitObstacle, RAIL_END, RAIL_TOP, RAIL_FLOOR, WALL_MARGIN, GROUND} from './web/terrain.js';
import * as T from './web/terrain.js';
import {LEVELS, ORDER} from './web/levels.js';
import {WINGS} from './web/cast.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if(!cond) fails++; };

console.log('Every rail is flyable');
for(const id of ORDER){
  const L = setLevel(LEVELS[id]);
  const end = L.railBossU || RAIL_END;
  let worst = -1e9, blocked = 0, tightest = 1e9;
  for(let u = 0; u <= end; u += 5){
    const lim = halfW(u) - WALL_MARGIN;
    if(GROUND !== 'space') for(let ox = -lim; ox <= lim; ox += 3){ const q = railPoint(u, ox, 0); worst = Math.max(worst, height(q.x, q.z)); }
    // is there a way through at this u? sample the box for a point clear of everything by 8 m
    let clear = 0, n = 0;
    for(let ox = -lim; ox <= lim; ox += 4) for(let y = Math.max(RAIL_FLOOR + 4, worst > -1e8 ? 6 : RAIL_FLOOR + 4); y <= RAIL_TOP - 4; y += 6){
      const q = railPoint(u, ox, y); n++;
      if(!hitObstacle(q.x, y, q.z, 8) && y > height(q.x, q.z) + 8) clear++;
    }
    if(clear === 0) blocked++;
    tightest = Math.min(tightest, clear / n);
  }
  const arches = T.OBSTACLES.filter(o => o.type === 'arch');
  const lowArch = arches.length ? Math.min(...arches.map(o => { const lim = halfW(o.u) - WALL_MARGIN; return Math.min(archUnder(o, lim), archUnder(o, -lim)); })) : null;
  ok((GROUND === 'space' || worst < RAIL_TOP - 20) && blocked === 0 && (lowArch == null || lowArch > RAIL_FLOOR + 14),
    `${LEVELS[id].name}: ${GROUND === 'space' ? 'space' : `rock in the box peaks at ${worst.toFixed(0)} m`}, ${T.OBSTACLES.length} obstacles, never blocked (tightest: ${(tightest * 100).toFixed(0)}% of the box clear)${lowArch != null ? `, lowest arch ${lowArch.toFixed(0)} m` : ''}`);
}

function allies(id){ const n = LEVELS[id].n; return WINGS.filter((w, i) => n >= [1, 3, 4][i]); }
function run(id, skill, style, pilot, seed, pace, start){
  const s = newSim({level: id, skill, style, seed, pace: pace || 1.25, start, allies: allies(id)});
  const dt = 1 / 60;
  let t = 0, crashes = 0, railT = null, railShield = null, nan = false;
  const seen = {join: 0, help: 0, rescue: 0, faces: 0, timeout: 0};
  while(t < 900 && !s.done && !s.failed){
    step(s, dt, autopilot(s, pilot));
    for(const e of s.events){
      if(e.k === 'hurt' && e.why === 'crash') crashes++;
      if(e.k in seen) seen[e.k]++;
      if(e.k === 'boom' && e.type === 'mittensFace') seen.faces++;
    }
    s.events.length = 0;
    t += dt;
    if(railT == null && (s.mode === 'free' || s.phase === 'railboss')){ railT = t; railShield = s.p.shield; }
    if(!Number.isFinite(s.p.x + s.p.y + s.p.z + s.p.fx + s.p.ux)){ nan = true; break; }
  }
  return {won: s.done, t, railT, railShield, shield: s.p.shield, kills: s.stats.kills, crashes, nan, seen, s,
    acc: s.stats.shots ? s.stats.hits / s.stats.shots : 0, why: s.failWhy, saved: s.stats.saved, rescued: s.stats.rescued, allies: s.allies.filter(a => !a.gone).map(a => a.id)};
}
const fmt = r => `${r.won ? 'WON ' : 'lost'} ${r.t.toFixed(0)} s (rail ${r.railT ? r.railT.toFixed(0) + ' s, shield ' + r.railShield.toFixed(0) : '-'}), shield ${r.shield.toFixed(0)}, ${r.kills} down, ${r.crashes} bumps, acc ${(r.acc * 100).toFixed(0)}%${r.why && !r.won ? ', ' + r.why : ''}`;

const SEEDS = [3, 11, 29];
const results = {};
console.log('\nThe adventure, flown by the computer at 1.25x, three games a planet');
for(const id of ORDER){
  const sharp = SEEDS.map(seed => run(id, 'good', 'level', 0.85, seed));
  const sloppy = SEEDS.map(seed => run(id, 'pup', 'level', 0.5, seed));
  results[id] = {sharp, sloppy};
  console.log(` ${LEVELS[id].n}. ${LEVELS[id].name}`);
  for(const r of sharp) console.log('    sharp, Good Boy: ' + fmt(r));
  for(const r of sloppy) console.log('    sloppy, Pup:     ' + fmt(r));
  ok(![...sharp, ...sloppy].some(r => r.nan), 'nothing went NaN');
  ok(sharp.filter(r => r.won).length >= 2, 'a sharp pilot clears it on Good Boy (2 of 3)');
  ok(sloppy.filter(r => r.won).length >= 2, 'a sloppy pilot clears it on Pup (2 of 3)');
  ok(sharp.filter(r => r.won).every(r => r.t > 60 && r.t < 420), 'a win takes 1 to 7 minutes');
}

console.log('\nTop Dog and full 3D');
const top = ['canyon', 'thunder', 'lair'].flatMap(id => SEEDS.map(seed => run(id, 'top', 'level', 0.85, seed)));
console.log('    Top Dog, sharp pilot (canyon, thunder, lair): ' + top.map(r => r.won ? 'W' : 'l').join(''));
ok(top.filter(r => !r.won).length >= 3, 'Top Dog is not a walkover (the sharp pilot loses at least 3 of 9)');
const full = ['canyon', 'yarn', 'lair'].flatMap(id => SEEDS.map(seed => run(id, 'good', 'full', 0.85, seed)));
console.log('    Full 3D, sharp pilot, Good Boy (canyon, yarn, lair): ' + full.map(r => r.won ? 'W' : 'l').join(''));
ok(full.filter(r => r.won).length >= 5, 'full-3D flying is winnable (at least 5 of 9)');

console.log('\nThe story happens');
const R = id => results[id].sharp.concat(results[id].sloppy);
ok(R('tidewater').some(r => r.seen.join && r.allies.includes('wing2')) && R('thunder').some(r => r.seen.join && r.allies.includes('wing2')), 'the second wingmate joins on Tidewater and on Thunder Peaks');
ok(R('kennel').some(r => r.rescued >= 3 && r.allies.includes('wing3')), 'pups are rescued at the Kennel, and the third wingmate with them');
ok(R('frost').some(r => r.seen.join && r.allies.includes('wing3')), 'the third wingmate is found on Frost Fang');
ok(ORDER.some(id => R(id).some(r => r.seen.help && r.saved)), 'a wingmate calls for help and gets saved');
ok(R('lair').some(r => r.won && r.seen.faces === 1), "Mittens' face breaks and the chase is on before she is beaten");
{
  // the Moon falls if you dawdle
  const s = newSim({level: 'moonfall', seed: 5, start: 'arena', pace: 1.25});
  let t = 0, fell = false;
  while(t < 400 && !s.failed){ step(s, 1 / 60, {}); for(const e of s.events) if(e.k === 'timeout') fell = true; s.events.length = 0; t += 1 / 60; }
  ok(fell && s.failWhy.includes('Moon'), `doing nothing at Moonfall, the Moon falls (after ${t.toFixed(0)} s)`);
}

console.log('\nThe moves');
{
  // the rail loop: up, over (facing back), down, and the rail waits
  const s = newSim({seed: 1});
  const go = (n, inp) => { let hurt = 0; for(let i = 0; i < n; i++){ step(s, 1 / 60, inp || {}); for(const e of s.events) if(e.k === 'hurt') hurt += e.n; s.events.length = 0; } return hurt; };
  go(60 * 8);
  const u0 = s.p.rail.u, oy0 = s.p.rail.oy, ox0 = s.p.rail.ox;
  go(1, {loop: true});
  let backwards = 1, top = 0;
  for(let i = 0; i < 60 * LOOP.railDur; i++){ go(1); backwards = Math.min(backwards, s.p.fz * -1); top = Math.max(top, s.p.y); }
  go(2);
  ok(backwards < -0.9, `rail loop: faces backwards at the top (forward ${(-backwards).toFixed(2)} along the canyon's way back)`);
  ok(Math.abs(s.p.rail.oy - oy0) < 1 && Math.abs(s.p.rail.ox - ox0) < 1, `rail loop: comes out where it went in (${oy0.toFixed(0)} m up, ${(top - oy0).toFixed(0)} m high loop)`);
  ok(s.p.rail.u - u0 < 10, `rail loop: the rail waits (moved ${(s.p.rail.u - u0).toFixed(1)} m in ${LOOP.railDur} s)`);
}
for(const style of ['level', 'full']){
  const s = newSim({seed: 1, start: 'arena', style});
  let n = 0;
  while(s.mode !== 'free' && n++ < 2000) step(s, 1 / 60, {});
  s.enemies = []; s.wave = 9; s.waveT = -1;   // a quiet sky
  s.p.y = 250; s.p.pitch = 0; s.p.fy = 0;
  step(s, 1 / 60, {});
  const f0 = {x: s.p.fx, z: s.p.fz}, y0 = s.p.y;
  step(s, 1 / 60, {loop: true});
  for(let i = 0; i < 60 * LOOP.freeDur + 5; i++) step(s, 1 / 60, {});
  ok(s.p.fx * f0.x + s.p.fz * f0.z > 0.98 && s.p.uy > 0.97, `${style}: a loop comes out the same way, right way up (up ${s.p.uy.toFixed(2)})`);
  const f1 = {x: s.p.fx, z: s.p.fz};
  step(s, 1 / 60, {uturn: true});
  let inverted = 1;
  for(let i = 0; i < 60 * (LOOP.uturnUp + LOOP.uturnRoll) + 5; i++){ step(s, 1 / 60, {}); inverted = Math.min(inverted, s.p.uy); }
  ok(s.p.fx * f1.x + s.p.fz * f1.z < -0.98 && s.p.uy > 0.97 && inverted < -0.9, `${style}: a U-turn goes up and over (upside down at the top), rolls upright, and faces back`);
  s.events.length = 0;
}
{
  // charge and lock: hold FIRE with an enemy ahead, let go, a homing shot
  const s = newSim({seed: 2, start: 'arena'});
  let n = 0;
  while(s.mode !== 'free' && n++ < 2000) step(s, 1 / 60, {});
  s.enemies = []; s.wave = 9; s.waveT = -1; s.p.y = 200; s.p.pitch = 0;
  step(s, 1 / 60, {});
  const p = s.p;
  s.enemies.push({id: 999, type: 'dart', x: p.x + p.fx * 300 + 12, y: p.y + 6, z: p.z + p.fz * 300, fx: 0, fy: 0, fz: 1, r: 3.2, hp: 50, maxHp: 50, t: 0, fireT: 99, burst: 0, state: 'extend', extT: 99, goal: {x: p.x + p.fx * 2000, y: p.y, z: p.z + p.fz * 2000}, speed: 1, bank: 0, ph: 0, flash: 0});
  for(let i = 0; i < 20; i++) step(s, 1 / 60, {fire: true});
  ok(p.lock == null, 'a short hold has no lock');
  for(let i = 0; i < 60; i++) step(s, 1 / 60, {fire: true});
  ok(p.charge >= 1 && p.lock === 999, `held for ${(80 / 60).toFixed(1)} s: charged and locked on`);
  step(s, 1 / 60, {});
  const m = s.missiles[0];
  ok(m && m.target === 999, 'let go: a homing charged shot');
  for(let i = 0; i < 120 && s.missiles.length; i++) step(s, 1 / 60, {});
  ok(s.enemies[0] && s.enemies[0].hp <= 50 - CHARGE.dmg, `it hits for ${CHARGE.dmg}`);
  const shots = s.stats.shots;
  for(let i = 0; i < 30; i++) step(s, 1 / 60, {fire: i % 10 < 5});
  ok(s.stats.shots - shots === 3, `three taps, three shots (${s.stats.shots - shots})`);
  step(s, 1 / 60, {bomb: true});
  ok(s.bombs.length === 1 && s.missiles.length === 0, 'a bomb goes straight: no lock');
  // a barrel roll knocks a bolt away
  s.bolts.push({x: p.x + p.fx * 30, y: p.y, z: p.z + p.fz * 30, vx: -p.fx * 125, vy: 0, vz: -p.fz * 125, life: 4, dmg: 7});
  const sh = p.shield;
  let deflect = 0;
  step(s, 1 / 60, {roll: 1});
  for(let i = 0; i < 20; i++){ step(s, 1 / 60, {}); deflect += s.events.filter(e => e.k === 'deflect').length; s.events.length = 0; }
  ok(deflect === 1 && p.shield === sh, 'a barrel roll knocks an incoming bolt away');
}

console.log('\nSame seed, same game');
const a = run('jungle', 'good', 'level', 0.85, 5), b = run('jungle', 'good', 'level', 0.85, 5);
ok(a.t === b.t && a.kills === b.kills && a.s.p.x === b.s.p.x, 'two runs of Catnip Jungle with seed 5 match exactly');

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
