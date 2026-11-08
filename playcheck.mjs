/* Dogfight - the real page in Chromium. node playcheck.mjs

   1. The title screen loads with no errors, the ship and the canyon drawn.
   2. The tilt: pretend motion-sensor readings for a phone held sideways,
      turned like a steering wheel and tipped, steer the right way.
   3. A game from the FLY! button: the count, then the thumb buttons -
      FIRE shoots, BOOST speeds up, a swipe rolls.
   4. The computer flies the clearing (?auto=1&start=arena) and clears
      the first wave, with the radar and arrows drawn.
   5. The adventure: the route map, a briefing, a level won, the map
      moving on, and every planet loading and drawing without an error.
   Screenshots go to /tmp/dogfight-*.png. Takes about a minute. */
import {createRequire} from 'node:module';
import {serve} from './tools/serve.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if(!cond) fails++; };

const srv = await serve(0);
const base = `http://localhost:${srv.address().port}/index.html`;
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const errors = [];
async function page(q, opts){
  const ctx = await browser.newContext(Object.assign({viewport: {width: 844, height: 390}}, opts || {}));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push(e.message));
  pg.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await pg.goto(base + (q || ''));
  await pg.waitForFunction(() => window.__dog && window.__dog.state, null, {timeout: 30000});
  return pg;
}

console.log('Title');
let pg = await page('');
await pg.waitForTimeout(1500);
ok(await pg.isVisible('#title'), 'the title screen shows');
const tris = await pg.evaluate(() => new Promise(r => {
  const R = window.__dog.world.renderer; R.info.autoReset = false; R.info.reset();
  requestAnimationFrame(() => requestAnimationFrame(() => { const n = R.info.render.triangles; R.info.autoReset = true; r(n); }));
}));
ok(tris > 10000, `the canyon and the ship are drawn (${tris} triangles a frame)`);
await pg.screenshot({path: '/tmp/dogfight-title.png'});

