/* Dogfight - each level's world: the sky, the ground, the sea, the rocks,
   the props. Built from terrain.js (after setLevel) and the level's theme in
   levels.js; world.js puts it in the scene and throws it away for the next.

   Skies: 'day' (a gradient, the sun, streaky cloud, the ringed planet),
   'storm' (the same, dark, and it flashes with the lightning), 'space'
   (stars and two-coloured nebula). The ground is height() sampled into
   meshes - strips along the rail, a grid for the clearing - coloured from
   the theme's palette. */
import * as THREE from 'three';
import {groundAt, height, halfW, rimH, railFrame, fbm, vnoise, OBSTACLES, archUnder, spireTop, GROUND, L, RAIL_END, ARENA, ARENA_U, ARENA_R} from './terrain.js';
import {hot} from './models.js';

export const NOISE = `
float hash3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for(int i = 0; i < 5; i++){ s += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const DAY_FRAG = `
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uZen; uniform float uTime; uniform float uCloud; uniform float uFlash;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHaze, uZen, pow(h, 0.55));
  col = mix(col, uHaze * 0.85, smoothstep(0.0, -0.2, d.y));
  float s = max(0.0, dot(d, uSun));
  col += vec3(1.0, 0.75, 0.45) * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6) * (1.0 - min(1.0, uCloud * 0.6));
  col += vec3(4.0, 3.4, 2.6) * smoothstep(0.9993, 0.9996, s) * (1.0 - min(1.0, uCloud * 0.7));
  vec3 q = d / max(0.08, d.y) * 0.35;
  float c = fbm(vec3(q.x * 1.2 + uTime * 0.004, 0.0, q.z * 3.0));
  float cl = smoothstep(0.55 - uCloud * 0.25, 0.85, c) * smoothstep(0.02, 0.25, d.y) * min(1.0, 0.55 * uCloud + 0.2);
  vec3 ccol = mix(vec3(1.0, 0.95, 0.9), uHaze * 1.1, min(1.0, uCloud * 0.5));
  col = mix(col, ccol, cl);
  col += vec3(0.7, 0.75, 0.9) * uFlash * (0.4 + cl);
  gl_FragColor = vec4(col, 1.0);
}`;
const SPACE_FRAG = `
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uNebA; uniform vec3 uNebB; uniform float uTime;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  vec3 col = vec3(0.004, 0.005, 0.012);
  float n1 = fbm(d * 2.2), n2 = fbm(d * 3.7 + 7.0), wisp = fbm(d * 9.0 + 3.0);
  col += uNebA * smoothstep(0.42, 0.85, n1) * (0.4 + wisp * 0.8);
  col += uNebB * smoothstep(0.5, 0.9, n2) * (0.3 + wisp * 0.7);
  // stars: one in a few hundred cells of a grid round the sky
  vec3 p = d * 260.0, c = floor(p);
  float h = hash3(c);
  vec3 o = vec3(hash3(c + 1.7), hash3(c + 4.1), hash3(c + 9.3)) - 0.5;
  float st = step(0.975, h) * smoothstep(0.16, 0.0, length(fract(p) - 0.5 - o * 0.5));
  col += vec3(0.9, 0.92, 1.0) * st * (0.5 + (h - 0.975) * 60.0);
  float s = max(0.0, dot(d, uSun));
  col += vec3(1.0, 0.85, 0.65) * (pow(s, 12.0) * 0.4 + pow(s, 200.0) * 2.0) + vec3(4.0, 3.6, 3.0) * smoothstep(0.9995, 0.9997, s);
  gl_FragColor = vec4(col, 1.0);
}`;
const PLANET_VERT = `
varying vec3 vP; varying vec3 vWN; varying vec3 vV;
void main(){
  vP = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PLANET_FRAG = `
varying vec3 vP; varying vec3 vWN; varying vec3 vV;
uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uA; uniform vec3 uB; uniform float uWash; uniform float uLand;
${NOISE}
void main(){
  float w = fbm(vP * 3.0) * 1.6 + fbm(vP * 9.0) * 0.35;
  float b = vP.y * 11.0 + w;
  vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(b));
  // a planet with land and sea, for home
  float land = smoothstep(0.52, 0.56, fbm(vP * 2.5 + 4.0));
  c = mix(c, mix(vec3(0.2, 0.45, 0.2), vec3(0.6, 0.5, 0.3), fbm(vP * 6.0)), land * uLand);
  c = mix(c, vec3(1.0), smoothstep(0.6, 0.75, fbm(vP * 4.0 + 9.0)) * 0.6 * uLand);
  float l = dot(vWN, uSun);
  vec3 col = c * smoothstep(-0.3, 0.7, l) * 0.95 + c * 0.04;
  float rim = pow(1.0 - max(0.0, dot(vWN, vV)), 3.0);
  col += uB * rim * 0.4 * smoothstep(-0.3, 0.3, l);
  col = mix(col, uHaze, uWash);
  gl_FragColor = vec4(col, 1.0);
}`;
const RING_VERT = `
varying vec2 vUv;
uniform float uIn; uniform float uOut;
void main(){
  vUv = vec2((length(position.xy) - uIn) / (uOut - uIn), 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
varying vec2 vUv; uniform float uA;
${NOISE}
void main(){
  float r = vUv.x;
  float bands = fbm(vec3(r * 40.0, 0.0, 0.0)) * 0.9 + fbm(vec3(r * 140.0, 3.0, 0.0)) * 0.4;
  float a = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.85, r) * smoothstep(0.35, 0.7, bands);
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * a * uA, a * uA);
}`;
const WATER_VERT = `
#include <fog_pars_vertex>
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = `
#include <fog_pars_fragment>
varying vec3 vW;
uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uSun; uniform float uTime;
void main(){
  vec2 p = vW.xz;
  float t = uTime;
  // waves: a few travelling sines, their slopes as the surface's tilt
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.08 + t * 1.1) * 0.5;
  g += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 0.13 + t * 1.4) * 0.35;
  g += vec2(0.2, -1.0) * cos(dot(p, vec2(0.2, -1.0)) * 0.31 + t * 2.1) * 0.18;
  g += vec2(0.9, -0.3) * cos(dot(p, vec2(0.9, -0.3)) * 0.7 + t * 2.9) * 0.08;
  vec3 n = normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
  vec3 v = normalize(cameraPosition - vW);
  float fres = pow(1.0 - max(0.0, dot(n, v)), 4.0);
  vec3 col = mix(uDeep, uSky * 0.75, 0.04 + fres * 0.5);
  vec3 h = normalize(v + uSun);
  col += vec3(1.0, 0.95, 0.85) * pow(max(0.0, dot(n, h)), 220.0) * 2.5;
  col += vec3(0.9) * smoothstep(0.42, 0.5, g.x * g.y + 0.3) * 0.08;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

