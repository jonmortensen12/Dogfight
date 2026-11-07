/* Dogfight - the ground. Pure: no drawing, no randomness at run time.

   One function, height(x, z), is the whole landscape. The simulation asks it
   whether a ship has hit the ground; world.js builds its meshes from it. So
   what you see is what you crash into.

   The level runs along -z. The canyon's centre line is cx(u), where u = -z
   is how far along the rail you are. The canyon cuts through a ring of
   mountains into a wide basin (the clearing) centred at ARENA, where the
   rail lets go and the fight is free.

   Spires and arches are not in the height field: they are too steep for its
   grid. They are listed in OBSTACLES and tested separately (hitObstacle). */

export const CANYON_END = 3700;        // u where the rail lets go
export const ARENA_U = 4250;           // the clearing's centre, along the rail
export const ARENA_R = 560;            // radius of the flat floor
export const ARENA_LIMIT = 820;        // past this, the ship is turned back
export const CEILING = 460;
export const RAIL_TOP = 58, RAIL_FLOOR = 6, WALL_MARGIN = 13;

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
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- the canyon's line ---------- */
export function cx(u){ return 70 * Math.sin(u / 420) + 34 * Math.sin(u / 170 + 1.3) + 12 * Math.sin(u / 73 + 0.4); }
export function dcx(u){ return 70 / 420 * Math.cos(u / 420) + 34 / 170 * Math.cos(u / 170 + 1.3) + 12 / 73 * Math.cos(u / 73 + 0.4); }
/* Half the canyon floor's width. Narrow stretches are the thrilling ones. */
export function halfW(u){
  let w = 50 + 12 * Math.sin(u / 260 + 0.5);
  w -= 16 * smooth(1750, 1850, u) * (1 - smooth(2150, 2250, u));   // the narrows
  w += 30 * smooth(3300, 3650, u);                                  // opening into the clearing
  return w;
}
export function rimH(u){ return 88 + 14 * Math.sin(u / 600) + 20 * smooth(3200, 3600, u); }

/* Where the rail is at u: the point on the canyon floor's centre line, the
   way along (t) and the way to the right (r), both level. */
export function railFrame(u){
  const d = dcx(u), l = Math.hypot(d, 1);
  // position (cx(u), 0, -u); d/du = (dcx, 0, -1)
  return {x: cx(u), z: -u, tx: d / l, tz: -1 / l, rx: 1 / l, rz: d / l};
}

export const ARENA = {x: cx(ARENA_U), z: -ARENA_U};

/* ---------- height ---------- */
function canyonH(x, z){
  const u = -z;
  if(u > ARENA_U - 150) return 1e9;
  const c = cx(u), sl = Math.hypot(dcx(u), 1);
  // craggy walls: the distance from the centre line is pushed about by noise
  let d = Math.abs(x - c) / sl;
  d += (fbm(x * 0.018, z * 0.018, 3) - 0.5) * 14 + (vnoise(x * 0.09, z * 0.09) - 0.5) * 5;
  const w = halfW(u), H = rimH(u);
  if(d < w){
    let y = (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 3;            // dunes
    y -= 3.5 * (1 - smooth(4, 14, d));                         // the stream bed
    y += 5 * smooth(w - 16, w, d);                             // scree at the foot of the walls
    return y;
  }
  const k = Math.min(1, (d - w) / 28);
  const s = k * k * (3 - 2 * k);
  const st = s * 4;
  const terr = (Math.floor(st) + smooth(0.2, 0.8, st - Math.floor(st))) / 4;   // strata ledges
  let y = 5 + (H - 5) * Math.min(1, terr);
  y += (fbm(x * 0.012 + 3, z * 0.012, 4) - 0.5) * 22 * k;     // the plateau rolls
  return y;
}

function basinH(x, z){
  const dx = x - ARENA.x, dz = z - ARENA.z, r = Math.hypot(dx, dz);
  let y = (fbm(x * 0.008, z * 0.008, 4) - 0.45) * 16 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 3;
  const m = smooth(ARENA_R, ARENA_R + 240, r);
  if(m > 0){
    const ridge = 1 - Math.abs(fbm(x * 0.004 + 7, z * 0.004, 4) * 2 - 1);
    y += m * (150 + 140 * ridge + (fbm(x * 0.02, z * 0.02, 3) - 0.5) * 50);
  }
  return y;
}

export function height(x, z){
  return Math.min(canyonH(x, z), basinH(x, z));
}

/* The ground's slope, for lighting and for bouncing off it. */
export function normalAt(x, z){
  const e = 1.5;
  const hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  return [-hx / l, 2 * e / l, -hz / l];
}

/* ---------- spires and arches ----------
   A spire is a rock column: x, z, radius at the foot, height.
   An arch is a stone bridge across the canyon at u: its underside is at y
   at the walls and higher in the middle. Fly under it. */
function lateral(u, off){ const f = railFrame(u); return {x: f.x + f.rx * off, z: f.z + f.rz * off}; }
function spireAt(u, off, r, h){ const p = lateral(u, off); return {type: 'spire', x: p.x, z: p.z, r, h, u}; }
export const OBSTACLES = [
  spireAt(800, -18, 7, 70), spireAt(880, 16, 7, 80), spireAt(960, -10, 8, 65),
  {type: 'arch', u: 1250, y: 34, thick: 14},
  spireAt(1900, 12, 6, 60), spireAt(1990, -9, 6, 72), spireAt(2080, 8, 6, 66),
  {type: 'arch', u: 2420, y: 30, thick: 12},
  {type: 'arch', u: 2520, y: 38, thick: 16},
  spireAt(3000, 0, 9, 75),
  // buttes in the clearing: cover to fight round
  ...[[0.45, 140, 38, 150], [2.2, 330, 46, 190], [3.7, 250, 32, 120], [5.2, 380, 52, 210], [1.2, 420, 30, 135]].map(([a, r, rad, h]) =>
    ({type: 'spire', x: ARENA.x + Math.cos(a) * r, z: ARENA.z + Math.sin(a) * r, r: rad, h, u: ARENA_U})),
];
for(const o of OBSTACLES) if(o.type === 'arch') Object.assign(o, railFrame(o.u), {w: halfW(o.u)});

/* The arch's underside at a sideways offset from the centre line. */
export function archUnder(o, off){ const k = Math.min(1, Math.abs(off) / (o.w + 10)); return o.y + 14 * (1 - k * k); }
/* Spires taper: the radius at a height. */
export function spireR(o, y){ return o.r * (1.1 - 0.35 * Math.min(1, Math.max(0, y / o.h))); }

/* Is a sphere of radius rad at (x,y,z) inside any obstacle? Returns it, or null. */
export function hitObstacle(x, y, z, rad){
  for(const o of OBSTACLES){
    if(o.type === 'spire'){
      if(y > o.h + rad) continue;
      const dx = x - o.x, dz = z - o.z, rr = spireR(o, y) + rad;
      if(dx * dx + dz * dz < rr * rr) return o;
    } else {
      // along and across the canyon at the arch
      const ax = x - o.x, az = z - o.z;
      const along = ax * o.tx + az * o.tz;
      if(Math.abs(along) > o.thick / 2 + rad) continue;
      const off = ax * o.rx + az * o.rz;
      if(y + rad > archUnder(o, off)) return o;
    }
  }
  return null;
}