console.log('\nTilt');
// A phone held sideways (top to the left), screen to the player, tipped back
// 40 degrees from upright. Then turned about its own axes the way a player
// would: left side pulled closer, top tipped away or towards, turned like a
// steering wheel. Built in the W3C earth frame and turned into the
// alpha/beta/gamma a phone reports.
const steer = await pg.evaluate(async () => {
  const THREE = await import('three');
  const D = Math.PI / 180;
  // held sideways, top to the left: the screen's right is the device's -y,
  // the screen's up is the device's +x, out of the screen is +z
  const AX = {up: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(0, -1, 0), out: new THREE.Vector3(0, 0, 1)};
  function pose(turns){
    let q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 50 * D).multiply(q);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 37 * D));   // facing some compass way
    for(const [axis, deg] of turns) q.multiply(new THREE.Quaternion().setFromAxisAngle(AX[axis], deg * D));
    const e = new THREE.Euler().setFromQuaternion(q, 'ZXY');
    return {alpha: (e.z / D + 360) % 360, beta: e.x / D, gamma: e.y / D};
  }
  Object.defineProperty(screen.orientation, 'angle', {get: () => 90, configurable: true});
  const inp = window.__dog.input;
  const send = turns => window.dispatchEvent(Object.assign(new Event('deviceorientation'), pose(turns)));
  send([]); inp.centre();
  const out = {};
  for(const [k, turns] of [['still', []], ['leftCloser', [['up', 15]]], ['rightCloser', [['up', -15]]],
    ['topAway', [['right', -15]]], ['topToward', [['right', 15]]], ['wheelRight', [['out', -20]]], ['wheelLeft', [['out', 20]]]]){
    send(turns); const r = inp.read(); out[k] = {sx: r.sx, sy: r.sy, sr: r.sr};
  }
  // rolled over like a wheel and THEN steered: about the phone's own axes
  for(const [k, turns] of [['rolledAway', [['out', -30], ['right', -15]]], ['rolledLeft', [['out', -30], ['up', 15]]]]){
    send(turns); const r = inp.read(); out[k] = {sx: r.sx, sy: r.sy, sr: r.sr};
  }
  inp.wheel = false; send([['out', -20]]); out.noWheel = inp.read().sr;
  inp.held.bankR = 1; out.bankR = inp.read().sr; inp.held = {}; inp.wheel = true;
  inp.invert = true; send([['right', -15]]); out.awayInverted = inp.read().sy; inp.invert = false;
  return out;
});
const f = o => `turn ${o.sx.toFixed(2)}, nose ${o.sy.toFixed(2)}, roll ${o.sr.toFixed(2)}`;
const small = v => Math.abs(v) < 0.08;
ok(small(steer.still.sx) && small(steer.still.sy) && small(steer.still.sr), 'held still where it was centred: nothing');
ok(steer.leftCloser.sx < -0.4 && small(steer.leftCloser.sr), `left side pulled closer: turns left, no roll (${f(steer.leftCloser)})`);
ok(steer.rightCloser.sx > 0.4 && small(steer.rightCloser.sr), `right side pulled closer: turns right (${f(steer.rightCloser)})`);
ok(steer.topAway.sy < -0.4 && small(steer.topAway.sx), `top tipped away: nose down (${f(steer.topAway)})`);
ok(steer.topToward.sy > 0.4 && small(steer.topToward.sx), `top tipped towards you: nose up (${f(steer.topToward)})`);
ok(steer.wheelRight.sr > 0.3 && small(steer.wheelRight.sx), `turned clockwise like a wheel: rolls right, does not turn (${f(steer.wheelRight)})`);
ok(steer.wheelLeft.sr < -0.3 && small(steer.wheelLeft.sx), `turned anticlockwise: rolls left (${f(steer.wheelLeft)})`);
ok(steer.rolledAway.sy < -0.4 && Math.abs(steer.rolledAway.sx) < 0.15, `rolled 30 degrees, then top tipped away: still just dives (${f(steer.rolledAway)})`);
ok(steer.rolledLeft.sx < -0.4 && Math.abs(steer.rolledLeft.sy) < 0.15, `rolled 30 degrees, then left side closer: still just turns left (${f(steer.rolledLeft)})`);
ok(small(steer.noWheel) && steer.bankR > 0.9, `Wheel off: turning like a wheel does nothing, the BANK button rolls (${steer.noWheel.toFixed(2)}, ${steer.bankR.toFixed(2)})`);
ok(steer.awayInverted > 0.4, 'inverted: tipped away noses up');
await pg.close();

/* Start a game: from the adventure (the map, Red Canyon, the briefing), or a
   level straight from the URL (?level=...) by skipping its briefing. */
async function startGame(pg){
  if(await pg.evaluate(() => new URLSearchParams(location.search).has('level'))){
    await pg.waitForSelector('#brief:not(.hide)', {timeout: 15000});
    await pg.click('#briefskip');
  } else {
    await pg.click('#adventure');
    await pg.waitForSelector('#map:not(.hide)');
    await pg.click('.node[data-id="canyon"]');
    await pg.click('#launch');
    await pg.waitForSelector('#brief:not(.hide)');
    await pg.click('#briefskip');
  }
  await pg.waitForFunction(() => window.__dog.state === 'play', null, {timeout: 15000});
}

