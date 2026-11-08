"""Render Dogfight's music from recorded instruments.

    python3 tools/samples.py      # once: the FluidR3 instrument recordings
    python3 tools/music.py [name ...]

Copied from Night Watch's tools/music.py (the engine is unchanged, plus a
synthesised kick and hi-hat and some synth instruments). The pieces are
Dogfight's own, written in the manner of a 90s console space shooter:
bright brass fanfares over octave-jumping bass, a rock kit, synth brass
stabs, fast. Every piece is written out below as notes, rendered note by
note from the FluidR3 GM recordings, put
through a hall reverb, and encoded into web/music/ as MP3 - MP3 because
every browser decodes it, the iPad's included, which Opus in Ogg is not.

Loops are made to loop: the reverb tail that runs past the end is folded
back onto the start, and the file carries a little of the end before bar 1
and a little of the start after the last bar, so the game can loop between
music.json's loopStart and loopEnd without a seam whatever a decoder does
with the first few milliseconds of an MP3.

Licence: FluidR3 GM by Frank Wen, CC BY 3.0. The game credits it.
"""
import json, math, os, random, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SAMPLES = os.path.join(HERE, 'samples')
OUT = os.path.join(REPO, 'web', 'music')
SR = 44100
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

# ---------------------------------------------------------------- instruments
# sus: a held note, carried past the end of the recording by crossfading
# repeats of its steady middle. ring: how long a struck note is left to ring
# after its written length. send: how much goes to the hall.
INST = {
    'horn':     dict(gm='french_horn', gain=0.55, pan=-0.25, send=0.45, rel=0.35, sus=True),
    'trumpet':  dict(gm='trumpet', gain=0.62, pan=0.2, send=0.35, rel=0.25, sus=True),
    'brass':    dict(gm='brass_section', gain=0.38, pan=0.05, send=0.4, rel=0.3, sus=True),
    'trombone': dict(gm='trombone', gain=0.45, pan=0.25, send=0.3, rel=0.2, sus=True),
    'tuba':     dict(gm='tuba', gain=0.5, pan=0.1, send=0.2, rel=0.2, sus=True),
    'strings':  dict(gm='string_ensemble_1', gain=0.36, pan=0.0, send=0.5, rel=0.6, sus=True),
    'spicc':    dict(gm='string_ensemble_1', gain=0.34, pan=-0.1, send=0.3, rel=0.08, sus=False, ring=0.12),
    'trem':     dict(gm='tremolo_strings', gain=0.34, pan=0.1, send=0.45, rel=0.4, sus=True),
    'pizz':     dict(gm='pizzicato_strings', gain=0.55, pan=0.15, send=0.3, rel=0.2, sus=False, ring=0.6),
    'bass':     dict(gm='contrabass', gain=0.5, pan=0.0, send=0.2, rel=0.3, sus=True),
    'cello':    dict(gm='cello', gain=0.42, pan=0.15, send=0.35, rel=0.4, sus=True),
    'timp':     dict(gm='timpani', gain=0.7, pan=0.0, send=0.4, rel=0.4, sus=False, ring=1.4),
    'taiko':    dict(gm='taiko_drum', gain=0.62, pan=0.0, send=0.3, rel=0.3, sus=False, ring=0.9),
    'harp':     dict(gm='orchestral_harp', gain=0.45, pan=-0.3, send=0.5, rel=0.8, sus=False, ring=2.0),
    'celesta':  dict(gm='celesta', gain=0.32, pan=0.3, send=0.55, rel=0.8, sus=False, ring=1.4),
    'glock':    dict(gm='glockenspiel', gain=0.24, pan=0.35, send=0.55, rel=0.8, sus=False, ring=1.4),
    'flute':    dict(gm='flute', gain=0.42, pan=0.2, send=0.5, rel=0.25, sus=True),
    'choir':    dict(gm='choir_aahs', gain=0.3, pan=0.0, send=0.65, rel=0.8, sus=True),
    'piano':    dict(gm='acoustic_grand_piano', gain=0.42, pan=0.0, send=0.35, rel=0.6, sus=False, ring=2.2),
    'hit':      dict(gm='orchestra_hit', gain=0.5, pan=0.0, send=0.5, rel=0.5, sus=False, ring=1.5),
    'revcym':   dict(gm='reverse_cymbal', gain=0.35, pan=0.0, send=0.3, rel=0.0, sus=False, ring=0.0),
    # the bunker's instruments
    'organ':    dict(gm='church_organ', gain=0.26, pan=0.0, send=0.6, rel=0.7, sus=True),
    'xylo':     dict(gm='xylophone', gain=0.42, pan=0.25, send=0.35, rel=0.3, sus=False, ring=0.6),
    'harpsi':   dict(gm='harpsichord', gain=0.34, pan=-0.25, send=0.35, rel=0.4, sus=False, ring=1.0),
    'bassoon':  dict(gm='bassoon', gain=0.5, pan=-0.15, send=0.35, rel=0.25, sus=True),
    'oboe':     dict(gm='oboe', gain=0.4, pan=0.2, send=0.45, rel=0.25, sus=True),
    'bells':    dict(gm='tubular_bells', gain=0.42, pan=0.0, send=0.6, rel=1.5, sus=False, ring=3.5),
    'mbox':     dict(gm='music_box', gain=0.34, pan=0.15, send=0.55, rel=0.8, sus=False, ring=1.6),
    # Dogfight's: the synths that make it sound like a cartridge from 1997
    'sbrass':   dict(gm='synth_brass_1', gain=0.34, pan=-0.1, send=0.3, rel=0.15, sus=True),
    'sbass':    dict(gm='synth_bass_1', gain=0.55, pan=0.0, send=0.08, rel=0.06, sus=False, ring=0.1),
    'sstr':     dict(gm='synth_strings_1', gain=0.3, pan=0.1, send=0.45, rel=0.5, sus=True),
    'lead':     dict(gm='lead_2_sawtooth', gain=0.16, pan=0.15, send=0.35, rel=0.15, sus=True),
    'ebass':    dict(gm='electric_bass_finger', gain=0.5, pan=0.0, send=0.1, rel=0.08, sus=False, ring=0.15),
}

