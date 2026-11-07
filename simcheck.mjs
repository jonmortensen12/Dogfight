/* Dogfight - the simulation, headless. node simcheck.mjs

   1. The canyon is flyable: the rail's box never runs into rock, and every
      arch leaves room to fly under it.
   2. The computer pilot (sim.js autopilot) flies the whole level at each
      difficulty and in both clearing styles, and the results land where
      they should: a sharp pilot clears Good Boy, a sloppy one clears Pup,
      Top Dog is a real fight, nothing goes NaN, the same seed plays the
      same game.
   Exits non-zero if anything that should hold does not. */
import {newSim, step, autopilot, SKILLS} from './web/sim.js';
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

console.log('\nSame seed, same game');
const a = run('good', 'level', 0.85, 5), b = run('good', 'level', 0.85, 5);
ok(a.t === b.t && a.kills === b.kills && a.x === b.x, 'two runs with seed 5 match exactly');

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
