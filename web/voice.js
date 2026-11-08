/* Dogfight - the voices.

   Every line on the radio has a recorded clip in voice/, made by
   tools/voice.py (Kokoro text-to-speech, a voice per character). A clip is
   found by a hash of who says it and the exact words, so a line that has
   been changed, or a pet that has been renamed, has no clip until
   voice.py is run again: the caption shows and nothing plays.

   voice/index.json lists the clips there are, so nothing is fetched that
   isn't. One line plays at a time; a new one cuts the last short. The
   music dips while anyone is talking. */

import * as snd from './sound.js';
import {voiceId} from './voiceid.js';
export {voiceId};

const DIR = new URL('voice/', import.meta.url).href;
let INDEX = null;
fetch(DIR + 'index.json').then(r => r.ok ? r.json() : {}).then(j => { INDEX = j; }).catch(() => { INDEX = {}; });

/* The clip for a line, if there is one: {url, dur}. */
export function clipFor(who, text){
  const id = voiceId(who, text);
  return INDEX && INDEX[id] ? {url: DIR + id + '.mp3', dur: INDEX[id]} : null;
}
/* Start fetching a line's clip (when it is queued, so it is ready to play). */
export function preload(who, text){ const c = clipFor(who, text); if(c) snd.loadVoice(c.url); return c; }
/* Say it. Returns how long it takes, or 0 if there is no clip. */
export function say(who, text, radio){
  const c = clipFor(who, text);
  if(!c) return 0;
  snd.speak(c.url, radio);
  return c.dur;
}
export const hush = snd.stopVoice;
