/* Dogfight - the page: the adventure, the screens, the loop, sound, settings.

   The adventure: the route map (levels.js MAP), a briefing on the radio,
   the level, the results, back to the map; the last planet ends with the
   ending. Progress is kept on this device (localStorage 'dogfight-save'):
   the planets flown, who has joined the squadron, who is home for a nap.

   URL options, for trying things quickly:
     ?level=ID      fly one level (ids in levels.js)   ?start=arena  near the end of the rail
     ?skill=pup|good|top   ?style=full   ?pace=1.5   ?low=1   ?seed=N
     ?auto=1        the computer flies (the checks use this) */
import {newSim, step, autopilot, SKILLS} from './sim.js';
import {LEVELS, START, ORDER, MAP, MEDALS} from './levels.js';
import {CAST, WINGS, lineFor} from './cast.js';
import {World} from './world.js';
import {Hud, drawTeddy, face, nameOf, VOICE} from './hud.js';
import {Input} from './input.js';
import * as snd from './sound.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
if(!touch) document.body.classList.add('desktop');

/* ---------- settings, kept on this device ---------- */
const S = {skill: 'good', style: 'level', sens: '1', invert: false, start: 'canyon', pace: '1.25', wheel: 'on', steer: 'point'};
try { Object.assign(S, JSON.parse(localStorage.getItem('dogfight') || '{}')); } catch(e){}
for(const k of ['skill', 'style', 'start', 'pace']) if(qs.get(k)) S[k] = qs.get(k);
const save = () => { try { localStorage.setItem('dogfight', JSON.stringify(S)); } catch(e){} };
const AUTO = qs.get('auto') === '1';

/* ---------- the adventure so far ---------- */
const fresh = () => ({flown: [], joined: ['wing1'], resting: {}, gold: {}, ranks: {}, finished: false, next: null, secrets: [], medals: {}});
let G = fresh();
try { const g = JSON.parse(localStorage.getItem('dogfight-save') || 'null'); if(g && g.flown) G = Object.assign(fresh(), g); } catch(e){}
const saveG = () => { try { localStorage.setItem('dogfight-save', JSON.stringify(G)); } catch(e){} };
/* The planets that can be flown next. */
/* Where the adventure goes next. Like the old space shooters, it isn't a
   menu choice: each planet has a secret (a hidden fork, every radar buoy,
   every storm ring, every pup), and finding it sends you down the hard
   route. G.next is set when a planet is won. */
function nextLevels(){
  if(!G.flown.length) return [START];
  if(G.next) return [G.next];
  const last = LEVELS[G.flown[G.flown.length - 1]];
  return last && last.next.normal ? [last.next.normal] : [];
}
const routeOf = L => [L.next.normal, L.next.secret].filter((n, i, a) => n && a.indexOf(n) === i);
/* Who flies with Teddy: everyone who has joined, minus anyone resting. In
   free play, whoever would have joined by that point in the story. */
function alliesFor(id, freePlay){
  if(freePlay){
    const n = LEVELS[id].n;
    return WINGS.filter((w, i) => n >= [1, 3, 4][i]);
  }
  return G.joined.filter(w => !(G.resting[w] > 0));
}

const world = new World($('view'), {low: qs.get('low') === '1'});
const hud = new Hud($('hud'));
const input = new Input(document.body);
drawTeddy($('tface').getContext('2d'), 128);

let current = {id: qs.get('level') && LEVELS[qs.get('level')] ? qs.get('level') : START, free: !!qs.get('level')};
let sim = newSim({level: current.id, skill: S.skill, style: S.style, pace: +S.pace, steer: S.steer, seed: +qs.get('seed') || 7});
let state = 'title';
const view = {target: null};
window.__dog = {get sim(){ return sim; }, world, hud, input, get state(){ return state; }, get save(){ return G; }, LEVELS};