/* ---------- the ground's colours ---------- */
let PAL = null;
const _c = new THREE.Color(), _c2 = new THREE.Color();
function palette(th){
  return {strata: (th.strata || [0xa8502a]).map(h => new THREE.Color(h)), sand: new THREE.Color(th.sand || 0xd8a46c), scrub: new THREE.Color(th.scrub || 0x7d8040),
    wet: new THREE.Color(th.wet || 0x7a5232), top: new THREE.Color(th.top || 0xe2b47c), metal: !!th.metal, ice: !!th.ice, ocean: !!th.ocean};
}
function groundColor(x, y, z, ny, inside){
  const P = PAL;
  const t = y * (P.metal ? 0.05 : 0.085) + (fbm(x * 0.006, z * 0.006, 3) - 0.5) * (P.metal ? 0.6 : 3) + 20;
  const i = Math.floor(t), f = t - i;
  _c.copy(P.strata[i % P.strata.length]).lerp(P.strata[(i + 1) % P.strata.length], P.metal ? (f > 0.9 ? 1 : 0) : f * f * (3 - 2 * f));
  const flat = Math.min(1, Math.max(0, (ny - 0.72) / 0.2));
  if(flat > 0){
    const n = fbm(x * 0.05 + 3, z * 0.05, 3);
    _c2.copy(y > 50 ? P.top : P.sand);
    if(n > 0.55) _c2.lerp(P.scrub, Math.min(1, (n - 0.55) * 4) * 0.8);
    if(y < -1.2) _c2.lerp(P.wet, 0.6);
    if(P.ocean && y < 2) _c2.copy(P.sand);
    if(P.ocean && y < -4) _c2.copy(P.wet);
    _c.lerp(_c2, flat);
  }
  if(P.metal){
    // carpet stripes and panel seams
    if(Math.abs(Math.sin(z * 0.08)) > 0.97) _c.multiplyScalar(0.6);
    if(Math.abs(Math.sin(y * 0.5)) > 0.98) _c.lerp(new THREE.Color(0xffc040), 0.5);
  }
  if(inside) _c.multiplyScalar(0.62 + 0.38 * Math.min(1, Math.max(0, (y + 4) / 70)));
  _c.multiplyScalar(0.92 + vnoise(x * 0.3, z * 0.3) * 0.16);
  return _c;
}
function finishGeo(pos, col, uv, idx){
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const c = new Float32Array(pos.length);
  for(let i = 0; i < pos.length / 3; i++){
    const k = groundColor(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nrm.getY(i), col[i]);
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}
/* Strips along the rail, sampled finely where the walls are. */
function railChunk(u0, u1){
  const rows = Math.ceil((u1 - u0) / 3);
  const lat = [];
  for(let i = 0; i <= 8; i++) lat.push(['f', i / 8]);
  for(let i = 1; i <= 16; i++) lat.push(['w', i / 16]);
  for(let i = 1; i <= 10; i++) lat.push(['p', i / 10]);
  const offs = w => {
    const o = [];
    for(const [k, t] of lat){
      if(k === 'f') o.push(t * (w - 12));
      else if(k === 'w') o.push(w - 12 + t * 48);
      else o.push(w + 36 + Math.pow(t, 1.6) * (GROUND === 'ocean' ? 600 : 300));
    }
    return o.slice(1).reverse().map(v => -v).concat(o);
  };
  const cols = lat.length * 2 - 1;
  const pos = [], inside = [], uv = [], idx = [];
  for(let r = 0; r <= rows; r++){
    const u = u0 + (u1 - u0) * r / rows;
    const f = railFrame(u), w = halfW(u);
    for(const o of offs(w)){
      const x = f.x + f.rx * o, z = f.z + f.rz * o, y = groundAt(x, z);
      pos.push(x, y, z);
      inside.push(GROUND !== 'ocean' && Math.abs(o) < w + 30);
      uv.push(x * 0.05 + z * 0.02, (z * 0.05 + y * 0.09));
    }
  }
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols - 1; c++){
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  return finishGeo(pos, inside, uv, idx);
}
/* The clearing and all round it: one grid, beyond where the strips end. */
function arenaGrid(zStart){
  const half = 1500, n = 190, step = half * 2 / n;
  const pos = [], inside = [], uv = [], idx = [];
  let rows = 0;
  for(let j = 0; j <= n; j++){
    const z = ARENA.z - half + j * step;
    if(z > zStart + step) break;
    rows++;
    for(let i = 0; i <= n; i++){
      const x = ARENA.x - half + i * step, y = groundAt(x, z);
      pos.push(x, y, z); inside.push(false); uv.push(x * 0.05, z * 0.05 + y * 0.06);
    }
  }
  const cols = n + 1;
  for(let r = 0; r < rows - 1; r++) for(let c = 0; c < cols - 1; c++){
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  return finishGeo(pos, inside, uv, idx);
}
function grainTex(){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), im = g.createImageData(256, 256);
  for(let y = 0; y < 256; y++) for(let x = 0; x < 256; x++){
    const n = 0.55 * vnoise(x / 9, y / 9) + 0.3 * vnoise(x / 3.5 + 40, y / 3.5) + 0.15 * vnoise(x / 1.2 + 9, y / 1.2);
    const v = 185 + n * 70, i = (y * 256 + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  return t;
}
let GRAIN = null;

/* ---------- obstacles ---------- */
function knobbly(geo, seed, amt){
  const p = geo.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x * 0.08 + seed, z * 0.08 + y * 0.05, 3) - 0.5) * (amt == null ? 0.45 : amt);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
function lumpySphere(r, det, amt, seed){
  const geo = new THREE.IcosahedronGeometry(r, det);
  const p = geo.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x / r * 2 + seed, y / r * 2 + z / r * 1.3, 3) - 0.5) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
function colourBy(geo, ox, oy, oz){
  const p = geo.attributes.position, n = geo.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for(let i = 0; i < p.count; i++){
    const k = groundColor(p.getX(i) + ox, p.getY(i) + oy, p.getZ(i) + oz, n.getY(i), false);
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if(geo.attributes.uv) for(let i = 0; i < p.count; i++) geo.attributes.uv.setXY(i, (p.getX(i) + p.getZ(i)) * 0.05, p.getY(i) * 0.09);
}
function yarnTex(hue){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const col = new THREE.Color().setHSL(hue, 0.6, 0.55);
  g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, 128, 128);
  for(let i = 0; i < 40; i++){
    g.strokeStyle = `rgba(0,0,0,${0.12 + (i % 3) * 0.05})`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, i * 3.4); g.bezierCurveTo(40, i * 3.4 + 6, 80, i * 3.4 - 6, 128, i * 3.4); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function buildObstacle(o, mats){
  const look = o.look || 'rock';
  if(o.type === 'spire'){
    if(look === 'tree'){
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.7, o.r, o.h, 8), mats.bark);
      trunk.position.y = o.h / 2; g.add(trunk);
      for(let i = 0; i < 4; i++){
        const c = new THREE.Mesh(lumpySphere(o.r * 2.6, 1, 0.4, i + o.x), mats.leaf);
        c.position.set(Math.cos(i * 2.1) * o.r * 1.4, o.h - o.r * (i === 3 ? -0.5 : 1.2), Math.sin(i * 2.1) * o.r * 1.4);
        c.scale.y = 0.7; g.add(c);
      }
      g.position.set(o.x, o.y0 || 0, o.z);
      return g;
    }
    const geo = new THREE.CylinderGeometry(o.r * 0.75, o.r * 1.1, o.h + 12, look === 'ice' ? 7 : 16, 12);
    geo.translate(0, (o.h + 12) / 2 - 12, 0);
    if(look === 'ice'){
      const p = geo.attributes.position;
      for(let i = 0; i < p.count; i++){ const k = 1 - Math.max(0, p.getY(i) / (o.h + 12)) * 0.75; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mats.ice);
      m.position.set(o.x, o.y0 || 0, o.z);
      return m;
    }
    knobbly(geo, o.x * 0.01);
    colourBy(geo, o.x, 0, o.z);
    const m = new THREE.Mesh(geo, mats.rock);
    m.position.set(o.x, o.y0 || 0, o.z);
    return m;
  }
  if(o.type === 'rock'){
    if(look === 'yarn'){
      const g = new THREE.Group();
      const hue = (Math.abs(o.x * 0.013 + o.z * 0.007) % 1);
      const mat = new THREE.MeshStandardMaterial({map: yarnTex(hue), roughness: 0.95});
      g.add(new THREE.Mesh(new THREE.SphereGeometry(o.r, 16, 12), mat));
      for(let i = 0; i < 2; i++){ const t = new THREE.Mesh(new THREE.TorusGeometry(o.r * 1.0, o.r * 0.06, 4, 28), mat); t.rotation.set(i * 1.1, i * 0.7, 0); g.add(t); }
      // a loose strand trailing off
      const curve = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(i => new THREE.Vector3(o.r + i * o.r * 0.6, Math.sin(i) * o.r * 0.4, Math.cos(i * 1.3) * o.r * 0.3)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, o.r * 0.05, 4), mat));
      g.position.set(o.x, o.y, o.z);
      return g;
    }
    if(look === 'module'){
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.r * 1.6, 12), mats.metal));
      for(const y of [-1, 1]){ const c = new THREE.Mesh(new THREE.SphereGeometry(o.r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.metal); c.position.y = y * o.r * 0.8; if(y < 0) c.rotation.x = Math.PI; g.add(c); }
      for(let i = 0; i < 8; i++){ const w = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5), new THREE.MeshBasicMaterial({color: hot(0xffd080, 2)})); const a = i / 8 * Math.PI * 2; w.position.set(Math.cos(a) * (o.r + 0.1), (i % 2) * 6 - 3, Math.sin(a) * (o.r + 0.1)); w.lookAt(w.position.clone().multiplyScalar(2)); g.add(w); }
      g.position.set(o.x, o.y, o.z);
      return g;
    }
    if(look === 'moon'){
      const geo = lumpySphere(o.r, 5, 0.02, 3);
      const p = geo.attributes.position, c = new Float32Array(p.count * 3);
      for(let i = 0; i < p.count; i++){
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = fbm(x * 0.02, y * 0.02 + z * 0.013, 4), cr = fbm(x * 0.06 + 5, z * 0.06 + y * 0.04, 2);
        const v = 0.55 + n * 0.35 - (cr > 0.62 ? 0.18 : 0);
        c[i * 3] = v; c[i * 3 + 1] = v * 0.98; c[i * 3 + 2] = v * 0.95;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({vertexColors: true}));
      m.position.set(o.x, o.y, o.z);
      return m;
    }
    if(look === 'mug'){
      // junk the cats knocked off tables: a mug, floating
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.abs(o.x * 0.01) % 1, 0.5, 0.6), roughness: 0.4});
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.7, o.r * 0.62, o.r * 1.5, 18, 1, true), mat));
      const h = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.38, o.r * 0.1, 8, 16), mat); h.position.x = o.r * 0.72; g.add(h);
      const b = new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.62, 18), mat); b.rotation.x = Math.PI / 2; b.position.y = -o.r * 0.75; g.add(b);
      g.rotation.set(o.x % 3, o.z % 2, o.y % 1.5);
      g.position.set(o.x, o.y, o.z);
      return g;
    }
    const m = new THREE.Mesh(lumpySphere(o.r, 2, 0.5, o.x * 0.01), mats.asteroid);
    m.rotation.set(o.x % 6, o.z % 6, 0);
    m.position.set(o.x, o.y, o.z);
    return m;
  }
  // arches: a slab of rock (or ice, or a steel beam) bridging the rail
  const W = o.w + 40, T = o.thick;
  if(look === 'beam'){
    const g = new THREE.Group();
    const top = archUnder(o, 0) + 8;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W * 2, top - o.y, T), mats.metal);
    beam.position.y = (top + o.y) / 2;
    g.add(beam);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 1.5, T + 0.2), new THREE.MeshBasicMaterial({color: hot(0xffb020, 1.5)}));
    stripe.position.y = o.y + 1; g.add(stripe);
    g.position.set(o.x, 0, o.z);
    g.rotation.y = Math.atan2(-o.rz, o.rx);
    return g;
  }
  const geo = new THREE.BoxGeometry(W * 2, 1, T, 40, 10, 4);
  const p = geo.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), yy = p.getY(i) + 0.5, z = p.getZ(i);
    const under = archUnder(o, x);
    const top = (GROUND === 'ocean' ? under + 20 : rimH(o.u) + 8) + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 10;
    p.setXYZ(i, x, under + yy * (top - under), z * (1 + (vnoise(x * 0.1, yy * 3) - 0.5) * 0.5));
  }
  geo.computeVertexNormals();
  let mat = mats.rock;
  if(look === 'ice') mat = mats.ice; else colourBy(geo, o.x, 0, o.z);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(o.x, 0, o.z);
  m.rotation.y = Math.atan2(-o.rz, o.rx);
  if(GROUND === 'ocean'){
    // a sea arch stands on two legs
    const g = new THREE.Group(); g.add(m);
    for(const s of [-1, 1]){
      const leg = new THREE.Mesh(colouredLeg(o, s), mats.rock);
      g.add(leg);
    }
    return g;
  }
  return m;
}
function colouredLeg(o, s){
  const geo = new THREE.CylinderGeometry(9, 14, o.y + 30, 10, 6);
  knobbly(geo, s * 3);
  const off = s * (o.w + 18);
  const x = o.x + o.rx * off, z = o.z + o.rz * off;
  geo.translate(x, (o.y + 30) / 2 - 15, z);
  colourBy(geo, 0, 0, 0);
  return geo;
}

