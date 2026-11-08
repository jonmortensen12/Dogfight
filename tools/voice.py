"""
Voice everyone on the radio: one clip per line, a voice per character.

    pip install kokoro-onnx soundfile imageio-ffmpeg
    # model files (about 120 MB, not kept in the repo):
    #   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
    #   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
    python3 tools/voice.py --models DIR             # every line that has no clip yet
    python3 tools/voice.py --models DIR --all       # every line, again
    python3 tools/voice.py --models DIR --who wing2 # one character, again (after changing their voice)

The same technique as Dry Fly's guide (tools/voice.py there). The words come
from tools/lines.mjs, which gathers every line from levels.js, cast.js and
the code, so the caption and the voice cannot disagree. Each clip is named by
a hash of who says it and the words (web/voice.js), so after changing a line
or renaming a pet, run this again: changed lines get new clips, and clips no
line uses any more are deleted.

Kokoro (Apache-2.0) voices, so the clips can ship. A new pet: add them to
VOICES below. Output: web/voice/<id>.mp3 (mono, ~56 kbit/s) and
web/voice/index.json ({id: seconds}) so the game knows which exist.
"""
import argparse, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'voice')

# who: (Kokoro voice, language, speed, pitch). Pitch above 1 is younger and
# smaller, below 1 bigger and meaner; it is done after Kokoro by resampling,
# with the tempo put back, so the speed stays what it says.
VOICES = {
    'teddy':   ('am_puck',     'en-us', 1.05, 1.05),   # brave, goofy, food-motivated
    'wing1':   ('am_michael',  'en-us', 1.0,  1.0),    # Biscuit: the steady one
    'wing2':   ('af_bella',    'en-us', 1.12, 1.03),   # Pepper: the hothead
    'wing3':   ('bm_fable',    'en-gb', 1.02, 1.0),    # Ziggy: the clever one
    'rosie':   ('bf_emma',     'en-gb', 1.02, 1.03),   # mission control, a corgi
    'hops':    ('bm_george',   'en-gb', 0.92, 0.97),   # the professor
    'mittens': ('af_nicole',   'en-us', 0.9,  0.95),   # the Emperor: sly, purring
    'ace1':    ('am_fenrir',   'en-us', 0.95, 0.93),   # Scratch: gruff leader
    'ace2':    ('am_eric',     'en-us', 1.08, 1.08),   # Hairball
    'ace3':    ('bf_isabella', 'en-gb', 0.95, 1.0),    # Duchess: posh
    'ace4':    ('am_onyx',     'en-us', 0.92, 0.96),   # Tom: cool, deep
}


def lines():
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'lines.mjs'), '--json'], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True, help='folder holding the two Kokoro files')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--who', action='append', default=[])
    o = ap.parse_args()

    import soundfile as sf
    import imageio_ffmpeg
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(o.models, 'kokoro-v1.0.int8.onnx'), os.path.join(o.models, 'voices-v1.0.bin'))
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, 'index.json')
    index = json.load(open(idx_path)) if os.path.exists(idx_path) else {}

    table = lines()
    missing = [w for w in {l['who'] for l in table} if w not in VOICES]
    if missing:
        sys.exit('no voice chosen for: ' + ', '.join(missing) + ' (add them to VOICES)')
    for l in table:
        i, who, text = l['id'], l['who'], l['text']
        dst = os.path.join(OUT, i + '.mp3')
        if os.path.exists(dst) and i in index and not o.all and who not in o.who:
            continue
        voice, lang, speed, pitch = VOICES[who]
        audio, sr = k.create(text, voice=voice, speed=speed, lang=lang)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            wav = t.name
        sf.write(wav, audio, sr)
        # pitch by resampling, tempo put back; trim the silence at the ends
        af = f'asetrate={int(sr * pitch)},aresample={sr},atempo={1 / pitch:.4f},' \
             'silenceremove=start_periods=1:start_threshold=-50dB,areverse,' \
             'silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5'
        wav2 = wav[:-4] + '-fx.wav'
        subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-af', af, '-ac', '1', '-ar', '24000', wav2], check=True)
        done = sf.info(wav2).duration
        subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav2, '-codec:a', 'libmp3lame', '-q:a', '7', dst], check=True)
        os.unlink(wav); os.unlink(wav2)
        index[i] = round(done, 2)
        json.dump(index, open(idx_path, 'w'), separators=(',', ':'))   # as it goes, so a stop loses nothing
        print(f'{who:8s} {index[i]:4.1f}s  {text}', flush=True)
    # clips no line asks for any more
    ids = {l['id'] for l in table}
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:-4] not in ids:
            os.unlink(os.path.join(OUT, f))
            print('removed (no line uses it):', f)
    index = {i: s for i, s in sorted(index.items()) if i in ids}
    json.dump(index, open(idx_path, 'w'), separators=(',', ':'))
    print(len(index), 'clips,', round(sum(index.values()) / 60, 1), 'minutes')


if __name__ == '__main__':
    main()