console.log('\nA game, by hand');
pg = await page('?seed=4', {hasTouch: true});
await startGame(pg);
ok(true, 'ADVENTURE, the map, Red Canyon, the briefing, the count - and the game starts');
const fire = await pg.$('#b-fire'), boost = await pg.$('#b-boost');
const fb = await fire.boundingBox(), bb = await boost.boundingBox();
const shotsBefore = await pg.evaluate(() => window.__dog.sim.stats.shots);
for(let i = 0; i < 3; i++){ await pg.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(60); await pg.mouse.up(); await pg.waitForTimeout(450); }
const taps = await pg.evaluate(() => window.__dog.sim.stats.shots) - shotsBefore;
ok(taps === 3, `three taps of FIRE, three shots (${taps})`);
await pg.mouse.down();
const charged = await pg.waitForFunction(() => window.__dog.sim.p.charge >= 1, null, {timeout: 5000}).then(() => true, () => false);
ok(charged, 'holding FIRE charges a shot');
await pg.mouse.up();
ok(await pg.waitForFunction(() => window.__dog.sim.stats.charged >= 1, null, {timeout: 2000}).then(() => true, () => false), 'letting go fires it');
const lb = await (await pg.$('#b-loop')).boundingBox();
await pg.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(80); await pg.mouse.up();
ok(await pg.waitForFunction(() => window.__dog.sim.p.man && window.__dog.sim.p.man.kind === 'loop', null, {timeout: 1500}).then(() => true, () => false), 'LOOP loops, on the rail');
await pg.waitForFunction(() => !window.__dog.sim.p.man, null, {timeout: 15000});
const sp0 = await pg.evaluate(() => window.__dog.sim.p.speed);
await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await pg.mouse.down();
await pg.waitForTimeout(1500);
const sp1 = await pg.evaluate(() => window.__dog.sim.p.speed);
await pg.mouse.up();
ok(sp1 > sp0 + 10, `holding BOOST speeds up (${sp0.toFixed(0)} -> ${sp1.toFixed(0)} m/s)`);
await pg.mouse.move(470, 120); await pg.mouse.down(); await pg.mouse.move(580, 125, {steps: 3}); await pg.mouse.up();
ok(await pg.waitForFunction(() => window.__dog.sim.p.rollT > 0, null, {timeout: 1500}).then(() => true, () => false), 'a sideways swipe barrel-rolls');
await pg.screenshot({path: '/tmp/dogfight-canyon.png'});
await pg.click('#b-pause');
await pg.waitForTimeout(200);
ok(await pg.evaluate(() => window.__dog.state === 'pause') && await pg.isVisible('#pause'), 'the pause button pauses');
await pg.close();

console.log('\nThe camera through the moves');
// Where Teddy's ship sits on the screen, every frame of a move. A camera
// that swings or lags makes it jump; the old one jumped 40-70 px in a
// frame going over the top of a loop.
async function onScreen(pg, press, frames){
  return pg.evaluate(async ([press, frames]) => {
    const d = window.__dog, xs = [];
    d.input.press[press] = true;
    for(let i = 0; i < frames; i++){ await new Promise(r => requestAnimationFrame(r)); const p = d.sim.p, q = d.world.project(p.x, p.y, p.z); xs.push([q.x, q.y]); }
    let jump = 0, lo = 1e9, hi = -1e9;
    for(let i = 1; i < xs.length; i++){ jump = Math.max(jump, Math.hypot(xs[i][0] - xs[i - 1][0], xs[i][1] - xs[i - 1][1])); lo = Math.min(lo, xs[i][1]); hi = Math.max(hi, xs[i][1]); }
    return {jump, travel: hi - lo};
  }, [press, frames]);
}
const steady = async pg => { const t0 = await pg.evaluate(() => window.__dog.sim.t); await pg.waitForFunction(t0 => window.__dog.sim.t > t0 + 1.5, t0, {timeout: 60000, polling: 100}); };
pg = await page('?seed=6&skill=pup', {hasTouch: true});
await startGame(pg);
await steady(pg);
let m = await onScreen(pg, 'loop', 60);
ok(m.jump < 20, `rail loop: the ship moves at most ${m.jump.toFixed(0)} px in a frame`);
await pg.waitForFunction(() => !window.__dog.sim.p.man, null, {timeout: 20000});
m = await onScreen(pg, 'rollR', 25);
ok(m.jump < 20, `rail barrel roll: at most ${m.jump.toFixed(0)} px in a frame`);
await pg.close();
for(const style of ['level', 'full']){
  pg = await page(`?level=canyon&seed=6&skill=pup&start=arena&style=${style}`, {hasTouch: true});
  await startGame(pg);
  await pg.waitForFunction(() => window.__dog.sim.mode === 'free', null, {timeout: 60000});
  await pg.evaluate(() => { const s = window.__dog.sim; s.wave = 9; s.waveT = -1; s.enemies = []; s.p.y = 250; });
  await steady(pg);
  m = await onScreen(pg, 'loop', 70);
  ok(m.jump < 20 && m.travel < 40, `${style}: through a loop the ship moves at most ${m.jump.toFixed(0)} px a frame, ${m.travel.toFixed(0)} px in all`);
  await pg.waitForFunction(() => !window.__dog.sim.p.man, null, {timeout: 20000});
  m = await onScreen(pg, 'uturn', 60);
  ok(m.jump < 20 && m.travel < 40, `${style}: through a U-turn, at most ${m.jump.toFixed(0)} px a frame, ${m.travel.toFixed(0)} px in all`);
  m = await onScreen(pg, 'rollR', 25);
  ok(m.jump < 20, `${style}: a barrel roll, at most ${m.jump.toFixed(0)} px a frame`);
  await pg.close();
}