_cache = {}


def midi_of(name):
    """'C#5', 'Bb3', 'G4' -> MIDI number."""
    letter, rest = name[0], name[1:]
    acc = 0
    while rest and rest[0] in '#b':
        acc += 1 if rest[0] == '#' else -1
        rest = rest[1:]
    pc = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[letter] + acc
    return 12 * (int(rest) + 1) + pc


def load(gm, m):
    key = (gm, m)
    if key in _cache:
        return _cache[key]
    path = os.path.join(SAMPLES, gm, NAMES[m % 12] + str(m // 12 - 1) + '.mp3')
    if not os.path.exists(path):
        raise SystemExit(f'missing sample {path} - run python3 tools/samples.py')
    raw = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-f', 'f32le',
                          '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    # start at the note's onset, not the mp3's leading silence
    loud = np.nonzero(np.abs(a).max(axis=1) > 0.003)[0]
    if len(loud):
        a = a[max(0, loud[0] - int(0.002 * SR)):]
    _cache[key] = a
    return a


def extend(s, n):
    """A held note longer than its recording: crossfade repeats of the middle."""
    if n <= len(s):
        return s[:n]
    a, b, xf = int(0.8 * SR), len(s) - int(0.4 * SR), int(0.15 * SR)
    if b - a < xf * 3:
        return np.concatenate([s, np.zeros((n - len(s), 2))])
    loop = s[a:b]
    out = s[:b].copy()
    fade = np.linspace(0, 1, xf)[:, None]
    while len(out) < n:
        head = out[-xf:] * (1 - fade) + loop[:xf] * fade
        out = np.concatenate([out[:-xf], head, loop[xf:]])
    return out[:n]


# ---------------------------------------------------------------- the score
CHORDS = {'': [0, 4, 7], 'm': [0, 3, 7], 'dim': [0, 3, 6], 'sus': [0, 5, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10]}


def chord(name):
    """'Am' -> (root pc, [pcs]); 'E/D' keeps E major over a D bass: (bass pc, pcs)."""
    bass = None
    if '/' in name:
        name, b = name.split('/')
        bass = midi_of(b + '0') % 12
    root = name[0]
    i = 1
    if len(name) > 1 and name[1] in '#b':
        root += name[1]
        i = 2
    r = midi_of(root + '0') % 12
    q = CHORDS[name[i:]]
    return (r if bass is None else bass), [(r + x) % 12 for x in q], r


def voice(pcs, lo, hi):
    """Every chord tone between two MIDI notes, low to high."""
    return [m for m in range(lo, hi + 1) if m % 12 in pcs]


def near(pc, lo, hi):
    """The pitch class's first note at or above lo (within hi)."""
    for m in range(lo, hi + 1):
        if m % 12 == pc:
            return m
    return lo


class Score:
    def __init__(self, bpm, bars, beats=4, seed=1):
        self.bpm, self.bars, self.beats = bpm, bars, beats
        self.notes = []          # (inst, t_sec, dur_sec, midi, vel)
        self.fx = []             # synthesised drums: (kind, t_sec, vel)
        self.rng = random.Random(seed)

    def sec(self, beat):
        return beat * 60.0 / self.bpm

    @property
    def length(self):
        return self.sec(self.bars * self.beats)

    def note(self, inst, beat, dur, pitch, vel=0.8):
        m = midi_of(pitch) if isinstance(pitch, str) else pitch
        # humanised a little: a few milliseconds and a few percent
        jit = self.rng.uniform(-0.006, 0.006) if INST[inst].get('sus') or inst not in ('taiko', 'timp') else self.rng.uniform(-0.003, 0.003)
        self.notes.append((inst, max(0, self.sec(beat) + jit), self.sec(dur), m, vel * self.rng.uniform(0.95, 1.04)))

    def line(self, inst, beat, tokens, vel=0.8, shift=0, legato=1.0):
        """'G4:1 C5:1.5 r:0.5' from a beat; returns the beat after."""
        for tok in tokens.split():
            p, d = tok.split(':')
            d = float(d)
            if p != 'r':
                self.note(inst, beat, d * legato, midi_of(p) + shift, vel)
            beat += d
        return beat

    def hold(self, inst, beat, dur, pitches, vel=0.6):
        for p in pitches:
            self.note(inst, beat, dur, p, vel)

    def drum(self, kind, beat, vel=0.8):
        self.fx.append((kind, max(0, self.sec(beat) + self.rng.uniform(-0.003, 0.003)), vel * self.rng.uniform(0.92, 1.05)))


# ---------------------------------------------------------------- synthesised drums
def snare(vel):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(vel * 1e6) % 9973)
    noise = rng.standard_normal(n)
    # band-limited: the top of the noise taken off, then the bottom, so it
    # reads as a drum and not as hiss
    noise = np.convolve(noise, np.ones(5) / 5, mode='same')
    noise = noise - np.convolve(noise, np.ones(24) / 24, mode='same')
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)
    s = (noise * np.exp(-t / 0.07) * 0.9 + body * 0.5) * vel * 0.26
    return np.stack([s, s], axis=1)


