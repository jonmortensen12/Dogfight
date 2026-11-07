/* Dogfight - the world, drawn. Decides nothing: it is shown the sim each
   frame and draws it.

   Borrowed from Night Watch: the particle system, the camera-facing beams,
   the glow textures, the enemy ships (built from primitives, nose along +z,
   every glowing part brighter than white so the bloom catches it) and the
   ringed planet. New here: the ground (built from terrain.js's height(), so
   what you see is what you hit), the sky, the rocks and Teddy's ship. */
import * as THREE from 'three';
import {EffectComposer} from './lib/postprocessing/EffectComposer.js';
import {RenderPass} from './lib/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './lib/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './lib/postprocessing/OutputPass.js';
import {height, halfW, rimH, cx, dcx, railFrame, fbm, vnoise, OBSTACLES, archUnder, spireR,
  ARENA, ARENA_U, ARENA_R, CANYON_END} from './terrain.js';
import {railPoint} from './sim.js';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.42, -0.78).normalize();   // ahead, left, low: long shadows, warm light
const PLANET_DIR = new THREE.Vector3(0.55, 0.38, -0.74).normalize();
const HAZE = new THREE.Color(0.93, 0.70, 0.52);
const ZENITH = new THREE.Color(0.20, 0.38, 0.70);

/* ---------- GLSL ---------- */
const NOISE = `
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
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uHaze; uniform vec3 uZen; uniform float uTime;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHaze, uZen, pow(h, 0.55));
  col = mix(col, uHaze * 0.85, smoothstep(0.0, -0.2, d.y));
  float s = max(0.0, dot(d, uSun));
  col += vec3(1.0, 0.75, 0.45) * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6);
  col += vec3(4.0, 3.4, 2.6) * smoothstep(0.9993, 0.9996, s);
  // high thin cloud, streaked along the wind
  vec3 q = d / max(0.08, d.y) * 0.35;
  float c = fbm(vec3(q.x * 1.2 + uTime * 0.004, 0.0, q.z * 3.0));
  float cl = smoothstep(0.5, 0.8, c) * smoothstep(0.02, 0.25, d.y) * 0.55;
  vec3 ccol = mix(vec3(1.0, 0.9, 0.8), vec3(1.0, 0.7, 0.5), pow(s, 3.0));
  col = mix(col, ccol, cl);
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
uniform vec3 uSun; uniform vec3 uHaze;
${NOISE}
void main(){
  float w = fbm(vP * 3.0) * 1.6 + fbm(vP * 9.0) * 0.35;
  float b = vP.y * 11.0 + w;
  vec3 c = mix(vec3(0.62, 0.70, 0.86), vec3(0.42, 0.50, 0.72), 0.5 + 0.5 * sin(b));
  c = mix(c, vec3(0.92, 0.88, 0.82), smoothstep(0.55, 1.0, sin(b * 2.3 + 1.0)) * 0.5);
  float l = dot(vWN, uSun);
  vec3 col = c * smoothstep(-0.3, 0.7, l) * 0.9 + c * 0.25;
  // seen through the day sky: washed out towards the haze
  col = mix(uHaze, col, 0.55);
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
varying vec2 vUv;
${NOISE}
void main(){
  float r = vUv.x;
  float bands = fbm(vec3(r * 40.0, 0.0, 0.0)) * 0.9 + fbm(vec3(r * 140.0, 3.0, 0.0)) * 0.4;
  float a = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.85, r) * smoothstep(0.35, 0.7, bands);
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * a * 0.35, a * 0.35);
}`;
const PART_VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
uniform float uScale;
varying vec3 vC; varying float vA;
void main(){
  vC = aColor; vA = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha <= 0.0 ? 0.0 : clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 256.0);
}`;
const PART_FRAG = `
varying vec3 vC; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vC * a * a * vA, 1.0);
}`;
const BEAM_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = `
varying vec2 vUv; uniform vec3 uColor; uniform float uAlpha;
void main(){
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-x * x * 40.0), glow = exp(-x * x * 5.0) * 0.55;
  float ends = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  vec3 c = mix(uColor, vec3(1.0), core * 0.8) * (core * 2.2 + glow);
  gl_FragColor = vec4(c * uAlpha * ends, 1.0);
}`;
const FRESNEL_VERT = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vP = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RIM_FRAG = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
uniform vec3 uColor; uniform float uPow; uniform float uAlpha; uniform float uTime;
void main(){
  float f = pow(1.0 - abs(dot(vN, vV)), uPow);
  float shimmer = 0.7 + 0.3 * sin(vP.y * 18.0 + uTime * 6.0) * sin(vP.x * 14.0 - uTime * 4.0);
  gl_FragColor = vec4(uColor * f * uAlpha * shimmer, 1.0);
}`;

