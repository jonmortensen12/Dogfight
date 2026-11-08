/* Dogfight - the ground, for whichever level is loaded. Pure: no drawing.

   setLevel(def) loads a level from levels.js. After that, height(x, z) is
   the whole landscape: the simulation asks it whether a ship has hit the
   ground, and world.js builds its meshes from it. What you see is what you
   crash into.

   Every level runs along -z. The rail's centre line is cx(u), where u = -z
   is how far along it you are. The rail runs to RAIL_END, where it lets go
   in a clearing (an arena) centred at ARENA, or, in a level whose boss is
   met on the rail, it stops there.

   The kinds of ground:
     canyon - a canyon cut through a plateau, opening into a basin ringed by
              mountains (Red Canyon, Thunder Peaks, Frost Fang, Catnip Jungle)
     trench - straight-sided metal walls (Scratchpost)
     ocean  - sea with islands; the water is the floor (Tidewater)
     space  - nothing at all (the space levels)
   Spires, arches, rocks and the like are not in the height field (too steep
   for its grid): they are in OBSTACLES, tested by hitObstacle.

   The exports below are `let`: modules that import them see the current
   level's values. */

export let L = null;                  // the level's definition
export let RAIL_END = 3700, ARENA_U = 4250, ARENA_R = 560, ARENA_LIMIT = 820;
export let CEILING = 460, FLOOR = -1e9;
export let RAIL_TOP = 58, RAIL_FLOOR = 6, WALL_MARGIN = 13;
export let ARENA = {x: 0, z: -4250};
export let OBSTACLES = [];
export let GROUND = 'canyon';
export const NONE = -1e9;