/* ---------- the option chips ---------- */
function paintChips(){
  for(const c of document.querySelectorAll('.chip')){
    const k = c.dataset.opt, v = c.dataset.v;
    c.classList.toggle('on', k === 'invert' ? !!S.invert : String(S[k]) === v);
  }
  input.sens = +S.sens; input.invert = !!S.invert; input.wheel = S.wheel !== 'off';
  document.body.classList.toggle('nowheel', S.wheel === 'off');
}
for(const c of document.querySelectorAll('.chip')) c.addEventListener('click', () => {
  const k = c.dataset.opt;
  if(k === 'invert') S.invert = !S.invert; else S[k] = c.dataset.v;
  if(k === 'style'){ sim.style = S.style; if(sim.mode === 'free'){ sim.p.bank = 0; } }
  if(k === 'pace') sim.pace = +S.pace;
  if(k === 'steer') sim.steer = S.steer;
  save(); paintChips(); snd.sfx('click');
});
paintChips();

const SCREENS = ['title', 'setup', 'map', 'free', 'brief', 'calib', 'pause', 'result', 'ending'];
function screen(id){ for(const s of SCREENS) $(s).classList.toggle('hide', s !== id); }
function controls(on){ $('controls').classList.toggle('hide', !on); input.enabled = on; }

/* ---------- the title ---------- */
function showTitle(){
  state = 'title'; controls(false); screen('title');
  const nx = nextLevels();
  if(G.finished) $('contline').textContent = 'Adventure complete! Fly it again for the other routes.';
  else if(G.flown.length) $('contline').textContent = `Planets flown: ${G.flown.length} of 7 · next: ${nx.map(i => LEVELS[i].name).join(' or ')}`;
  else $('contline').textContent = 'Seven planets. One cat. Lots of good dogs.';
  $('adventure').textContent = G.flown.length && !G.finished ? 'CONTINUE' : 'ADVENTURE';
  $('newgame').classList.toggle('hide', !G.flown.length);
  if(sim.level !== START || sim.mode !== 'rail'){ sim = newSim({level: START, skill: S.skill, style: S.style, pace: +S.pace, steer: S.steer}); world.snap = true; }
}
$('adventure').onclick = () => { snd.unlock(); if(G.finished){ G = fresh(); saveG(); } showMap(); };
$('newgame').onclick = () => { if(confirm('Start a new adventure? The planets you have flown will be forgotten.')){ G = fresh(); saveG(); showMap(); } };
$('settings').onclick = () => { snd.unlock(); state = 'setup'; screen('setup'); };
$('setupdone').onclick = showTitle;
$('freeplay').onclick = () => { snd.unlock(); showFree(); };
$('freeback').onclick = showTitle;
$('mapback').onclick = showTitle;
$('endok').onclick = showTitle;

