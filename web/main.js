/* Dogfight - the page: screens, the loop, sound, settings.

   URL options, for trying things quickly:
     ?start=arena   begin at the clearing        ?skill=pup|good|top
     ?style=full    full-3D flying in the clearing
     ?auto=1        the computer flies (the checks use this)
     ?low=1         low graphics                 ?seed=N */
import {newSim, step, autopilot, SKILLS} from './sim.js';
import {World} from './world.js';
import {Hud, drawTeddy} from './hud.js';
import {Input} from './input.js';
import * as snd from './sound.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
if(!touch) document.body.classList.add('desktop');

/* ---------- settings, kept on this device ---------- */
const S = {skill: 'good', style: 'level', sens: '1', invert: false, start: 'canyon', pace: '1.25'};
try { Object.assign(S, JSON.parse(localStorage.getItem('dogfight') || '{}')); } catch(e){}
for(const k of ['skill', 'style', 'start', 'pace']) if(qs.get(k)) S[k] = qs.get(k);
const save = () => { try { localStorage.setItem('dogfight', JSON.stringify(S)); } catch(e){} };
const AUTO = qs.get('auto') === '1';

const world = new World($('view'), {low: qs.get('low') === '1'});
const hud = new Hud($('hud'));
const input = new Input(document.body);
drawTeddy($('tface').getContext('2d'), 128);

let sim = newSim({skill: S.skill, style: S.style, pace: +S.pace, seed: +qs.get('seed') || 7});
let state = 'title';
const view = {target: null};
window.__dog = {get sim(){ return sim; }, world, hud, input, get state(){ return state; }};

/* ---------- the option chips ---------- */
function paintChips(){
  for(const c of document.querySelectorAll('.chip')){
    const k = c.dataset.opt, v = c.dataset.v;
    c.classList.toggle('on', k === 'invert' ? !!S.invert : String(S[k]) === v);
  }
  input.sens = +S.sens; input.invert = !!S.invert;
}
for(const c of document.querySelectorAll('.chip')) c.addEventListener('click', () => {
  const k = c.dataset.opt;
  if(k === 'invert') S.invert = !S.invert; else S[k] = c.dataset.v;
  if(k === 'style'){ sim.style = S.style; if(sim.mode === 'free'){ sim.p.bank = 0; } }
  if(k === 'pace') sim.pace = +S.pace;
  save(); paintChips(); snd.sfx('click');
});
paintChips();

function screen(id){ for(const s of ['title', 'calib', 'pause', 'result']) $(s).classList.toggle('hide', s !== id); }
function controls(on){ $('controls').classList.toggle('hide', !on); input.enabled = on; }

