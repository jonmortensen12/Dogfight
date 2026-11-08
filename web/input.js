/* Dogfight - the controls.

   The phone is held sideways in both hands like a game controller, and it
   is a little model of the ship: point the phone and the nose follows.
     - pull the LEFT side of the phone towards you (turn it about its own
       up-and-down line) to turn left, the right side to turn right
     - tip the top edge away to dive, towards you to climb
     - turn it like a steering wheel to ROLL the ship (or, with the Wheel
       setting off, hold the two BANK buttons instead)
   All three are measured from the grip the phone was in when it was
   CENTRED, so lying back on the couch or sitting up both work.

   Turning left and right is a rotation about the phone's own vertical
   line, which gravity cannot see when the phone is upright, so this uses
   the whole orientation the phone reports, not just "which way is down".
   That reading wanders slowly on some phones; small leftovers near the
   centre are bled away, and CENTRE resets it outright.

   Thumbs: left - BOOST, BRAKE, LOOP (and U-TURN when flying free); right -
   FIRE (tap to shoot, hold to charge), BOMB, TARGET when flying free. A
   quick sideways swipe anywhere else is a barrel roll that way.

   No motion sensor (a laptop, or permission refused): the left thumb
   drags a stick instead, and the keyboard works too. */
import * as THREE from 'three';

const D = Math.PI / 180;
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const ZEE = new THREE.Vector3(0, 0, 1);

