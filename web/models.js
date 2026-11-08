/* Dogfight - the models. Everything is built from primitives, nose along
   +z (so Object3D.lookAt points it), every glowing part a colour brighter
   than white so the bloom catches it.

   Ships: Teddy's (his own head in the cockpit), and the same airframe in
   each wingmate's colours with their own head - from cast.js, so a renamed
   or recoloured pet changes here too. Enemies: the Hiss (cats, so their
   ships have ears), the Alley Cats in their own colours, every boss and
   every boss part, and the props (pickups, cages, Mittens' planets). */
import * as THREE from 'three';
import {CAST} from './cast.js';
import {vnoise} from './terrain.js';

export function hot(hex, k){ const c = new THREE.Color(hex); c.multiplyScalar(k || 3); return c; }
const glowMat = (hex, k) => new THREE.MeshBasicMaterial({color: hot(hex, k)});
const std = (color, metal, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({color, metalness: metal == null ? 0.4 : metal, roughness: rough == null ? 0.45 : rough}, extra || {}));
function adder(g){
  return (geo, mat, x, y, z, rx, ry, rz, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    (parent || g).add(m); return m;
  };
}
function sprite(glow, color, s, k){
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: glow, color: hot(color, k || 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true}));
  sp.scale.set(s, s, 1);
  return sp;
}
/* Curly or fluffy: an icosahedron with its surface pushed about. */
function lumpy(r, det, amt, seed){
  const geo = new THREE.IcosahedronGeometry(r, det);
  const p = geo.attributes.position;
  for(let i = 0; i < p.count; i++){
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (vnoise(x * 6 / r + seed, y * 6 / r + z * 3 / r) - 0.5) * amt;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------- heads ---------- */
/* Teddy's own head: a Bernedoodle, from his photo. Facing +z. */
export function buildTeddyHead(){
  const g = new THREE.Group(), add = adder(g);
  const curl = std(0x15151a, 0, 0.9, {flatShading: true});
  const tan = std(0xb57a45, 0, 0.8, {flatShading: true});
  const white = std(0xf2efe9, 0, 0.85, {flatShading: true});
  const grey = std(0x9a9894, 0, 0.85, {flatShading: true});
  const nose = std(0x050506, 0.1, 0.3), eye = std(0x2a1408, 0.2, 0.15), pink = std(0xe0707e, 0, 0.6);
  const sc = (m, x, y, z) => { m.scale.set(x, y, z); return m; };
  sc(add(lumpy(1, 2, 0.22, 1), curl, 0, 0.1, 0), 1, 1, 0.95);
  sc(add(lumpy(0.55, 1, 0.3, 4), curl, 0, 0.75, 0.15), 1.2, 0.7, 1);
  sc(add(lumpy(0.55, 1, 0.18, 2), white, 0, -0.2, 0.75), 1, 0.85, 0.9);
  sc(add(lumpy(0.3, 1, 0.2, 7), grey, 0, 0.1, 0.95), 0.7, 0.6, 0.5);
  add(new THREE.BoxGeometry(0.16, 0.7, 0.1), white, 0, 0.45, 0.88);
  sc(add(lumpy(0.3, 1, 0.25, 3), tan, 0.38, -0.32, 0.7), 1, 0.9, 0.9);
  sc(add(lumpy(0.3, 1, 0.25, 5), tan, -0.38, -0.32, 0.7), 1, 0.9, 0.9);
  sc(add(new THREE.SphereGeometry(0.17, 12, 10), nose, 0, -0.08, 1.24), 1.25, 0.9, 0.9);
  add(new THREE.SphereGeometry(0.12, 10, 8), eye, 0.34, 0.22, 0.86);
  add(new THREE.SphereGeometry(0.12, 10, 8), eye, -0.34, 0.22, 0.86);
  sc(add(new THREE.SphereGeometry(0.1, 8, 6), tan, 0.36, 0.42, 0.86), 1.4, 0.7, 0.7);
  sc(add(new THREE.SphereGeometry(0.1, 8, 6), tan, -0.36, 0.42, 0.86), 1.4, 0.7, 0.7);
  sc(add(new THREE.SphereGeometry(0.14, 10, 8), pink, 0, -0.5, 1.0), 1, 0.5, 0.8);
  for(const s of [1, -1]){ const e = sc(add(lumpy(0.45, 1, 0.3, 6 + s), curl, s * 0.88, -0.25, 0.05), 0.55, 1.15, 0.8); e.rotation.z = s * 0.25; }
  const collar = add(new THREE.TorusGeometry(0.62, 0.09, 6, 20), std(0xd2462a, 0, 0.6), 0, -0.85, 0.15, Math.PI / 2);
  void collar;
  return g;
}
/* Anyone else's head, from cast.js: a dog, a cat or a rabbit in their colours. */
export function buildPetHead(pet){
  if(pet === CAST.teddy) return buildTeddyHead();
  const g = new THREE.Group(), add = adder(g);
  const fur = std(new THREE.Color(pet.fur), 0, 0.85, {flatShading: true});
  const patch = std(new THREE.Color(pet.patch || pet.fur), 0, 0.85, {flatShading: true});
  const muz = std(new THREE.Color(pet.muzzle || pet.patch || pet.fur), 0, 0.85, {flatShading: true});
  const eye = std(new THREE.Color(pet.eyes || '#2a1408'), 0.2, 0.15, pet.kind === 'cat' ? {emissive: new THREE.Color(pet.eyes).multiplyScalar(0.4)} : {});
  const nose = std(pet.kind === 'dog' ? 0x050506 : 0xe0808a, 0.1, 0.3);
  const sc = (m, x, y, z) => { m.scale.set(x, y, z); return m; };
  sc(add(lumpy(1, 2, pet.kind === 'dog' ? 0.12 : 0.05, 3), fur, 0, 0.1, 0), pet.kind === 'cat' ? 1.08 : 1, 0.95, 0.95);
  add(new THREE.BoxGeometry(0.2, 0.7, 0.1), patch, 0, 0.45, 0.9);
  if(pet.kind === 'cat'){ for(const s of [1, -1]) sc(add(new THREE.SphereGeometry(0.28, 12, 10), muz, s * 0.2, -0.25, 0.82), 1, 0.85, 0.7); }
  else sc(add(new THREE.SphereGeometry(0.42, 14, 10), muz, 0, -0.25, 0.75), 1, 0.8, 1.1);
  sc(add(new THREE.SphereGeometry(0.14, 10, 8), nose, 0, -0.05, pet.kind === 'dog' ? 1.2 : 1.0), 1.2, 0.85, 0.85);
  for(const s of [1, -1]) sc(add(new THREE.SphereGeometry(0.12, 10, 8), eye, s * 0.34, 0.22, 0.86), 1, pet.kind === 'cat' ? 0.8 : 1, 1);
  for(const s of [1, -1]){
    if(pet.kind === 'rabbit'){ const e = sc(add(new THREE.SphereGeometry(0.22, 10, 8), fur, s * 0.3, 1.25, -0.1), 0.8, 3, 0.5); e.rotation.z = -s * 0.15; }
    else if(pet.ears === 'floppy'){ const e = sc(add(lumpy(0.42, 1, 0.2, 6 + s), fur, s * 0.9, -0.2, 0.05), 0.5, 1.1, 0.8); e.rotation.z = s * 0.25; }
    else if(pet.ears === 'round'){ add(new THREE.SphereGeometry(0.3, 12, 10), fur, s * 0.62, 0.85, 0); }
    else { const e = add(new THREE.ConeGeometry(0.32, 0.7, 4), fur, s * 0.58, 0.95, 0); e.rotation.z = -s * 0.3; }
  }
  if(pet.kind === 'cat') for(const s of [1, -1]) for(const dy of [-0.06, 0.06]){
    const w = add(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 3), std(0xffffff, 0, 0.5), s * 0.55, -0.2 + dy, 0.85);
    w.rotation.z = Math.PI / 2 + s * dy * 2;
  }
  if(pet.role !== 'Villain' && pet.role !== 'Ace') add(new THREE.TorusGeometry(0.62, 0.09, 6, 20), std(0x2f6fd0, 0, 0.6), 0, -0.85, 0.15, Math.PI / 2);
  if(pet.role === 'Villain'){
    const crown = new THREE.Group(); crown.position.y = 1.0;
    const gold = std(0xe8b830, 0.9, 0.25);
    add(new THREE.CylinderGeometry(0.5, 0.55, 0.3, 10, 1, true), gold, 0, 0, 0, 0, 0, 0, crown);
    for(let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2; add(new THREE.ConeGeometry(0.1, 0.3, 4), gold, Math.cos(a) * 0.5, 0.28, Math.sin(a) * 0.5, 0, 0, 0, crown); }
    g.add(crown);
  }
  return g;
}

/* ---------- the squadron's ships ----------
   Teddy's colours: a black hull, a white nose and blaze, tan trim, a red
   collar band with a gold tag, and wing tips that droop like his ears.
   Wingmates fly the same airframe in their own colours. */
export function buildPetShip(who, glow){
  const pet = CAST[who] || CAST.teddy;
  const c = Object.assign({hull: 0x1b1c22, trim: 0xc4874a, nose: 0xeeeae2, engine: 0x5ad8ff}, pet.ship || {});
  const g = new THREE.Group(), add = adder(g);
  const hull = std(c.hull, 0.45, 0.38), trim = std(c.trim, 0.25, 0.45), white = std(c.nose, 0.2, 0.35);
  const red = std(0xc8202a, 0.3, 0.4), gold = std(0xe0a830, 0.9, 0.25);
  const flash = [hull, trim, white];
  const prof = [[0, -3.4], [0.55, -3.3], [0.8, -2.6], [0.95, -1.2], [0.92, 0.6], [0.7, 2.0], [0.42, 3.0], [0.12, 3.6], [0, 3.7]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = add(new THREE.LatheGeometry(prof, 20), hull, 0, 0, 0, Math.PI / 2);
  body.scale.set(1, 1, 0.85);
  add(new THREE.SphereGeometry(0.5, 16, 12), white, 0, -0.05, 3.25).scale.set(0.9, 0.8, 1.1);
  add(new THREE.BoxGeometry(0.3, 0.05, 1.5), white, 0, 0.6, 2.3, -0.22);
  add(new THREE.TorusGeometry(0.9, 0.12, 8, 28), red, 0, 0, -0.2);
  const tag = add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), gold, 0, -1.08, -0.05, Math.PI / 2);
  const glass = std(0x9fd8ff, 0, 0.05, {transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 0.4});
  add(new THREE.SphereGeometry(0.66, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.55, 0.95).scale.set(1.0, 1.25, 1.7);
  const pilot = buildPetHead(pet);
  pilot.scale.setScalar(0.5); pilot.position.set(0, 0.9, 0.8);
  g.add(pilot);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 1.0); wingShape.lineTo(2.9, -0.4); wingShape.lineTo(2.9, -1.3); wingShape.lineTo(0, -1.6); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1});
  wingGeo.rotateX(Math.PI / 2); wingGeo.translate(0, 0.07, 0);
  const earShape = new THREE.Shape();
  earShape.moveTo(0, 0); earShape.quadraticCurveTo(1.0, 0.25, 1.5, -0.35); earShape.quadraticCurveTo(1.35, -1.1, 0.8, -1.25); earShape.lineTo(0, -0.9); earShape.closePath();
  const earGeo = new THREE.ExtrudeGeometry(earShape, {depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 8});
  earGeo.rotateX(Math.PI / 2);
  // pointy-eared pets get wing tips that stand up instead of drooping
  const droop = pet.ears === 'pointy' ? 0.5 : pet.ears === 'round' ? -0.2 : -0.95;
  for(const s of [1, -1]){
    const w = new THREE.Group(); w.position.set(s * 0.7, -0.15, -0.6); w.rotation.z = s * -0.06;
    g.add(w);
    const wm = add(wingGeo, hull, 0, 0, 0, 0, 0, 0, w); if(s < 0) wm.scale.x = -1;
    add(new THREE.BoxGeometry(3.0, 0.18, 0.22), trim, s * 1.45, 0.07, 0.35, 0, s * 0.45, 0, w);
    const ear = new THREE.Group(); ear.position.set(s * 2.85, 0.05, -0.35); ear.rotation.z = s * droop; ear.scale.setScalar(1.25);
    w.add(ear);
    const em = add(earGeo, hull, 0, 0, 0.45, 0, 0, 0, ear); if(s < 0) em.scale.x = -1;
    add(new THREE.SphereGeometry(0.16, 8, 6), glowMat(c.engine, 3), s * 1.45, 0, -0.1, 0, 0, 0, ear);
    add(new THREE.CylinderGeometry(0.34, 0.42, 2.0, 12), white, s * 1.3, -0.3, -0.7, Math.PI / 2, 0, 0, w);
    add(new THREE.TorusGeometry(0.36, 0.07, 6, 16), trim, s * 1.3, -0.3, -1.7, 0, 0, 0, w);
  }
  for(const s of [1, -1]){
    const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-1.3, 0); fin.lineTo(-1.6, 1.4); fin.lineTo(-1.05, 1.4); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, {depth: 0.08, bevelEnabled: false});
    fg.rotateY(Math.PI / 2);
    add(fg, white, s * 0.42, 0.45, -1.9, 0, 0, s * -0.32);
  }
  const engines = [];
  for(const s of [1, -1]){ const sp = sprite(glow, c.engine, 1.1, 1.8); sp.position.set(s * 1.98, -0.45, -2.45); g.add(sp); engines.push(sp); }
  const main = sprite(glow, c.engine, 2.2, 1.3); main.position.set(0, 0, -3.5); g.add(main); engines.push(main);
  add(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 14), glowMat(c.engine, 2.5), 0, 0, -3.35, Math.PI / 2);
  const charge = sprite(glow, 0x70ff90, 1, 2.2); charge.position.set(0, -0.1, 4.3); charge.visible = false; g.add(charge);
  g.userData = {flash, engines, pilot, tag, charge};
  return g;
}
export function buildTeddyShip(glow){ return buildPetShip('teddy', glow); }