/* ---------- noise ---------- */
function hash2(ix, iz){
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z){
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x, z, oct){
  let s = 0, a = 0.5;
  for(let i = 0; i < (oct || 4); i++){ s += a * vnoise(x, z); x = x * 2.03 + 17.1; z = z * 2.03 + 9.7; a *= 0.5; }
  return s;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* A seeded random number generator, for laying out a level the same way every time. */
export function rng(seed){
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- the rail's line ---------- */
let PA = [70, 34, 12], PL = [420, 170, 73], PP = [0, 1.3, 0.4];
function cx0(u){ let x = 0; for(let i = 0; i < PA.length; i++) x += PA[i] * Math.sin(u / PL[i] + PP[i]); return x; }
function dcx0(u){ let d = 0; for(let i = 0; i < PA.length; i++) d += PA[i] / PL[i] * Math.cos(u / PL[i] + PP[i]); return d; }
/* A fork: between u0 and u1 a second channel splits off to one side (side
   -1 left, +1 right) by `off` metres and comes back. Fly into it and the
   rail follows it (BRANCH 1) until the two meet again. */
export let BRANCH = 0;
export function setBranch(b){ BRANCH = b; }
const FORK_RAMP = 320;
export function forkOff(u){
  const F = L && L.fork;
  if(!F || u <= F.u0 || u >= F.u1) return 0;
  const k = Math.min(smooth(F.u0, F.u0 + FORK_RAMP, u), 1 - smooth(F.u1 - FORK_RAMP, F.u1, u));
  return F.side * F.off * k;
}
export function inFork(u){ const F = L && L.fork; return !!F && u > F.u0 && u < F.u1; }
export function cx(u){ return cx0(u) + (BRANCH ? forkOff(u) : 0); }
export function dcx(u){ return dcx0(u) + (BRANCH ? (forkOff(u + 1) - forkOff(u - 1)) / 2 : 0); }
/* Half the rail corridor's width (the canyon floor, the trench, the gap through the rocks). */
export function halfW(u){ return BRANCH && inFork(u) ? Math.min(L.fork.width, L.width(u)) + (1 - Math.abs(forkOff(u)) / L.fork.off) * (L.width(u) - Math.min(L.fork.width, L.width(u))) : L.width(u); }
/* The canyon's rim height (canyon and trench levels). */
export function rimH(u){ return L.rim ? L.rim(u) : 90; }

export function railFrame(u){
  const d = dcx(u), l = Math.hypot(d, 1);
  return {x: cx(u), z: -u, tx: d / l, tz: -1 / l, rx: 1 / l, rz: d / l};
}
/* A point in the rail's frame: u along, ox to the right, at height y. */
export function railPoint(u, ox, y){ const f = railFrame(u); return {x: f.x + f.rx * ox, y, z: f.z + f.rz * ox}; }
/* Sideways offset of a world point from the rail's line at u. */
export function lateralAt(u, x, z){ const f = railFrame(u); return (x - f.x) * f.rx + (z - f.z) * f.rz; }

/* ---------- height ---------- */
function canyonH(x, z){
  const u = -z;
  if(u > ARENA_U - 150 && L.arena !== false) return 1e9;
  let h = channelH(x, z, u, cx0(u), dcx0(u), L.width(u));
  if(inFork(u)){
    const o = forkOff(u), F = L.fork;
    const w = Math.min(F.width, L.width(u)) + (1 - Math.abs(o) / F.off) * (L.width(u) - Math.min(F.width, L.width(u)));
    h = Math.min(h, channelH(x, z, u, cx0(u) + o, dcx0(u) + (forkOff(u + 1) - forkOff(u - 1)) / 2, w));
  }
  return h;
}
function channelH(x, z, u, c, dc, w){
  const G = L.groundParams || {};
  const sl = Math.hypot(dc, 1);
  let d = Math.abs(x - c) / sl;
  const crag = G.crag == null ? 1 : G.crag;
  d += ((fbm(x * 0.018, z * 0.018, 3) - 0.5) * 14 + (vnoise(x * 0.09, z * 0.09) - 0.5) * 5) * crag;
  const H = rimH(u);
  if(d < w){
    let y = (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3 * (G.dunes == null ? 1 : G.dunes);
    if(G.stream !== false) y -= 3.5 * (1 - smooth(4, 14, d));
    y += 5 * smooth(w - 16, w, d) * crag;
    return y;
  }
  const wall = G.wall || 28, steps = G.steps || 4;
  const k = Math.min(1, (d - w) / wall);
  const s = k * k * (3 - 2 * k);
  const st = s * steps;
  const terr = (Math.floor(st) + smooth(0.2, 0.8, st - Math.floor(st))) / steps;
  let y = 5 + (H - 5) * Math.min(1, terr);
  y += (fbm(x * 0.012 + 3, z * 0.012, 4) - 0.5) * (G.roll == null ? 22 : G.roll) * k;
  return y;
}
function basinH(x, z){
  const G = L.groundParams || {};
  const dx = x - ARENA.x, dz = z - ARENA.z, r = Math.hypot(dx, dz);
  let y = (fbm(x * 0.008, z * 0.008, 4) - 0.45) * 16 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 3;
  const m = smooth(ARENA_R, ARENA_R + 240, r);
  if(m > 0){
    const ridge = 1 - Math.abs(fbm(x * 0.004 + 7, z * 0.004, 4) * 2 - 1);
    const M = G.mountains || 150;
    y += m * (M + M * 0.93 * ridge + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 50);
  }
  return y;
}
/* The trench: sheer walls with a ledge or two, opening into a chamber at the end. */
function trenchH(x, z){
  const u = -z, c = cx(u);
  if(L.railBossU && u > L.railBossU + 330) return rimH(u);     // the chamber's far wall
  const d = Math.abs(x - c), w = halfW(u), H = rimH(u);
  if(d < w) return 0;
  if(d < w + 3) return H * 0.45;
  if(d < w + 14) return H * 0.45 + (d > w + 9 ? H * 0.55 : 0);
  return H + Math.floor(vnoise(x * 0.02, z * 0.02) * 4) * 8;
}
/* The sea: islands where the noise rises above the waves, none in the rail's way. */
function oceanH(x, z){
  const u = -z;
  let y = (fbm(x * 0.004 + 11, z * 0.004, 4) - 0.6) * 260 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 12;
  // keep the rail's corridor and the clearing's middle open sea
  if(u < ARENA_U - 300){
    const d = Math.abs(lateralAt(u, x, z));
    y -= 120 * (1 - smooth(halfW(u) + 20, halfW(u) + 120, d));
  }
  if(L.arena !== false){
    const ra = Math.hypot(x - ARENA.x, z - ARENA.z);
    y -= 140 * (1 - smooth(ARENA_R * 0.5, ARENA_R, ra));
    y += smooth(ARENA_R + 100, ARENA_R + 400, ra) * 60;
  }
  return Math.max(y, -30);
}
/* The ground itself, wherever it is (below the waves too). */
export function groundAt(x, z){
  if(GROUND === 'space') return NONE;
  if(GROUND === 'ocean') return oceanH(x, z);
  if(GROUND === 'trench') return trenchH(x, z);
  return L.arena === false ? canyonH(x, z) : Math.min(canyonH(x, z), basinH(x, z));
}
/* What a ship hits: the ground, or the water. */
export function height(x, z){
  const g = groundAt(x, z);
  return GROUND === 'ocean' ? Math.max(g, 0) : g;
}
export function normalAt(x, z){
  if(GROUND === 'space') return [0, 1, 0];
  const e = 1.5;
  const hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  return [-hx / l, 2 * e / l, -hz / l];
}

/* ---------- obstacles ----------
   spire  - a rock column (or a tree, an ice spike, a sea stack): x, z, foot radius r, height h
   arch   - a stone bridge across the rail at u, underside y at the walls (higher in the middle)
   rock   - a sphere: an asteroid, a yarn ball, a station module, the moon: x, y, z, r
   They are kept in buckets along z, so a test only looks at the nearby few. */
const BUCKET = 120;
let buckets = new Map();
function bucketKeys(o){
  let z0, z1;
  if(o.type === 'arch'){ z0 = o.z - 60; z1 = o.z + 60; }
  else { const r = o.type === 'rock' ? o.r : o.r * 1.2 + 5; z0 = o.z - r; z1 = o.z + r; }
  const out = [];
  for(let k = Math.floor(z0 / BUCKET); k <= Math.floor(z1 / BUCKET); k++) out.push(k);
  return out;
}
export function archUnder(o, off){ const k = Math.min(1, Math.abs(off) / (o.w + 10)); return o.y + 14 * (1 - k * k); }
export function spireR(o, y){ return o.r * (1.1 - 0.35 * Math.min(1, Math.max(0, (y - (o.y0 || 0)) / o.h))); }
export function spireTop(o){ return (o.y0 || 0) + o.h; }

export function hitObstacle(x, y, z, rad){
  const list = buckets.get(Math.floor(z / BUCKET));
  if(!list) return null;
  for(const o of list){
    if(o.type === 'spire'){
      if(y > spireTop(o) + rad || y < (o.y0 || 0) - 20) continue;
      const dx = x - o.x, dz = z - o.z, rr = spireR(o, y) + rad;
      if(dx * dx + dz * dz < rr * rr) return o;
    } else if(o.type === 'rock'){
      const dx = x - o.x, dy = y - o.y, dz = z - o.z, rr = o.r + rad;
      if(dx * dx + dy * dy + dz * dz < rr * rr) return o;
    } else {
      const ax = x - o.x, az = z - o.z;
      const along = ax * o.tx + az * o.tz;
      if(Math.abs(along) > o.thick / 2 + rad) continue;
      const off = ax * o.rx + az * o.rz;
      if(y + rad > archUnder(o, off)) return o;
    }
  }
  return null;
}

/* Helpers for levels.js to lay out obstacles with. */
export const lay = {
  spire(u, off, r, h, look){ const p = railPoint(u, off, 0); return {type: 'spire', x: p.x, z: p.z, r, h, u, look: look || 'rock'}; },
  spireAt(x, z, r, h, look, y0){ return {type: 'spire', x, z, r, h, u: -z, look: look || 'rock', y0: y0 || 0}; },
  arch(u, y, thick, look){ return {type: 'arch', u, y, thick, look: look || 'rock'}; },
  rock(u, off, y, r, look){ const p = railPoint(u, off, y); return {type: 'rock', x: p.x, y, z: p.z, r, u, look: look || 'asteroid'}; },
  rockAt(x, y, z, r, look){ return {type: 'rock', x, y, z, r, u: -z, look: look || 'asteroid'}; },
  /* lay things out along the fork's other channel */
  onFork(fn){ const b = BRANCH; BRANCH = 1; const out = fn(); BRANCH = b; for(const o of out) o.branch = 1; return out; },
};

/* ---------- loading a level ---------- */
export function setLevel(def){
  L = def;
  GROUND = def.ground || 'canyon';
  const p = def.path || {};
  PA = p.a || [70, 34, 12]; PL = p.l || [420, 170, 73]; PP = p.p || [0, 1.3, 0.4];
  RAIL_END = def.railEnd || 3700;
  ARENA_U = def.arenaU || RAIL_END + 550;
  ARENA_R = def.arenaR || 560;
  ARENA_LIMIT = def.arenaLimit || 820;
  CEILING = def.ceiling || 460;
  FLOOR = GROUND === 'space' ? (def.floor || -380) : NONE;
  RAIL_TOP = def.railTop || 58;
  RAIL_FLOOR = def.railFloor != null ? def.railFloor : 6;
  WALL_MARGIN = def.wallMargin || 13;
  BRANCH = 0;
  ARENA = {x: cx(ARENA_U), z: -ARENA_U, y: def.arenaY || 0};
  lay.arenaX = ARENA.x; lay.arenaZ = ARENA.z;
  OBSTACLES = def.obstacles ? def.obstacles(lay, rng(def.seed || 1)) : [];
  for(const o of OBSTACLES) if(o.type === 'arch'){ BRANCH = o.branch || 0; Object.assign(o, railFrame(o.u), {w: halfW(o.u)}); BRANCH = 0; }
  buckets = new Map();
  for(const o of OBSTACLES) for(const k of bucketKeys(o)){ if(!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o); }
  return def;
}