def kick(vel):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = np.exp(-t / 0.002) * 0.4
    s = (s + click) * vel * 0.05
    return np.stack([s, s], axis=1)


def hat(vel, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(vel * 1e5) % 9973)
    x = rng.standard_normal(n)
    x = x - np.convolve(x, np.ones(3) / 3, mode='same')
    s = x * np.exp(-t / (0.08 if open_ else 0.018)) * vel * 0.05
    return np.stack([s * 0.9, s], axis=1)


def crash(vel):
    """A real cymbal: FluidR3's reverse cymbal, played forwards again."""
    s = load('reverse_cymbal', 60)[::-1].copy()
    loud = np.nonzero(np.abs(s).max(axis=1) > 0.01)[0]
    s = s[loud[0]:] if len(loud) else s
    fade = int(0.3 * SR)
    s[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return s * vel * 0.55


def crash_noise(vel):
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)
    l, r = rng.standard_normal(n), rng.standard_normal(n)
    band = lambda x: (lambda y: y - np.convolve(y, np.ones(10) / 10, mode='same'))(np.convolve(x, np.ones(3) / 3, mode='same'))
    env = np.exp(-t / 0.9) * (1 - np.exp(-t / 0.004))
    return np.stack([band(l) * env, band(r) * env], axis=1) * vel * 0.2


