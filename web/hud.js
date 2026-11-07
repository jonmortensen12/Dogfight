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
/* Rosie, at base: a corgi with a headset. */
export function drawRosie(g, s){
  g.save(); g.scale(s / 100, s / 100);
  g.fillStyle = '#3a2a40'; g.fillRect(0, 0, 100, 100);
  g.fillStyle = '#d98a3a';
  g.beginPath(); g.moveTo(24, 40); g.lineTo(18, 6); g.lineTo(44, 28); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(76, 40); g.lineTo(82, 6); g.lineTo(56, 28); g.closePath(); g.fill();
  g.fillStyle = '#f2b6a0';
  g.beginPath(); g.moveTo(26, 34); g.lineTo(22, 14); g.lineTo(38, 29); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(74, 34); g.lineTo(78, 14); g.lineTo(62, 29); g.closePath(); g.fill();
  g.fillStyle = '#d98a3a'; g.beginPath(); g.ellipse(50, 52, 30, 27, 0, 0, 7); g.fill();
  g.fillStyle = '#fbf6ee'; g.beginPath(); g.moveTo(46, 30); g.lineTo(54, 30); g.lineTo(62, 62); g.lineTo(38, 62); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(50, 66, 17, 12, 0, 0, 7); g.fill();
  g.fillStyle = '#20140c'; g.beginPath(); g.arc(39, 48, 3.6, 0, 7); g.fill(); g.beginPath(); g.arc(61, 48, 3.6, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(40, 47, 1.1, 0, 7); g.fill(); g.beginPath(); g.arc(62, 47, 1.1, 0, 7); g.fill();
  g.fillStyle = '#100a08'; g.beginPath(); g.ellipse(50, 60, 5.5, 3.8, 0, 0, 7); g.fill();
  g.strokeStyle = '#3a2418'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(44, 69); g.quadraticCurveTo(50, 73, 56, 69); g.stroke();
  // headset
  g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.arc(50, 50, 34, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.fillStyle = '#333'; g.fillRect(12, 44, 9, 16);
  g.strokeStyle = '#333'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(17, 58); g.quadraticCurveTo(22, 74, 38, 72); g.stroke();
  g.fillStyle = '#d33'; g.beginPath(); g.arc(38, 72, 2.5, 0, 7); g.fill();
  g.fillStyle = '#2f6fd0'; g.fillRect(26, 84, 48, 16);
  g.restore();
}
function portrait(fn){ const c = document.createElement('canvas'); c.width = c.height = 128; fn(c.getContext('2d'), 128); return c; }
export const FACES = {teddy: null, rosie: null};
export const NAMES = {teddy: 'TEDDY', rosie: 'ROSIE · BASE'};

export class Hud {
  constructor(canvas){
    this.c = canvas; this.g = canvas.getContext('2d');
    FACES.teddy = portrait(drawTeddy); FACES.rosie = portrait(drawRosie);
    this.radio = null; this.queue = [];
    this.hurt = 0; this.banner = null; this.lockPulse = 0;
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

    // ---- radar, in the clearing ----
    if(s.mode === 'free') this.radar(s, g, W - 78 - (view.safeR || 0), 78, 60);

    // ---- the boss ----
    if(s.boss){
      const b = s.boss, pods = s.enemies.filter(e => e.type === 'pod');
      const w = Math.min(320, W * 0.4), x = W / 2 - w / 2, y = 58;
      g.font = font(11); g.fillStyle = '#e8b0ff'; g.textAlign = 'center';
      g.fillText(b.shielded ? 'THE BRUTE  -  shoot its engines' : 'THE BRUTE  -  the core is open!', W / 2, y);
      g.textAlign = 'left';
      g.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(g, x, y + 16, w, 9, 4); g.fill();
      const hp = b.hp / b.maxHp + pods.reduce((a, q) => a + q.hp / q.maxHp, 0);
      g.fillStyle = b.shielded ? '#b060ff' : '#ff4a7a'; roundRect(g, x, y + 16, w * hp / 3, 9, 4); g.fill();
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
    const locking = p.cand && !p.lock ? Math.min(1, p.candT / 0.45) : 0;
    const col = p.lock ? '#ff5050' : locking > 0 ? '#ffd040' : '#7dffb0';
    g.strokeStyle = col; g.lineWidth = 2;
    if(!near.behind){ const r = 17; g.strokeRect(near.x - r, near.y - r, r * 2, r * 2); }
    if(!far.behind){
      const r = 10; g.strokeRect(far.x - r, far.y - r, r * 2, r * 2);
      g.beginPath(); g.moveTo(far.x - 4, far.y); g.lineTo(far.x + 4, far.y); g.moveTo(far.x, far.y - 4); g.lineTo(far.x, far.y + 4); g.stroke();
    }
    if(locking > 0 && !far.behind){
      g.beginPath(); g.arc(far.x, far.y, 22, -Math.PI / 2, -Math.PI / 2 + locking * Math.PI * 2); g.stroke();
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
          g.fillText(p.bombs > 0 ? 'LOCKED - BOMB to fire' : 'LOCKED', q.x, q.y + r + 18);
          g.textAlign = 'left';
        }
      }
    }
  }

  enemyMarks(s, world, g, W, H, font){
    const p = s.p, free = s.mode === 'free';
    for(const e of s.enemies){
      if(e.x < -9e4 || e.type === 'pod') continue;
      const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = Math.hypot(dx, dy, dz);
      if(d > 1100) continue;
      const q = world.project(e.x, e.y, e.z);
      const on = !q.behind && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < H - 20;
      const col = e.type === 'torpedo' ? '#ff4080' : e.type === 'brute' ? '#d070ff' : '#ff6a4a';
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
        if(e.type === 'torpedo'){ g.font = font(10, 800); g.fillStyle = col; g.textAlign = 'center'; g.fillText('TORPEDO', q.x, q.y - r - 6); g.textAlign = 'left'; }
        if(e.maxHp > 4 && e.type !== 'brute'){ g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(q.x - r, q.y + r + 4, r * 2, 3); g.fillStyle = col; g.fillRect(q.x - r, q.y + r + 4, r * 2 * e.hp / e.maxHp, 3); }
      } else if(free){
        // an arrow at the edge, pointing the way round to it
        let ax = q.nx, ay = q.ny;
        if(q.behind){ ax = -ax; ay = -ay; }
        const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
        const m = 34, hw = W / 2 - m, hh = H / 2 - m;
        const t = Math.min(hw / Math.abs(ax || 1e-6), hh / Math.abs(ay || 1e-6));
        const x = W / 2 + ax * t, y = H / 2 - ay * t;
        const big = e.type === 'torpedo' ? 1.4 + 0.3 * Math.sin(performance.now() / 90) : e.type === 'brute' ? 1.5 : 1;
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
      if(e.type === 'pod') continue;
      let [x, y] = toR(e.x, e.z);
      const l = Math.hypot(x, y);
      if(l > R - 3){ x *= (R - 3) / l; y *= (R - 3) / l; }
      g.fillStyle = e.type === 'torpedo' ? '#ff4080' : e.type === 'brute' ? '#d070ff' : '#ff6a4a';
      const r = e.type === 'brute' ? 5 : 3;
      const above = e.y > p.y + 40 ? -1 : e.y < p.y - 40 ? 1 : 0;
      g.beginPath();
      if(above < 0){ g.moveTo(cx + x, cy + y - r - 1); g.lineTo(cx + x + r, cy + y + r); g.lineTo(cx + x - r, cy + y + r); }
      else if(above > 0){ g.moveTo(cx + x, cy + y + r + 1); g.lineTo(cx + x + r, cy + y - r); g.lineTo(cx + x - r, cy + y - r); }
      else g.arc(cx + x, cy + y, r, 0, 7);
      g.fill();
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
    g.drawImage(FACES[r.who] || FACES.teddy, x + 4, y + 4, sz, sz);
    g.strokeStyle = r.who === 'teddy' ? '#7ae6ff' : '#ffb060'; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, sz, sz);
    g.font = font(10, 800); g.fillStyle = r.who === 'teddy' ? '#7ae6ff' : '#ffb060'; g.textBaseline = 'top';
    g.fillText(NAMES[r.who] || r.who, x + sz + 14, y + 8);
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
