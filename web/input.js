/* Dogfight - the controls.

   The phone is held sideways in both hands like a game controller. It is
   the stick:
     - turn it like a steering wheel to steer (roll, about the line of sight)
     - tip the top edge away to dive, towards you to climb (like pushing
       and pulling a stick; "invert" swaps it)
   Both are measured from where the phone was held when it was CENTRED,
   so any comfortable grip works: lying back on the couch, sitting up.

   Only gravity is used (where "up" is, seen from the screen). The compass
   heading the sensor also reports wanders on phones and means nothing
   here, so it is thrown away.

   Thumbs: left - BOOST, BRAKE (and U-TURN when flying free); right - FIRE
   (hold), BOMB, and TARGET when flying free. A quick swipe anywhere else
   is a barrel roll that way.

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
    this.steer = 0; this.pitch = 0;        // radians, raw
    this.steer0 = 0; this.pitch0 = 0.6;    // the centre
    this.sens = 1; this.invert = false;
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
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.sensorQ.clone().invert());
      // up, seen from the screen: x across, y up the screen, z out of it
      // the wheel angle, however far back the phone is tipped
      this.steer = Math.atan2(-up.x, up.y);
      this.pitch = Math.atan2(up.z, up.y);
      if(this.autoCentre){ this.centre(); this.autoCentre = false; }
    });
    addEventListener('keydown', e => {
      if(e.repeat) return;
      this.keys[e.code] = true;
      const map = {Space: 'fire', KeyX: 'bomb', KeyB: 'bomb', KeyQ: 'rollL', KeyE: 'rollR', KeyC: 'uturn', KeyT: 'target', KeyP: 'pause', Escape: 'pause'};
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
  centre(){ this.steer0 = this.steer; this.pitch0 = this.pitch; }

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

  /* The stick and the buttons, as the sim wants them. */
  read(){
    const k = this.keys, h = this.held;
    let sx = 0, sy = 0;
    if(this.live()){
      const range = 22 * D / this.sens, prange = 20 * D / this.sens, dead = 2 * D;
      const shape = (v, r) => { const a = Math.max(0, Math.abs(v) - dead) / r; const c = Math.min(1, a); return Math.sign(v) * (0.35 * c + 0.65 * c * c); };
      sx = shape(this.steer - this.steer0, range);
      sy = -shape(this.pitch - this.pitch0, prange) * (this.invert ? -1 : 1);
    }
    if(this.drag){
      const r = Math.min(innerWidth, innerHeight) * 0.16;
      sx = Math.max(-1, Math.min(1, this.drag.dx / r));
      sy = Math.max(-1, Math.min(1, -this.drag.dy / r)) * (this.invert ? -1 : 1);
    }
    const kx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
    const ky = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0);
    if(kx) sx = kx;
    if(ky) sy = ky * (this.invert ? -1 : 1);
    const p = this.press;
    const out = {
      sx, sy,
      fire: !!(h.fire || k.Space),
      boost: !!(h.boost || k.ShiftLeft || k.ShiftRight),
      brake: !!(h.brake || k.KeyZ || k.ControlLeft),
      bomb: !!p.bomb, uturn: !!p.uturn, target: !!p.target, pause: !!p.pause, centre: !!p.centre,
      roll: p.rollR ? 1 : p.rollL ? -1 : 0,
    };
    this.press = {};
    return out;
  }
}

function screenAngle(){ return ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D; }