def reverb_ir():
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    ir = rng.standard_normal((n, 2)) * np.exp(-t / 0.6)[:, None]
    # darker as it decays: a running average whose width grows with time
    k = 12
    ir = np.stack([np.convolve(ir[:, c], np.ones(k) / k, mode='same') for c in range(2)], axis=1)
    ir[:int(0.018 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum() / 2) * 0.55


def render(score, tail=3.0, loop=True):
    L = int(round(score.length * SR))
    N = L + int(tail * SR)
    dry = np.zeros((N, 2))
    wet = np.zeros((N, 2))
    for inst, t, dur, m, vel in score.notes:
        spec = INST[inst]
        s = load(spec['gm'], m)
        if inst == 'revcym':
            # a reverse cymbal swells INTO its beat: line its end up with it
            start = int(t * SR) - len(s)
            seg = s.copy()
            if start < 0:
                seg, start = seg[-start:], 0
        else:
            keep = dur + (spec['rel'] if spec['sus'] else spec.get('ring', 0.5))
            n = int(keep * SR)
            seg = extend(s, n) if spec['sus'] else s[:n].copy()
            # release: hold to the written end, then fade
            rel_n = max(1, int((spec['rel'] if spec['sus'] else min(spec.get('ring', 0.5), 0.3)) * SR))
            fade_from = max(0, len(seg) - rel_n)
            env = np.ones(len(seg))
            env[fade_from:] = np.cos(np.linspace(0, np.pi / 2, len(seg) - fade_from)) ** 2
            seg = seg * env[:, None]
            start = int(t * SR)
        g = spec['gain'] * (vel ** 1.5)
        p = (spec['pan'] + 1) * np.pi / 4
        seg = seg * np.array([math.cos(p), math.sin(p)]) * g * 1.41
        end = min(N, start + len(seg))
        if end <= start:
            continue
        dry[start:end] += seg[:end - start]
        wet[start:end] += seg[:end - start] * spec['send']
    for kind, t, vel in score.fx:
        s = snare(vel) if kind == 'snare' else kick(vel) if kind == 'kick' else hat(vel) if kind == 'hat' else hat(vel, True) if kind == 'ohat' else crash(vel)
        start = int(t * SR)
        end = min(N, start + len(s))
        if end <= start:
            continue
        dry[start:end] += s[:end - start]
        wet[start:end] += s[:end - start] * (0.1 if kind in ('kick', 'hat', 'ohat') else 0.35)
    ir = reverb_ir()
    size = 1 << int(np.ceil(np.log2(N + len(ir))))
    rev = np.stack([np.fft.irfft(np.fft.rfft(wet[:, c], size) * np.fft.rfft(ir[:, c], size), size)[:N] for c in range(2)], axis=1)
    mix = dry + rev
    if loop:
        # the tail past the last bar belongs at the start of the next time round
        mix[:N - L] += mix[L:]
        mix = mix[:L]
    else:
        loud = np.nonzero(np.abs(mix).max(axis=1) > 0.0008)[0]
        mix = mix[:(loud[-1] + int(0.05 * SR)) if len(loud) else N]
        fade = min(len(mix), int(0.05 * SR))
        mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix


def master(mix, rms_target=0.11, peak=0.8):
    rms = np.sqrt((mix ** 2).mean()) + 1e-9
    mix = mix * (rms_target / rms)
    # a gentle limiter rather than a clip
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mx = np.abs(mix).max()
    if mx > peak:
        mix *= peak / mx
    return mix


def encode(mix, path):
    data = mix.astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2',
                    '-i', '-', '-c:a', 'libmp3lame', '-b:a', '128k', path], input=data, check=True)


# ================================================================ the pieces
def ostinato(sc, inst, bar, name, pattern, lo, hi, vel, step=0.5, dur=0.45):
    """An arpeggiated figure over a bar: pattern indexes the chord's tones
    from the lowest in range (0, 1, 2...), -1 being the bass note."""
    bass, pcs, root = chord(name)
    tones = voice(pcs, lo, hi)
    # start the figure on the root
    while tones and tones[0] % 12 != root:
        tones = tones[1:]
    for i, k in enumerate(pattern):
        b = bar * sc.beats + i * step
        if b >= (bar + 1) * sc.beats:
            break
        m = near(bass, lo - 12, hi) if k == -1 else tones[min(k, len(tones) - 1)]
        sc.note(inst, b, dur, m, vel)


def pad(sc, inst, bar, name, lo, hi, vel, beats=None):
    _, pcs, _ = chord(name)
    sc.hold(inst, bar * sc.beats, beats or sc.beats, voice(pcs, lo, hi), vel)


def bassline(sc, inst, bar, name, octave_lo, vel, beats=None):
    bass, _, _ = chord(name)
    sc.note(inst, bar * sc.beats, beats or sc.beats, near(bass, octave_lo, octave_lo + 11), vel)


def roll(sc, inst, beat, beats, pitch, v0, v1, step=0.125):
    n = int(beats / step)
    for i in range(n):
        sc.note(inst, beat + i * step, step, pitch, v0 + (v1 - v0) * i / max(1, n - 1))