/* ---------- starting ---------- */
async function play(from){
  snd.unlock();
  if(touch){
    try { await document.documentElement.requestFullscreen({navigationUI: 'hide'}); await screen_lock(); } catch(e){}
  }
  const ok = await Input.ask();
  sim = newSim({skill: S.skill, style: S.style, pace: +S.pace, start: from || S.start, seed: +qs.get('seed') || (Math.random() * 1e9) | 0});
  world.snap = true; view.target = null; document.body.classList.remove('target-on', 'free');
  hud.queue = []; hud.radio = null; hud.banner = null;
  if(AUTO){ go(); return; }
  // centre the tilt: a short count while the phone is held still
  state = 'calib'; screen('calib');
  let n = 3;
  $('count').textContent = n;
  $('calibmsg').textContent = 'Sideways, both thumbs on the screen. Keep it still - that\'s "straight and level".';
  const tick = setInterval(() => {
    n--;
    if(n === 1 && !input.live()){
      $('calibmsg').textContent = ok === false ? 'Motion was not allowed, so steer by dragging a thumb on the left half of the screen (or the arrow keys).'
        : 'No motion sensor here: drag a thumb on the left half to steer, or use the arrow keys, Space to fire, Shift to boost.';
    }
    $('count').textContent = n > 0 ? n : 'GO!';
    if(n > 0) snd.sfx('click');
    if(n <= 0){ clearInterval(tick); input.centre(); go(); }
  }, 750);
}
async function screen_lock(){ try { await screen.orientation.lock('landscape'); } catch(e){} }
function go(){
  state = 'play'; screen(null); controls(true);
  hud.show(sim.mode === 'rail' ? 'RED CANYON' : 'THE CLEARING', sim.mode === 'rail' ? 'Point the phone to steer · tap FIRE · hold it to charge' : '', 2.6);
  snd.cue('count');
}
function pause(){ if(state !== 'play') return; state = 'pause'; screen('pause'); controls(false); }
function resume(){ state = 'play'; screen(null); controls(true); }
function toTitle(){
  state = 'title'; controls(false); screen('title');
  sim = newSim({skill: S.skill, style: S.style, pace: +S.pace}); world.snap = true;
}
function finish(won){
  state = 'over'; controls(false);
  const st = sim.stats;
  $('rtitle').textContent = won ? 'Mission complete!' : 'Teddy\'s down!';
  const acc = st.shots ? Math.round(100 * st.hits / st.shots) : 0;
  let rank = '';
  if(won){
    rank = st.damage < 40 && acc > 30 && st.gold === st.goldTotal ? 'TOP DOG' : st.damage < 120 ? 'GOOD BOY' : 'GOOD PUP';
  }
  $('rank').textContent = won ? 'Rank: ' + rank : 'He\'s fine - he bailed out. Again?';
  const mm = Math.floor(st.time / 60), ss = Math.floor(st.time % 60);
  $('rtable').innerHTML = [
    ['Time', mm + ':' + String(ss).padStart(2, '0')], ['Shot down', st.kills], ['Accuracy', acc + '%'],
    ['Golden bones', st.gold + ' / ' + st.goldTotal], ['Damage taken', Math.round(st.damage)],
    ['Difficulty', SKILLS[sim.skill].name], ['Speed', sim.pace + '×'], ['Clearing flown', sim.style === 'full' ? 'Full 3D' : 'Level horizon'],
  ].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  const other = S.style === 'full' ? 'level' : 'full';
  $('other').textContent = won ? 'Try ' + (other === 'full' ? 'Full 3D' : 'Level horizon') : 'Retry from the clearing';
  $('other').classList.toggle('hide', !won && sim.checkpoint !== 'arena' && sim.mode !== 'free');
  $('other').onclick = () => { if(won){ S.style = other; save(); paintChips(); play('arena'); } else play('arena'); };
  $('again').textContent = won ? 'FLY AGAIN' : 'FROM THE START';
  setTimeout(() => screen('result'), won ? 300 : 0);
}
$('play').onclick = () => play();
$('resume').onclick = resume;
$('recentre').onclick = () => { input.centre(); hud.show('Tilt centred', '', 1.2); resume(); };
$('restart').onclick = () => play(sim.mode === 'free' ? 'arena' : 'canyon');
$('quit').onclick = toTitle; $('rquit').onclick = toTitle;
$('again').onclick = () => play('canyon');
addEventListener('resize', () => { world.resize(); hud.resize(); });
document.addEventListener('visibilitychange', () => { if(document.hidden) pause(); });

/* ---------- sound for what happened ---------- */
let lastFire = 0;
function react(events){
  const p = sim.p;
  for(const e of events){
    const at = e.x != null ? {x: e.x, y: e.y, z: e.z} : null;
    switch(e.k){
      case 'fire': if(performance.now() - lastFire > 70){ snd.sfx('laser', {x: p.x, y: p.y, z: p.z}, e.twin ? 1.2 : 1); lastFire = performance.now(); } break;
      case 'enemyShot': snd.sfx('enemyShot', at, 0.8); break;
      case 'hit': snd.sfx('hit', at); break;
      case 'deflect': snd.sfx('hit', at, 1.2, 1.5); hud.deflectT = 0.9; break;
      case 'boom': snd.sfx(e.big ? 'bigBoom' : 'boom', at); break;
      case 'bomb': snd.sfx('bigBoom', at, 0.8); break;
      case 'hurt': snd.sfx('hull', null, e.why === 'crash' ? 0.7 : 0.5); hud.hurt = Math.min(1.2, hud.hurt + 0.6); if(navigator.vibrate) navigator.vibrate(e.why === 'crash' ? 70 : 35); break;
      case 'lock': snd.sfx('lock'); break;
      case 'charged': snd.sfx('pickup', null, 0.5); break;
      case 'chargeShot': snd.sfx('missile', {x: p.x, y: p.y, z: p.z}, 1.2); snd.sfx('laser', {x: p.x, y: p.y, z: p.z}, 1.6); break;
      case 'burst': snd.sfx('boom', at, 0.9); break;
      case 'missile': snd.sfx('missile', {x: p.x, y: p.y, z: p.z}); break;
      case 'torpedo': snd.sfx('torpedo', at); break;
      case 'pickup': snd.sfx('pickup'); break;
      case 'shieldDown': snd.sfx('shieldDown', at); break;
      case 'roll': case 'uturn': case 'loop': snd.sfx('whoosh', {x: p.x, y: p.y, z: p.z}); break;
      case 'say': hud.say(e.who, e.text, e.dur); break;
      case 'free':
        document.body.classList.add('free');
        hud.show('FREE FLIGHT', sim.style === 'level' ? 'Point the phone to turn · LOOP gets behind a tailgater · U-TURN to come about' : 'Full 3D: point the phone to turn, wheel it to roll · LOOP · U-TURN', 3.2);
        snd.cue('wave');
        break;
      case 'bosswarn': snd.cue('bosswarn'); break;
      case 'won': snd.cue('victory'); hud.show('MISSION COMPLETE', 'Red Canyon is clear', 3.5); break;
      case 'failed': snd.cue('gameover'); finish(false); break;
      case 'done': finish(true); break;
    }
  }
}