/* ---------- the Hiss ---------- */
export function buildEnemy(e, glow){
  const type = e.type, g = new THREE.Group(), add = adder(g);
  const hull = std(0x8a94a8, 0.6, 0.35, {emissive: 0x000000});
  const dark = std(0x3c4352, 0.5, 0.55, {emissive: 0x000000});
  const flash = [hull, dark];
  const engines = [];
  const eng = (color, s, x, y, z) => { const sp = sprite(glow, color, s * 0.6); sp.position.set(x, y, z); g.add(sp); engines.push(sp); return sp; };
  if(type === 'dart' || type === 'ace'){
    if(type === 'ace'){ hull.color.set(((CAST[e.who] || {}).ship || {}).hull || 0xe08a2a); hull.metalness = 0.3; }
    add(new THREE.ConeGeometry(0.62, 3.8, 6), hull, 0, 0, 0.2, Math.PI / 2);
    const wing = new THREE.BoxGeometry(2.2, 0.08, 1.1);
    add(wing, dark, 1.0, 0, -0.7, 0, 0.45, -0.12);
    add(wing, dark, -1.0, 0, -0.7, 0, -0.45, 0.12);
    add(new THREE.BoxGeometry(0.08, 0.9, 0.9), dark, 0, 0.45, -1.0, 0.3);
    const ear = type === 'ace' ? 0.7 : 0.45;
    add(new THREE.ConeGeometry(0.22, ear, 4), type === 'ace' ? hull : dark, 0.2, 0.5, 0.3, 0, 0, -0.2);
    add(new THREE.ConeGeometry(0.22, ear, 4), type === 'ace' ? hull : dark, -0.2, 0.5, 0.3, 0, 0, 0.2);
    const eye = type === 'ace' ? 0xffd030 : 0xff3b30;
    add(new THREE.SphereGeometry(0.28, 10, 8), glowMat(eye, 4), 0, 0.22, 0.5);
    add(new THREE.BoxGeometry(0.06, 0.05, 1.0), glowMat(eye, 3), 1.9, 0, -0.95, 0, 0.45);
    add(new THREE.BoxGeometry(0.06, 0.05, 1.0), glowMat(eye, 3), -1.9, 0, -0.95, 0, -0.45);
    if(type === 'ace'){ const tail = add(new THREE.CylinderGeometry(0.08, 0.14, 2.2, 6), hull, 0, 0.6, -2.2, -1.0); void tail; }
    eng(type === 'ace' ? 0xffb030 : 0xff5a2a, 2.2, 0, 0, -1.8);
    g.scale.setScalar(type === 'ace' ? 1.7 : 1.5);
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
    const en = new THREE.CylinderGeometry(0.32, 0.4, 1.3, 10);
    add(en, dark, 0.8, 0, -1.0, Math.PI / 2); add(en, dark, -0.8, 0, -1.0, Math.PI / 2);
    add(new THREE.BoxGeometry(3.4, 0.05, 0.08), glowMat(0xff8a00, 3), 0, 0.2, -1.2);
    eng(0xff8a20, 2.0, 0.8, 0, -1.8); eng(0xff8a20, 2.0, -0.8, 0, -1.8);
    g.scale.setScalar(1.6);
  } else if(type === 'torpedo'){
    add(new THREE.SphereGeometry(0.9, 16, 12), glowMat(0xff2060, 4));
    const spike = new THREE.ConeGeometry(0.22, 1.4, 5);
    for(let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; add(spike, dark, Math.cos(a) * 1.0, Math.sin(a) * 1.0, -0.3, 0, 0, a - Math.PI / 2); }
    g.userData.pulse = eng(0xff2060, 7, 0, 0, 0);
  } else if(type === 'turret'){
    const head = new THREE.Group(); g.add(head); g.userData.head = head;
    add(new THREE.CylinderGeometry(3.4, 4.2, 3, 10), dark, 0, -2.5, 0);
    const ha = adder(head);
    ha(new THREE.SphereGeometry(2.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, -0.8, 0);
    ha(new THREE.BoxGeometry(0.45, 0.45, 4.2), dark, 0.7, 0.2, 2.2);
    ha(new THREE.BoxGeometry(0.45, 0.45, 4.2), dark, -0.7, 0.2, 2.2);
    ha(new THREE.SphereGeometry(0.6, 12, 10), glowMat(0xff2a1a, 4), 0, 0.6, 1.4);
    const sp = sprite(glow, 0xff3020, 2.6); sp.position.set(0, 0.6, 1.4); head.add(sp);
  } else if(type === 'planet'){
    // one of the little worlds Mittens bats at you
    const hue = e.hue || 0.3;
    const geo = new THREE.SphereGeometry(8, 24, 16);
    const col = new Float32Array(geo.attributes.position.count * 3), p = geo.attributes.position, c = new THREE.Color();
    for(let i = 0; i < p.count; i++){ const b = Math.sin(p.getY(i) * 0.9 + vnoise(p.getX(i) * 0.3, p.getZ(i) * 0.3) * 3); c.setHSL((hue + b * 0.06 + 1) % 1, 0.55, 0.45 + b * 0.12); col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    add(geo, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.8}));
    add(new THREE.TorusGeometry(12, 0.6, 4, 40), std(0xe8dcc0, 0, 0.6, {transparent: true, opacity: 0.7}), 0, 0, 0, 1.3);
    g.userData.spin = true;
  } else if(type === 'cage'){
    // a cage with a pup inside: shoot it open
    const bars = std(0x707888, 0.8, 0.3, {emissive: 0x000000});
    flash.length = 0; flash.push(bars);
    for(const y of [-4, 4]) add(new THREE.BoxGeometry(8, 0.5, 8), bars, 0, y, 0);
    for(let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; add(new THREE.CylinderGeometry(0.18, 0.18, 8, 5), bars, Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8); }
    const pup = buildPetHead({kind: 'dog', fur: ['#c98f4a', '#2b2b30', '#e8e8e4', '#8a5a3a'][e.id % 4], patch: '#f3e6cf', muzzle: '#f3e6cf', ears: ['floppy', 'pointy', 'round'][e.id % 3], eyes: '#2a1608'});
    pup.scale.setScalar(1.6); g.add(pup);
    const sp = sprite(glow, 0xfff0a0, 14, 0.8); g.add(sp);
  } else if(type === 'mittensShip'){
    hull.color.set(0x8a4aa0); hull.metalness = 0.7;
    add(new THREE.SphereGeometry(1.4, 16, 12), hull).scale.set(1, 0.7, 2.4);
    for(const s of [1, -1]){ add(new THREE.BoxGeometry(3.6, 0.12, 1.4), dark, s * 2, 0, -0.8, 0, s * 0.4, 0); add(new THREE.ConeGeometry(0.35, 1.0, 4), hull, s * 0.5, 1.0, 0.4, 0, 0, -s * 0.25); }
    const gold = std(0xe8b830, 0.9, 0.25);
    add(new THREE.CylinderGeometry(0.6, 0.65, 0.35, 10, 1, true), gold, 0, 1.0, 0.6);
    add(new THREE.SphereGeometry(0.35, 10, 8), glowMat(0x7ad040, 4), 0, 0.4, 2.6);
    eng(0xd070ff, 4, 0, 0, -3.2);
    g.scale.setScalar(1.6);
  } else if(type === 'mine'){
    // a floating mine: a ball of spikes with a blinking light
    add(new THREE.SphereGeometry(2.2, 14, 10), dark);
    for(let i = 0; i < 10; i++){ const a = i * 2.4, b = Math.acos(1 - 2 * (i + 0.5) / 10); const sp = add(new THREE.ConeGeometry(0.5, 2, 6), hull, Math.sin(b) * Math.cos(a) * 2.4, Math.cos(b) * 2.4, Math.sin(b) * Math.sin(a) * 2.4); sp.lookAt(sp.position.clone().multiplyScalar(3)); sp.rotateX(Math.PI / 2); }
    g.userData.pulse = eng(0xff3030, 5, 0, 0, 0);
  } else if(type === 'buoy'){
    // a Hiss radar buoy, bobbing: a float, a mast, a spinning dish, a blinking light
    add(new THREE.CylinderGeometry(2.6, 3.2, 3, 12), std(0xd84a2a, 0.3, 0.6), 0, -1, 0);
    add(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), dark, 0, 2.5, 0);
    const dish = add(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), hull, 0, 5.5, 0, Math.PI / 2.4);
    g.userData.dish = dish;
    add(new THREE.ConeGeometry(0.5, 1.2, 4), dark, 0.6, 7, 0, 0, 0, -0.3); add(new THREE.ConeGeometry(0.5, 1.2, 4), dark, -0.6, 7, 0, 0, 0, 0.3);
    g.userData.pulse = eng(0xff3030, 4, 0, 6.5, 0);
  } else if(type === 'part'){
    buildPart(e.kind, g, add, hull, dark, eng, glow);
  } else if(type === 'boss'){
    buildBossBody(e.kind, g, add, hull, dark, eng, glow, flash);
  }
  g.userData.flash = g.userData.flash || flash;
  g.userData.engines = engines;
  return g;
}