/* ---------- the route map ---------- */
function showMap(){
  state = 'map'; controls(false); screen('map');
  const svg = $('mapsvg'), nx = nextLevels();
  const X = c => 50 + c * 100, Y = r => 40 + r * 90;
  let html = '';
  // the routes
  for(const id of ORDER){
    const L = LEVELS[id], [c, r] = MAP[id];
    for(const n of routeOf(L)){
      const [c2, r2] = MAP[n];
      const flown = G.flown.includes(id) && (G.flown.includes(n) || nx.includes(n));
      const secret = n === L.next.secret && n !== L.next.normal;
      html += `<line x1="${X(c)}" y1="${Y(r)}" x2="${X(c2)}" y2="${Y(r2)}" stroke="${flown ? (secret ? '#ff9a7a' : '#ffcf9a') : secret ? 'rgba(255,140,110,0.25)' : 'rgba(255,255,255,0.18)'}" stroke-width="${flown ? 3 : 2}" stroke-dasharray="${flown ? '' : secret ? '2 6' : '5 5'}"/>`;
    }
  }
  const colour = id => ({canyon: '#d06a3a', tidewater: '#2a8ac8', thunder: '#5a6a80', kennel: '#6a7ac0', frost: '#cfe8ff', jungle: '#4aa040', yarn: '#d060c0', moonfall: '#c8c4bc', scratchpost: '#7a3a5a', lair: '#a02040'})[id];
  for(const id of ORDER){
    const L = LEVELS[id], [c, r] = MAP[id];
    const done = G.flown.includes(id), next = nx.includes(id);
    const cls = 'node' + (next ? ' next' : '') + (!done && !next ? ' locked' : '');
    html += `<g class="${cls}" data-id="${id}"><circle class="body" cx="${X(c)}" cy="${Y(r)}" r="${L.final ? 26 : 20}" fill="${colour(id)}" stroke="${done ? '#ffcf9a' : 'rgba(255,255,255,0.4)'}" stroke-width="3"/>`
      + (done ? `<text x="${X(c)}" y="${Y(r) + 5}">${G.medals[id] ? '🏅' : '✓'}</text>` : '')
      + `<text x="${X(c)}" y="${Y(r) + (L.final ? 44 : 38)}">${L.name}</text>`
      + (L.hard ? `<text x="${X(c)}" y="${Y(r) - 26}" style="fill:#ff9a7a;font-size:10px">HARD</text>` : '') + '</g>';
  }
  svg.innerHTML = html;
  for(const g of svg.querySelectorAll('.node')) g.addEventListener('click', () => {
    const id = g.dataset.id;
    if(!nx.includes(id)){ $('mapinfo').textContent = G.flown.includes(id) ? `${LEVELS[id].name}: flown${G.ranks[id] ? ' - rank ' + G.ranks[id] : ''}.` : 'Not on your route yet.'; return; }
    const L = LEVELS[id];
    $('mapinfo').innerHTML = `<b>${L.name}</b> - ${L.blurb}<br><button class="go small" id="launch">FLY THERE</button>`;
    $('launch').onclick = () => { current = {id, free: false}; brief(id); };
    snd.sfx('click');
  });
  const rest = Object.keys(G.resting).filter(w => G.resting[w] > 0);
  const hint = G.flown.length && G.secrets.includes(G.flown[G.flown.length - 1]) ? 'Secret route! ' : '';
  $('mapinfo').textContent = !nx.length ? 'Every planet is flown.' : hint + (rest.length ? `${rest.map(w => CAST[w].name).join(' and ')} ${rest.length > 1 ? 'are' : 'is'} home napping this mission. ` : '') + `Next stop: ${LEVELS[nx[0]].name} - tap it.`;
  $('maptitle').textContent = G.flown.length ? `The Dog Star System · ${G.flown.length} of 7` : 'The Dog Star System';
}

/* ---------- free play ---------- */
function showFree(){
  state = 'free'; screen('free');
  $('levellist').innerHTML = ORDER.map(id => `<button class="chip" data-level="${id}">${LEVELS[id].n}. ${LEVELS[id].name}<small>${LEVELS[id].planet}</small></button>`).join('');
  for(const b of $('levellist').querySelectorAll('button')) b.onclick = () => { current = {id: b.dataset.level, free: true}; brief(current.id); };
  paintChips();
}

