import {CAST} from './cast.js';
/* Dogfight - the heads-up display, drawn on a 2D canvas over the 3D view.

   The reticle (two boxes ahead of the nose: line them up and that is where
   the shots go), the lock, markers and edge arrows for enemies, the radar
   in the clearing, shield / boost / bombs, the boss's health, warnings,
   and the radio: whoever is talking, with their portrait. */

/* ---------- portraits ---------- */
function blobs(g, cx, cy, r, n, rr, col, seed){
  g.fillStyle = col;
  for(let i = 0; i < n; i++){
    const a = i / n * Math.PI * 2 + seed, k = 0.85 + ((i * 7919 + seed * 13) % 10) / 40;
    g.beginPath(); g.arc(cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k, rr, 0, 7); g.fill();
  }
}
/* Teddy, from his photo: black curls, tan eyebrows and cheeks, a white
   blaze into a greying white muzzle, brown eyes, tongue out, red collar. */
export function drawTeddy(g, s){
  g.save(); g.scale(s / 100, s / 100);
  g.fillStyle = '#20324a'; g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#2d4766'; g.beginPath(); g.arc(50, 120, 70, 0, 7); g.fill();
  // ears
  g.fillStyle = '#121216';
  for(const s2 of [-1, 1]){ g.beginPath(); g.ellipse(50 + s2 * 30, 56, 13, 24, s2 * -0.25, 0, 7); g.fill(); blobs(g, 50 + s2 * 30, 58, 14, 9, 5, '#121216', s2); }
  // head
  g.fillStyle = '#16161b'; g.beginPath(); g.arc(50, 46, 27, 0, 7); g.fill();
  blobs(g, 50, 40, 24, 16, 7, '#16161b', 0.3);
  blobs(g, 50, 40, 18, 10, 4, '#26262d', 1.1);
  // white blaze and muzzle
  g.fillStyle = '#efece6';
  g.beginPath(); g.moveTo(47, 26); g.lineTo(53, 26); g.lineTo(56, 52); g.lineTo(44, 52); g.closePath(); g.fill();
  // tan cheeks
  g.fillStyle = '#b97c46';
  g.beginPath(); g.ellipse(38, 64, 10, 9, 0.3, 0, 7); g.fill();
  g.beginPath(); g.ellipse(62, 64, 10, 9, -0.3, 0, 7); g.fill();
  g.fillStyle = '#efece6'; g.beginPath(); g.ellipse(50, 62, 13, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#a9a7a3'; g.beginPath(); g.ellipse(50, 56, 8, 5, 0, 0, 7); g.fill();
  // eyebrows and eyes
  g.fillStyle = '#c4874a';
  g.beginPath(); g.ellipse(38, 39, 6, 3.2, -0.2, 0, 7); g.fill();
  g.beginPath(); g.ellipse(62, 39, 6, 3.2, 0.2, 0, 7); g.fill();
  g.fillStyle = '#3a1c0c';
  g.beginPath(); g.arc(39, 46, 4, 0, 7); g.fill(); g.beginPath(); g.arc(61, 46, 4, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(40.3, 44.7, 1.3, 0, 7); g.fill(); g.beginPath(); g.arc(62.3, 44.7, 1.3, 0, 7); g.fill();
  // nose, mouth, tongue
  g.fillStyle = '#060607'; g.beginPath(); g.ellipse(50, 56, 6.5, 4.5, 0, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(48, 54.6, 1.8, 1, 0, 0, 7); g.fill();
  g.strokeStyle = '#2a1a14'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(42, 66); g.quadraticCurveTo(50, 72, 58, 66); g.stroke();
  g.fillStyle = '#e0707e'; g.beginPath(); g.ellipse(50, 71, 5, 6, 0, 0, 7); g.fill();
  g.strokeStyle = '#b84a5a'; g.lineWidth = 1; g.beginPath(); g.moveTo(50, 67); g.lineTo(50, 74); g.stroke();
  // collar and tag
  g.fillStyle = '#16161b'; g.fillRect(28, 78, 44, 22);
  g.fillStyle = '#efece6'; g.beginPath(); g.ellipse(50, 98, 14, 10, 0, 0, 7); g.fill();
  g.fillStyle = '#d2462a'; g.fillRect(30, 80, 40, 5);
  g.fillStyle = '#3b9fc8'; g.fillRect(40, 80, 6, 5); g.fillStyle = '#e8b53a'; g.fillRect(54, 80, 6, 5);
  g.fillStyle = '#e0a830'; g.beginPath(); g.arc(50, 90, 4, 0, 7); g.fill();
  g.restore();
}
/* Anyone else, from their entry in cast.js: a dog, a cat or a rabbit in
   their own colours, with their ears. If the entry has a photo, the photo
   is used instead once it has loaded. */
export function drawPet(g, s, pet){
  g.save(); g.scale(s / 100, s / 100);
  const villain = pet.role === 'Villain' || pet.role === 'Ace';
  g.fillStyle = villain ? '#3a1830' : pet.role === 'Base' || pet.role === 'Mechanic' ? '#3a2a40' : '#20324a'; g.fillRect(0, 0, 100, 100);
  g.fillStyle = villain ? '#5a2848' : '#2d4766'; g.beginPath(); g.arc(50, 120, 70, 0, 7); g.fill();
  const fur = pet.fur, patch = pet.patch || fur, muz = pet.muzzle || patch;
  const ear = (x, flip) => {
    g.fillStyle = fur;
    if(pet.kind === 'rabbit'){ g.beginPath(); g.ellipse(x, 14, 8, 26, flip * 0.15, 0, 7); g.fill(); g.fillStyle = '#f2b6a0'; g.beginPath(); g.ellipse(x, 16, 4, 18, flip * 0.15, 0, 7); g.fill(); return; }
    if(pet.ears === 'floppy'){ g.beginPath(); g.ellipse(x + flip * 6, 56, 12, 22, flip * -0.3, 0, 7); g.fill(); return; }
    if(pet.ears === 'round'){ g.beginPath(); g.arc(x + flip * 4, 26, 12, 0, 7); g.fill(); return; }
    // pointy
    g.beginPath(); g.moveTo(x - 12, 36); g.lineTo(x + flip * 4, pet.kind === 'cat' ? 6 : 8); g.lineTo(x + 12, 34); g.closePath(); g.fill();
    g.fillStyle = '#f2b6a0'; g.beginPath(); g.moveTo(x - 6, 33); g.lineTo(x + flip * 3, 15); g.lineTo(x + 6, 32); g.closePath(); g.fill();
  };
  if(pet.ears !== 'floppy') { ear(28, -1); ear(72, 1); }
  // head
  g.fillStyle = fur; g.beginPath(); g.ellipse(50, 50, pet.kind === 'cat' ? 30 : 28, 27, 0, 0, 7); g.fill();
  if(pet.ears === 'floppy') { ear(24, -1); ear(76, 1); }
  // blaze and muzzle
  g.fillStyle = patch;
  g.beginPath(); g.moveTo(46, 28); g.lineTo(54, 28); g.lineTo(58, 56); g.lineTo(42, 56); g.closePath(); g.fill();
  g.fillStyle = muz;
  if(pet.kind === 'cat'){ g.beginPath(); g.ellipse(43, 62, 9, 7, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(57, 62, 9, 7, 0, 0, 7); g.fill(); }
  else { g.beginPath(); g.ellipse(50, 63, 14, 11, 0, 0, 7); g.fill(); }
  // eyes
  const eye = (x) => {
    if(pet.kind === 'cat'){
      g.fillStyle = pet.eyes; g.beginPath(); g.ellipse(x, 46, 5.5, 4.5, 0, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.ellipse(x, 46, 1.4, 4, 0, 0, 7); g.fill();
      if(villain){ g.strokeStyle = '#111'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 7, 38 + (x < 50 ? -2 : 3)); g.lineTo(x + 7, 38 + (x < 50 ? 3 : -2)); g.stroke(); }
    } else {
      g.fillStyle = pet.eyes; g.beginPath(); g.arc(x, 46, 4, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 1.3, 44.7, 1.3, 0, 7); g.fill();
    }
  };
  eye(39); eye(61);
  // nose and mouth
  g.fillStyle = pet.kind === 'cat' || pet.kind === 'rabbit' ? '#e0808a' : '#100a08';
  g.beginPath();
  if(pet.kind === 'dog') g.ellipse(50, 58, 6, 4.2, 0, 0, 7); else { g.moveTo(46, 56); g.lineTo(54, 56); g.lineTo(50, 60); g.closePath(); }
  g.fill();
  g.strokeStyle = '#2a1a14'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(44, 67); g.quadraticCurveTo(47, 70, 50, 66); g.quadraticCurveTo(53, 70, 56, 67); g.stroke();
  if(pet.kind === 'cat'){
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1;
    for(const sx of [-1, 1]) for(const dy of [-3, 0, 3]){ g.beginPath(); g.moveTo(50 + sx * 10, 62 + dy * 0.5); g.lineTo(50 + sx * 30, 60 + dy * 2); g.stroke(); }
  }
  if(pet.kind === 'rabbit'){ g.fillStyle = '#fff'; g.fillRect(47, 68, 3, 4); g.fillRect(50.5, 68, 3, 4); }
  // Mittens' crown; Rosie's headset; Hops' goggles
  if(pet.role === 'Villain'){
    g.fillStyle = '#e8b830'; g.beginPath(); g.moveTo(34, 26); g.lineTo(38, 12); g.lineTo(44, 22); g.lineTo(50, 8); g.lineTo(56, 22); g.lineTo(62, 12); g.lineTo(66, 26); g.closePath(); g.fill();
    g.fillStyle = '#d02040'; g.beginPath(); g.arc(50, 20, 2.5, 0, 7); g.fill();
  }
  if(pet.headset){
    g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.arc(50, 50, 34, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.fillStyle = '#333'; g.fillRect(12, 44, 9, 16);
    g.strokeStyle = '#333'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(17, 58); g.quadraticCurveTo(22, 74, 38, 72); g.stroke();
  }
  if(pet.role === 'Mechanic'){
    g.strokeStyle = '#5a3a20'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 36); g.lineTo(78, 36); g.stroke();
    g.fillStyle = 'rgba(140,220,255,0.8)'; g.strokeStyle = '#5a3a20';
    for(const x of [39, 61]){ g.beginPath(); g.arc(x, 38, 8, 0, 7); g.fill(); g.stroke(); }
  }
  // collar
  g.fillStyle = villain ? '#6a1a3a' : '#2f6fd0'; g.fillRect(26, 84, 48, 16);
  g.restore();
}
export function drawRosie(g, s){ drawPet(g, s, CAST.rosie); }

const faceCache = {};
/* The radio portrait for anyone in the cast: drawn, or their photo. */
export function face(who){
  if(faceCache[who]) return faceCache[who];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const pet = CAST[who];
  if(who === 'teddy') drawTeddy(g, 128);
  else if(pet) drawPet(g, 128, pet);
  if(pet && pet.photo){
    const im = new Image();
    im.onload = () => {
      const k = Math.min(im.width, im.height);
      g.drawImage(im, (im.width - k) / 2, (im.height - k) / 2, k, k, 0, 0, 128, 128);
    };
    im.src = pet.photo;
  }
  faceCache[who] = c;
  return c;
}
export function nameOf(who){
  const pet = CAST[who];
  if(!pet) return who.toUpperCase();
  const n = pet.name.toUpperCase();
  return pet.role === 'Base' ? n + ' · BASE' : pet.role === 'Mechanic' ? n + ' · MECHANIC' : pet.role === 'Villain' ? n : pet.role === 'Ace' ? n + ' · ALLEY CATS' : n;
}
export const VOICE = {teddy: '#7ae6ff', wing1: '#ffb24a', wing2: '#ff6a5a', wing3: '#8ab8ff', rosie: '#ffb060', hops: '#c8e0a0', mittens: '#e070c0', ace1: '#ff7090', ace2: '#ff7090', ace3: '#ff7090', ace4: '#ff7090'};

export class Hud {
  constructor(canvas){
    this.c = canvas; this.g = canvas.getContext('2d');
    this.radio = null; this.queue = [];
    this.hurt = 0; this.banner = null; this.lockPulse = 0; this.deflectT = 0;
    this.resize();
  }
  resize(){
    const d = Math.min(2, devicePixelRatio || 1);
    this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.d = d;
    this.g.setTransform(d, 0, 0, d, 0, 0);
  }
  say(who, text, dur){
    // a new line cuts in only if it is more urgent than a chat
    this.queue.push({who, text, dur, t: 0});
    if(this.queue.length > 3) this.queue.shift();
  }
  show(text, sub, dur){ this.banner = {text, sub, t: 0, dur: dur || 2.5}; }

  draw(s, world, dt, view){
    const g = this.g, W = innerWidth, H = innerHeight, p = s.p;
    g.clearRect(0, 0, W, H);
    view = view || {};
    const sm = Math.min(W, H) / 400;          // scale for a small phone
    const font = (px, w) => (w || 700) + ' ' + Math.round(px * Math.max(0.8, Math.min(1.3, sm))) + 'px system-ui, -apple-system, sans-serif';

    // damage flash
    if(this.hurt > 0){
      const k = Math.min(1, this.hurt);
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(1, `rgba(255,30,20,${0.45 * k})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      this.hurt -= dt * 2;
    }
    if(p.shield < 25 && !p.dead){
      const k = 0.15 + 0.15 * Math.sin(performance.now() / 150);
      g.strokeStyle = `rgba(255,40,30,${k})`; g.lineWidth = 14; g.strokeRect(0, 0, W, H);
    }
    if(this.deflectT > 0){
      this.deflectT -= dt;
      g.globalAlpha = Math.min(1, this.deflectT * 3);
      g.font = font(14, 900); g.fillStyle = '#80e0ff'; g.textAlign = 'center';
      g.fillText('DEFLECTED!', W / 2, H * 0.62);
      g.textAlign = 'left'; g.globalAlpha = 1;
    }
    if(!p.dead && !view.hideAim){
      this.enemyMarks(s, world, g, W, H, font);
      this.reticle(s, world, g, font);
    }
    // ---- top left: shield, boost, bombs ----
    const x0 = 14 + (view.safeL || 0), y0 = 12;
    const bw = Math.round(150 * Math.max(0.85, Math.min(1.25, sm)));
    g.font = font(11); g.fillStyle = 'rgba(255,255,255,0.85)'; g.textBaseline = 'top';
    g.fillText('SHIELD', x0, y0);
    const sh = p.shield / 100;
    g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(g, x0, y0 + 15, bw, 12, 6); g.fill();
    g.fillStyle = sh > 0.5 ? '#5cf08a' : sh > 0.25 ? '#ffd040' : '#ff4a3a';
    roundRect(g, x0, y0 + 15, Math.max(0, bw * sh), 12, 6); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(g, x0, y0 + 32, bw * 0.7, 6, 3); g.fill();
    g.fillStyle = p.boost > 0.25 ? '#7ae6ff' : '#ff9a40'; roundRect(g, x0, y0 + 32, bw * 0.7 * p.boost, 6, 3); g.fill();
    // bombs as little round shells, twin lasers, gold bones
    let bx = x0;
    for(let i = 0; i < p.bombs; i++){ g.fillStyle = '#6a9aff'; g.beginPath(); g.arc(bx + 6, y0 + 50, 5, 0, 7); g.fill(); g.strokeStyle = '#cfe0ff'; g.lineWidth = 1.5; g.stroke(); bx += 14; }
    g.font = font(11); g.fillStyle = 'rgba(255,255,255,0.8)';
    let line = 'HITS ' + s.stats.kills;
    if(p.twin) line += '   TWIN';
    line += '   ' + '🦴'.repeat(s.stats.gold) + '·'.repeat(Math.max(0, s.stats.goldTotal - s.stats.gold));
    g.fillText(line, x0, y0 + 62);
    // the wingmates: a face and a health bar each; a red ring when one is in trouble
    let ay = y0 + 80;
    for(const a of s.allies){
      if(a.gone) continue;
      const fz = 22, trouble = a.chased && Math.floor(performance.now() / 250) % 2 === 0;
      g.drawImage(face(a.id), x0, ay, fz, fz);
      g.strokeStyle = trouble ? '#ff4a3a' : (VOICE[a.id] || '#fff'); g.lineWidth = trouble ? 3 : 1.5; g.strokeRect(x0, ay, fz, fz);
      g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(g, x0 + fz + 5, ay + 8, 60, 6, 3); g.fill();
      g.fillStyle = a.hp > 50 ? '#5cf08a' : a.hp > 25 ? '#ffd040' : '#ff4a3a'; roundRect(g, x0 + fz + 5, ay + 8, 60 * Math.max(0, a.hp) / 100, 6, 3); g.fill();
      if(a.chased){ g.font = font(10, 800); g.fillStyle = '#ff6a5a'; g.fillText('HELP!', x0 + fz + 70, ay + 4); }
      ay += fz + 4;
    }
    // the level's secret, once there is something to count
    const SC = s.secret;
    if(SC && SC.type !== 'fork' && (SC.got > 0 || SC.done)){
      g.font = font(11, 800); g.fillStyle = SC.done ? '#ffd040' : 'rgba(255,220,160,0.85)';
      g.fillText((s.L.secret.label || 'SECRET') + ' ' + SC.got + '/' + SC.need + (SC.done ? '  ★' : ''), x0, ay + 4);
      ay += 18;
    }
    // the Moon's clock
    if(s.timer != null && s.phase !== 'won'){
      const t = Math.max(0, s.timer), mm = Math.floor(t / 60), ss = Math.floor(t % 60);
      g.font = font(22, 900); g.textAlign = 'center';
      g.fillStyle = t < 30 && Math.floor(performance.now() / 300) % 2 ? '#ff4a3a' : '#ffe0a0';
      g.fillText('MOON FALLS IN ' + mm + ':' + String(ss).padStart(2, '0'), W / 2, 92);
      g.textAlign = 'left';
    }
    if(p.confused > 0){
      g.save(); g.translate(W / 2, H * 0.7); g.rotate(Math.sin(performance.now() / 120) * 0.15);
      g.font = font(16, 900); g.textAlign = 'center'; g.fillStyle = `hsl(${(performance.now() / 5) % 360},90%,70%)`;
      g.fillText('CATNIP! CONTROLS BACKWARDS', 0, 0); g.restore(); g.textAlign = 'left';
    }

    // ---- radar, in the clearing ----
    if(s.mode === 'free') this.radar(s, g, W - 78 - (view.safeR || 0), 78, 60);

    // ---- the boss ----
    if(s.boss){
      const b = s.boss;
      let hp = 0, max = 0, shielded = false;
      if(b.aces || b.engines){
        for(const e of s.enemies) if((b.aces && e.boss && e.type === 'ace') || (b.engines && e.kind === 'engine')){ hp += e.hp; max += e.maxHp; }
        max = Math.max(max, b.aces ? 4 * 14 * s.K.hp : 4 * 14 * s.K.hp);
      } else {
        hp = Math.max(0, b.hp); max = b.maxHp;
        for(const e of s.enemies) if(e.parent === b.id){ hp += e.hp; max += e.maxHp; }
        if(!b.maxParts) b.maxParts = max;
        max = b.maxParts; shielded = !!b.shielded;
      }
      const w = Math.min(320, W * 0.4), x = W / 2 - w / 2, y = 58;
      const name = b.type === 'mittensShip' ? 'MITTENS - ON THE RUN!' : (s.L.boss && s.L.boss.name) || 'BOSS';
      g.font = font(11); g.fillStyle = '#e8b0ff'; g.textAlign = 'center';
      g.fillText(shielded ? name + '  -  break its shield parts' : name, W / 2, y);
      g.textAlign = 'left';
      g.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(g, x, y + 16, w, 9, 4); g.fill();
      g.fillStyle = shielded ? '#b060ff' : '#ff4a7a'; roundRect(g, x, y + 16, w * Math.min(1, hp / Math.max(1, max)), 9, 4); g.fill();
    }

    // ---- warnings ----
    if(s.warn && !p.dead && Math.floor(performance.now() / 280) % 2 === 0){
      g.font = font(20, 800); g.textAlign = 'center'; g.fillStyle = s.warn === 'ON YOUR TAIL' ? '#ffb030' : '#ff4a3a';
      g.fillText(s.warn, W / 2, H * 0.24);
      g.textAlign = 'left';
    }

    // ---- the radio ----
    this.drawRadio(g, W, H, dt, font, view);

    // ---- banners ----
    if(this.banner){
      const b = this.banner; b.t += dt;
      const a = Math.min(1, b.t * 3, (b.dur - b.t) * 2);
      if(a <= 0) this.banner = null;
      else {
        g.globalAlpha = a; g.textAlign = 'center';
        g.font = font(34, 900); g.fillStyle = '#fff';
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 12;
        g.fillText(b.text, W / 2, H * 0.36);
        if(b.sub){ g.font = font(15, 600); g.fillText(b.sub, W / 2, H * 0.36 + 44 * Math.max(0.8, sm)); }
        g.shadowBlur = 0; g.globalAlpha = 1; g.textAlign = 'left';
      }
    }
  }

  reticle(s, world, g, font){
    const p = s.p;
    const near = world.project(p.x + p.fx * 45, p.y + p.fy * 45, p.z + p.fz * 45);
    const far = world.project(p.x + p.fx * 110, p.y + p.fy * 110, p.z + p.fz * 110);
    const ch = p.charge || 0, full = ch >= 1;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
    const col = p.lock ? '#ff5050' : full ? `rgb(${200 + 55 * pulse},255,${120 + 60 * pulse})` : '#7dffb0';
    g.strokeStyle = col; g.lineWidth = full ? 3 : 2;
    if(!near.behind){ const r = 17; g.strokeRect(near.x - r, near.y - r, r * 2, r * 2); }
    if(!far.behind){
      const r = 10; g.strokeRect(far.x - r, far.y - r, r * 2, r * 2);
      g.beginPath(); g.moveTo(far.x - 4, far.y); g.lineTo(far.x + 4, far.y); g.moveTo(far.x, far.y - 4); g.lineTo(far.x, far.y + 4); g.stroke();
    }
    // the charge, filling a ring round the far box
    if(ch > 0 && !far.behind){
      g.strokeStyle = full ? col : 'rgba(125,255,176,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(far.x, far.y, 24, -Math.PI / 2, -Math.PI / 2 + ch * Math.PI * 2); g.stroke();
      if(full && !p.lock){ g.font = font(11, 800); g.fillStyle = col; g.textAlign = 'center'; g.fillText('CHARGED - aim at one', far.x, far.y + 40); g.textAlign = 'left'; }
    }
    if(p.lock){
      const e = s.enemies.find(e => e.id === p.lock);
      if(e){
        const q = world.project(e.x, e.y, e.z);
        if(!q.behind){
          this.lockPulse += 0.1;
          const r = 22 + Math.sin(this.lockPulse * 2) * 3;
          g.strokeStyle = '#ff4040'; g.lineWidth = 2.5;
          g.save(); g.translate(q.x, q.y); g.rotate(Math.PI / 4 + this.lockPulse * 0.2);
          g.strokeRect(-r, -r, r * 2, r * 2); g.restore();
          g.font = font(11, 800); g.fillStyle = '#ff6060'; g.textAlign = 'center';
          g.fillText('LOCKED - let go of FIRE', q.x, q.y + r + 18);
          g.textAlign = 'left';
        }
      }
    }
  }

  enemyMarks(s, world, g, W, H, font){
    const p = s.p, free = s.mode === 'free';
    for(const e of s.enemies){
      if(e.x < -9e4) continue;
      const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = Math.hypot(dx, dy, dz);
      if(d > 1100) continue;
      const q = world.project(e.x, e.y, e.z);
      const on = !q.behind && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < H - 20;
      const col = e.type === 'cage' ? '#fff0a0' : e.type === 'torpedo' || e.type === 'planet' ? '#ff4080' : e.type === 'boss' || e.type === 'part' ? (e.shielded ? '#7a5a9a' : '#d070ff') : e.type === 'ace' ? '#ffb030' : '#ff6a4a';
      if(on){
        if(d < 40 || (!free && d > 600)) continue;
        const r = Math.max(9, Math.min(40, (e.r + 2) * 420 / d));
        g.strokeStyle = col; g.lineWidth = 1.6;
        const c = r * 0.45;
        g.beginPath();
        for(const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
          g.moveTo(q.x + sx * r, q.y + sy * (r - c)); g.lineTo(q.x + sx * r, q.y + sy * r); g.lineTo(q.x + sx * (r - c), q.y + sy * r);
        }
        g.stroke();
        const tag = e.type === 'torpedo' ? 'TORPEDO' : e.type === 'cage' ? 'PUP!' : e.type === 'ace' && e.who ? (CAST[e.who] || {}).name : e.type === 'planet' ? 'PLANET!' : e.hunt ? 'ON ' + ((CAST[e.hunt] || {}).name || '').toUpperCase() + "'S TAIL" : '';
        if(tag){ g.font = font(10, 800); g.fillStyle = col; g.textAlign = 'center'; g.fillText(tag, q.x, q.y - r - 6); g.textAlign = 'left'; }
        if(e.maxHp > 4 && e.type !== 'boss'){ g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(q.x - r, q.y + r + 4, r * 2, 3); g.fillStyle = col; g.fillRect(q.x - r, q.y + r + 4, r * 2 * e.hp / e.maxHp, 3); }
      } else if(free){
        // an arrow at the edge, pointing the way round to it
        let ax = q.nx, ay = q.ny;
        if(q.behind){ ax = -ax; ay = -ay; }
        const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
        const m = 34, hw = W / 2 - m, hh = H / 2 - m;
        const t = Math.min(hw / Math.abs(ax || 1e-6), hh / Math.abs(ay || 1e-6));
        const x = W / 2 + ax * t, y = H / 2 - ay * t;
        const big = e.type === 'torpedo' || e.type === 'planet' ? 1.4 + 0.3 * Math.sin(performance.now() / 90) : e.type === 'boss' ? 1.5 : 1;
        g.save(); g.translate(x, y); g.rotate(Math.atan2(-ay, ax));
        g.fillStyle = col; g.globalAlpha = Math.max(0.35, 1 - d / 1100);
        g.beginPath(); g.moveTo(12 * big, 0); g.lineTo(-7 * big, -8 * big); g.lineTo(-3 * big, 0); g.lineTo(-7 * big, 8 * big); g.closePath(); g.fill();
        g.restore(); g.globalAlpha = 1;
      }
    }
  }

  radar(s, g, cx, cy, R){
    const p = s.p;
    g.fillStyle = 'rgba(10,20,30,0.42)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(160,255,200,0.4)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    g.beginPath(); g.arc(cx, cy, R / 2, 0, 7); g.stroke();
    const scale = R / 700;
    const yaw = Math.atan2(p.fx, -p.fz);
    const toR = (x, z) => {
      const dx = x - p.x, dz = z - p.z;
      // forward is up on the radar
      const fx = dx * Math.cos(yaw) + dz * Math.sin(yaw), fz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
      return [fx * scale, fz * scale];
    };
    for(const e of s.enemies){
      let [x, y] = toR(e.x, e.z);
      const l = Math.hypot(x, y);
      if(l > R - 3){ x *= (R - 3) / l; y *= (R - 3) / l; }
      g.fillStyle = e.type === 'cage' ? '#fff0a0' : e.type === 'torpedo' || e.type === 'planet' ? '#ff4080' : e.type === 'boss' || e.type === 'part' ? '#d070ff' : '#ff6a4a';
      const r = e.type === 'boss' ? 5 : 3;
      const above = e.y > p.y + 40 ? -1 : e.y < p.y - 40 ? 1 : 0;
      g.beginPath();
      if(above < 0){ g.moveTo(cx + x, cy + y - r - 1); g.lineTo(cx + x + r, cy + y + r); g.lineTo(cx + x - r, cy + y + r); }
      else if(above > 0){ g.moveTo(cx + x, cy + y + r + 1); g.lineTo(cx + x + r, cy + y - r); g.lineTo(cx + x - r, cy + y - r); }
      else g.arc(cx + x, cy + y, r, 0, 7);
      g.fill();
    }
    for(const a of s.allies){
      if(a.gone) continue;
      let [x, y] = toR(a.x, a.z); const l = Math.hypot(x, y); if(l > R - 3){ x *= (R - 3) / l; y *= (R - 3) / l; }
      g.fillStyle = VOICE[a.id] || '#7ae6ff'; g.beginPath(); g.arc(cx + x, cy + y, 3, 0, 7); g.fill();
    }
    // the clearing's edge
    g.strokeStyle = 'rgba(255,200,120,0.5)'; g.beginPath();
    for(let i = 0; i <= 48; i++){
      const a = i / 48 * Math.PI * 2;
      const [x, y] = toR(s.arena.x + Math.cos(a) * 820, s.arena.z + Math.sin(a) * 820);
      const l = Math.hypot(x, y);
      if(l > R){ g.moveTo(cx + x * R / l, cy + y * R / l); continue; }
      i === 0 ? g.moveTo(cx + x, cy + y) : g.lineTo(cx + x, cy + y);
    }
    g.stroke();
    g.fillStyle = '#7dffb0'; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 4, cy + 4); g.lineTo(cx - 4, cy + 4); g.closePath(); g.fill();
  }

  drawRadio(g, W, H, dt, font, view){
    if(!this.radio && this.queue.length) this.radio = this.queue.shift();
    const r = this.radio;
    if(!r) return;
    r.t += dt;
    if(r.t > r.dur){ this.radio = null; return; }
    const a = Math.min(1, r.t * 5, (r.dur - r.t) * 4);
    const sz = Math.round(Math.min(64, Math.max(48, H * 0.13)));
    const w = Math.min(W * 0.52, 430), x = W / 2 - w / 2, y = H - sz - 22 - (view.radioLift || 0);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(8,14,24,0.7)'; roundRect(g, x, y, w, sz + 8, 10); g.fill();
    const col = VOICE[r.who] || '#ffb060';
    g.drawImage(face(r.who), x + 4, y + 4, sz, sz);
    g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, sz, sz);
    g.font = font(10, 800); g.fillStyle = col; g.textBaseline = 'top';
    g.fillText(nameOf(r.who), x + sz + 14, y + 8);
    g.font = font(13, 600); g.fillStyle = '#fff';
    const shown = r.text.slice(0, Math.floor(r.t * 45));
    wrapText(g, shown, x + sz + 14, y + 24, w - sz - 24, 17 * Math.max(0.8, Math.min(1.3, Math.min(W, H) / 400)));
    g.globalAlpha = 1;
  }
}
function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrapText(g, text, x, y, w, lh){
  const words = text.split(' ');
  let line = '';
  for(const wd of words){
    const t = line ? line + ' ' + wd : wd;
    if(g.measureText(t).width > w && line){ g.fillText(line, x, y); y += lh; line = wd; } else line = t;
  }
  if(line) g.fillText(line, x, y);
}