/* ---------- little textures ---------- */
export function canvasTex(size, draw){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function glowTex(){
  return canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,255,255,0.75)');
    r.addColorStop(0.4, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
}
function ringTex(){
  return canvasTex(256, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.82, 'rgba(255,255,255,0)');
    r.addColorStop(0.92, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
}
function shadowTex(){
  return canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(0.5, 'rgba(0,0,0,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
}
/* Grain for the rock, so it is not just smooth colour. */
function grainTex(){
  const t = canvasTex(256, (g, s) => {
    const im = g.createImageData(s, s);
    for(let y = 0; y < s; y++) for(let x = 0; x < s; x++){
      const n = 0.55 * vnoise(x / 9, y / 9) + 0.3 * vnoise(x / 3.5 + 40, y / 3.5) + 0.15 * vnoise(x / 1.2 + 9, y / 1.2);
      // tile: blend with the wrapped copy
      const v = 185 + n * 70;
      const i = (y * s + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  return t;
}

/* ---------- particles ---------- */
class Particles {
  constructor(n){
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.size0 = new Float32Array(n);
    this.alpha = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.drag = new Float32Array(n); this.grow = new Float32Array(n); this.grav = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize); geo.setAttribute('aAlpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      uniforms: {uScale: {value: 500}}, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, size, life, drag, grow, grav){
    const i = this.next; this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.size[i] = this.size0[i] = size; this.life[i] = this.max[i] = life; this.alpha[i] = 1;
    this.drag[i] = drag || 0; this.grow[i] = grow || 0; this.grav[i] = grav || 0;
  }
  burst(p, n, speed, color, size, life, grav){
    for(let i = 0; i < n; i++){
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const v = speed * (0.3 + Math.random() * 0.7), c = 0.7 + Math.random() * 0.6;
      this.emit(p.x, p.y, p.z, s * Math.cos(a) * v, u * v, s * Math.sin(a) * v,
        color.r * c, color.g * c, color.b * c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), 2.2, 0.5, grav);
    }
  }
  update(dt){
    for(let i = 0; i < this.n; i++){
      if(this.life[i] <= 0){ if(this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, f = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= f; this.vel[k + 1] = this.vel[k + 1] * f - this.grav[i] * dt; this.vel[k + 2] *= f;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const l = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = l * l;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - l));
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
}

/* ---------- beams: lasers, camera-facing quads ---------- */
const beamGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
class Beam {
  constructor(scene, color, width){
    this.mat = new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: {uColor: {value: color.clone()}, uAlpha: {value: 1}},
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide});
    this.mesh = new THREE.Mesh(beamGeo, this.mat);
    this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.width = width;
    scene.add(this.mesh);
  }
  place(cam){
    const axis = _v1.subVectors(this.b, this.a);
    const toCam = _v2.subVectors(cam.position, this.a);
    const side = _v3.crossVectors(axis, toCam).normalize().multiplyScalar(this.width);
    const n = _v4.crossVectors(side, axis).normalize();
    this.mesh.matrix.makeBasis(side, axis, n).setPosition(this.a);
    this.mesh.matrixWorldNeedsUpdate = true;
  }
}

export function hot(hex, k){ const c = new THREE.Color(hex); c.multiplyScalar(k || 3); return c; }
const glowMat = (hex, k) => new THREE.MeshBasicMaterial({color: hot(hex, k)});

/* ---------- Teddy's ship ----------
   Teddy is a Bernedoodle: black and curly, tan eyebrows and cheeks and
   legs, a white blaze and chest. The ship wears his colours: a black hull,
   a white nose, tan trim, a red collar band with a gold tag, and wings
   whose tips droop like his ears. He sits in the cockpit. Nose along +z. */
export function buildTeddyShip(glow){
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({color: 0x1b1c22, metalness: 0.45, roughness: 0.38});
  const tan = new THREE.MeshStandardMaterial({color: 0xc4874a, metalness: 0.25, roughness: 0.45});
  const white = new THREE.MeshStandardMaterial({color: 0xeeeae2, metalness: 0.2, roughness: 0.35});
  const red = new THREE.MeshStandardMaterial({color: 0xc8202a, metalness: 0.3, roughness: 0.4});
  const gold = new THREE.MeshStandardMaterial({color: 0xe0a830, metalness: 0.9, roughness: 0.25});
  const flash = [black, tan, white];
  const add = (geo, mat, x, y, z, rx, ry, rz, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    (parent || g).add(m); return m;
  };
  // the fuselage: a lathe, fat in the middle, nose forward
  const prof = [[0, -3.4], [0.55, -3.3], [0.8, -2.6], [0.95, -1.2], [0.92, 0.6], [0.7, 2.0], [0.42, 3.0], [0.12, 3.6], [0, 3.7]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = add(new THREE.LatheGeometry(prof, 20), black, 0, 0, 0, Math.PI / 2);
  body.scale.set(1, 1, 0.85);
  add(new THREE.SphereGeometry(0.5, 16, 12), white, 0, -0.05, 3.25).scale.set(0.9, 0.8, 1.1);      // white nose
  add(new THREE.BoxGeometry(0.3, 0.05, 1.5), white, 0, 0.6, 2.3, -0.22);                          // the blaze
  add(new THREE.TorusGeometry(0.9, 0.12, 8, 28), red, 0, 0, -0.2);                                 // the collar
  const tag = add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), gold, 0, -1.08, -0.05, Math.PI / 2);
  // canopy
  const glass = new THREE.MeshStandardMaterial({color: 0x9fd8ff, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.4});
  add(new THREE.SphereGeometry(0.66, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.55, 0.95).scale.set(1.0, 1.25, 1.7);
  // Teddy
  const pilot = buildTeddyHead();
  pilot.scale.setScalar(0.5); pilot.position.set(0, 0.9, 0.8);
  g.add(pilot);
  // wings: swept, tan leading edge, tips drooping like ears
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 1.0); wingShape.lineTo(2.9, -0.4); wingShape.lineTo(2.9, -1.3); wingShape.lineTo(0, -1.6); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1});
  wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.07, 0);
  const earShape = new THREE.Shape();
  earShape.moveTo(0, 0); earShape.quadraticCurveTo(1.0, 0.25, 1.5, -0.35); earShape.quadraticCurveTo(1.35, -1.1, 0.8, -1.25); earShape.lineTo(0, -0.9); earShape.closePath();
  const earGeo = new THREE.ExtrudeGeometry(earShape, {depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 8});
  earGeo.rotateX(Math.PI / 2);
  for(const s of [1, -1]){
    const w = new THREE.Group(); w.position.set(s * 0.7, -0.15, -0.6); w.rotation.z = s * -0.06;
    g.add(w);
    const wm = add(wingGeo, black, 0, 0, 0, 0, 0, 0, w); if(s < 0) wm.scale.x = -1;
    const edge = add(new THREE.BoxGeometry(3.0, 0.18, 0.22), tan, s * 1.45, 0.07, 0.35, 0, s * 0.45, 0, w);
    void edge;
    // the ear: hinged at the wing tip, drooping down and out
    const ear = new THREE.Group(); ear.position.set(s * 2.85, 0.05, -0.35); ear.rotation.z = s * -0.95; ear.scale.setScalar(1.25);
    w.add(ear);
    const em = add(earGeo, black, 0, 0, 0.45, 0, 0, 0, ear); if(s < 0) em.scale.x = -1;
    add(new THREE.SphereGeometry(0.16, 8, 6), glowMat(0x58e0ff, 3), s * 1.45, 0, -0.1, 0, 0, 0, ear);   // nav light
    // engine pod under each wing
    add(new THREE.CylinderGeometry(0.34, 0.42, 2.0, 12), white, s * 1.3, -0.3, -0.7, Math.PI / 2, 0, 0, w);
    add(new THREE.TorusGeometry(0.36, 0.07, 6, 16), tan, s * 1.3, -0.3, -1.7, 0, 0, 0, w);
  }
  // tail: two fins canted out, white with tan tips
  for(const s of [1, -1]){
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-1.3, 0); fin.lineTo(-1.6, 1.4); fin.lineTo(-1.05, 1.4); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, {depth: 0.08, bevelEnabled: false});
    fg.rotateY(Math.PI / 2);
    const f = add(fg, white, s * 0.42, 0.45, -1.9, 0, 0, s * -0.32);
    void f;
  }
  // the tail: a fluffy pom of an exhaust, and the engine glow
  const engines = [];
  for(const s of [1, -1]){
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(0x5ad8ff, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
    sp.scale.set(1.1, 1.1, 1); sp.position.set(s * 1.98, -0.45, -2.45);
    g.add(sp); engines.push(sp);
  }
  const main = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(0x7ae6ff, 1.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
  main.scale.set(2.2, 2.2, 1); main.position.set(0, 0, -3.5);
  g.add(main); engines.push(main);
  add(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 14), glowMat(0x7ae6ff, 2.5), 0, 0, -3.35, Math.PI / 2);
  g.userData = {flash, engines, pilot, tag};
  return g;
}

/* Teddy's head, built for the cockpit and the title screen. Facing +z. */
export function buildTeddyHead(){
  const g = new THREE.Group();
  const curl = new THREE.MeshStandardMaterial({color: 0x15151a, roughness: 0.9, metalness: 0, flatShading: true});
  const tan = new THREE.MeshStandardMaterial({color: 0xb57a45, roughness: 0.8, flatShading: true});
  const white = new THREE.MeshStandardMaterial({color: 0xf2efe9, roughness: 0.85, flatShading: true});
  const grey = new THREE.MeshStandardMaterial({color: 0x9a9894, roughness: 0.85, flatShading: true});
  const nose = new THREE.MeshStandardMaterial({color: 0x050506, roughness: 0.3, metalness: 0.1});
  const eye = new THREE.MeshStandardMaterial({color: 0x2a1408, roughness: 0.15, metalness: 0.2});
  const pink = new THREE.MeshStandardMaterial({color: 0xe0707e, roughness: 0.6});
  const add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if(sx) m.scale.set(sx, sy, sz); g.add(m); return m; };
  // curly: lumpy icosahedra
  const lumpy = (r, det, amt, seed) => {
    const geo = new THREE.IcosahedronGeometry(r, det);
    const p = geo.attributes.position;
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + (vnoise(x * 6 + seed, y * 6 + z * 3) - 0.5) * amt;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
  };
  add(lumpy(1, 2, 0.22, 1), curl, 0, 0.1, 0, 1.0, 1.0, 0.95);               // head, a big curly top
  add(lumpy(0.55, 1, 0.3, 4), curl, 0, 0.75, 0.15, 1.2, 0.7, 1);              // topknot
  // the white blaze up the face, the muzzle, grey whiskers
  add(lumpy(0.55, 1, 0.18, 2), white, 0, -0.2, 0.75, 1.0, 0.85, 0.9);
  add(lumpy(0.3, 1, 0.2, 7), grey, 0, 0.1, 0.95, 0.7, 0.6, 0.5);
  add(new THREE.BoxGeometry(0.16, 0.7, 0.1), white, 0, 0.45, 0.88);
  add(lumpy(0.3, 1, 0.25, 3), tan, 0.38, -0.32, 0.7, 1, 0.9, 0.9);           // tan cheeks
  add(lumpy(0.3, 1, 0.25, 5), tan, -0.38, -0.32, 0.7, 1, 0.9, 0.9);
  add(new THREE.SphereGeometry(0.17, 12, 10), nose, 0, -0.08, 1.24, 1.25, 0.9, 0.9);
  add(new THREE.SphereGeometry(0.12, 10, 8), eye, 0.34, 0.22, 0.86);
  add(new THREE.SphereGeometry(0.12, 10, 8), eye, -0.34, 0.22, 0.86);
  add(new THREE.SphereGeometry(0.1, 8, 6), tan, 0.36, 0.42, 0.86, 1.4, 0.7, 0.7);   // eyebrows
  add(new THREE.SphereGeometry(0.1, 8, 6), tan, -0.36, 0.42, 0.86, 1.4, 0.7, 0.7);
  add(new THREE.SphereGeometry(0.14, 10, 8), pink, 0, -0.5, 1.0, 1, 0.5, 0.8);       // tongue out
  // floppy ears
  for(const s of [1, -1]){
    const e = add(lumpy(0.45, 1, 0.3, 6 + s), curl, s * 0.88, -0.25, 0.05, 0.55, 1.15, 0.8);
    e.rotation.z = s * 0.25;
  }
  // a little flying helmet strap? No - Teddy flies au naturel, with his collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 6, 20), new THREE.MeshStandardMaterial({color: 0xd2462a, roughness: 0.6}));
  collar.rotation.x = Math.PI / 2; collar.position.set(0, -0.85, 0.15);
  g.add(collar);
  return g;
}