def snare_roll(sc, beat, beats, v0, v1, step=0.125):
    n = int(beats / step)
    for i in range(n):
        sc.drum('snare', beat + i * step, v0 + (v1 - v0) * i / max(1, n - 1))




# ================================================================ the pieces
# ================================================================ Dogfight's pieces
# The style: a band that never stops running. A rock kit (kick, snare on 2
# and 4, eighth-note hats), a synth bass jumping octaves in eighths, synth
# brass stabbing the chords off the beat, and trumpets and horns singing a
# big, leaping, major-key tune over it, with the flattened sixth and
# seventh chords (Bb and C in D) that make it sound heroic rather than sweet.

def kit(sc, bar, fill=False, light=False):
    b = bar * sc.beats
    for k in ((0, 1.5, 2) if not light else (0, 2)):
        sc.drum('kick', b + k, 0.85)
    for k in (1, 3):
        if not (fill and k == 3):
            sc.drum('snare', b + k, 0.36)
    for i in range(8):
        sc.drum('ohat' if i == 7 and not fill else 'hat', b + i * 0.5, 0.55 if i % 2 == 0 else 0.4)
    if fill:
        snare_roll(sc, b + 2.5, 1.5, 0.2, 0.5, step=0.25)


def octbass(sc, bar, ch, lo=26, vel=0.7, pattern=(0, 12, 0, 12, 0, 12, 0, 12)):
    bass, _, _ = chord(ch)
    r = near(bass, lo, lo + 11)
    for i, o in enumerate(pattern):
        sc.note('sbass', bar * sc.beats + i * 0.5, 0.42, r + o, vel if i % 2 == 0 else vel * 0.85)


def stabs(sc, bar, ch, beats=(0, 1.5, 2.5), lo=55, hi=67, vel=0.5, inst='sbrass'):
    _, pcs, _ = chord(ch)
    for k in beats:
        sc.hold(inst, bar * sc.beats + k, 0.4, voice(pcs, lo, hi), vel)


def canyon():
    """Red Canyon: the first level. D major, 152 bpm. Trumpets on the
    tune, horns answering, the band underneath."""
    sc = Score(152, 32, seed=51)
    intro = ['D', 'C', 'G/B', 'A']
    A = ['D', 'D', 'C', 'G', 'D', 'D', 'Bb', 'A']
    B = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'C', 'A']
    turn = ['G', 'A', 'Bb', 'A']
    prog = intro + A + B + A + turn
    for bar, ch in enumerate(prog):
        sect = 'intro' if bar < 4 else 'A' if bar < 12 else 'B' if bar < 20 else "A'" if bar < 28 else 'turn'
        kit(sc, bar, fill=bar in (3, 11, 19, 27, 31), light=sect == 'intro')
        octbass(sc, bar, ch)
        sc.note('bass', bar * 4, 4, near(chord(ch)[0], 26, 37), 0.4)
        pad(sc, 'sstr', bar, ch, 57, 72, 0.32)
        if sect in ('intro', 'turn'):
            stabs(sc, bar, ch, beats=(0, 0.75, 1.5, 3), vel=0.62)
            pad(sc, 'brass', bar, ch, 50, 64, 0.5)
        else:
            stabs(sc, bar, ch)
    melA = ['A4:0.5 D5:0.5 E5:0.5 F#5:1.5 A5:1', 'G5:0.5 F#5:0.5 E5:1 D5:1 E5:1', 'G5:1.5 E5:0.5 C5:2', 'D5:1 B4:1 G4:1 B4:1',
            'A4:0.5 D5:0.5 E5:0.5 F#5:1.5 A5:1', 'B5:0.5 A5:0.5 F#5:1 D6:2', 'D6:1 C6:1 Bb5:1 F5:1', 'A5:2 C#5:1 E5:1']
    melB = ['F#5:2 B4:2', 'D5:1.5 E5:0.5 G5:2', 'A5:3 F#5:1', 'E5:4',
            'F#5:1 G5:1 A5:1 B5:1', 'D6:2 B5:2', 'C6:1.5 B5:0.5 G5:2', 'A5:2 E5:1 C#5:1']
    for i, ln in enumerate(melA):
        sc.line('trumpet', (4 + i) * 4, ln, 0.8)
        sc.line('trumpet', (20 + i) * 4, ln, 0.84)
        sc.line('horn', (20 + i) * 4, ln, 0.6, shift=-12)
        sc.line('lead', (20 + i) * 4, ln, 0.5)
    for i, ln in enumerate(melB):
        sc.line('horn', (12 + i) * 4, ln, 0.82, shift=-12)
        sc.line('strings', (12 + i) * 4, ln, 0.42)
    # the intro's call: a fanfare on the stabs
    sc.line('trumpet', 0, 'D5:0.333 D5:0.333 D5:0.333 A5:3', 0.8)
    sc.line('trumpet', 8, 'G5:0.333 G5:0.333 G5:0.333 B5:1.5 A5:1.5', 0.8)
    for bar in (4, 12, 20, 28):
        sc.note('revcym', bar * 4, 0.1, 'C4', 0.5)
        sc.drum('crash', bar * 4, 0.85)
    for bar in (28, 29, 30, 31):
        sc.note('timp', bar * 4, 1, near(chord(prog[bar])[0], 38, 50), 0.6)
    return sc