/* ---------- the whole level ---------- */
export function buildScenery(def, renderer){
  const th = def.theme || {};
  PAL = palette(th);
  GRAIN = GRAIN || grainTex();
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(...(th.sun || [-0.45, 0.42, -0.78])).normalize();
  const haze = new THREE.Color(...(th.haze || [0.5, 0.5, 0.6]));
  const zen = new THREE.Color(...(th.zenith || [0.2, 0.3, 0.6]));
  const space = th.kind === 'space';
  const out = {group, sunDir, haze, space, theme: th, chunks: [], arena: null, water: null, sea: null, planet: null, update: null};

  // the sky
  const skyU = space
    ? {uSun: {value: sunDir}, uNebA: {value: new THREE.Color(...th.nebula[0])}, uNebB: {value: new THREE.Color(...th.nebula[1])}, uTime: {value: 0}}
    : {uSun: {value: sunDir}, uHaze: {value: haze}, uZen: {value: zen}, uTime: {value: 0}, uCloud: {value: th.clouds == null ? 0.6 : th.clouds}, uFlash: {value: 0}};
  const skyMat = new THREE.ShaderMaterial({vertexShader: SKY_VERT, fragmentShader: space ? SPACE_FRAG : DAY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU});
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);
  out.sky = sky; out.skyMat = skyMat;
  // the ringed planet in a day sky; home, big, at Moonfall
  if(th.planet || th.home){
    const planet = new THREE.Group();
    const home = !!th.home;
    const pm = new THREE.Mesh(new THREE.SphereGeometry(home ? 900 : 520, 48, 32), new THREE.ShaderMaterial({vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false, depthWrite: false,
      uniforms: {uSun: {value: sunDir}, uHaze: {value: haze}, uA: {value: home ? new THREE.Color(0.1, 0.3, 0.7) : new THREE.Color(0.62, 0.70, 0.86)}, uB: {value: home ? new THREE.Color(0.2, 0.5, 0.9) : new THREE.Color(0.42, 0.50, 0.72)},
        uWash: {value: home ? 0 : 0.45}, uLand: {value: home ? 1 : 0}}}));
    planet.add(pm);
    if(!home){
      const ring = new THREE.Mesh(new THREE.RingGeometry(700, 1150, 96, 1), new THREE.ShaderMaterial({vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: {uIn: {value: 700}, uOut: {value: 1150}, uA: {value: 0.35}}, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false}));
      ring.rotation.x = -1.25; ring.rotation.y = 0.35;
      planet.add(ring);
      ring.renderOrder = -8;
    }
    pm.renderOrder = -9;
    out.planet = planet; out.planetDir = home ? new THREE.Vector3(-0.3, 0.25, -0.92).normalize() : new THREE.Vector3(0.55, 0.38, -0.74).normalize();
    group.add(planet);
  }

  // the ground
  const groundMat = new THREE.MeshLambertMaterial({vertexColors: true, map: GRAIN});
  if(GROUND !== 'space'){
    const end = def.arena === false ? (def.railBossU || RAIL_END) + 420 : RAIL_END + 40;
    for(let u = -200; u < end; u += 150){
      const m = new THREE.Mesh(railChunk(u, Math.min(u + 150, end)), groundMat);
      m.userData.u = u;
      group.add(m); out.chunks.push(m);
    }
    if(def.arena !== false){
      out.arena = new THREE.Mesh(arenaGrid(-(RAIL_END - 160)), groundMat);
      group.add(out.arena);
    }
  }
  // water: the open sea, or a stream along the canyon floor
  if(GROUND === 'ocean'){
    const mat = new THREE.ShaderMaterial({vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {uDeep: {value: new THREE.Color(th.water || 0x1a6a8a).multiplyScalar(0.6)}, uSky: {value: haze.clone()}, uSun: {value: sunDir}, uTime: {value: 0}}])});
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), mat);
    sea.rotation.x = -Math.PI / 2;
    group.add(sea); out.sea = sea;
  } else if(GROUND === 'canyon' && !(def.groundParams && def.groundParams.stream === false)){
    const pos = [], idx = [];
    let rows = 0;
    for(let u = -200; u < ARENA_U - 150; u += 6){
      const f = railFrame(u);
      for(const o of [-11, 0, 11]) pos.push(f.x + f.rx * o, -1.4, f.z + f.rz * o);
      rows++;
    }
    for(let r = 0; r < rows - 1; r++) for(let c = 0; c < 2; c++){ const a = r * 3 + c; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    out.water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: th.water || 0x2c5f6e, metalness: 0.1, roughness: th.ice ? 0.3 : 0.08, envMapIntensity: 1.4}));
    group.add(out.water);
  }
  // the rocks and everything else
  const mats = {
    rock: new THREE.MeshLambertMaterial({vertexColors: true, map: GRAIN}),
    ice: new THREE.MeshStandardMaterial({color: 0xcfe8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92, envMapIntensity: 1.5}),
    bark: new THREE.MeshLambertMaterial({color: 0x5a3a22, map: GRAIN}),
    leaf: new THREE.MeshLambertMaterial({color: 0x3a7a2a, flatShading: true}),
    metal: new THREE.MeshStandardMaterial({color: 0x6a6878, metalness: 0.7, roughness: 0.4}),
    asteroid: new THREE.MeshStandardMaterial({color: 0x6a625a, roughness: 0.95, flatShading: true}),
  };
  for(const o of OBSTACLES) group.add(buildObstacle(o, mats));
  // the Kennel: a ring of girders through the modules
  if(OBSTACLES.some(o => o.look === 'module')){
    const ring = new THREE.Mesh(new THREE.TorusGeometry(160, 3, 8, 96), mats.metal);
    ring.rotation.x = Math.PI / 2; ring.position.set(ARENA.x, 0, ARENA.z);
    group.add(ring);
  }

  // light, and a picture of the sky for shiny things to reflect
  out.sunColor = new THREE.Color(th.sunColor || (th.kind === 'storm' ? 0xb8c4d8 : 0xfff0dc));
  out.sunI = th.kind === 'storm' ? 1.8 : space ? 2.8 : 2.6;
  out.hemiSky = new THREE.Color(space ? 0x405070 : th.kind === 'storm' ? 0x58607a : 0xa8c8ff);
  out.hemiGround = new THREE.Color(space ? 0x201820 : th.kind === 'storm' ? 0x303828 : (th.ocean ? 0x4a7a8a : 0xb0683a));
  out.hemiI = space ? 0.7 : th.kind === 'storm' ? 1.5 : 1.1;
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: (space ? SPACE_FRAG : DAY_FRAG).replace('gl_FragColor = vec4(col, 1.0);', space ? 'col += vec3(0.04, 0.045, 0.06); gl_FragColor = vec4(col, 1.0);' : 'col = mix(col, vec3(0.55, 0.32, 0.2) * 0.8, smoothstep(0.0, -0.15, d.y)); gl_FragColor = vec4(col, 1.0);'),
    side: THREE.BackSide, uniforms: skyU})));
  out.env = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();
  const fog = th.fog || [260, 1700];
  out.fog = new THREE.Fog(space ? new THREE.Color(...th.nebula[0]).multiplyScalar(0.25) : haze.clone().multiplyScalar(th.kind === 'storm' ? 0.8 : 0.92), fog[0], fog[1]);
  out.background = space ? new THREE.Color(0, 0, 0) : haze.clone();

  out.update = (cam, time, flash) => {
    sky.position.copy(cam.position);
    skyU.uTime.value = time;
    if(skyU.uFlash) skyU.uFlash.value = flash || 0;
    if(out.planet){ out.planet.position.copy(cam.position).addScaledVector(out.planetDir, th.home ? 3800 : 4200); out.planet.lookAt(cam.position); }
    if(out.sea){ out.sea.position.set(cam.position.x, 0, cam.position.z); out.sea.material.uniforms.uTime.value = time; }
    const cu = -cam.position.z;
    for(const c of out.chunks) c.visible = c.userData.u > cu - 350 && c.userData.u < cu + 1500;
    if(out.arena) out.arena.visible = cu > RAIL_END - 1600;
  };
  out.dispose = () => {
    group.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material){ const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => { if(x.map && x.map !== GRAIN) x.map.dispose(); x.dispose(); }); } });
    out.env.dispose();
  };
  return out;
}