/* ---------- enemy ships (from Night Watch) ---------- */
function buildEnemy(type, glow){
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({color: 0x8a94a8, metalness: 0.6, roughness: 0.35, emissive: 0x000000});
  const dark = new THREE.MeshStandardMaterial({color: 0x3c4352, metalness: 0.5, roughness: 0.55, emissive: 0x000000});
  const flash = [hull, dark];
  const engines = [];
  const add = (geo, mat, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    g.add(m); return m;
  };
  const sprite = (color, s, x, y, z) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(color, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
    sp.scale.set(s * 0.6, s * 0.6, 1); sp.position.set(x, y, z);
    g.add(sp); return sp;
  };
  if(type === 'dart'){
    add(new THREE.ConeGeometry(0.62, 3.8, 6), hull, 0, 0, 0.2, Math.PI / 2);
    const wing = new THREE.BoxGeometry(2.2, 0.08, 1.1);
    add(wing, dark, 1.0, 0, -0.7, 0, 0.45, -0.12);
    add(wing, dark, -1.0, 0, -0.7, 0, -0.45, 0.12);
    add(new THREE.BoxGeometry(0.08, 0.9, 0.9), dark, 0, 0.45, -1.0, 0.3);
    // cat ears on the canopy: the Hiss fly cats
    add(new THREE.ConeGeometry(0.22, 0.45, 4), dark, 0.2, 0.5, 0.3, 0, 0, -0.2);
    add(new THREE.ConeGeometry(0.22, 0.45, 4), dark, -0.2, 0.5, 0.3, 0, 0, 0.2);
    add(new THREE.SphereGeometry(0.28, 10, 8), glowMat(0xff3b30, 4), 0, 0.22, 0.5);
    add(new THREE.BoxGeometry(0.06, 0.05, 1.0), glowMat(0xff3b30, 3), 1.9, 0, -0.95, 0, 0.45);
    add(new THREE.BoxGeometry(0.06, 0.05, 1.0), glowMat(0xff3b30, 3), -1.9, 0, -0.95, 0, -0.45);
    engines.push(sprite(0xff5a2a, 2.2, 0, 0, -1.8));
    g.scale.setScalar(1.5);
  } else if(type === 'raider'){
    const sh = new THREE.Shape();
    sh.moveTo(0, 2.4); sh.lineTo(2.1, -1.5); sh.lineTo(0.7, -1.0); sh.lineTo(0, -1.6); sh.lineTo(-0.7, -1.0); sh.lineTo(-2.1, -1.5); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, {depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2});
    geo.translate(0, 0, -0.17);
    add(geo, hull, 0, 0, 0, -Math.PI / 2);
    add(new THREE.BoxGeometry(0.9, 0.5, 1.6), dark, 0, 0.35, 0.1);
    add(new THREE.ConeGeometry(0.25, 0.5, 4), dark, 0.25, 0.75, 0.3, 0, 0, -0.2);
    add(new THREE.ConeGeometry(0.25, 0.5, 4), dark, -0.25, 0.75, 0.3, 0, 0, 0.2);
    add(new THREE.BoxGeometry(0.7, 0.08, 0.5), glowMat(0xffb020, 3.5), 0, 0.62, 0.5);
    const eng = new THREE.CylinderGeometry(0.32, 0.4, 1.3, 10);
    add(eng, dark, 0.8, 0, -1.0, Math.PI / 2);
    add(eng, dark, -0.8, 0, -1.0, Math.PI / 2);
    add(new THREE.BoxGeometry(3.4, 0.05, 0.08), glowMat(0xff8a00, 3), 0, 0.2, -1.2);
    engines.push(sprite(0xff8a20, 2.0, 0.8, 0, -1.8), sprite(0xff8a20, 2.0, -0.8, 0, -1.8));
    g.scale.setScalar(1.6);
  } else if(type === 'brute'){
    const k = 6;
    const big = (geo) => { geo.scale(k, k, k); return geo; };
    add(big(new THREE.CapsuleGeometry(1.25, 4.2, 4, 16)), hull, 0, 0, 0, Math.PI / 2);
    g.userData.pods = {};
    for(const s of [1, -1]){
      const pod = new THREE.Group(); pod.position.set(-s * 3.0 * k, -0.3 * k, -0.4 * k);   // +x is the ship's left
      const m = new THREE.Mesh(big(new THREE.CylinderGeometry(0.75, 0.9, 4.4, 14)), dark); m.rotation.x = Math.PI / 2; pod.add(m);
      const ring = new THREE.Mesh(big(new THREE.TorusGeometry(0.8, 0.08, 6, 20)), glowMat(0xb040ff, 3)); ring.position.z = -2.2 * k; pod.add(ring);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(0xc060ff, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
      sp.scale.set(14, 14, 1); sp.position.z = -2.5 * k; pod.add(sp);
      g.add(pod); g.userData.pods[s] = pod;
    }
    add(big(new THREE.BoxGeometry(6.2, 0.3, 2.2)), hull, 0, -0.2 * k, -0.6 * k);
    add(big(new THREE.BoxGeometry(1.4, 0.6, 2.2)), glowMat(0xb040ff, 2.5), 0, -1.15 * k, 0.2 * k);
    add(big(new THREE.SphereGeometry(0.5, 14, 10)), glowMat(0xd070ff, 3.5), 0, 0.6 * k, 2.4 * k);
    // the cat's face on the prow: ears and a glare
    add(big(new THREE.ConeGeometry(0.4, 1.0, 4)), dark, 0.6 * k, 1.3 * k, 1.6 * k, 0, 0, -0.25);
    add(big(new THREE.ConeGeometry(0.4, 1.0, 4)), dark, -0.6 * k, 1.3 * k, 1.6 * k, 0, 0, 0.25);
    engines.push(sprite(0xc060ff, 3.2 * k * 0.8, 0, 0, -3.4 * k));
    const core = add(big(new THREE.SphereGeometry(0.6, 16, 12)), glowMat(0xff4060, 3), 0, 0.2 * k, -1.6 * k);
    g.userData.core = core;
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.ShaderMaterial({
      vertexShader: FRESNEL_VERT, fragmentShader: RIM_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      uniforms: {uColor: {value: new THREE.Color(1.1, 0.35, 1.3)}, uPow: {value: 2.5}, uAlpha: {value: 0.8}, uTime: {value: 0}}}));
    shield.scale.set(12, 9, 26);
    g.add(shield);
    g.userData.shield = shield;
  } else if(type === 'torpedo'){
    add(new THREE.SphereGeometry(0.9, 16, 12), glowMat(0xff2060, 4));
    const spike = new THREE.ConeGeometry(0.22, 1.4, 5);
    for(let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; add(spike, dark, Math.cos(a) * 1.0, Math.sin(a) * 1.0, -0.3, 0, 0, a - Math.PI / 2); }
    engines.push(sprite(0xff2060, 7, 0, 0, 0));
    g.userData.pulse = engines[0];
  } else if(type === 'turret'){
    // a gun emplacement: a squat base that stays put, a head that swivels
    const head = new THREE.Group(); g.add(head); g.userData.head = head;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 3, 10), dark); base.position.y = -2.5; g.add(base);
    const ha = (geo, mat, x, y, z, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx || 0; head.add(m); return m; };
    ha(new THREE.SphereGeometry(2.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, -0.8, 0);
    ha(new THREE.BoxGeometry(0.45, 0.45, 4.2), dark, 0.7, 0.2, 2.2);
    ha(new THREE.BoxGeometry(0.45, 0.45, 4.2), dark, -0.7, 0.2, 2.2);
    ha(new THREE.SphereGeometry(0.6, 12, 10), glowMat(0xff2a1a, 4), 0, 0.6, 1.4);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(0xff3020, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
    sp.scale.set(2.6, 2.6, 1); sp.position.set(0, 0.6, 1.4); head.add(sp);
  } else {
    // pods are drawn as part of the brute
    g.userData.invisible = true;
  }
  g.userData.flash = flash;
  g.userData.engines = engines;
  return g;
}