def clearing():
    """Open Sky: free flight. E minor, more urgent, 156 bpm."""
    sc = Score(156, 32, seed=61)
    A = ['Em', 'D', 'C', 'D', 'Em', 'D', 'C', 'B']
    B = ['Am', 'C', 'G', 'B', 'Am', 'C', 'D', 'B']
    prog = ['Em', 'Em', 'C', 'D'] + A + B + A + ['C', 'D', 'C', 'B']
    for bar, ch in enumerate(prog):
        sect = 'intro' if bar < 4 else 'A' if bar < 12 else 'B' if bar < 20 else "A'" if bar < 28 else 'turn'
        kit(sc, bar, fill=bar in (3, 11, 19, 27, 31))
        octbass(sc, bar, ch, pattern=(0, 0, 12, 0, 0, 12, 0, 12))
        pad(sc, 'trem', bar, ch, 55, 70, 0.36)
        stabs(sc, bar, ch, beats=(0, 0.75, 2, 2.75) if sect in ('B', 'turn') else (0, 1.5, 2.5))
        if sect in ("A'", 'turn'):
            pad(sc, 'choir', bar, ch, 55, 67, 0.32)
        if bar % 2 == 0:
            sc.note('timp', bar * 4, 1, near(chord(ch)[0], 40, 52), 0.5)
    melA = ['E5:0.75 F#5:0.75 G5:0.5 B5:2', 'A5:1 G5:0.5 F#5:0.5 D5:2', 'E5:0.5 G5:0.5 C6:1.5 B5:0.5 G5:1', 'A5:3 F#5:1',
            'E5:0.75 F#5:0.75 G5:0.5 B5:2', 'D6:1 C6:0.5 B5:0.5 A5:2', 'G5:1 E5:1 C5:1 E5:1', 'F#5:2 D#5:2']
    melB = ['A5:2 C6:2', 'E6:3 C6:1', 'D6:1.5 B5:0.5 G5:2', 'D#5:2 F#5:2',
            'A5:2 C6:2', 'E6:2 G6:2', 'F#6:1 D6:1 A5:1 F#5:1', 'F#5:2 D#5:2']
    for i, ln in enumerate(melA):
        sc.line('trumpet', (4 + i) * 4, ln, 0.8)
        sc.line('trumpet', (20 + i) * 4, ln, 0.84)
        sc.line('lead', (4 + i) * 4, ln, 0.45, shift=-12)
        sc.line('horn', (20 + i) * 4, ln, 0.6, shift=-12)
    for i, ln in enumerate(melB):
        sc.line('horn', (12 + i) * 4, ln, 0.82, shift=-12)
        sc.line('strings', (12 + i) * 4, ln, 0.45)
        sc.line('lead', (12 + i) * 4, ln, 0.35)
    # the intro: a rising call over the drums
    sc.line('horn', 0, 'E4:1 B4:1 E5:2', 0.7)
    sc.line('horn', 8, 'G4:1 C5:1 E5:1 F#5:1', 0.7)
    for bar in (4, 12, 20, 28):
        sc.note('revcym', bar * 4, 0.1, 'C4', 0.5)
        sc.drum('crash', bar * 4, 0.85)
    return sc