console.log('\nThe clearing, flown by the computer');
pg = await page('?auto=1&level=canyon&start=arena&seed=3');
await pg.waitForFunction(() => window.__dog.sim.mode === 'free', null, {timeout: 60000});
ok(true, 'the rail lets go at the clearing');
await pg.waitForFunction(() => window.__dog.sim.wave >= 1 && window.__dog.sim.enemies.length > 0, null, {timeout: 60000});
await pg.waitForTimeout(1500);
await pg.screenshot({path: '/tmp/dogfight-clearing.png'});
const w2 = await pg.waitForFunction(() => window.__dog.sim.wave >= 2, null, {timeout: 150000}).then(() => true, () => false);
ok(w2, 'the first wave is cleared and the second comes in');
await pg.close();

console.log('\nThe adventure');
pg = await page('?seed=8', {hasTouch: true});
await pg.evaluate(() => localStorage.removeItem('dogfight-save'));
await pg.reload();
await pg.waitForFunction(() => window.__dog && window.__dog.state === 'title');
await pg.click('#adventure');
await pg.waitForSelector('#map:not(.hide)');
ok(await pg.evaluate(() => document.querySelectorAll('.node.next').length === 1 && !!document.querySelector('.node.next[data-id="canyon"]')), 'a new adventure starts with Red Canyon the only planet open');
await pg.click('.node[data-id="canyon"]');
await pg.click('#launch');
await pg.waitForSelector('#brief:not(.hide)');
const lines = [];
for(let i = 0; i < 8; i++){
  if(await pg.isHidden('#brief')) break;
  lines.push(await pg.textContent('#briefwho'));
  await pg.click('#briefnext');
}
ok(lines.length >= 3 && lines.includes('TEDDY') && lines.some(l => l.startsWith('ROSIE')), `the briefing plays on the radio (${lines.join(', ')})`);
await pg.waitForFunction(() => window.__dog.state === 'play', null, {timeout: 15000});
// win it on the spot: the boss is beaten
await pg.evaluate(() => { const s = window.__dog.sim; s.phase = 'won'; s.clearT = 5.9; s.events.push({k: 'won'}); });
await pg.waitForSelector('#result:not(.hide)', {timeout: 20000});
ok(await pg.evaluate(() => window.__dog.save.flown.includes('canyon')), 'winning Red Canyon is saved');
await pg.click('#again');
await pg.waitForSelector('#map:not(.hide)');
const open = await pg.evaluate(() => [...document.querySelectorAll('.node.next')].map(n => n.dataset.id).sort().join(','));
ok(open === 'tidewater', `the map moves on: no secret found, so Tidewater is next (${open})`);
await pg.close();

pg = await page('');
const planets = await pg.evaluate(() => Object.keys(window.__dog.LEVELS));
await pg.close();
for(const id of planets){
  pg = await page(`?auto=1&level=${id}&seed=2`);
  await pg.waitForFunction(() => window.__dog.state === 'play' && window.__dog.sim.t > 1.5, null, {timeout: 60000, polling: 200});
  const tris = await pg.evaluate(() => new Promise(r => {
    const R = window.__dog.world.renderer; R.info.autoReset = false; R.info.reset();
    requestAnimationFrame(() => requestAnimationFrame(() => { const n = R.info.render.triangles; R.info.autoReset = true; r(n); }));
  }));
  await pg.screenshot({path: `/tmp/dogfight-${id}.png`});
  ok(tris > 2000, `${id}: loads and draws (${tris} triangles a frame)`);
  await pg.close();
}

ok(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