/* ---------- the briefing: the radio, one line at a time ---------- */
let briefLines = [], briefI = 0, briefDone = null;
function brief(id, lines, then){
  const L = LEVELS[id];
  briefLines = (lines || L.briefing || []).filter(([who]) => !who.startsWith('wing') || alliesFor(id, current.free).includes(who) || (L.joins || []).includes(who));
  briefI = 0; briefDone = then || (() => play());
  if(!briefLines.length){ briefDone(); return; }
  state = 'brief'; screen('brief');
  $('briefname').textContent = lines ? '' : L.name;
  $('briefplanet').textContent = lines ? '' : 'Planet ' + L.planet;
  showBriefLine();
}
function showBriefLine(){
  const [who, text] = briefLines[briefI];
  const c = $('briefface').getContext('2d');
  c.clearRect(0, 0, 128, 128); c.drawImage(face(who), 0, 0, 128, 128);
  $('briefface').style.borderColor = VOICE[who] || '#ffb060';
  $('briefwho').textContent = nameOf(who); $('briefwho').style.color = VOICE[who] || '#ffb060';
  $('brieftext').textContent = lineFor(text);
  $('briefnext').textContent = briefI === briefLines.length - 1 ? (state === 'brief' && briefDone.ending ? 'DONE' : 'LAUNCH!') : 'NEXT';
  snd.sfx('click');
}
$('briefnext').onclick = () => { briefI++; if(briefI >= briefLines.length){ $('brief').classList.add('hide'); briefDone(); } else showBriefLine(); };
$('briefskip').onclick = () => { $('brief').classList.add('hide'); briefDone(); };

/* ---------- starting a level ---------- */
async function play(from, carry){
  snd.unlock();
  if(touch){
    try { await document.documentElement.requestFullscreen({navigationUI: 'hide'}); await screen_lock(); } catch(e){}
  }
  const ok = await Input.ask();
  const startAt = from || (current.free ? S.start : 'canyon');
  sim = newSim({level: current.id, skill: S.skill, style: S.style, pace: +S.pace, steer: S.steer, start: startAt === 'arena' ? 'arena' : startAt === 'mid' ? 'mid' : undefined, carry, hard: !current.free && G.secrets.length >= 2,
    seed: +qs.get('seed') || (Math.random() * 1e9) | 0, allies: carry ? carry.allies : alliesFor(current.id, current.free)});
  world.snap = true; view.target = null; document.body.classList.remove('target-on', 'free');
  hud.queue = []; hud.radio = null; hud.banner = null;
  if(AUTO){ go(); return; }
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
  hud.show(sim.L.name.toUpperCase(), sim.mode === 'rail' ? 'Planet ' + sim.L.planet : '', 2.6);
  snd.cue('count');
}
function pause(){ if(state !== 'play') return; state = 'pause'; screen('pause'); controls(false); }
function resume(){ state = 'play'; screen(null); controls(true); }
function quit(){ if(current.free) showFree(); else showMap(); }

