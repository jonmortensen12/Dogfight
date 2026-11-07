/* Dogfight - the real page in Chromium. node playcheck.mjs

   1. The title screen loads with no errors, the ship and the canyon drawn.
   2. The tilt: pretend motion-sensor readings for a phone held sideways,
      turned like a steering wheel and tipped, steer the right way.
   3. A game from the FLY! button: the count, then the thumb buttons -
      FIRE shoots, BOOST speeds up, a swipe rolls.
   4. The computer flies the clearing (?auto=1&start=arena) and clears
      the first wave, with the radar and arrows drawn.
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
ok(steer.awayInverted > 0.4, 'inverted: tipped away noses up');
await pg.close();

console.log('\nA game, by hand');
pg = await page('?seed=4', {hasTouch: true});
await pg.click('#play');
await pg.waitForFunction(() => window.__dog.state === 'play', null, {timeout: 15000});
ok(true, 'FLY! counts in and the game starts');
const fire = await pg.$('#b-fire'), boost = await pg.$('#b-boost');
const fb = await fire.boundingBox(), bb = await boost.boundingBox();
const shotsBefore = await pg.evaluate(() => window.__dog.sim.stats.shots);
for(let i = 0; i < 3; i++){ await pg.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await pg.mouse.down(); await pg.waitForTimeout(60); await pg.mouse.up(); await pg.waitForTimeout(160); }
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

console.log('\nThe clearing, flown by the computer');
pg = await page('?auto=1&start=arena&seed=3');
await pg.waitForFunction(() => window.__dog.sim.mode === 'free', null, {timeout: 60000});
ok(true, 'the rail lets go at the clearing');
await pg.waitForFunction(() => window.__dog.sim.wave >= 1 && window.__dog.sim.enemies.length > 0, null, {timeout: 60000});
await pg.waitForTimeout(1500);
await pg.screenshot({path: '/tmp/dogfight-clearing.png'});
const w2 = await pg.waitForFunction(() => window.__dog.sim.wave >= 2, null, {timeout: 150000}).then(() => true, () => false);
ok(w2, 'the first wave is cleared and the second comes in');
await pg.close();

ok(errors.length === 0, 'no errors in the page' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
