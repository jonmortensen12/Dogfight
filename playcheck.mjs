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
// `back` degrees from upright, turned `wheel` degrees clockwise. Built in
// the W3C earth frame and turned into the alpha/beta/gamma a phone reports.
const steer = await pg.evaluate(async () => {
  const THREE = await import('three');
  const D = Math.PI / 180;
  function pose(back, wheel){
    let q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (90 - back) * D).multiply(q);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    q = new THREE.Quaternion().setFromAxisAngle(n, -wheel * D).multiply(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'ZXY');
    return {alpha: e.z / D, beta: e.x / D, gamma: e.y / D};
  }
  // the page reads the screen's angle: pretend it is sideways
  Object.defineProperty(screen.orientation, 'angle', {get: () => 90, configurable: true});
  const inp = window.__dog.input;
  const send = (back, wheel) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), pose(back, wheel)));
  const out = {};
  send(40, 0); inp.centre();
  for(const [k, b, w] of [['still', 40, 0], ['right', 40, 18], ['left', 40, -18], ['away', 55, 0], ['toward', 25, 0]]){
    send(b, w); const r = inp.read(); out[k] = {sx: r.sx, sy: r.sy};
  }
  inp.invert = true; send(55, 0); out.awayInverted = inp.read().sy; inp.invert = false;
  return out;
});
ok(Math.abs(steer.still.sx) < 0.01 && Math.abs(steer.still.sy) < 0.01, 'held still where it was centred: no steering');
ok(steer.right.sx > 0.4, `turned clockwise: steers right (${steer.right.sx.toFixed(2)})`);
ok(steer.left.sx < -0.4, `turned anticlockwise: steers left (${steer.left.sx.toFixed(2)})`);
ok(steer.away.sy < -0.4, `top tipped away: dives (${steer.away.sy.toFixed(2)})`);
ok(steer.toward.sy > 0.4, `top tipped towards you: climbs (${steer.toward.sy.toFixed(2)})`);
ok(steer.awayInverted > 0.4, 'inverted: tipped away climbs');
await pg.close();

console.log('\nA game, by hand');
pg = await page('?seed=4', {hasTouch: true});
await pg.click('#play');
await pg.waitForFunction(() => window.__dog.state === 'play', null, {timeout: 15000});
ok(true, 'FLY! counts in and the game starts');
const fire = await pg.$('#b-fire'), boost = await pg.$('#b-boost');
const fb = await fire.boundingBox(), bb = await boost.boundingBox();
const shotsBefore = await pg.evaluate(() => window.__dog.sim.stats.shots);
await pg.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2); await pg.mouse.down();
await pg.waitForTimeout(1200);
await pg.mouse.up();
const shots = await pg.evaluate(() => window.__dog.sim.stats.shots) - shotsBefore;
ok(shots > 3, `holding FIRE shoots (${shots} shots)`);
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