/* ---------- the end of a level ---------- */
function rankOf(st){
  const acc = st.shots ? st.hits / st.shots : 0;
  return st.damage < 30 && acc > 0.3 && st.gold === st.goldTotal ? 'TOP DOG' : st.damage < 100 ? 'GOOD BOY' : 'GOOD PUP';
}
function finish(won){
  state = 'over'; controls(false);
  const st = sim.stats, L = sim.L;
  const acc = st.shots ? Math.round(100 * st.hits / st.shots) : 0;
  const rank = won ? rankOf(st) : '';
  $('rtitle').textContent = won ? `${L.name}: mission complete!` : (sim.failWhy && sim.failWhy !== 'shot down' ? sim.failWhy : 'Teddy\'s down!');
  $('rank').textContent = won ? 'Rank: ' + rank : 'He\'s fine - he bailed out. Again?';
  const mm = Math.floor(st.time / 60), ss = Math.floor(st.time % 60);
  const target = MEDALS[sim.level], medal = won && target && st.kills >= target;
  const rows = [['Time', mm + ':' + String(ss).padStart(2, '0')], ['Hits', st.kills + (st.combo ? ` (${st.combo} combo bonus)` : '')],
    ['Medal', medal ? '🏅 WON!' : `${st.kills} / ${target} hits`], ['Accuracy', acc + '%'], ['Golden bones', st.gold + ' / ' + st.goldTotal], ['Damage taken', Math.round(st.damage)]];
  if(sim.secret) rows.push([sim.L.secret.label || 'Secret', sim.secret.done ? 'FOUND - hard route!' : sim.secret.type === 'fork' ? 'not found' : sim.secret.got + ' / ' + sim.secret.need]);
  if(won && !current.free && !L.final) rows.push(['Next stop', LEVELS[sim.secret && sim.secret.done ? L.next.secret : L.next.normal].name]);
  if(st.rescued) rows.push(['Pups rescued', st.rescued]);
  if(st.saved) rows.push(['Wingmates saved', st.saved]);
  if(sim.downed.length) rows.push(['Gone home to nap', sim.downed.map(w => CAST[w].name).join(', ')]);
  rows.push(['Difficulty', SKILLS[sim.skill].name], ['Speed', sim.pace + '×']);
  $('rtable').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  // a medal counts however the planet was flown (adventure or free play)
  if(medal && !G.medals[current.id]){ G.medals[current.id] = true; saveG(); }
  if(won && !current.free){
    // the adventure moves on: who joined, who is resting
    for(const w of Object.keys(G.resting)) G.resting[w] = Math.max(0, G.resting[w] - 1);
    for(const w of sim.allies.map(a => a.id).concat(sim.joined)) if(!G.joined.includes(w) && !sim.downed.includes(w)) G.joined.push(w);
    for(const w of sim.downed){ if(!G.joined.includes(w)) G.joined.push(w); G.resting[w] = 1; }
    if(!G.flown.includes(current.id)) G.flown.push(current.id);
    const secret = !!(sim.secret && sim.secret.done);
    if(secret && !G.secrets.includes(current.id)) G.secrets.push(current.id);
    G.next = secret ? L.next.secret : L.next.normal;
    G.gold[current.id] = Math.max(G.gold[current.id] || 0, st.gold);
    G.ranks[current.id] = rank;
    if(L.final) G.finished = true;
    saveG();
  }
  $('again').textContent = won ? (current.free ? 'FLY AGAIN' : L.final ? 'THE ENDING' : 'CONTINUE') : 'FROM THE START';
  $('again').onclick = () => {
    if(!won) return play('rail');
    if(current.free) return play();
    if(L.final) return ending();
    showMap();
  };
  // after a crash: back to the clearing if you got that far, else to the
  // rail's checkpoint if you passed it
  const toArena = sim.checkpoint === 'arena' || sim.mode === 'free' || sim.phase === 'railboss';
  const cp = !toArena && sim.cpPassed;
  $('other').textContent = won ? 'Fly it again' : cp ? 'Retry from the checkpoint' : 'Retry near the end of the rail';
  $('other').classList.toggle('hide', !won && !toArena && !cp);
  $('other').onclick = () => won ? play() : cp ? play('mid', cp) : play('arena');
  setTimeout(() => screen('result'), won ? 300 : 0);
}
function ending(){
  const L = LEVELS.lair;
  const fin = () => {
    state = 'ending'; screen('ending');
    const cast = ['teddy', ...WINGS, 'rosie', 'hops'].map(w => `${CAST[w].name} - ${CAST[w].role}`).join('<br>');
    $('credits').innerHTML = `<b>Good Boy Squadron</b><br>${cast}<br><br><b>and introducing</b><br>${CAST.mittens.name}, at the vet<br><br>Instruments: FluidR3 GM soundfont by Frank Wen (CC BY 3.0)`;
    snd.cue('victory');
  };
  fin.ending = true;
  current = {id: 'lair', free: false};
  // the hard route earns a little more
  const lines = L.ending.slice();
  if(G.secrets.length >= 2) lines.splice(lines.length - 1, 0, ['hops', "Psst, {teddy}. You found the hard way through. I've built you something... for next time."], ['mittens', "...I'll be back. Cats ALWAYS land on their feet."]);
  brief('lair', lines, fin);
  $('briefname').textContent = 'Epilogue';
  $('briefplanet').textContent = 'Dog Star System';
}
$('resume').onclick = resume;
$('recentre').onclick = () => { input.centre(); hud.show('Tilt centred', '', 1.2); resume(); };
$('restart').onclick = () => play(sim.mode === 'free' || sim.phase === 'railboss' ? 'arena' : 'rail');
$('quit').onclick = quit; $('rquit').onclick = quit;
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
      case 'allyFire': snd.sfx('laserFar', at, 0.6); break;
      case 'enemyShot': snd.sfx('enemyShot', at, 0.8); break;
      case 'hit': snd.sfx('hit', at); break;
      case 'deflect': snd.sfx('hit', at, 1.2, 1.5); hud.deflectT = 0.9; break;
      case 'boom': snd.sfx(e.big ? 'bigBoom' : 'boom', at); break;
      case 'bomb': snd.sfx('bigBoom', at, 0.8); break;
      case 'hurt': snd.sfx('hull', null, e.why === 'crash' ? 0.7 : 0.5); hud.hurt = Math.min(1.2, hud.hurt + 0.6); buzz(e.why === 'crash' ? 70 : 35); break;
      case 'lock': snd.sfx('lock'); break;
      case 'charged': snd.sfx('pickup', null, 0.5); break;
      case 'chargeShot': snd.sfx('missile', {x: p.x, y: p.y, z: p.z}, 1.2); snd.sfx('laser', {x: p.x, y: p.y, z: p.z}, 1.6); break;
      case 'burst': snd.sfx('boom', at, 0.9); break;
      case 'chain': snd.sfx('boom', at, 0.7, 1.2); break;
      case 'combo': hud.combo = {n: e.n, t: 0}; break;
      case 'missile': snd.sfx('missile', {x: p.x, y: p.y, z: p.z}); break;
      case 'torpedo': snd.sfx('torpedo', at); break;
      case 'bat': snd.sfx('whoosh', at, 1.4); break;
      case 'windup': snd.sfx('alarm', at, 0.5); break;
      case 'swat': snd.sfx('hull', null, 1); break;
      case 'pickup': case 'gift': snd.sfx('pickup'); break;
      case 'drop': snd.sfx('pickup', at, 0.6, 1.4); break;
      case 'checkpoint': snd.cue('pickup'); hud.show('CHECKPOINT', 'Crash after this and you start here', 1.8); break;
      case 'upgrade': snd.cue('pickup'); hud.show('SHIELD UPGRADE', 'Three golden bones', 2); break;
      case 'shieldDown': snd.sfx('shieldDown', at); break;
      case 'strikeWarn': snd.sfx('torpedo', at, 0.6); break;
      case 'lightning': snd.sfx('bigBoom', at, 1); snd.sfx('crack', at, 1); buzz(30); break;
      case 'rescue': snd.sfx('pickup'); break;
      case 'nip': snd.sfx('whoosh', null, 0.8); break;
      case 'launch': snd.sfx('missile', at, 0.6); break;
      case 'join': snd.cue('pickup'); hud.show(CAST[e.who].name.toUpperCase() + ' JOINS!', 'A new wingmate', 2.4); break;
      case 'allyDown': snd.sfx('bigBoom', at, 0.6); break;
      case 'roll': case 'uturn': case 'loop': snd.sfx('whoosh', {x: p.x, y: p.y, z: p.z}); break;
      case 'say': hud.say(e.who, e.text, e.dur); break;
      case 'free':
        document.body.classList.add('free');
        hud.show('FREE FLIGHT', sim.style === 'level' ? 'Point the phone to turn · LOOP gets behind a tailgater · U-TURN to come about' : 'Full 3D: point the phone to turn, wheel it to roll · LOOP · U-TURN', 3.2);
        snd.cue('wave');
        break;
      case 'bosswarn': snd.cue('bosswarn'); hud.show(sim.L.boss.name, '', 2.4); break;
      case 'won':
        snd.cue('victory'); hud.show('MISSION COMPLETE', sim.L.name + ' is clear', 3.5);
        for(const [who, text] of sim.L.outro || []) hud.say(who, lineFor(text), Math.max(2.4, text.length / 20));
        break;
      case 'timeout': hud.show('THE MOON FELL', '', 3); break;
      case 'secret': snd.cue('pickup'); hud.show('SECRET ROUTE!', 'The hard way is open', 3); break;
      case 'secretStep': snd.sfx('pickup', null, 0.6); break;
      case 'fork': snd.sfx('whoosh', null, 0.8); break;
      case 'hiss': snd.sfx('shieldDown', at, 1); break;
      case 'escaped': hud.show('IT GOT AWAY', '', 3); break;
      case 'carried': snd.sfx('alarm', null, 0.6); break;
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
  const portrait = touch && innerHeight > innerWidth;
  $('rotate').classList.toggle('want', portrait && state !== 'title');
  if(portrait && state === 'play') pause();

  if(state === 'play' || state === 'over'){
    let inp = input.read();
    if(inp.pause && state === 'play'){ pause(); inp = {}; }
    if(inp.centre){ input.centre(); hud.show('Tilt centred', '', 1); }
    if(AUTO) inp = Object.assign(autopilot(sim, 0.85), {target: false});
    if(inp.target){
      view.target = view.target ? null : sim.p.lock || nearest();
      document.body.classList.toggle('target-on', !!view.target);
    }
    if(view.target && !sim.enemies.some(e => e.id === view.target)){ view.target = null; document.body.classList.remove('target-on'); }
    const n = dt > 1 / 40 ? 2 : 1;
    for(let i = 0; i < n; i++) step(sim, dt / n, state === 'play' ? inp : {});
    react(sim.events);
  }
  world.effects(sim.events, sim);
  sim.events.length = 0;
  const backdrop = !['play', 'pause', 'over'].includes(state);
  world.sync(sim, dt, {orbit: backdrop, target: view.target});
  world.render();
  if(!backdrop) hud.draw(sim, world, dt, {});
  else hud.g.clearRect(0, 0, innerWidth, innerHeight);

  const cam = world.camera;
  const f = cam.getWorldDirection(cam.position.clone().set(0, 0, 0));
  snd.listenAt(cam.position.x, cam.position.y, cam.position.z);
  snd.listen(f, cam.up);
  snd.engine(sim.p.speed, state === 'play' && !sim.p.dead);
  const M = sim.L.music || {};
  snd.music(state === 'ending' ? 'ending' : backdrop ? 'title' : sim.phase === 'won' || state === 'over' ? null : sim.boss ? (M.boss || 'boss') : sim.mode === 'free' ? (M.free || 'clearing') : (M.rail || 'canyon'));

  if(state === 'play'){
    if(dt > 0.026) slow += dt; else fast += dt;
    // too slow for 2 s: a step down - fewer pixels, then no bloom
    if(slow > 2 && qLevel < 4){ qLevel++; slow = fast = 0; const pr = [1.5, 1.25, 1, 0.8][qLevel - 1] || 0.8; world.setQuality(Math.min(pr, world.pr), qLevel < 4); }
    if(fast > 6){ slow = Math.max(0, slow - 1); fast = 0; }
  }
}
function nearest(){
  let best = null, bd = 1e9;
  for(const e of sim.enemies){ if(e.type === 'part' && e.parent) continue; const d = Math.hypot(e.x - sim.p.x, e.y - sim.p.y, e.z - sim.p.z); if(d < bd){ bd = d; best = e.id; } }
  return best;
}

$('loading').classList.add('hide');
if(AUTO) play(S.start === 'arena' ? 'arena' : 'rail');
else if(qs.get('level')) brief(current.id);
else showTitle();
requestAnimationFrame(frame);
/* A buzz, once someone has touched the page (before that, phones refuse). */
function buzz(ms){ try { if(navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch(e){} }