/* ---------- pickups ---------- */
function buildPickup(type, glow){
  const g = new THREE.Group();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
  sp.scale.set(9, 9, 1); g.add(sp);
  if(type === 'bone' || type === 'gold'){
    const m = type === 'gold' ? new THREE.MeshStandardMaterial({color: 0xffc040, metalness: 1, roughness: 0.2, emissive: 0x6a3a00})
      : new THREE.MeshStandardMaterial({color: 0xf4f0e8, metalness: 0.3, roughness: 0.3, emissive: 0x404040});
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 12), m); shaft.rotation.z = Math.PI / 2; g.add(shaft);
    for(const x of [-1.7, 1.7]) for(const y of [-0.45, 0.45]){ const b = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), m); b.position.set(x, y, 0); g.add(b); }
    sp.material.color = hot(type === 'gold' ? 0xffb020 : 0x9fffc0, 1.2);
  } else if(type === 'ball'){
    const m = new THREE.MeshStandardMaterial({color: 0xd6f03a, roughness: 0.8, emissive: 0x304000});
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 16), m));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.08, 6, 40), new THREE.MeshBasicMaterial({color: 0xffffff}));
    seam.rotation.set(0.6, 0.3, 0); seam.scale.set(1, 0.6, 1); g.add(seam);
    sp.material.color = hot(0xd6ff40, 1.2);
  } else {
    const m = new THREE.MeshStandardMaterial({color: 0x3a6aff, metalness: 0.6, roughness: 0.3, emissive: 0x0a1a60});
    g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 1.6, 4, 12), m));
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 6, 20), glowMat(0x80b0ff, 3)); r.rotation.x = Math.PI / 2; g.add(r);
    sp.material.color = hot(0x6090ff, 1.2);
  }
  return g;
}

