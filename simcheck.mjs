/* Dogfight - the simulation, headless. node simcheck.mjs

   1. The canyon is flyable: the rail's box never runs into rock, and every
      arch leaves room to fly under it.
   2. The computer pilot (sim.js autopilot) flies the whole level at each
      difficulty and in both clearing styles, and the results land where
      they should: a sharp pilot clears Good Boy, a sloppy one clears Pup,
      Top Dog is a real fight, nothing goes NaN, the same seed plays the
      same game.
   Exits non-zero if anything that should hold does not. */
import {newSim, step, autopilot, SKILLS, LOOP, CHARGE} from './web/sim.js';
import {height, halfW, railFrame, OBSTACLES, archUnder, CANYON_END, RAIL_TOP, RAIL_FLOOR, WALL_MARGIN} from './web/terrain.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if(!cond) fails++; };

console.log('The canyon');
let worst = -1e9, worstU = 0;
for(let u = 0; u <= CANYON_END; u += 4){
  const f = railFrame(u), lim = halfW(u) - WALL_MARGIN;
  for(let ox = -lim; ox <= lim; ox += 2){
    const h = height(f.x + f.rx * ox, f.z + f.rz * ox);
    if(h > worst){ worst = h; worstU = u; }
  }
}
ok(worst < RAIL_TOP - 20, `rock inside the rail's box peaks at ${worst.toFixed(1)} m (u ${worstU}); the box is ${RAIL_FLOOR}-${RAIL_TOP} m`);
for(const o of OBSTACLES.filter(o => o.type === 'arch')){
  const lim = halfW(o.u) - WALL_MARGIN;
  const lowest = Math.min(archUnder(o, lim), archUnder(o, -lim));
  ok(lowest > RAIL_FLOOR + 14, `arch at u ${o.u}: ${lowest.toFixed(0)} m of room under it at the walls, ${archUnder(o, 0).toFixed(0)} m in the middle`);
}

function run(skill, style, pilot, seed, start){
  const s = newSim({skill, style, seed, start});
  const dt = 1 / 60;
  let t = 0, crashes = 0, arenaAt = null, shieldAtArena = null, nan = false;
  while(t < 600 && !s.done && !s.failed){
    step(s, dt, autopilot(s, pilot));
    for(const e of s.events) if(e.k === 'hurt' && e.why === 'crash') crashes++;
    s.events.length = 0;
    t += dt;
    if(arenaAt == null && s.mode === 'free'){ arenaAt = t; shieldAtArena = s.p.shield; }
    if(!Number.isFinite(s.p.x + s.p.y + s.p.z + s.p.fx + s.p.ux)) { nan = true; break; }
  }
  return {won: s.done, t, arenaAt, shieldAtArena, shield: s.p.shield, kills: s.stats.kills, crashes, nan,
    acc: s.stats.shots ? s.stats.hits / s.stats.shots : 0, wave: s.wave, x: s.p.x};
}
const fmt = r => `${r.won ? 'WON ' : 'lost'} in ${r.t.toFixed(0)} s, canyon ${r.arenaAt ? r.arenaAt.toFixed(0) + ' s (shield ' + r.shieldAtArena.toFixed(0) + ')' : 'not finished'}, shield ${r.shield.toFixed(0)}, ${r.kills} down, ${r.crashes} bumps, acc ${(r.acc * 100).toFixed(0)}%, wave ${r.wave}`;

const SEEDS = [3, 11, 29];
const table = {};
console.log('\nThe computer pilot, three games each');
for(const [skill, style, pilot, label] of [
  ['good', 'level', 0.85, 'sharp pilot, Good Boy, level'],
  ['good', 'full', 0.85, 'sharp pilot, Good Boy, full 3D'],
  ['pup', 'level', 0.5, 'sloppy pilot, Pup'],
  ['good', 'level', 0.5, 'sloppy pilot, Good Boy'],
  ['top', 'level', 0.85, 'sharp pilot, Top Dog'],
]){
  const rs = SEEDS.map(seed => run(skill, style, pilot, seed));
  table[label] = rs;
  console.log(' ' + label);
  for(const r of rs) console.log('    ' + fmt(r));
  ok(!rs.some(r => r.nan), 'nothing went NaN');
  ok(rs.every(r => r.arenaAt && r.arenaAt > 50 && r.arenaAt < 80), 'the canyon takes about a minute');
}
const wins = l => table[l].filter(r => r.won).length;
ok(wins('sharp pilot, Good Boy, level') >= 2, 'a sharp pilot clears Good Boy (at least 2 of 3)');
ok(wins('sloppy pilot, Pup') >= 2, 'a sloppy pilot clears Pup (at least 2 of 3)');
ok(wins('sharp pilot, Top Dog') <= 2, 'Top Dog is not a walkover (the sharp pilot loses at least 1 of 3)');
ok(table['sharp pilot, Good Boy, full 3D'].every(r => r.wave >= 2), 'full-3D flying works well enough for the computer to reach wave 2');
ok(table['sharp pilot, Good Boy, level'].every(r => r.shieldAtArena > 40), 'the canyon leaves a sharp pilot more than 40 shield');
const won = table['sharp pilot, Good Boy, level'].filter(r => r.won);
ok(won.every(r => r.t > 120 && r.t < 330), 'a winning run lasts 2 to 5.5 minutes');

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
const a = run('good', 'level', 0.85, 5), b = run('good', 'level', 0.85, 5);
ok(a.t === b.t && a.kills === b.kills && a.x === b.x, 'two runs with seed 5 match exactly');

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
