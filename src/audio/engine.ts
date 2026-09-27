import { SONGS, type Song } from './songs.ts';

// Web Audio engine: three buses (sfx, music, ambience) under a master gain.
//  - SFX: Kenney CC0 samples with pitch/volume jitter so repeats don't grate,
//    plus small procedural sounds where no sample fits.
//  - Music: a tiny lookahead chiptune sequencer playing SONGS, with crossfades
//    and ducking under tense prompts.
//  - Ambience: filtered-noise crowd murmur (floor) and sea wash (map).

type Bus = 'sfx' | 'music' | 'amb';

const SAMPLES: Record<string, string[]> = {
  click: ['assets/audio/ui-click.ogg'],
  confirm: ['assets/audio/ui-confirm.ogg'],
  error: ['assets/audio/ui-error.ogg'],
  glass: ['assets/audio/glass-clink.ogg'],
  coin: ['assets/audio/coin-1.ogg', 'assets/audio/coin-2.ogg'],
  thud: ['assets/audio/thud-1.ogg'],
  punch: ['assets/audio/punch-1.ogg'],
};

const VOL_KEY = 'last-call:volume';

class Engine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private buffers = new Map<string, AudioBuffer[]>();
  private lastPlayed = new Map<string, number>();
  private noise: AudioBuffer | null = null;
  private song: Song | null = null;
  private songGain: GainNode | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private duck = 1;
  private ambFloor: GainNode | null = null;
  private ambSea: GainNode | null = null;
  vol = { master: 0.8, sfx: 0.9, music: 0.55, amb: 0.5, muted: false };

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const saved = JSON.parse(localStorage.getItem(VOL_KEY) ?? 'null') as Engine['vol'] | null;
      if (saved) this.vol = { ...this.vol, ...saved };
    } catch { /* ignore */ }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (const b of ['sfx', 'music', 'amb'] as Bus[]) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }
    this.applyVolumes();
    this.noise = this.makeNoise();
    for (const [key, urls] of Object.entries(SAMPLES)) void this.load(key, urls);
    this.startAmbience();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private async load(key: string, urls: string[]): Promise<void> {
    if (!this.ctx) return;
    const out: AudioBuffer[] = [];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        out.push(await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        /* e.g. Safari without Ogg support: the procedural fallback plays instead */
      }
    }
    if (out.length) this.buffers.set(key, out);
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : this.vol.master, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.buses.music.gain.setTargetAtTime(this.vol.music * this.duck, t, 0.2);
    this.buses.amb.gain.setTargetAtTime(this.vol.amb, t, 0.2);
    try { localStorage.setItem(VOL_KEY, JSON.stringify(this.vol)); } catch { /* ignore */ }
  }

  setDuck(on: boolean): void {
    const d = on ? 0.35 : 1;
    if (d === this.duck) return;
    this.duck = d;
    this.applyVolumes();
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- sfx

  play(kind: string): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(kind) ?? 0;
    if (now - last < 0.045) return;
    this.lastPlayed.set(kind, now);
    const map: Record<string, () => void> = {
      ui: () => this.sample('click', 0.5) || this.blip(900, 0.03, 'square', 0.08),
      seat: () => this.sample('click', 0.35, 0.8) || this.blip(500, 0.04, 'triangle', 0.1),
      confirm: () => this.sample('confirm', 0.45) || this.arp([660, 880], 0.06),
      error: () => this.sample('error', 0.4) || this.blip(180, 0.12, 'square', 0.1),
      coin: () => this.sample('coin', 0.28) || this.arp([1200, 1600], 0.04),
      tip: () => { this.sample('coin', 0.36, 1.12) || this.arp([1300, 1750, 2100], 0.04); },
      clink: () => this.sample('glass', 0.3) || this.blip(2400, 0.05, 'sine', 0.08),
      brawl: () => this.sample('punch', 0.5) || this.noiseHit(0.15, 700),
      thud: () => this.sample('thud', 0.55) || this.noiseHit(0.2, 300),
      steal: () => this.arp([700, 520, 380], 0.07, 'square', 0.09),
      caught: () => this.arp([520, 780, 1040], 0.06, 'square', 0.1),
      walkout: () => this.blip(220, 0.1, 'triangle', 0.06),
      vip: () => this.bell(1318, 0.25),
      greet: () => this.bell(1568, 0.18),
      pour: () => this.pour(),
      restock: () => this.sample('thud', 0.25, 1.4) || this.noiseHit(0.08, 900),
      bell: () => { this.bell(880, 0.5); window.setTimeout(() => this.bell(880, 0.4), 260); },
      calm: () => this.arp([440, 660], 0.06, 'triangle', 0.08),
      map: () => this.whoosh(),
      buy: () => { this.sample('coin', 0.4, 0.9) || this.arp([900, 1200], 0.05); },
      hire: () => this.arp([523, 659, 784], 0.07, 'triangle', 0.1),
      brew: () => this.bubbles(),
      // A new recipe: a rising ta-da that lands on a bell.
      discover: () => { this.arp([523, 659, 784, 1047], 0.09, 'triangle', 0.11); window.setTimeout(() => this.ctx && this.bell(1568, 0.3), 380); },
      alert: () => this.arp([880, 660], 0.09, 'square', 0.08),
      // Trouble at one of your taverns: two falling bells, then a low third.
      trouble: () => { this.bell(1175, 0.35); window.setTimeout(() => this.ctx && this.bell(880, 0.35), 200); window.setTimeout(() => this.ctx && this.bell(698, 0.3), 400); },
    };
    (map[kind] ?? map.ui!)();
  }

  private sample(key: string, gain: number, rate = 1): boolean {
    const list = this.buffers.get(key);
    if (!list || !this.ctx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)]!;
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain();
    g.gain.value = gain * (0.85 + Math.random() * 0.3);
    src.connect(g).connect(this.buses.sfx);
    src.start();
    return true;
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, bus: Bus = 'sfx'): boolean {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq * (0.97 + Math.random() * 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.buses[bus]);
    o.start(t);
    o.stop(t + dur + 0.02);
    return true;
  }

  private arp(freqs: number[], step: number, type: OscillatorType = 'square', gain = 0.07): boolean {
    freqs.forEach((f, i) => window.setTimeout(() => this.ctx && this.blip(f, step * 1.4, type, gain), i * step * 1000));
    return true;
  }

  private bell(freq: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const [mult, amp, dec] of [[1, 1, 1.4], [2.76, 0.4, 0.6], [5.4, 0.2, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * amp * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(this.buses.sfx);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
  }

  private noiseHit(dur: number, cutoff: number): boolean {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return true;
  }

  private pour(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t, Math.random() * 0.5, 0.45);
  }

  private whoosh(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t, 0, 0.4);
  }

  private bubbles(): void {
    for (let i = 0; i < 5; i++) window.setTimeout(() => this.ctx && this.blip(300 + Math.random() * 500, 0.06, 'sine', 0.08), i * 70);
  }

  // ---------------------------------------------------------------- ambience

  private startAmbience(): void {
    const ctx = this.ctx!;
    const mk = (cutoff: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = cutoff;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.buses.amb);
      src.start();
      return g;
    };
    this.ambFloor = mk(420, 0.7);
    this.ambSea = mk(260, 0.4);
  }

  setAmbience(view: 'floor' | 'world' | 'title', crowd: number): void {
    if (!this.ctx || !this.ambFloor || !this.ambSea) return;
    const t = this.ctx.currentTime;
    this.ambFloor.gain.setTargetAtTime(view === 'floor' ? 0.02 + Math.min(0.08, crowd * 0.004) : 0, t, 0.5);
    const sea = view === 'world' ? 0.06 + 0.03 * Math.sin(t * 0.4) : 0;
    this.ambSea.gain.setTargetAtTime(sea, t, 0.8);
  }

  // ---------------------------------------------------------------- music

  setSong(id: string | null): void {
    const next = id ? (SONGS[id] ?? null) : null;
    if (this.song?.id === next?.id || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.songGain) {
      const old = this.songGain;
      old.gain.setTargetAtTime(0, t, 0.25);
      window.setTimeout(() => old.disconnect(), 1500);
    }
    this.song = next;
    if (!next) {
      this.songGain = null;
      return;
    }
    this.songGain = this.ctx.createGain();
    this.songGain.gain.setValueAtTime(0, t);
    this.songGain.gain.setTargetAtTime(next.gain * 0.22, t + 0.1, 0.4);
    this.songGain.connect(this.buses.music);
    this.step = 0;
    this.nextTime = t + 0.12;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song || !this.songGain || ctx.state !== 'running') return;
    const stepDur = 60 / song.bpm / song.stepsPerBeat;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(song, this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private playStep(song: Song, i: number, t: number, stepDur: number): void {
    const voice = (line: string | undefined, wave: string, octaveGain: number) => {
      if (!line) return;
      const notes = line.split(' ');
      const n = notes[i % notes.length]!;
      if (n === '.' || n === '-') return;
      let len = 1;
      while (notes[(i + len) % notes.length] === '-' && len < 16) len++;
      this.note(freqOf(n), t, len * stepDur * 0.95, wave, octaveGain);
    };
    voice(song.lead, song.leadWave, 0.5);
    voice(song.bass, song.bassWave, 0.65);
    voice(song.harmony, song.harmonyWave ?? 'triangle', 0.3);
    const d = song.drums.split(' ');
    const hit = d[i % d.length];
    if (hit === 'k') this.drum(t, 'k');
    else if (hit === 's') this.drum(t, 's');
    else if (hit === 'h') this.drum(t, 'h');
  }

  private note(freq: number, t: number, dur: number, wave: string, gain: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    if (wave === 'pulse25' || wave === 'pulse12') o.setPeriodicWave(pulseWave(ctx, wave === 'pulse25' ? 0.25 : 0.125));
    else o.type = wave === 'bell' ? 'sine' : (wave as OscillatorType);
    o.frequency.value = freq;
    const decay = wave === 'bell' ? Math.max(dur, 1.2) : dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    if (wave === 'bell') g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    else {
      g.gain.setValueAtTime(gain * 0.8, t + Math.max(0.01, dur * 0.6));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    }
    o.connect(g).connect(this.songGain!);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private drum(t: number, kind: 'k' | 's' | 'h'): void {
    const ctx = this.ctx!;
    if (kind === 'k') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(this.songGain!);
      o.start(t);
      o.stop(t + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'h' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'h' ? 7000 : 1800;
    const g = ctx.createGain();
    const dur = kind === 'h' ? 0.03 : 0.1;
    g.gain.setValueAtTime(kind === 'h' ? 0.15 : 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.songGain!);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  stop(): void {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freqOf(n: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 440;
  const midi = (Number(m[2]) + 1) * 12 + NOTE[m[1]!]!;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const waves = new Map<number, PeriodicWave>();
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  let w = waves.get(duty);
  if (w) return w;
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  w = ctx.createPeriodicWave(real, imag);
  waves.set(duty, w);
  return w;
}

export const audio = new Engine();

/** Must be called from a user gesture (browser autoplay policy). */
export function startAudio(): void {
  audio.start();
}