def boss():
    """The Brute: a grinding E phrygian riff, choir, taiko under the kit,
    trumpets when it opens up. 162 bpm."""
    sc = Score(162, 24, seed=71)
    prog = ['Em', 'F', 'Em', 'F', 'Em', 'F', 'G', 'F#',
            'Em', 'F', 'Em', 'D', 'C', 'F', 'B', 'B',
            'Em', 'F', 'Em', 'D', 'C', 'F', 'B', 'B']
    riff = [0, 0, 1, 0, 3, 1, 0, -1]
    for bar, ch in enumerate(prog):
        bass, pcs, root = chord(ch)
        r = near(root, 28, 39)
        for i, o in enumerate(riff):
            sc.note('sbass', bar * 4 + i * 0.5, 0.4, r + o, 0.75)
            sc.note('trombone', bar * 4 + i * 0.5, 0.4, r + o + 12, 0.55)
        kit(sc, bar, fill=bar % 8 == 7)
        for k in (0, 1.5, 3):
            sc.note('taiko', bar * 4 + k, 0.5, 'C3', 0.7)
        pad(sc, 'choir', bar, ch, 52, 66, 0.42)
        pad(sc, 'trem', bar, ch, 59, 74, 0.38)
        if bar >= 8:
            stabs(sc, bar, ch, beats=(0, 0.75, 2.5), vel=0.6)
    mel = ['B4:1.5 C5:0.5 B4:1 G4:1', 'A4:1.5 B4:0.5 C5:2', 'E5:1.5 F5:0.5 E5:1 D#5:1', 'B4:4',
           'G5:1.5 F5:0.5 E5:1 C5:1', 'D5:1 C5:1 B4:1 A4:1', 'C5:1.5 B4:0.5 A4:1 F#4:1', 'D#4:2 F#4:2']
    for i, ln in enumerate(mel):
        sc.line('trumpet', (8 + i) * 4, ln, 0.82, shift=12)
        sc.line('horn', (8 + i) * 4, ln, 0.64)
        sc.line('trumpet', (16 + i) * 4, ln, 0.86, shift=12)
        sc.line('lead', (16 + i) * 4, ln, 0.45, shift=12)
    for bar in (0, 8, 16):
        sc.drum('crash', bar * 4, 0.9)
        sc.note('hit', bar * 4, 0.5, 'E4', 0.55)
    return sc


def title():
    """Dogfight's theme, for the title screen: a march in C, the band at
    a stride, a fanfare that climbs through Ab and Bb. 126 bpm."""
    sc = Score(126, 20, seed=81)
    prog = ['C', 'C', 'Ab', 'Bb', 'C', 'F', 'Ab', 'G',
            'Am', 'F', 'C', 'G', 'Am', 'F', 'Ab', 'Bb',
            'C', 'Ab', 'Bb', 'C']
    for bar, ch in enumerate(prog):
        kit(sc, bar, fill=bar in (7, 15, 19), light=bar < 4)
        octbass(sc, bar, ch, lo=28, vel=0.6, pattern=(0, 12, 7, 12, 0, 12, 7, 12))
        pad(sc, 'strings', bar, ch, 55, 72, 0.36)
        stabs(sc, bar, ch, beats=(0, 2.5), vel=0.45)
        if bar >= 16:
            pad(sc, 'brass', bar, ch, 52, 67, 0.55)
    mel = ['G4:0.333 G4:0.333 G4:0.333 C5:1 G5:2', 'F5:0.5 E5:0.5 D5:0.5 E5:0.5 C5:2', 'C5:0.333 C5:0.333 C5:0.333 Eb5:1 Ab5:2', 'G5:1 F5:1 D5:2',
           'G4:0.333 G4:0.333 G4:0.333 C5:1 G5:2', 'A5:1.5 G5:0.5 F5:1 C5:1', 'Eb5:1 F5:1 Ab5:1 C6:1', 'B5:2 G5:2',
           'E5:1.5 D5:0.5 C5:1 A4:1', 'F5:1.5 E5:0.5 D5:1 C5:1', 'E5:1 G5:1 C6:2', 'B5:2 D5:2',
           'E5:1.5 D5:0.5 C5:1 A4:1', 'A5:1.5 G5:0.5 F5:1 C5:1', 'Eb5:1 Ab5:1 C6:2', 'D6:1 C6:1 Bb5:1 D6:1',
           'E6:4', 'Eb6:2 C6:2', 'D6:1 Bb5:1 F5:1 D6:1', 'C6:4']
    for i, ln in enumerate(mel):
        sc.line('trumpet', i * 4, ln, 0.78 if i < 16 else 0.86)
        if i >= 8:
            sc.line('horn', i * 4, ln, 0.6, shift=-12)
    for bar in (0, 8, 16):
        sc.drum('crash', bar * 4, 0.8)
        sc.note('timp', bar * 4, 1, 'C3', 0.7)
    return sc