/* ---------- the ground ---------- */
const STRATA = [0xa8502a, 0xc46a38, 0x8e4022, 0xd88a50, 0xb05a32, 0xe3a46a, 0x9c4a2a, 0xcf7c44].map(h => new THREE.Color(h));
const SAND = new THREE.Color(0xd8a46c), SCRUB = new THREE.Color(0x7d8040), WET = new THREE.Color(0x7a5232), TOP = new THREE.Color(0xe2b47c);
const _c = new THREE.Color(), _c2 = new THREE.Color();
function groundColor(x, y, z, ny, inside){
  // rock strata by height, wobbling
  const t = y * 0.085 + (fbm(x * 0.006, z * 0.006, 3) - 0.5) * 3 + 20;
  const i = Math.floor(t), f = t - i;
  _c.copy(STRATA[i % STRATA.length]).lerp(STRATA[(i + 1) % STRATA.length], f * f * (3 - 2 * f));
  const flat = Math.min(1, Math.max(0, (ny - 0.72) / 0.2));
  if(flat > 0){
    const n = fbm(x * 0.05 + 3, z * 0.05, 3);
    _c2.copy(y > 50 ? TOP : SAND);
    if(n > 0.55) _c2.lerp(SCRUB, Math.min(1, (n - 0.55) * 4) * 0.8);
    if(y < -1.2) _c2.lerp(WET, 0.6);
    _c.lerp(_c2, flat);
  }
  // deep in the canyon it is darker: the walls keep the sky off it
  if(inside) _c.multiplyScalar(0.62 + 0.38 * Math.min(1, Math.max(0, (y + 4) / 70)));
  _c.multiplyScalar(0.92 + vnoise(x * 0.3, z * 0.3) * 0.16);
  return _c;
}
function finishGeo(pos, col, uv, idx){
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // colours need the normals
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
/* The canyon: strips along the rail, sampled densely across the walls. */
function canyonChunk(u0, u1){
  const rows = Math.ceil((u1 - u0) / 3);
  const lat = [];
  // across: floor (coarse), walls (fine), plateau (coarse, getting coarser)
  for(let i = 0; i <= 8; i++) lat.push(['f', i / 8]);
  for(let i = 1; i <= 16; i++) lat.push(['w', i / 16]);
  for(let i = 1; i <= 10; i++) lat.push(['p', i / 10]);
  const offs = w => {
    const o = [];
    for(const [k, t] of lat){
      if(k === 'f') o.push(t * (w - 12));
      else if(k === 'w') o.push(w - 12 + t * 48);
      else o.push(w + 36 + Math.pow(t, 1.6) * 300);
    }
    const all = o.slice(1).reverse().map(v => -v).concat(o);
    return all;
  };
  const cols = lat.length * 2 - 1;
  const pos = [], inside = [], uv = [], idx = [];
  for(let r = 0; r <= rows; r++){
    const u = u0 + (u1 - u0) * r / rows;
    const f = railFrame(u), w = halfW(u);
    for(const o of offs(w)){
      const x = f.x + f.rx * o, z = f.z + f.rz * o, y = height(x, z);
      pos.push(x, y, z);
      inside.push(Math.abs(o) < w + 30);
      uv.push(x * 0.05 + z * 0.02, (z * 0.05 + y * 0.09));
    }
  }
  for(let r = 0; r < rows; r++) for(let c = 0; c < cols - 1; c++){
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, b, d, b, e, d);
  }
  return finishGeo(pos, inside, uv, idx);
}
/* The clearing and everything round it: one grid. */
function arenaGrid(){
  const half = 1500, n = 190, step = half * 2 / n;
  const z0 = -(CANYON_END - 160);
  const pos = [], inside = [], uv = [], idx = [];
  let rows = 0;
  for(let j = 0; j <= n; j++){
    const z = ARENA.z - half + j * step;
    if(z > z0 + step) break;
    rows++;
    for(let i = 0; i <= n; i++){
      const x = ARENA.x - half + i * step, y = height(x, z);
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
function rockGeo(geo, seed){
  // knobbly rock: push each vertex out by noise, then colour it like the walls
  const p = geo.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (fbm(x * 0.08 + seed, z * 0.08 + y * 0.05, 3) - 0.5) * 0.45;
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
function colourRock(geo, ox, oy, oz){
  const p = geo.attributes.position, n = geo.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for(let i = 0; i < p.count; i++){
    const k = groundColor(p.getX(i) + ox, p.getY(i) + oy, p.getZ(i) + oz, n.getY(i), false);
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const uv = geo.attributes.uv;
  if(uv) for(let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * 0.05, p.getY(i) * 0.09);
}

/* ---------- the world ---------- */
export class World {
  constructor(canvas, opts){
    opts = opts || {};
    this.low = !!opts.low;
    const r = this.renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
    this.pr = Math.min(opts.low ? 1 : 1.5, devicePixelRatio || 1);
    r.setPixelRatio(this.pr);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HAZE.clone().multiplyScalar(0.92), 260, 1700);
    scene.background = HAZE.clone();
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.5, 9000);
    const glow = this.glow = glowTex();
    this.ringT = ringTex();

    // sky
    this.skyMat = new THREE.ShaderMaterial({vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {uSun: {value: SUN_DIR}, uHaze: {value: HAZE}, uZen: {value: ZENITH}, uTime: {value: 0}}});
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
    // the ringed planet, pale in the day sky
    const planet = new THREE.Group();
    const pm = new THREE.Mesh(new THREE.SphereGeometry(520, 48, 32), new THREE.ShaderMaterial({vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false, depthWrite: false,
      uniforms: {uSun: {value: SUN_DIR}, uHaze: {value: HAZE}}}));
    planet.add(pm);
    const ring = new THREE.Mesh(new THREE.RingGeometry(700, 1150, 96, 1), new THREE.ShaderMaterial({vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      uniforms: {uIn: {value: 700}, uOut: {value: 1150}}, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false}));
    ring.rotation.x = -1.25; ring.rotation.y = 0.35;
    planet.add(ring);
    planet.renderOrder = -9;
    pm.renderOrder = -9; ring.renderOrder = -8;
    this.planet = planet;
    scene.add(planet);

    // light
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    scene.add(new THREE.HemisphereLight(0xa8c8ff, 0xb0683a, 1.1));
    // a picture of the sky for shiny things to reflect
    const pm2 = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SKY_FRAG.replace('gl_FragColor = vec4(col, 1.0);', 'col = mix(col, vec3(0.55, 0.32, 0.2), smoothstep(0.0, -0.15, d.y)); gl_FragColor = vec4(col, 1.0);'),
      side: THREE.BackSide, uniforms: {uSun: {value: SUN_DIR}, uHaze: {value: HAZE}, uZen: {value: ZENITH}, uTime: {value: 0}}})));
    scene.environment = pm2.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.7;

    // the ground
    const grain = grainTex();
    this.groundMat = new THREE.MeshLambertMaterial({vertexColors: true, map: grain});
    this.chunks = [];
    for(let u = -200; u < CANYON_END + 40; u += 150){
      const m = new THREE.Mesh(canyonChunk(u, Math.min(u + 150, CANYON_END + 40)), this.groundMat);
      m.userData.u = u;
      scene.add(m); this.chunks.push(m);
    }
    this.arena = new THREE.Mesh(arenaGrid(), this.groundMat);
    scene.add(this.arena);
    // the stream
    this.water = this.buildWater();
    scene.add(this.water);
    // rocks
    this.rockMat = new THREE.MeshLambertMaterial({vertexColors: true, map: grain});
    for(const o of OBSTACLES) scene.add(this.buildObstacle(o));

    // Teddy
    this.ship = buildTeddyShip(glow);
    scene.add(this.ship);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4}));
    scene.add(this.shadow);

    this.ents = new Map();
    this.pickups = new Map();
    this.parts = new Particles(this.low ? 2500 : 4500);
    scene.add(this.parts.points);
    this.shotBeams = []; for(let i = 0; i < 90; i++) this.shotBeams.push(new Beam(scene, hot(0x60ff90, 2.2), 0.35));
    const boltMat = new THREE.SpriteMaterial({map: glow, color: hot(0xff5030, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.boltSprites = []; for(let i = 0; i < 140; i++){ const s = new THREE.Sprite(boltMat); s.scale.set(3.2, 3.2, 1); s.visible = false; scene.add(s); this.boltSprites.push(s); }
    this.boltTails = []; for(let i = 0; i < 140; i++) this.boltTails.push(new Beam(scene, hot(0xff4020, 1.6), 0.5));
    const misMat = new THREE.SpriteMaterial({map: glow, color: hot(0x80c0ff, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.misSprites = []; for(let i = 0; i < 12; i++){ const s = new THREE.Sprite(misMat); s.scale.set(4, 4, 1); s.visible = false; scene.add(s); this.misSprites.push(s); }
    // flashes and rings for explosions
    this.flashes = [];
    for(let i = 0; i < 16; i++){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: new THREE.Color(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
      s.visible = false; scene.add(s); this.flashes.push({s, t: 0, life: 0, size: 1});
    }
    this.rings = [];
    for(let i = 0; i < 8; i++){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: this.ringT, color: new THREE.Color(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
      s.visible = false; scene.add(s); this.rings.push({s, t: 0, life: 0, size: 1});
    }
    this.fi = 0; this.ri = 0;

    // post: bloom on the bright parts
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.useBloom = !this.low;

    this.camPos = new THREE.Vector3(0, 30, 30);
    this.camLook = new THREE.Vector3(0, 20, -100);
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.shake = 0;
    this.time = 0;
    this.fovKick = 0;
    this.dust = 0;
    this.resize();
  }

  buildWater(){
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
    const m = new THREE.MeshStandardMaterial({color: 0x2c5f6e, metalness: 0.1, roughness: 0.08, envMapIntensity: 1.4});
    return new THREE.Mesh(geo, m);
  }

  buildObstacle(o){
    if(o.type === 'spire'){
      const g = new THREE.CylinderGeometry(o.r * 0.75, o.r * 1.1, o.h + 12, 16, 12);
      g.translate(0, (o.h + 12) / 2 - 12, 0);
      rockGeo(g, o.x * 0.01);
      // a little flat cap on top, like a mesa
      colourRock(g, o.x, 0, o.z);
      const m = new THREE.Mesh(g, this.rockMat);
      m.position.set(o.x, 0, o.z);
      return m;
    }
    // an arch: a slab of rock bridging the canyon, its underside curved
    const W = o.w + 40, T = o.thick, H = 140;
    const g = new THREE.BoxGeometry(W * 2, 1, T, 40, 10, 4);
    const p = g.attributes.position;
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), yy = p.getY(i) + 0.5, z = p.getZ(i);
      const under = archUnder(o, x);
      const top = rimH(o.u) + 8 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 10;
      let y = under + yy * (top - under);
      const nz = z * (1 + (vnoise(x * 0.1, yy * 3) - 0.5) * 0.5);
      p.setXYZ(i, x, y, nz);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.rockMat);
    // turn it to face along the canyon
    m.position.set(o.x, 0, o.z);
    m.rotation.y = Math.atan2(-o.rz, o.rx);
    colourRock(g, o.x, 0, o.z);
    return m;
  }

  resize(){
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // portrait (on a laptop window) still shows enough width
    this.baseFov = w / h < 1 ? 85 : 68;
    this.camera.updateProjectionMatrix();
    this.parts.mat.uniforms.uScale.value = h * 0.9;
  }
  setQuality(pr, bloom){ this.pr = pr; this.useBloom = bloom; this.renderer.setPixelRatio(pr); this.resize(); }

  /* ---------- effects from the sim's events ---------- */
  flash(p, color, size, life){
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.s.position.set(p.x, p.y, p.z); f.s.material.color.copy(color); f.size = size; f.t = f.life = life; f.s.visible = true;
  }
  ring(p, color, size, life){
    const f = this.rings[this.ri++ % this.rings.length];
    f.s.position.set(p.x, p.y, p.z); f.s.material.color.copy(color); f.size = size; f.t = f.life = life; f.s.visible = true;
  }
  effects(events, s){
    const P = this.parts;
    for(const e of events){
      if(e.k === 'boom'){
        const big = e.big;
        P.burst(e, big ? 160 : 60, big ? 70 : 40, hot(0xff8a30, 2.2), big ? 7 : 3.5, big ? 1.6 : 0.9, 8);
        P.burst(e, big ? 60 : 25, big ? 30 : 18, new THREE.Color(0.35, 0.3, 0.28), big ? 12 : 6, big ? 2.6 : 1.6, -2);
        this.flash(e, hot(0xffc070, 3), big ? 70 : 22, big ? 0.6 : 0.3);
        this.ring(e, hot(0xffb060, 2), big ? 110 : 35, big ? 0.9 : 0.5);
        if(e.type === 'pod') this.podGone(s, e);
        const d = this.camera.position.distanceTo(_v1.set(e.x, e.y, e.z));
        this.shake = Math.max(this.shake, (big ? 1.4 : 0.5) * Math.max(0, 1 - d / (big ? 500 : 160)));
        if(e.player){ this.shake = 2; }
      } else if(e.k === 'hit'){
        P.burst(e, 10, 25, hot(0xffe080, 2), 1.2, 0.35);
        this.flash(e, hot(0xfff0b0, 2), 5, 0.12);
        const m = this.ents.get(e.id); if(m) m.userData.hitT = 0.12;
      } else if(e.k === 'spark'){
        P.burst(e, e.hurt ? 18 : 6, e.hurt ? 30 : 14, e.hurt ? hot(0xff6040, 2) : hot(0xffd090, 1.5), e.hurt ? 1.6 : 1.0, 0.4, 10);
      } else if(e.k === 'deflect'){
        P.burst(e, 10, 30, hot(0x80e0ff, 2.5), 1.2, 0.3);
        this.flash(e, hot(0x80e0ff, 2), 6, 0.15);
      } else if(e.k === 'bomb'){
        P.burst(e, 140, 60, hot(0x80b0ff, 2.2), 6, 1.2, 4);
        this.flash(e, hot(0xa0c8ff, 3), e.r * 2, 0.5);
        this.ring(e, hot(0x80b0ff, 2.5), e.r * 2.6, 0.7);
        this.shake = Math.max(this.shake, 0.8);
      } else if(e.k === 'scrape'){
        P.burst(e, 14, 20, hot(0xffc070, 2), 1.4, 0.5, 15);
        P.burst(e, 8, 10, new THREE.Color(0.5, 0.35, 0.25), 5, 1.2, -1);
        this.shake = Math.max(this.shake, 0.7);
      } else if(e.k === 'hurt'){
        this.shake = Math.max(this.shake, 0.6);
      } else if(e.k === 'pickup'){
        P.burst(e, 40, 25, e.type === 'gold' ? hot(0xffc040, 2.5) : e.type === 'ball' ? hot(0xd6ff40, 2.5) : hot(0x9fffc0, 2.5), 2, 0.7);
        this.ring(e, hot(0xffffff, 1.5), 22, 0.5);
      } else if(e.k === 'shieldDown'){
        this.ring(e, hot(0xd070ff, 3), 120, 1.0);
      }
    }
  }
  podGone(s, e){
    // hide the pod on the brute it belonged to
    for(const [id, m] of this.ents){
      if(m.userData.type !== 'brute') continue;
      const pods = m.userData.pods;
      for(const k in pods){
        const w = pods[k].getWorldPosition(_v2);
        if(w.distanceTo(_v1.set(e.x, e.y, e.z)) < 30) pods[k].visible = false;
      }
    }
  }

  /* ---------- each frame ---------- */
  sync(s, dt, view){
    view = view || {};
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    const p = s.p, ship = this.ship;
    const cam = this.camera;

    // Teddy's ship
    _v1.set(p.fx, p.fy, p.fz); _v2.set(p.ux, p.uy, p.uz); _v3.crossVectors(_v2, _v1);
    ship.matrixAutoUpdate = true;
    ship.position.set(p.x, p.y, p.z);
    const m4 = new THREE.Matrix4().makeBasis(_v3, _v2, _v1);
    ship.quaternion.setFromRotationMatrix(m4);
    if(p.spin) ship.rotateZ(p.spin);
    ship.visible = !p.dead;
    const blink = p.hitT > 0 && Math.floor(this.time * 20) % 2 === 0;
    for(const m of ship.userData.flash) m.emissive.setRGB(blink ? 0.6 : 0, blink ? 0.15 : 0, blink ? 0.1 : 0);
    const thrust = p.speed / 62;
    for(const e of ship.userData.engines){ const k = (e === ship.userData.engines[2] ? 1.6 : 1.0) * (0.6 + thrust * 0.5) * (0.9 + Math.random() * 0.2); e.scale.set(k, k, 1); }
    ship.userData.pilot.rotation.y = Math.sin(this.time * 0.7) * 0.25;
    ship.userData.pilot.rotation.z = -p.bank * 0.3;
    ship.userData.tag.rotation.z = Math.sin(this.time * 6) * 0.3;
    // the shadow on the ground under it
    const g = height(p.x, p.z);
    const alt = p.y - g;
    this.shadow.visible = !p.dead && alt < 120;
    if(this.shadow.visible){
      const sc = 8 + alt * 0.05;
      this.shadow.position.set(p.x, g + 0.3, p.z);
      this.shadow.rotation.set(-Math.PI / 2, 0, -p.yaw);
      this.shadow.scale.set(sc, sc * 0.8, 1);
      this.shadow.material.opacity = Math.max(0, 1 - alt / 120);
    }
    // engine trail
    if(!p.dead){
      const P = this.parts;
      for(const sx of [-1.98, 1.98]){
        const wx = p.x - p.fx * 2.6 + _v3.x * sx, wy = p.y - p.fy * 2.6 - 0.45 + _v3.y * sx, wz = p.z - p.fz * 2.6 + _v3.z * sx;
        P.emit(wx, wy, wz, -p.fx * 10, -p.fy * 10, -p.fz * 10, 0.15, 0.45, 0.7, 0.6, 0.2, 1, 0.5);
      }
      if(p.speed > 80) P.emit(p.x - p.fx * 3.8, p.y - p.fy * 3.8, p.z - p.fz * 3.8, -p.fx * 20, -p.fy * 20, -p.fz * 20, 0.25, 0.6, 0.9, 1.0, 0.2, 1, 0.3);
      if(p.rollT > 0) for(const sx of [-3.4, 3.4]) P.emit(p.x + _v2.x * sx * 0 + _v3.x * sx, p.y + _v3.y * sx, p.z + _v3.z * sx, 0, 0, 0, 0.6, 1.1, 1.6, 1.2, 0.35, 0, 0);
      // dust kicked up flying low
      if(alt < 14 && Math.random() < 0.8){
        P.emit(p.x + (Math.random() - 0.5) * 6, g + 1, p.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, 4 + Math.random() * 4, (Math.random() - 0.5) * 8, 0.45, 0.33, 0.22, 4 + Math.random() * 3, 1.0, 1.5, 1.5, -1);
      }
    }

    // enemies
    const seen = new Set();
    for(const e of s.enemies){
      seen.add(e.id);
      let m = this.ents.get(e.id);
      if(!m){ m = buildEnemy(e.type, this.glow); m.userData.type = e.type; m.userData.hitT = 0; this.ents.set(e.id, m); this.scene.add(m); }
      if(m.userData.invisible){ m.visible = false; continue; }
      m.visible = e.x > -9e4;
      m.position.set(e.x, e.y, e.z);
      if(e.type === 'turret'){
        m.userData.head.lookAt(_v1.set(p.x, p.y, p.z));
      } else {
        _v1.set(e.fx, e.fy, e.fz);
        if(_v1.lengthSq() > 0.5){
          _v3.crossVectors(_v4.set(0, 1, 0), _v1).normalize();
          _v2.crossVectors(_v1, _v3).normalize();
          m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(_v3, _v2, _v1));
          if(e.bank) m.rotateZ(-e.bank);
        }
      }
      m.userData.hitT = Math.max(0, (m.userData.hitT || 0) - dt);
      const fl = m.userData.hitT > 0 ? 0.9 : 0;
      for(const mat of m.userData.flash) mat.emissive.setRGB(fl, fl * 0.8, fl * 0.6);
      if(m.userData.pulse){ const k = 6 + Math.sin(this.time * 18) * 2; m.userData.pulse.scale.set(k, k, 1); }
      if(m.userData.shield){
        m.userData.shield.visible = !!e.shielded;
        m.userData.shield.material.uniforms.uTime.value = this.time;
      }
      if(m.userData.core) m.userData.core.material.color.copy(hot(e.shielded ? 0x803040 : 0xff4060, e.shielded ? 1 : 3 + Math.sin(this.time * 10)));
      // their engines leave a little trail
      if(e.type === 'dart' || e.type === 'raider' || e.type === 'torpedo'){
        const back = e.type === 'torpedo' ? 0 : 3;
        this.parts.emit(e.x - e.fx * back, e.y - e.fy * back, e.z - e.fz * back, 0, 0, 0,
          e.type === 'torpedo' ? 1.6 : 1.4, e.type === 'torpedo' ? 0.3 : 0.6, 0.2, e.type === 'torpedo' ? 2.4 : 1.2, 0.4, 0, 0.4);
      }
    }
    for(const [id, m] of this.ents) if(!seen.has(id)){ this.scene.remove(m); this.ents.delete(id); }

    // pickups
    const ps = new Set();
    for(const k of s.pickups){
      if(k.taken) continue;
      ps.add(k.id);
      let m = this.pickups.get(k.id);
      if(!m){ m = buildPickup(k.type, this.glow); this.pickups.set(k.id, m); this.scene.add(m); }
      m.position.set(k.x, k.y + Math.sin(this.time * 2 + k.id) * 0.6, k.z);
      m.rotation.y = this.time * 2;
    }
    for(const [id, m] of this.pickups) if(!ps.has(id)){ this.scene.remove(m); this.pickups.delete(id); }

    // shots, bolts, missiles
    let i = 0;
    for(const b of s.shots){
      if(i >= this.shotBeams.length) break;
      const B = this.shotBeams[i++];
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      B.a.set(b.x - b.vx / sp * 9, b.y - b.vy / sp * 9, b.z - b.vz / sp * 9); B.b.set(b.x, b.y, b.z);
      B.mesh.visible = true; B.place(cam);
    }
    for(; i < this.shotBeams.length; i++) this.shotBeams[i].mesh.visible = false;
    i = 0;
    for(const b of s.bolts){
      if(i >= this.boltSprites.length) break;
      this.boltSprites[i].position.set(b.x, b.y, b.z); this.boltSprites[i].visible = true;
      const T = this.boltTails[i];
      T.a.set(b.x - b.vx * 0.05, b.y - b.vy * 0.05, b.z - b.vz * 0.05); T.b.set(b.x, b.y, b.z); T.mesh.visible = true; T.place(cam);
      i++;
    }
    for(; i < this.boltSprites.length; i++){ this.boltSprites[i].visible = false; this.boltTails[i].mesh.visible = false; }
    i = 0;
    for(const m of s.missiles.concat(s.bombs)){
      if(i >= this.misSprites.length) break;
      this.misSprites[i].position.set(m.x, m.y, m.z); this.misSprites[i].visible = true; i++;
      this.parts.emit(m.x, m.y, m.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.9, 0.9, 1.0, 2.2, 0.7, 0.5, 1.5);
    }
    for(; i < this.misSprites.length; i++) this.misSprites[i].visible = false;

    // flashes and rings fade
    for(const f of this.flashes) if(f.s.visible){ f.t -= dt; const k = Math.max(0, f.t / f.life); f.s.scale.setScalar(f.size * (1.4 - k * 0.4)); f.s.material.opacity = k; if(f.t <= 0) f.s.visible = false; }
    for(const f of this.rings) if(f.s.visible){ f.t -= dt; const k = Math.max(0, f.t / f.life); f.s.scale.setScalar(f.size * (1 - k * 0.9)); f.s.material.opacity = k; if(f.t <= 0) f.s.visible = false; }

    this.cameraFollow(s, dt, view);
    // speed dust: specks hanging in the air that rush past
    if(!p.dead && Math.random() < (this.low ? 0.4 : 0.9)){
      const ahead = 60 + Math.random() * 80;
      this.parts.emit(p.x + p.fx * ahead + (Math.random() - 0.5) * 70, p.y + p.fy * ahead + (Math.random() - 0.5) * 40, p.z + p.fz * ahead + (Math.random() - 0.5) * 70,
        0, 0, 0, 0.55, 0.48, 0.4, 0.5, 2.2, 0, 0);
    }
    this.parts.update(dt);
    // the sky goes with the camera; the planet sits in it
    this.sky.position.copy(cam.position);
    this.planet.position.copy(cam.position).addScaledVector(PLANET_DIR, 4200);
    this.planet.lookAt(cam.position);
    this.sun.position.copy(cam.position).addScaledVector(SUN_DIR, 100);
    this.sun.target.position.copy(cam.position);
    // chunks far away need not be drawn
    const cu = -cam.position.z;
    for(const c of this.chunks) c.visible = c.userData.u > cu - 350 && c.userData.u < cu + 1500;
    this.arena.visible = cu > CANYON_END - 1600;
  }

  cameraFollow(s, dt, view){
    const p = s.p, cam = this.camera;
    const want = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    if(view.orbit){
      // the title screen: a slow turn round Teddy's ship
      const a = 0.75 + Math.sin(this.time * 0.15) * 0.55;
      want.set(p.x + Math.sin(a) * 12, p.y + 2.5 + Math.sin(this.time * 0.3), p.z + Math.cos(a) * 12);
      // look past the ship, a little to its left, so it sits right of the menu with the canyon behind
      look.set(p.x - Math.cos(a) * 5 - Math.sin(a) * 6, p.y + 0.5, p.z + Math.sin(a) * 5 - Math.cos(a) * 6);
      this.snap = this.snap || this.time < 0.1;
    } else if(p.dead){
      // circle the wreck
      const a = this.time * 0.3;
      want.set(p.x + Math.cos(a) * 40, p.y + 18, p.z + Math.sin(a) * 40);
      look.set(p.x, p.y, p.z);
    } else if(s.mode === 'rail'){
      const r = p.rail;
      const c = railPoint(r.u - 17, r.ox * 0.72, 0);
      want.set(c.x, r.oy * 0.85 + 6.5, c.z);
      const l = railPoint(r.u + 45, r.ox * 0.85, 0);
      look.set(l.x, r.oy * 0.92 + 2, l.z);
      up.set(0, 1, 0).applyAxisAngle(_v1.set(p.fx, 0, p.fz).normalize(), -p.bank * 0.12);
    } else {
      const f = _v1.set(p.fx, p.fy, p.fz);
      let u;
      if(s.style === 'level'){
        // the camera stays level-ish: it leans with the bank a little
        const right = _v3.set(-p.fz, 0, p.fx).normalize();
        u = _v2.crossVectors(right, f).normalize();
        u.applyAxisAngle(f, -p.bank * 0.25);
      } else u = _v2.set(p.ux, p.uy, p.uz);
      const tgt = view.target && s.enemies.find(e => e.id === view.target);
      if(tgt){
        // keep both of you in the picture: behind Teddy, looking towards it
        const d = _v4.set(tgt.x - p.x, tgt.y - p.y, tgt.z - p.z);
        const dist = d.length(); d.normalize();
        want.set(p.x, p.y, p.z).addScaledVector(d, -20).addScaledVector(u, 7);
        look.set(p.x, p.y, p.z).addScaledVector(d, Math.min(dist * 0.5, 120));
      } else {
        want.set(p.x, p.y, p.z).addScaledVector(f, -17).addScaledVector(u, 5);
        look.set(p.x, p.y, p.z).addScaledVector(f, 35);
      }
      up.copy(u);
      // the ground is solid for the camera too
      const g = height(want.x, want.z) + 3;
      if(want.y < g) want.y = g;
    }
    const k = 1 - Math.exp(-(s.mode === 'rail' ? 7 : 6) * dt);
    if(this.snap){ this.camPos.copy(want); this.camLook.copy(look); this.camUp.copy(up); this.snap = false; }
    this.camPos.lerp(want, k);
    this.camLook.lerp(look, Math.min(1, k * 1.6));
    this.camUp.lerp(up, k).normalize();
    cam.position.copy(this.camPos);
    if(this.shake > 0){
      const a = this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.up.copy(this.camUp);
    cam.lookAt(this.camLook);
    const boost = (p.speed - (s.mode === 'rail' ? 60 : 62)) / 45;
    this.fovKick += (boost * 12 - this.fovKick) * Math.min(1, 4 * dt);
    cam.fov = this.baseFov + this.fovKick;
    cam.updateProjectionMatrix();
  }

  /* Screen position of a world point: {x, y} in CSS pixels and whether it is in front. */
  project(x, y, z){
    const v = _v4.set(x, y, z).project(this.camera);
    const behind = v.z > 1;
    return {x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind, nx: v.x, ny: v.y};
  }

  render(){
    if(this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