export class Input {
  constructor(root){
    this.root = root;
    this.sensorQ = new THREE.Quaternion();
    this.gyro = false; this.lastSensor = 0;
    this.q0 = new THREE.Quaternion();      // the centred grip
    this.centred = false;
    this.yaw = 0; this.pitch = 0; this.roll = 0;   // radians, from the centred grip
    this.sens = 1; this.invert = false; this.wheel = true;
    this.held = {};                        // buttons held
    this.press = {};                       // one-shot presses since the last read
    this.keys = {};
    this.drag = null;                      // the fallback stick
    this.swipes = new Map();
    this.enabled = false;
    this.autoCentre = false;
    const qs = new THREE.Quaternion(), eul = new THREE.Euler();
    addEventListener('deviceorientation', e => {
      if(e.beta == null) return;
      this.gyro = true; this.lastSensor = performance.now();
      eul.set(e.beta * D, (e.alpha || 0) * D, -e.gamma * D, 'YXZ');
      this.sensorQ.setFromEuler(eul).multiply(q1).multiply(qs.setFromAxisAngle(ZEE, -screenAngle()));
      if(!this.centred){ this.centre(); }
      this.measure();
    });
    addEventListener('keydown', e => {
      if(e.repeat) return;
      this.keys[e.code] = true;
      const map = {Space: 'fire', KeyX: 'bomb', KeyB: 'bomb', KeyQ: 'rollL', KeyE: 'rollR', KeyL: 'loop', KeyC: 'uturn', KeyU: 'uturn', KeyT: 'target', KeyP: 'pause', Escape: 'pause'};
      if(map[e.code]) this.press[map[e.code]] = true;
      if(e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.held = {}; });
    this.bindButtons();
    this.bindSwipes();
  }

  static ask(){
    // iOS asks once, and only from inside a tap
    try {
      if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')
        return DeviceOrientationEvent.requestPermission().then(r => r === 'granted').catch(() => false);
    } catch(e){}
    return Promise.resolve(true);
  }

  live(){ return this.gyro && performance.now() - this.lastSensor < 1000; }
  centre(){ this.q0.copy(this.sensorQ); this.centred = true; this.measure(); }
  /* The turn from the centred grip, in the screen's own axes (x across,
     y up the screen, z out of it towards you): yaw about y, then pitch
     about x, then roll about z. */
  /* The turn from the centred grip, split in the order a hand does it:
     the wheel (roll) first, then the turn and the tip measured about the
     phone's OWN axes as it is now held. So with the phone rolled over like
     a wheel, "pull the left side closer" and "tip the top away" still mean
     what they meant before the roll. (They used to be measured about the
     unrolled axes, so after a big roll a tip came out as a turn - Jon's
     "I have to tilt my phone in a direction other than expected".) */
  measure(){
    const rel = this.q0.clone().invert().multiply(this.sensorQ);
    const e = new THREE.Euler().setFromQuaternion(rel, 'ZYX');
    this.yaw = e.y; this.pitch = e.x; this.roll = e.z;
    // bleed away slow wander in the turn while it is close to centre
    const now = performance.now(), dt = Math.min(0.1, (now - (this.lastBleed || now)) / 1000);
    this.lastBleed = now;
    if(Math.abs(this.yaw) < 4 * D && dt > 0){
      const yaw = this.yaw * (1 - Math.min(1, dt * 0.25));
      const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, yaw, this.roll, 'ZYX'));
      this.q0.copy(this.sensorQ).multiply(want.invert());
      this.yaw = yaw;
    }
  }

  bindButtons(){
    for(const el of this.root.querySelectorAll('[data-btn]')){
      const k = el.dataset.btn;
      const down = e => {
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
        el.classList.add('down');
        this.held[k] = (this.held[k] || 0) + 1;
        this.press[k] = true;
        if(navigator.vibrate && k !== 'fire') navigator.vibrate(8);
      };
      const up = e => {
        if(!el.classList.contains('down')) return;
        el.classList.remove('down');
        this.held[k] = 0;
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
    }
  }

  /* A quick sideways flick anywhere that is not a button rolls the ship.
     Without a motion sensor, a finger held down on the left half is a stick. */
  bindSwipes(){
    const z = this.root.querySelector('#touch');
    z.addEventListener('pointerdown', e => {
      if(!this.enabled) return;
      this.swipes.set(e.pointerId, {x: e.clientX, y: e.clientY, t: performance.now()});
      if(!this.live() && e.clientX < innerWidth * 0.5 && !this.drag) this.drag = {id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0};
    });
    z.addEventListener('pointermove', e => {
      if(this.drag && this.drag.id === e.pointerId){ this.drag.dx = e.clientX - this.drag.x; this.drag.dy = e.clientY - this.drag.y; }
    });
    const end = e => {
      const s = this.swipes.get(e.pointerId);
      this.swipes.delete(e.pointerId);
      if(this.drag && this.drag.id === e.pointerId){ this.drag = null; return; }
      if(!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, dt = performance.now() - s.t;
      if(dt < 450 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) this.press[dx > 0 ? 'rollR' : 'rollL'] = true;
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  }

  /* The stick and the buttons, as the sim wants them:
     sx turn (right +), sy nose (up +), sr roll (right +), all -1..1. */
  read(){
    const k = this.keys, h = this.held;
    let sx = 0, sy = 0, sr = 0;
    if(this.live()){
      const sv = this.sens, dead = 2 * D;
      const shape = (v, r) => { const a = Math.max(0, Math.abs(v) - dead) / r; const c = Math.min(1, a); return Math.sign(v) * (0.35 * c + 0.65 * c * c); };
      sx = -shape(this.yaw, 20 * D / sv);                         // left side closer: yaw +, turn left
      sy = shape(this.pitch, 20 * D / sv) * (this.invert ? -1 : 1);   // top towards you: pitch +, climb
      if(this.wheel) sr = -shape(this.roll, 32 * D / sv);         // wheel clockwise: roll -, roll right
    }
    if(this.drag){
      const r = Math.min(innerWidth, innerHeight) * 0.16;
      sx = Math.max(-1, Math.min(1, this.drag.dx / r));
      sy = Math.max(-1, Math.min(1, -this.drag.dy / r)) * (this.invert ? -1 : 1);
    }
    const kx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    const ky = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0);
    const kr = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const hb = (h.bankR ? 1 : 0) - (h.bankL ? 1 : 0);     // the bank buttons, held
    if(kx) sx = kx;
    if(ky) sy = ky * (this.invert ? -1 : 1);
    if(kr) sr = kr;
    if(hb) sr = hb;
    const p = this.press;
    const out = {
      sx, sy, sr,
      fire: !!(h.fire || k.Space || p.fire),     // a tap between two frames still counts
      boost: !!(h.boost || k.ShiftLeft || k.ShiftRight),
      brake: !!(h.brake || k.KeyZ || k.ControlLeft),
      bomb: !!p.bomb, loop: !!p.loop, uturn: !!p.uturn, target: !!p.target, pause: !!p.pause, centre: !!p.centre,
      roll: p.rollR ? 1 : p.rollL ? -1 : 0,
    };
    this.press = {};
    return out;
  }
}

function screenAngle(){ return ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D; }
