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
import {height, railPoint, railFrame, GROUND, RAIL_END} from './terrain.js';
import {hot, buildPetShip, buildEnemy, buildPickup} from './models.js';
import {buildScenery, NOISE} from './scenery.js';
import {CAST} from './cast.js';
import {checkpointU} from './sim.js';


/* ---------- GLSL ---------- */
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
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
/* How big Teddy's ship looks: it is drawn a little smaller than life, and
   the camera sits further back than it used to (2026-11-08: "make my ship
   smaller on the screen so I can see what is happening"). */
const SHIP_SCALE = 0.85;
/* The camera (round 6, after Star Fox 64's): a narrow 48 degree lens from
   further back - Teddy is the same size on screen, but distant enemies and
   bosses look three times bigger than through the old 68-74 degree lens.
   On the rail it follows 78% of the ship's slide (so the ship moves about
   the screen), swings a little against the stick, and tilts 30% of the
   ship's roll (20% in space). */
const CAM = {fov: 48, railBack: 38, railUp: 9.5, railLook: 70, railFollow: 0.78, railLead: 0.12, chaseBack: 36, chaseUp: 8, chaseLook: 55};
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

/* ---------- the world ---------- */
export class World {
  constructor(canvas, opts){
    opts = opts || {};
    this.low = !!opts.low;
    const r = this.renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
    // sharp: the screen's own pixels, up to 2x; the frame-rate watcher in
    // main.js steps it down on a phone that can't keep up
    this.pr = Math.min(opts.low ? 1 : 2, devicePixelRatio || 1);
    r.setPixelRatio(this.pr);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.5, 9000);
    const glow = this.glow = glowTex();
    this.ringT = ringTex();

