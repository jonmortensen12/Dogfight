/* A voice clip's name: FNV-1a over "who|text". The game (voice.js) and
   tools/lines.mjs both use this, so they agree on which clip is which. */
export function voiceId(who, text){
  let h = 0x811c9dc5;
  const s = who + '|' + text;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

