/* Every line the cast says out loud, for tools/voice.py to voice.

     node tools/lines.mjs            # prints the count per character
     node tools/lines.mjs --json     # [{id, who, text}] for voice.py

   Where they come from:
     - levels.js: briefings, outros, the ending, wave and boss calls, the
       secret, fork and chase lines, and everything the level scripts say
       (each script is run with a stand-in that records instead of acting)
     - cast.js: each wingmate's lines (hello, help, saved...)
     - sim.js and main.js: lines written straight into the code, found by
       reading the source: say(s, 'who', 'text'), a choice of lines in
       [...], ['who', 'text'] pairs, and the Alley Cats' parting shots

   A line's id is a hash of who says it and the words after the names are
   filled in (web/voice.js makes the same hash in the game). So a changed
   line, or a renamed pet, simply has no clip until voice.py is run again:
   the caption still shows, silently. Lines built from numbers ("Radar
   buoy down - 3 of 8") are not voiced. */
import {readFileSync} from 'fs';
import {LEVELS} from '../web/levels.js';
import {CAST, WINGS, ACES, lineFor} from '../web/cast.js';
import {voiceId} from '../web/voiceid.js';

const out = new Map();
const add = (who, text) => {
  if(!CAST[who] || typeof text !== 'string' || !text.trim() || text.includes('${')) return;
  const t = lineFor(text), id = voiceId(who, t);
  if(!out.has(id)) out.set(id, {id, who, text: t});
};

// ---- levels: any [who, text] pair anywhere in a level's data, and the scripts
function walk(v, depth){
  if(depth > 8 || v == null) return;
  if(Array.isArray(v)){
    if(v.length >= 2 && typeof v[0] === 'string' && CAST[v[0]] && typeof v[1] === 'string') add(v[0], v[1]);
    for(const x of v) walk(x, depth + 1);
  } else if(typeof v === 'object') for(const k of Object.keys(v)) walk(v[k], depth + 1);
}
for(const L of Object.values(LEVELS)){
  walk(L, 0);
  if(typeof L.script === 'function'){
    const A = new Proxy({}, {get: (o, k) => k === 'say' ? (who, text) => add(who, text) : k === 'at' ? (u, fn) => { try { fn(); } catch(e){} } : () => {}});
    try { L.script(A); } catch(e){}
  }
}
// ---- the cast's own lines
for(const w of Object.keys(CAST)) for(const t of Object.values(CAST[w].lines || {})) add(w, t);

// ---- lines written into the code
const STR = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
const unq = m => (m[1] != null ? m[1] : m[2]).replace(/\\(['"\\])/g, '$1');
function argsAt(src, i){
  // the text of a call's arguments, from just after '(' to its matching ')'
  let d = 1, j = i, q = null;
  for(; j < src.length && d > 0; j++){
    const c = src[j];
    if(q){ if(c === '\\') j++; else if(c === q) q = null; continue; }
    if(c === "'" || c === '"' || c === '`') q = c;
    else if(c === '(') d++;
    else if(c === ')') d--;
  }
  return src.slice(i, j - 1);
}
for(const f of ['web/sim.js', 'web/main.js']){
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  // say(s, WHO, ...): the words are the string literals in the third argument on
  for(const m of src.matchAll(/\bsay\(s,\s*/g)){
    const args = argsAt(src, m.index + m[0].length);
    const w = args.match(/^'(\w+)'|^(a\.id|e\.who)\b/);
    if(!w) continue;
    const whos = w[1] ? [w[1]] : w[2] === 'a.id' ? WINGS : ACES;
    const rest = args.slice(w[0].length);
    if(rest.includes('`') || /['"]\s*\+|\+\s*['"]/.test(rest)) continue;   // built from numbers: not voiced
    for(const s of rest.matchAll(STR)) for(const who of whos) add(who, unq(s));
  }
  // ['who', 'text'] pairs
  for(const m of src.matchAll(/\[\s*'(\w+)'\s*,\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\]/g)){
    const s = [...m[2].matchAll(STR)][0];
    if(s) add(m[1], unq(s));
  }
  // the Alley Cats' parting shots: {ace1: '...', ...}
  for(const m of src.matchAll(/\b(ace\d):\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) add(m[1], unq([...m[2].matchAll(STR)][0]));
}
add('ace1', 'Hiss!'); add('ace2', 'Hiss!'); add('ace3', 'Hiss!'); add('ace4', 'Hiss!');

const all = [...out.values()];
if(process.argv.includes('--json')) process.stdout.write(JSON.stringify(all));
else {
  const n = {};
  for(const l of all) n[l.who] = (n[l.who] || 0) + 1;
  console.log(all.length + ' lines:', Object.entries(n).map(([w, c]) => `${CAST[w].name} ${c}`).join(', '));
}