/* Boss parts, sized to their hit spheres in sim.js's BOSS table. */
function buildPart(kind, g, add, hull, dark, eng, glow){
  if(kind === 'pod'){
    add(new THREE.CylinderGeometry(4.5, 5.4, 26, 14), dark, 0, 0, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(4.8, 0.5, 6, 20), glowMat(0xb040ff, 3), 0, 0, -13);
    eng(0xc060ff, 22, 0, 0, -15);
  } else if(kind === 'gun'){
    add(new THREE.CylinderGeometry(3.5, 4.5, 2.5, 12), dark, 0, -1, 0);
    add(new THREE.SphereGeometry(3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hull, 0, 0, 0);
    add(new THREE.BoxGeometry(0.6, 0.6, 6), dark, 1, 1.2, 3); add(new THREE.BoxGeometry(0.6, 0.6, 6), dark, -1, 1.2, 3);
    add(new THREE.SphereGeometry(0.8, 10, 8), glowMat(0xff3a1a, 4), 0, 1.6, 1.5);
  } else if(kind === 'rod'){
    add(new THREE.CylinderGeometry(0.8, 1.6, 22, 8), dark, 0, -6, 0);
    add(new THREE.BoxGeometry(14, 1.2, 1.2), dark, 7, -12, 0);
    add(new THREE.SphereGeometry(3.5, 14, 10), glowMat(0x9ad0ff, 3.5), 0, 5, 0);
    eng(0x9ad0ff, 18, 0, 5, 0);
  } else if(kind === 'lock'){
    add(new THREE.BoxGeometry(9, 9, 9), hull);
    add(new THREE.TorusGeometry(3, 0.8, 8, 20), glowMat(0xffc030, 3), 0, 0, 4.6);
    add(new THREE.BoxGeometry(2, 4, 1), dark, 0, -1, 5);
  } else if(kind === 'vent'){
    add(new THREE.CylinderGeometry(4, 5.5, 5, 12), dark, 0, 0, 0);
    add(new THREE.CylinderGeometry(1.5, 2, 8, 8), dark, 0, -5, 0);
    add(new THREE.CircleGeometry(3.6, 16), glowMat(0x7ae0ff, 3), 0, 2.6, 0, -Math.PI / 2);
    eng(0x9ae8ff, 16, 0, 4, 0);
  } else if(kind === 'petal'){
    const petal = std(0xd060c0, 0, 0.5, {emissive: 0x000000});
    g.userData.flash = [petal];
    add(new THREE.SphereGeometry(7, 16, 12), petal).scale.set(1, 1.6, 0.35);
    add(new THREE.SphereGeometry(2, 10, 8), glowMat(0xffa0e0, 2.5), 0, 0, 2.5);
  } else if(kind === 'panel'){
    add(new THREE.CylinderGeometry(8, 8, 1.6, 6), hull, 0, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(5, 5, 1.8, 6), glowMat(0xff4080, 2.5), 0, 0, 0.3, Math.PI / 2);
  } else if(kind === 'paw'){
    // a great soft grey paw, toe beans and all
    const fur = std(0x9a9aa2, 0, 0.9, {emissive: 0x000000, flatShading: true});
    const bean = std(0xf08aa0, 0, 0.5);
    g.userData.flash = [fur];
    add(lumpy(13, 2, 0.08, 9), fur).scale.set(1, 0.75, 1.1);
    add(new THREE.SphereGeometry(5, 14, 10), bean, 0, -4, 8).scale.set(1.2, 0.8, 0.6);
    for(let i = 0; i < 4; i++) add(new THREE.SphereGeometry(2.4, 10, 8), bean, (i - 1.5) * 4.2, 2, 11 - Math.abs(i - 1.5) * 1.5);
  } else if(kind === 'engine'){
    // a rocket strapped to the Moon, nozzle down, pushing
    const n = new THREE.Group(); g.add(n); g.userData.axis = n;
    const na = adder(n);
    na(new THREE.CylinderGeometry(6, 7, 16, 14), hull, 0, 4, 0);
    na(new THREE.ConeGeometry(6, 6, 14), dark, 0, 15, 0);
    na(new THREE.CylinderGeometry(4, 7, 5, 14, 1, true), dark, 0, -6, 0);
    for(let i = 0; i < 3; i++) na(new THREE.BoxGeometry(0.6, 10, 4), dark, Math.cos(i * 2.1) * 6, 0, Math.sin(i * 2.1) * 6, 0, -i * 2.1, 0);
    const fl = sprite(glow, 0xffa040, 30, 2); fl.position.set(0, -12, 0); n.add(fl); g.userData.flame = fl;
  }
}

/* Boss bodies, sized to their hit spheres. */
function buildBossBody(kind, g, add, hull, dark, eng, glow, flash){
  const shield = () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.ShaderMaterial({
      vertexShader: FRESNEL_VERT, fragmentShader: RIM_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      uniforms: {uColor: {value: new THREE.Color(1.1, 0.35, 1.3)}, uPow: {value: 2.5}, uAlpha: {value: 0.8}, uTime: {value: 0}}}));
    g.add(m); g.userData.shield = m; return m;
  };
  const core = (r, color, x, y, z) => { const m = add(new THREE.SphereGeometry(r, 18, 14), glowMat(color, 3), x || 0, y || 0, z || 0); g.userData.core = m; g.userData.coreColor = color; return m; };
  if(kind === 'brute'){
    const k = 6, big = geo => { geo.scale(k, k, k); return geo; };
    add(big(new THREE.CapsuleGeometry(1.25, 4.2, 4, 16)), hull, 0, 0, 0, Math.PI / 2);
    add(big(new THREE.BoxGeometry(6.2, 0.3, 2.2)), hull, 0, -0.2 * k, -0.6 * k);
    add(big(new THREE.BoxGeometry(1.4, 0.6, 2.2)), glowMat(0xb040ff, 2.5), 0, -1.15 * k, 0.2 * k);
    add(big(new THREE.SphereGeometry(0.5, 14, 10)), glowMat(0xd070ff, 3.5), 0, 0.6 * k, 2.4 * k);
    add(big(new THREE.ConeGeometry(0.4, 1.0, 4)), dark, 0.6 * k, 1.3 * k, 1.6 * k, 0, 0, -0.25);
    add(big(new THREE.ConeGeometry(0.4, 1.0, 4)), dark, -0.6 * k, 1.3 * k, 1.6 * k, 0, 0, 0.25);
    eng(0xc060ff, 3.2 * k * 0.8, 0, 0, -3.4 * k);
    core(3.6, 0xff4060, 0, 0.2 * k, -1.6 * k);
    shield().scale.set(14, 10, 24);
  } else if(kind === 'carrier'){
    // the Big Tabby: a flat-topped carrier, a tabby-striped hull, the bridge on the deck
    const tabby = std(0xc87a3a, 0.3, 0.6, {emissive: 0x000000});
    flash.push(tabby);
    add(new THREE.BoxGeometry(30, 10, 92), tabby, 0, 0, 0);
    add(new THREE.BoxGeometry(34, 1.2, 96), dark, 0, 5.6, 0);
    for(let i = 0; i < 9; i++) add(new THREE.BoxGeometry(30.4, 10.2, 2.4), std(0x8a4a1a, 0.3, 0.6), 0, 0, -40 + i * 10);
    add(new THREE.ConeGeometry(15, 20, 4), tabby, 0, 0, 55, Math.PI / 2, Math.PI / 4, 0);
    for(let i = 0; i < 6; i++) add(new THREE.BoxGeometry(1, 0.1, 6), glowMat(0xffe080, 2), 0, 6.3, -35 + i * 14);
    // the bridge, with ears
    add(new THREE.BoxGeometry(10, 14, 16), hull, 12, 13, -5);
    add(new THREE.BoxGeometry(10.4, 2, 10), glowMat(0x80d0ff, 2.5), 12, 17, -3);
    add(new THREE.ConeGeometry(2.5, 6, 4), hull, 9, 23, -3); add(new THREE.ConeGeometry(2.5, 6, 4), hull, 15, 23, -3);
    core(4, 0xff5030, 12, 19, 3);
    eng(0xffa040, 18, 8, 0, -48); eng(0xffa040, 18, -8, 0, -48);
    shield().scale.set(30, 22, 56);
    g.userData.wake = true;
  } else if(kind === 'tower'){
    // a weather tower: a thin black spike up out of the valley, a storm-cloud crown
    add(new THREE.CylinderGeometry(3, 8, 170, 10), dark, 0, -90, 0);
    for(let i = 0; i < 6; i++) add(new THREE.TorusGeometry(5 + i * 0.6, 0.6, 6, 16), glowMat(0x9ad0ff, 1.5), 0, -20 - i * 22, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(13, 18, 14), hull);
    core(6, 0x9ad0ff, 0, 0, 10);
    for(let i = 0; i < 5; i++){ const c = add(new THREE.SphereGeometry(10, 10, 8), std(0x40444c, 0, 1, {transparent: true, opacity: 0.8}), Math.cos(i * 1.26) * 16, 14, Math.sin(i * 1.26) * 16); c.scale.set(1.4, 0.7, 1.4); }
    shield().scale.set(22, 22, 22);
  } else if(kind === 'warden'){
    add(new THREE.SphereGeometry(16, 24, 18), hull);
    for(let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; add(new THREE.BoxGeometry(1, 34, 1), dark, Math.cos(a) * 16.5, 0, Math.sin(a) * 16.5); }
    const ring = new THREE.Group(); g.add(ring); g.userData.spinUp = ring;
    adder(ring)(new THREE.TorusGeometry(38, 2, 10, 64), dark, 0, 0, 0, Math.PI / 2);
    for(let i = 0; i < 4; i++){ const a = i * Math.PI / 2 + Math.PI / 4; adder(ring)(new THREE.BoxGeometry(2, 2, 36), dark, Math.cos(a) * 19, 0, Math.sin(a) * 19, 0, -a + Math.PI / 2, 0); }
    core(7, 0xffc030, 0, 0, 12);
    add(new THREE.SphereGeometry(4, 12, 10), glowMat(0xff3a20, 4), 0, 8, 13);
    shield().scale.set(22, 22, 22);
  } else if(kind === 'snowball'){
    const ice = std(0xe8f2ff, 0.1, 0.3, {emissive: 0x000000, flatShading: true});
    flash.push(ice);
    add(lumpy(20, 3, 0.1, 2), ice);
    for(let i = 0; i < 14; i++){ const a = i * 2.4, b = (i * 0.7) % 3 - 1.5; const sp = add(new THREE.ConeGeometry(2.4, 9, 5), std(0xa8d0f0, 0.1, 0.2), Math.cos(a) * 19 * Math.cos(b * 0.6), Math.sin(b * 0.6) * 19, Math.sin(a) * 19 * Math.cos(b * 0.6)); sp.lookAt(sp.position.clone().multiplyScalar(2)); sp.rotateX(Math.PI / 2); }
    core(5, 0x7ae0ff, 0, 0, 18);
    shield().scale.set(28, 28, 28);
  } else if(kind === 'queen'){
    // Queen Nip: a great catnip flower, a glowing middle, a stem trailing down
    add(new THREE.SphereGeometry(10, 20, 16), std(0xd8e050, 0, 0.6), 0, 0, 0).scale.set(1, 1, 0.6);
    core(5, 0xc0ff60, 0, 0, 6);
    add(new THREE.CylinderGeometry(1.5, 2.5, 60, 8), std(0x3a7a2a, 0, 0.8), 0, -35, -3);
    for(let i = 0; i < 4; i++){ const l = add(new THREE.SphereGeometry(6, 10, 8), std(0x4a9a3a, 0, 0.7), (i % 2 ? 6 : -6), -20 - i * 9, -3); l.scale.set(1.6, 0.3, 0.9); }
    shield().scale.set(36, 36, 16);
    g.userData.spinFwd = null;
  } else if(kind === 'core'){
    add(new THREE.SphereGeometry(14, 22, 16), hull);
    for(let i = 0; i < 3; i++) add(new THREE.TorusGeometry(16 + i * 3, 0.8, 8, 40), dark, 0, 0, 0, i * 1.05, i * 0.7, 0);
    core(8, 0xff4080, 0, 0, 10);
    shield().scale.set(32, 32, 14);
  } else if(kind === 'mittens'){
    // Emperor Mittens: a giant cat's face in the dark, crowned
    const fur = std(0x9a9aa2, 0, 0.9, {emissive: 0x000000, flatShading: true});
    const white = std(0xf4f2ee, 0, 0.9, {flatShading: true});
    flash.length = 0; flash.push(fur);
    add(lumpy(30, 3, 0.06, 5), fur).scale.set(1.25, 1, 0.9);
    for(const s of [1, -1]){
      add(new THREE.ConeGeometry(12, 26, 4), fur, s * 22, 30, 0, 0, Math.PI / 4, -s * 0.3);
      add(new THREE.ConeGeometry(7, 16, 4), std(0xf2a8b8, 0, 0.7), s * 22, 28, 3, 0, Math.PI / 4, -s * 0.3);
      add(new THREE.SphereGeometry(6, 16, 12), glowMat(0x7ad040, 3.2), s * 12, 6, 24).scale.set(1, 0.75, 0.5);
      add(new THREE.SphereGeometry(1.6, 8, 8), std(0x050505, 0, 0.3), s * 12, 6, 27).scale.set(0.5, 1.4, 0.5);
      add(new THREE.SphereGeometry(8, 12, 10), white, s * 7, -8, 24).scale.set(1, 0.8, 0.6);
      for(const dy of [-2, 1, 4]){ const w = add(new THREE.CylinderGeometry(0.25, 0.25, 30, 4), white, s * 22, -8 + dy, 24); w.rotation.z = Math.PI / 2 + s * dy * 0.05; }
    }
    add(new THREE.SphereGeometry(3, 10, 8), std(0xf08aa0, 0, 0.5), 0, -3, 28).scale.set(1.2, 0.8, 0.8);
    // the mouth: shut, until she opens it to hiss (then it glows: hit it)
    const mouth = add(new THREE.SphereGeometry(9, 18, 12), glowMat(0xff3060, 1.6), 0, -15, 21);
    mouth.scale.set(1.3, 0.04, 0.5);
    g.userData.mouth = mouth;
    const gold = std(0xe8b830, 0.9, 0.25);
    add(new THREE.CylinderGeometry(16, 17, 8, 14, 1, true), gold, 0, 30, -2);
    for(let i = 0; i < 7; i++){ const a = i / 7 * Math.PI * 2; add(new THREE.ConeGeometry(2.5, 8, 4), gold, Math.cos(a) * 16.5, 37, Math.sin(a) * 16.5 - 2); }
    add(new THREE.SphereGeometry(2.5, 10, 8), glowMat(0xff2040, 3), 0, 30, 15);
    g.userData.core = null;
    shield().scale.set(48, 44, 36);
  }
}