def c_victory(sc):
    # mission complete: a quick run up, then through Ab and Bb to C
    sc.line('trumpet', 0, 'G4:0.25 C5:0.25 E5:0.25 G5:0.25 C6:1 Ab5:0.75 Bb5:0.75 C6:4', 0.86)
    sc.line('horn', 2, 'Eb5:0.75 F5:0.75 E5:4', 0.66, shift=-12)
    sc.hold('brass', 0, 2, ['C4', 'E4', 'G4'], 0.6)
    sc.hold('brass', 2, 0.75, ['Ab3', 'C4', 'Eb4'], 0.62)
    sc.hold('brass', 2.75, 0.75, ['Bb3', 'D4', 'F4'], 0.64)
    sc.hold('brass', 3.5, 4, ['C4', 'E4', 'G4', 'C5'], 0.66)
    sc.hold('sstr', 3.5, 4, ['C3', 'G3', 'E4', 'C5'], 0.45)
    for b in (2, 2.75):
        sc.drum('snare', b, 0.7)
    sc.drum('kick', 3.5, 0.9); sc.drum('crash', 3.5, 0.95)
    sc.note('timp', 3.5, 1, 'C3', 0.9)
    sc.note('sbass', 3.5, 2, 'C2', 0.7)


def c_bosswarn(sc):
    # something big over the ridge: low brass and choir swelling in E phrygian
    sc.hold('choir', 0, 6, ['E4', 'G4', 'B4'], 0.5)
    sc.line('trombone', 0, 'E3:1.5 F3:1.5 E3:1 D#3:3', 0.7)
    sc.line('tuba', 0, 'E2:1.5 F2:1.5 E2:1 D#2:3', 0.65)
    sc.hold('trem', 0, 7, ['B4', 'E5', 'F5'], 0.4)
    for b in (0, 1.5, 3, 4):
        sc.note('taiko', b, 0.5, 'C3', 0.85)
    roll(sc, 'timp', 4, 3, 'B2', 0.3, 0.9)
    sc.note('hit', 7, 0.5, 'E4', 0.6)
    sc.drum('crash', 7, 0.8)


LOOPS = {'title': title, 'canyon': canyon, 'clearing': clearing, 'boss': boss}
CUES = {'victory': (132, 2, c_victory), 'bosswarn': (100, 2, c_bosswarn)}
TITLES = {'title': 'Dogfight', 'canyon': 'Red Canyon', 'clearing': 'Open Sky', 'boss': 'The Brute'}
EDGE = 0.3        # seconds of wrap-around either side of a loop


def cue(bpm, bars, fn, seed=7):
    sc = Score(bpm, bars, seed=seed)
    fn(sc)
    return sc


def main():
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'music.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {'loops': {}, 'cues': {}}
    man.setdefault('loops', {}); man.setdefault('cues', {}); man['themes'] = {}; man['loops'].pop('lobby', None)
    for key, fn in LOOPS.items():
        if want and key not in want:
            continue
        sc = fn()
        mix = master(render(sc, loop=True))
        e = int(EDGE * SR)
        body = np.concatenate([mix[-e:], mix, mix[:e]])
        encode(body, os.path.join(OUT, key + '.mp3'))
        man['loops'][key] = {'file': key + '.mp3', 'loopStart': EDGE, 'loopEnd': EDGE + len(mix) / SR, 'bpm': sc.bpm, 'title': TITLES[key]}
        print(f'{key}: {len(mix) / SR:.1f} s loop')
    for key, (bpm, bars, fn) in CUES.items():
        if want and key not in want:
            continue
        mix = master(render(cue(bpm, bars, fn), tail=2.2, loop=False), rms_target=0.12)
        encode(mix, os.path.join(OUT, key + '.mp3'))
        man['cues'][key] = {'file': key + '.mp3', 'len': round(len(mix) / SR, 2)}
        print(f'{key}: {len(mix) / SR:.1f} s')
    man['credit'] = 'Instruments: FluidR3 GM soundfont by Frank Wen (CC BY 3.0)'
    json.dump(man, open(man_path, 'w'), indent=1)


if __name__ == '__main__':
    main()