/* ---------- the loop ---------- */
let last = performance.now(), slow = 0, fast = 0, qLevel = 0;
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // portrait on a phone: ask for sideways, and pause
  const portrait = touch && innerHeight > innerWidth;
  $('rotate').classList.toggle('want', portrait && state !== 'title');
  if(portrait && state === 'play') pause();

  if(state === 'play' || state === 'over'){
    let inp = input.read();
    if(inp.pause && state === 'play'){ pause(); inp = {}; }
    if(inp.centre){ input.centre(); hud.show('Tilt centred', '', 1); }
    if(AUTO) inp = Object.assign(autopilot(sim, 0.85), {target: false});
    if(inp.target){
      const lock = sim.p.lock;
      view.target = view.target ? null : lock || nearest();
      document.body.classList.toggle('target-on', !!view.target);
    }
    if(view.target && !sim.enemies.some(e => e.id === view.target)){ view.target = null; document.body.classList.remove('target-on'); }
    if(state === 'play' || state === 'over'){
      const n = dt > 1 / 40 ? 2 : 1;
      for(let i = 0; i < n; i++) step(sim, dt / n, state === 'play' ? inp : {});
    }
    react(sim.events);
  }
  world.effects(sim.events, sim);
  sim.events.length = 0;
  world.sync(sim, dt, {orbit: state === 'title' || state === 'calib', target: view.target});
  world.render();
  if(state === 'play' || state === 'pause' || state === 'over') hud.draw(sim, world, dt, {});
  else hud.g.clearRect(0, 0, innerWidth, innerHeight);

  // sound follows the camera
  const cam = world.camera;
  const f = cam.getWorldDirection(cam.position.clone().set(0, 0, 0));
  snd.listenAt(cam.position.x, cam.position.y, cam.position.z);
  snd.listen(f, cam.up);
  snd.engine(sim.p.speed, state === 'play' && !sim.p.dead);
  snd.music(state === 'title' || state === 'calib' ? 'title' : sim.phase === 'won' || state === 'over' ? null : sim.boss ? 'boss' : sim.mode === 'free' ? 'clearing' : 'canyon');

  // a phone that cannot keep up draws fewer pixels, then drops the glow
  if(state === 'play'){
    if(dt > 0.026) slow += dt; else fast += dt;
    if(slow > 2 && qLevel < 3){ qLevel++; slow = fast = 0; const pr = [1.25, 1, 0.8][qLevel - 1] || 0.8; world.setQuality(Math.min(pr, world.pr), qLevel < 3); }
    if(fast > 6){ slow = Math.max(0, slow - 1); fast = 0; }
  }
}
function nearest(){
  let best = null, bd = 1e9;
  for(const e of sim.enemies){ if(e.type === 'pod') continue; const d = Math.hypot(e.x - sim.p.x, e.y - sim.p.y, e.z - sim.p.z); if(d < bd){ bd = d; best = e.id; } }
  return best;
}

$('loading').classList.add('hide');
if(AUTO){ play(S.start); }
else screen('title');
requestAnimationFrame(frame);