/* ---------- pickups ---------- */
export function buildPickup(type, glow){
  const g = new THREE.Group(), add = adder(g);
  const sp = sprite(glow, 0xffffff, 9, 1); g.add(sp);
  if(type === 'bone' || type === 'gold'){
    const m = type === 'gold' ? std(0xffc040, 1, 0.2, {emissive: 0x6a3a00}) : std(0xf4f0e8, 0.3, 0.3, {emissive: 0x404040});
    add(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 12), m, 0, 0, 0, 0, 0, Math.PI / 2);
    for(const x of [-1.7, 1.7]) for(const y of [-0.45, 0.45]) add(new THREE.SphereGeometry(0.62, 12, 10), m, x, y, 0);
    sp.material.color = hot(type === 'gold' ? 0xffb020 : 0x9fffc0, 1.2);
  } else if(type === 'ring'){
    // a storm ring: fly through it
    g.remove(sp);
    add(new THREE.TorusGeometry(6, 0.5, 8, 40), glowMat(0x9ad0ff, 2.6));
    add(new THREE.TorusGeometry(6.8, 0.15, 6, 40), glowMat(0xffffff, 2));
    g.userData.ring = true;
  } else if(type === 'ball'){
    add(new THREE.SphereGeometry(1.6, 20, 16), std(0xd6f03a, 0, 0.8, {emissive: 0x304000}));
    const seam = add(new THREE.TorusGeometry(1.62, 0.08, 6, 40), new THREE.MeshBasicMaterial({color: 0xffffff}), 0, 0, 0, 0.6, 0.3, 0);
    seam.scale.set(1, 0.6, 1);
    sp.material.color = hot(0xd6ff40, 1.2);
  } else {
    add(new THREE.CapsuleGeometry(0.8, 1.6, 4, 12), std(0x3a6aff, 0.6, 0.3, {emissive: 0x0a1a60}));
    add(new THREE.TorusGeometry(1.0, 0.12, 6, 20), glowMat(0x80b0ff, 3), 0, 0, 0, Math.PI / 2);
    sp.material.color = hot(0x6090ff, 1.2);
  }
  return g;
}

export const FRESNEL_VERT = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vP = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const RIM_FRAG = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
uniform vec3 uColor; uniform float uPow; uniform float uAlpha; uniform float uTime;
void main(){
  float f = pow(1.0 - abs(dot(vN, vV)), uPow);
  float shimmer = 0.7 + 0.3 * sin(vP.y * 18.0 + uTime * 6.0) * sin(vP.x * 14.0 - uTime * 4.0);
  gl_FragColor = vec4(uColor * f * uAlpha * shimmer, 1.0);
}`;