    // light: set for each level
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xa8c8ff, 0xb0683a, 1.1);
    scene.add(this.hemi);

    // Teddy
    this.ship = buildPetShip('teddy', glow);
    this.ship.scale.setScalar(SHIP_SCALE);
    scene.add(this.ship);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4}));
    scene.add(this.shadow);

    this.ents = new Map();
    this.pickups = new Map();
    this.allyShips = new Map();
    this.parts = new Particles(this.low ? 2500 : 4500);
    scene.add(this.parts.points);
    // Teddy's lasers: fat green bolts with a glowing head, easy to follow
    // from 38 m back through the narrow lens (were 0.35 m wide, 9 m long)
    this.shotBeams = []; for(let i = 0; i < 120; i++) this.shotBeams.push(new Beam(scene, hot(0x60ff90, 2.8), 1.7));
    const headMat = new THREE.SpriteMaterial({map: glow, color: hot(0x9affb8, 3.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.shotHeads = []; for(let i = 0; i < 120; i++){ const s = new THREE.Sprite(headMat); s.scale.set(6, 6, 1); s.visible = false; scene.add(s); this.shotHeads.push(s); }
    const boltMat = new THREE.SpriteMaterial({map: glow, color: hot(0xff5030, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.boltSprites = []; for(let i = 0; i < 140; i++){ const s = new THREE.Sprite(boltMat); s.scale.set(3.2, 3.2, 1); s.visible = false; scene.add(s); this.boltSprites.push(s); }
    this.boltTails = []; for(let i = 0; i < 140; i++) this.boltTails.push(new Beam(scene, hot(0xff4020, 1.6), 0.5));
    this.misMat = new THREE.SpriteMaterial({map: glow, color: hot(0x80c0ff, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.chargeMat = new THREE.SpriteMaterial({map: glow, color: hot(0x70ff90, 3.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true});
    this.misSprites = []; for(let i = 0; i < 12; i++){ const s = new THREE.Sprite(this.misMat); s.scale.set(4, 4, 1); s.visible = false; scene.add(s); this.misSprites.push(s); }
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
    // lightning: a warning column where it will strike, then the bolt
    this.columns = [];
    const colMat = new THREE.MeshBasicMaterial({color: hot(0xfff0a0, 1.2), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    for(let i = 0; i < 6; i++){ const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), colMat.clone()); m.visible = false; scene.add(m); this.columns.push(m); }
    this.bolts3 = []; for(let i = 0; i < 4; i++) this.bolts3.push({beams: [0, 1, 2, 3, 4, 5].map(() => new Beam(scene, hot(0xd8e8ff, 3), 1.6)), t: 0});
    this.skyFlash = 0;
    // catnip clouds: a few soft sprites each
    const nipMats = [0x9aff60, 0xd070ff, 0x60ffc0].map(c => new THREE.SpriteMaterial({map: glow, color: hot(c, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55}));
    this.nips = []; for(let i = 0; i < 60; i++){ const s = new THREE.Sprite(nipMats[i % 3]); s.visible = false; scene.add(s); this.nips.push(s); }

    // post: bloom on the bright parts
    // (multisampling was tried for sharpness: it halved the frame rate, and a
    // phone's own pixels at 2x are sharp enough without it)
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.useBloom = !this.low;

    this.camUp = new THREE.Vector3(0, 1, 0);
    this.shake = 0;
    this.time = 0;
    this.fovKick = 0;
    this.level = null;
    this.resize();
  }

  /* Build a level's world (after terrain.js has it). The last one is thrown away. */
  loadLevel(def){
    if(this.level === def) return;
    if(this.scenery){ this.scene.remove(this.scenery.group); this.scenery.dispose(); }
    for(const [, m] of this.ents) this.scene.remove(m);
    for(const [, m] of this.pickups) this.scene.remove(m);
    for(const [, m] of this.allyShips) this.scene.remove(m);
    this.ents.clear(); this.pickups.clear(); this.allyShips.clear();
    const sc = this.scenery = buildScenery(def, this.renderer);
    this.scene.add(sc.group);
    this.scene.fog = sc.fog;
    this.scene.background = sc.background;
    this.scene.environment = sc.env;
    this.scene.environmentIntensity = sc.space ? 0.5 : 0.7;
    this.sun.color.copy(sc.sunColor); this.sun.intensity = sc.sunI;
    this.hemi.color.copy(sc.hemiSky); this.hemi.groundColor.copy(sc.hemiGround); this.hemi.intensity = sc.hemiI;
    this.theme = def.theme || {};
    this.level = def;
    // the checkpoint gate: a big ring of light across the rail
    if(this.gate){ this.scene.remove(this.gate); this.gate = null; }
    const cu = checkpointU(def);
    if(cu){
      const f = railFrame(cu), q = railPoint(cu, 0, 0);
      const y = GROUND === 'space' ? 10 : Math.max(30, height(q.x, q.z) + 26);
      const g = this.gate = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(22, 1.1, 8, 48), new THREE.MeshBasicMaterial({color: hot(0x7affb0, 2.2), transparent: true, opacity: 0.8})));
      g.add(new THREE.Mesh(new THREE.TorusGeometry(19, 0.4, 6, 48), new THREE.MeshBasicMaterial({color: hot(0xd0ffe0, 2), transparent: true, opacity: 0.6})));
      g.position.set(q.x, y, q.z); g.rotation.set(0, Math.atan2(f.tx, f.tz), 0);
      this.scene.add(g);
    }
    this.snap = true;
  }

  resize(){
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // portrait (on a laptop window) still shows enough width
    this.baseFov = w / h < 1 ? 66 : CAM.fov;
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
      } else if(e.k === 'chain'){
        // one link of a charged-shot combo going off
        P.burst(e, 50, 40, hot(0x9affb0, 2.4), 3.2, 0.6, 2);
        this.flash(e, hot(0xd0ffd8, 3), e.r * 1.4, 0.3);
        this.ring(e, hot(0x70ff90, 2.5), e.r * 2, 0.45);
        this.shake = Math.max(this.shake, 0.3);
      } else if(e.k === 'burst'){
        P.burst(e, 90, 45, hot(0x70ff90, 2.4), 4, 0.8, 2);
        this.flash(e, hot(0xb0ffc0, 3), e.r * 1.8, 0.35);
        this.ring(e, hot(0x70ff90, 2.5), e.r * 2.4, 0.5);
        this.shake = Math.max(this.shake, 0.4);
      } else if(e.k === 'deflect'){
        this.ring(e, hot(0x80e0ff, 2.5), 14, 0.35);
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
      } else if(e.k === 'lightning'){
        const B = this.bolts3.find(b => b.t <= 0) || this.bolts3[0];
        B.t = 0.35; B.x = e.x; B.z = e.z; B.g = e.ground > -1e8 ? e.ground : e.y - 60; B.top = Math.max(e.y, B.g) + 260;
        this.skyFlash = 1;
        P.burst({x: e.x, y: Math.max(e.y, B.g + 2), z: e.z}, 40, 40, hot(0xd8e8ff, 2.5), 3, 0.5);
        this.flash({x: e.x, y: e.y, z: e.z}, hot(0xe0f0ff, 3), 60, 0.25);
        this.shake = Math.max(this.shake, 0.5);
      } else if(e.k === 'rescue'){
        // a little pup flies home
        P.burst(e, 50, 30, hot(0xfff0a0, 2.5), 2, 0.9);
        this.ring(e, hot(0xfff0a0, 2), 30, 0.6);
      } else if(e.k === 'nip' || e.k === 'puff'){
        P.burst(e.x != null ? e : this.ship.position, 30, 20, hot(0xa0ff60, 1.5), 4, 1.2);
      } else if(e.k === 'allyDown'){
        P.burst(e, 40, 30, hot(0xff8a30, 2), 3, 1);
      } else if(e.k === 'swat'){
        this.shake = Math.max(this.shake, 1.2);
      }
    }
  }
  /* ---------- each frame ---------- */
  sync(s, dt, view){
    view = view || {};
    this.time += dt;
    if(this.level !== s.L) this.loadLevel(s.L);
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
    const cg = ship.userData.charge, ch = p.charge || 0;
    cg.visible = ch > 0;
    if(ch > 0){ const k = (ch >= 1 ? 3.2 + Math.sin(this.time * 30) * 0.5 : 0.6 + ch * 2.2); cg.scale.set(k, k, 1); }
    // the shadow on the ground under it
    const g = height(p.x, p.z);
    const alt = p.y - g;
    this.shadow.visible = !p.dead && alt < 120 && GROUND !== 'space';
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
      if(alt < 14 && Math.random() < 0.8 && GROUND !== 'space'){
        P.emit(p.x + (Math.random() - 0.5) * 6, g + 1, p.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, 4 + Math.random() * 4, (Math.random() - 0.5) * 8, 0.45, 0.33, 0.22, 4 + Math.random() * 3, 1.0, 1.5, 1.5, -1);
      }
    }

    // enemies
    const seen = new Set();
    for(const e of s.enemies){
      seen.add(e.id);
      let m = this.ents.get(e.id);
      if(!m){ m = buildEnemy(e, this.glow); m.userData.type = e.type; m.userData.hitT = 0; this.ents.set(e.id, m); this.scene.add(m); }
      m.visible = e.x > -9e4;
      m.position.set(e.x, e.y, e.z);
      if(e.type === 'turret'){
        m.userData.head.lookAt(_v1.set(p.x, p.y, p.z));
      } else if(e.kind === 'engine'){
        // stood on the Moon, pointing out from it
        m.quaternion.setFromUnitVectors(_v4.set(0, 1, 0), _v1.set(e.fx, e.fy, e.fz));
        if(m.userData.flame){ const k = 26 + Math.sin(this.time * 30) * 6; m.userData.flame.scale.set(k, k, 1); }
      } else if(m.userData.spin){
        m.rotation.y += dt * 1.5; m.rotation.x += dt * 0.7;
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
      if(m.userData.core) m.userData.core.material.color.copy(hot(e.shielded ? 0x604050 : (m.userData.coreColor || 0xff4060), e.shielded ? 1 : 3 + Math.sin(this.time * 10)));
      if(m.userData.spinUp) m.userData.spinUp.rotation.y = -(e.spinA || 0);
      if(e.roll) m.rotateX(-e.roll);
      if(m.userData.mouth) m.userData.mouth.scale.y = 0.04 + 0.6 * (e.mouth || 0);
      if(m.userData.dish) m.userData.dish.rotation.y = this.time * 3;
      if(e.type === 'cage') m.rotation.y = this.time * 0.6;
      if(e.type === 'boss' && e.kind === 'carrier' && Math.random() < 0.6) this.parts.emit(e.x - e.fx * 46 + (Math.random() - 0.5) * 20, 1, e.z - e.fz * 46 + (Math.random() - 0.5) * 20, 0, 2, 0, 0.8, 0.85, 0.9, 6, 2.5, 0.5, 2);
      // their engines leave a little trail
      if(e.type === 'dart' || e.type === 'raider' || e.type === 'torpedo' || e.type === 'ace' || e.type === 'mittensShip'){
        const back = e.type === 'torpedo' ? 0 : 7;
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
      if(!m){ m = buildPickup(k.type, this.glow); m.scale.setScalar(1.6); this.pickups.set(k.id, m); this.scene.add(m); }
      if(k.type === 'ring'){
        // storm rings face along the rail
        m.position.set(k.x, k.y, k.z);
        const f = railFrame(k.u); m.rotation.set(0, Math.atan2(f.tx, f.tz), 0);
      } else {
        m.position.set(k.x, k.y + Math.sin(this.time * 2 + k.id) * 0.6, k.z);
        m.rotation.y = this.time * 2;
      }
    }
    for(const [id, m] of this.pickups) if(!ps.has(id)){ this.scene.remove(m); this.pickups.delete(id); }

    // shots, bolts, missiles
    let i = 0;
    for(const b of s.shots){
      if(i >= this.shotBeams.length) break;
      const B = this.shotBeams[i++];
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1, len = b.ally ? 12 : 20;
      B.width = b.ally ? 0.9 : 1.7;      // wingmates' shots thinner, so yours stand out
      B.a.set(b.x - b.vx / sp * len, b.y - b.vy / sp * len, b.z - b.vz / sp * len); B.b.set(b.x, b.y, b.z);
      B.mesh.visible = true; B.place(cam);
      const H = this.shotHeads[i - 1];
      H.visible = !b.ally; H.position.set(b.x, b.y, b.z);
    }
    for(let j = i; j < this.shotBeams.length; j++){ this.shotBeams[j].mesh.visible = false; this.shotHeads[j].visible = false; }
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
      const sp = this.misSprites[i++];
      sp.position.set(m.x, m.y, m.z); sp.visible = true;
      sp.material = m.charged ? this.chargeMat : this.misMat;
      const k = m.charged ? 7 + Math.sin(this.time * 40) : 4; sp.scale.set(k, k, 1);
      if(m.charged) for(let j = 0; j < 3; j++) this.parts.emit(m.x - m.fx * j * 1.5, m.y - m.fy * j * 1.5, m.z - m.fz * j * 1.5, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.4, 1.6, 0.6, 2.6, 0.45, 1, 0.5);
      else this.parts.emit(m.x, m.y, m.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.9, 0.9, 1.0, 2.2, 0.7, 0.5, 1.5);
    }
    for(; i < this.misSprites.length; i++) this.misSprites[i].visible = false;

    // wingmates
    const as = new Set();
    for(const a of s.allies){
      as.add(a.id);
      let m = this.allyShips.get(a.id);
      if(!m){ m = buildPetShip(a.id, this.glow); this.allyShips.set(a.id, m); this.scene.add(m); }
      m.position.set(a.x, a.y, a.z);
      _v1.set(a.fx, a.fy, a.fz);
      if(_v1.lengthSq() > 0.5){
        _v3.crossVectors(_v4.set(0, 1, 0), _v1).normalize();
        _v2.crossVectors(_v1, _v3).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(_v3, _v2, _v1));
        if(a.bank) m.rotateZ(-a.bank);
      }
      m.userData.pilot.rotation.y = Math.sin(this.time * 0.6 + a.slot[0]) * 0.3;
      if(Math.random() < 0.7) this.parts.emit(a.x - a.fx * 3.6, a.y - a.fy * 3.6, a.z - a.fz * 3.6, -a.fx * 8, -a.fy * 8, -a.fz * 8, 0.3, 0.5, 0.7, 0.8, 0.25, 1, 0.5);
      if(a.gone && Math.random() < 0.8) this.parts.emit(a.x, a.y, a.z, 0, 4, 0, 0.3, 0.3, 0.3, 4, 1.5, 0.5, 2, -2);
    }
    for(const [id, m] of this.allyShips) if(!as.has(id)){ this.scene.remove(m); this.allyShips.delete(id); }
    // lightning columns and catnip clouds
    let ci = 0, ni = 0;
    for(const h of s.hazards){
      if(h.kind === 'strike' && !h.done && ci < this.columns.length){
        const c = this.columns[ci++];
        const bot = h.ground > -1e8 ? h.ground : h.y - 80;
        c.visible = true; c.position.set(h.x, bot + 150, h.z); c.scale.set(h.r, 300, h.r);
        c.material.opacity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 18)) * (1.6 - Math.min(1.4, h.t));
      } else if(h.kind === 'nip'){
        for(let k = 0; k < 5 && ni < this.nips.length; k++){
          const sp = this.nips[ni++];
          const a = this.time * 0.7 + k * 1.26 + h.x * 0.01;
          sp.visible = true;
          sp.position.set(h.x + Math.cos(a) * h.r * 0.5, h.y + Math.sin(a * 1.3) * h.r * 0.35, h.z + Math.sin(a) * h.r * 0.5);
          const sz = h.r * (1.6 + 0.3 * Math.sin(this.time * 2 + k));
          sp.scale.set(sz, sz, 1);
        }
      }
    }
    for(; ci < this.columns.length; ci++) this.columns[ci].visible = false;
    for(; ni < this.nips.length; ni++) this.nips[ni].visible = false;
    for(const B of this.bolts3){
      const on = B.t > 0;
      if(on){
        B.t -= dt;
        // a jagged bolt from the clouds to the ground, re-drawn every frame
        let x = B.x, y = B.top, z = B.z;
        const step = (B.top - B.g) / B.beams.length;
        for(const bm of B.beams){
          const nx = B.x + (Math.random() - 0.5) * 14, ny = y - step, nz = B.z + (Math.random() - 0.5) * 14;
          bm.a.set(x, y, z); bm.b.set(nx, ny, nz); bm.mesh.visible = true; bm.place(this.camera);
          bm.mat.uniforms.uAlpha.value = Math.min(1, B.t * 6);
          x = nx; y = ny; z = nz;
        }
      } else for(const bm of B.beams) bm.mesh.visible = false;
    }
    this.skyFlash = Math.max(0, this.skyFlash - dt * 3);
    // weather round the camera
    const th = this.theme || {}, cp = this.camera.position;
    if(th.rain) for(let k = 0; k < (this.low ? 4 : 9); k++) this.parts.emit(cp.x + (Math.random() - 0.5) * 80, cp.y + 30, cp.z + (Math.random() - 0.5) * 80 - p.fz * 20, -p.vx * 0.2, -90, -p.vz * 0.2, 0.25, 0.28, 0.35, 0.35, 0.8, 0, 0);
    if(th.snow) for(let k = 0; k < (this.low ? 3 : 6); k++) this.parts.emit(cp.x + (Math.random() - 0.5) * 90, cp.y + 25, cp.z + (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 4, -8, (Math.random() - 0.5) * 4, 0.9, 0.95, 1.0, 0.5, 4, 0, 0);
    if(th.spores && Math.random() < 0.6) this.parts.emit(cp.x + (Math.random() - 0.5) * 100, cp.y + (Math.random() - 0.5) * 40, cp.z + (Math.random() - 0.5) * 100, 0, 1, 0, 0.5, 0.9, 0.3, 0.8, 4, 0, 0);

    // flashes and rings fade
    for(const f of this.flashes) if(f.s.visible){ f.t -= dt; const k = Math.max(0, f.t / f.life); f.s.scale.setScalar(f.size * (1.4 - k * 0.4)); f.s.material.opacity = k; if(f.t <= 0) f.s.visible = false; }
    for(const f of this.rings) if(f.s.visible){ f.t -= dt; const k = Math.max(0, f.t / f.life); f.s.scale.setScalar(f.size * (1 - k * 0.9)); f.s.material.opacity = k; if(f.t <= 0) f.s.visible = false; }

    this.cameraFollow(s, dt, view);
    // speed dust: specks hanging in the air that rush past
    if(!p.dead && Math.random() < (this.low ? 0.4 : 0.9)){
      const ahead = 60 + Math.random() * 80;
      const sp = GROUND === 'space';
      this.parts.emit(p.x + p.fx * ahead + (Math.random() - 0.5) * 70, p.y + p.fy * ahead + (Math.random() - 0.5) * 40, p.z + p.fz * ahead + (Math.random() - 0.5) * 70,
        0, 0, 0, sp ? 0.6 : 0.55, sp ? 0.65 : 0.48, sp ? 0.8 : 0.4, sp ? 0.4 : 0.5, 2.2, 0, 0);
    }
    this.parts.update(dt);
    // the sky goes with the camera; far ground is not drawn
    this.scenery.update(cam, this.time, this.skyFlash);
    this.sun.position.copy(cam.position).addScaledVector(this.scenery.sunDir, 100);
    this.sun.target.position.copy(cam.position);
  }

  /* The camera. Everything is worked out as offsets from the ship and
     smoothed as offsets, so the ship's own speed never makes the picture
     lag or jitter.
     - On the rail: the classic view, behind and a little above the rail,
       following the ship part of the way across the canyon.
     - The chase rig (the clearing, and the rail's loop): bolted behind the
       ship, turning with it. Its turning is smoothed as a rotation
       (a quaternion slerp), so going over the top of a loop - nose
       straight up, then upside down - is one smooth swing with nothing
       to flip.
     The two are blended (chaseW) so moving between them is a glide. */
  cameraFollow(s, dt, view){
    const p = s.p, cam = this.camera;
    const P = _cp.set(p.x, p.y, p.z);
    const want = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let rate = 7;
    // the ship's frame, as the chase rig wants it
    const f = new THREE.Vector3(p.fx, p.fy, p.fz);
    let u;
    if(!p.man && s.mode === 'free' && s.style === 'level'){
      // level flying: the camera stays level, leaning a little with the bank
      const right = new THREE.Vector3(-p.fz, 0, p.fx).normalize();
      u = new THREE.Vector3().crossVectors(right, f).normalize().applyAxisAngle(f, -p.bank * 0.25);
    } else if(!p.man && s.mode === 'rail'){
      u = new THREE.Vector3(0, 1, 0);
    } else u = new THREE.Vector3(p.ux, p.uy, p.uz);
    const r = new THREE.Vector3().crossVectors(f, u).normalize();
    const u2 = new THREE.Vector3().crossVectors(r, f).normalize();
    const tq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u2, f.clone().negate()));
    if(!this.camQ || this.snap) this.camQ = tq.clone();
    else this.camQ.slerp(tq, 1 - Math.exp(-(p.man ? 5 : 7) * dt));
    const fs = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camQ), us = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camQ);
    const chaseW = view.orbit || p.dead ? 0 : (s.mode === 'free' || p.man) ? 1 : 0;
    this.chaseW = this.chaseW == null || this.snap ? chaseW : this.chaseW + (chaseW - this.chaseW) * Math.min(1, 4 * dt);

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
      look.copy(P);
      rate = 3;
    } else {
      // the rail view (used as long as chaseW is below 1)
      const R = p.man && s.mode === 'rail' ? {u: p.man.u0, ox: p.man.ox0, oy: p.man.oy0} : p.rail;
      // the stick's lead: the camera eases the other way to the stick
      const lead = this.lead = (this.lead || 0) + ((p.rail.vx || 0) - (this.lead || 0)) * Math.min(1, 3 * dt);
      const fol = CAM.railFollow;
      const c = railPoint(R.u - CAM.railBack, R.ox * fol - lead * CAM.railLead, 0);
      const railPos = new THREE.Vector3(c.x, R.oy * fol + (1 - fol) * 30 + CAM.railUp, c.z);
      const l = railPoint(R.u + CAM.railLook, R.ox * fol - lead * CAM.railLead * 0.35, 0);
      const railLook = new THREE.Vector3(l.x, R.oy * fol + (1 - fol) * 30 + 2, l.z);
      const space = this.theme && this.level && this.level.ground === 'space';
      const railUp = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(p.fx, 0, p.fz).normalize(), -p.bank * (space ? 0.2 : 0.3));
      // once free of the rail, the rail view travels with the ship (as the
      // offset it last had) rather than staying behind on the canyon floor
      if(s.mode === 'rail'){ this.railWo = railPos.clone().sub(P); this.railLo = railLook.clone().sub(P); }
      else if(this.railWo){ railPos.copy(P).add(this.railWo); railLook.copy(P).add(this.railLo); }
      // the chase rig
      const tgt = view.target && s.mode === 'free' && s.enemies.find(e => e.id === view.target);
      let chasePos, chaseLook;
      if(tgt){
        // keep both of you in the picture: behind Teddy, looking towards it
        const d = new THREE.Vector3(tgt.x - p.x, tgt.y - p.y, tgt.z - p.z);
        const dist = d.length(); d.normalize();
        chasePos = P.clone().addScaledVector(d, -20).addScaledVector(us, 7);
        chaseLook = P.clone().addScaledVector(d, Math.min(dist * 0.5, 120));
        rate = 5;
      } else {
        chasePos = P.clone().addScaledVector(fs, -CAM.chaseBack).addScaledVector(us, CAM.chaseUp);
        chaseLook = P.clone().addScaledVector(fs, CAM.chaseLook);
        rate = s.mode === 'free' ? 25 : 7;
      }
      const w = this.chaseW;
      want.copy(railPos).lerp(chasePos, w);
      look.copy(railLook).lerp(chaseLook, w);
      up.copy(railUp).lerp(us, w);
      if(up.lengthSq() < 0.01) up.copy(us);
      up.normalize();
      if(w > 0.02 && s.mode === 'rail') rate = 12;
    }
    // smooth as offsets from the ship
    const wo = want.clone().sub(P), lo = look.clone().sub(P);
    const k = 1 - Math.exp(-rate * dt);
    if(this.snap || !this.camOff){ this.camOff = wo.clone(); this.lookOff = lo.clone(); this.camUp.copy(up); this.snap = false; }
    this.camOff.lerp(wo, k);
    this.lookOff.lerp(lo, Math.min(1, k * 1.6));
    this.camUp.lerp(up, Math.min(1, k * 1.2)).normalize();
    cam.position.copy(P).add(this.camOff);
    // the ground is solid for the camera too
    const g = height(cam.position.x, cam.position.z) + 3;
    if(cam.position.y < g) cam.position.y = g;
    if(this.shake > 0){
      const a = this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.up.copy(this.camUp);
    cam.lookAt(_cl.copy(P).add(this.lookOff));
    const base = (s.mode === 'rail' ? 60 : 62) * (s.pace || 1);
    const boost = (p.speed - base) / (45 * (s.pace || 1));
    this.fovKick += (boost * 8 - this.fovKick) * Math.min(1, 4 * dt);
    cam.fov = this.baseFov + this.fovKick + ((s.pace || 1) - 1) * 3;
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
