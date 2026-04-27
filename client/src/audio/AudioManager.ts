/**
 * AudioManager — procedural WebAudio synthesiser.
 * Ported from the demo client's audio.js — full ADSR envelopes, noise bursts,
 * arpeggio music loops. Zero asset dependencies; swap play() for real files later.
 */

interface ToneOptions {
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  freqEnd?: number;
  freqCurve?: 'exp' | 'linear';
  pan?: number;
}

interface NoiseOptions {
  vol?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
  attack?: number;
  release?: number;
}

interface MusicTrackCfg {
  tempo: number;
  progression: number[];
  bassOct: number;
  leadOct: number;
  type: OscillatorType;
}

const MUSIC_TRACKS: Record<string, MusicTrackCfg> = {
  base:   { tempo: 120, progression: [220, 277, 330, 293], bassOct: -2, leadOct: 0, type: 'sine' },
  fs:     { tempo: 135, progression: [247, 311, 370, 415], bassOct: -2, leadOct: 1, type: 'triangle' },
  wheel:  { tempo: 100, progression: [196, 261, 329, 392], bassOct: -2, leadOct: 0, type: 'square' },
  bonus:  { tempo: 110, progression: [261, 330, 392, 349], bassOct: -2, leadOct: 1, type: 'triangle' },
  bigwin: { tempo: 140, progression: [330, 392, 494, 587], bassOct: -1, leadOct: 1, type: 'sawtooth' },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterMusic: GainNode | null = null;
  private masterSfx: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private musicInterval: ReturnType<typeof setInterval> | null = null;
  private currentMusicTrack: string | null = null;
  private musicVol = 0.7;
  private sfxVol   = 0.9;
  private muted    = false;

  /* ── Init / Resume ──────────────────────────────── */
  resume(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.masterMusic = this.ctx.createGain();
      this.masterMusic.gain.value = this.musicVol;
      this.masterMusic.connect(this.ctx.destination);
      this.masterSfx = this.ctx.createGain();
      this.masterSfx.gain.value = this.sfxVol;
      this.masterSfx.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusicVol(v: number): void {
    this.musicVol = v;
    if (this.masterMusic && this.ctx)
      this.masterMusic.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setSfxVol(v: number): void {
    this.sfxVol = v;
    if (this.masterSfx && this.ctx)
      this.masterSfx.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.ctx) return;
    if (this.masterMusic) this.masterMusic.gain.setTargetAtTime(m ? 0 : this.musicVol, this.ctx.currentTime, 0.05);
    if (this.masterSfx)   this.masterSfx.gain.setTargetAtTime(m ? 0 : this.sfxVol,   this.ctx.currentTime, 0.05);
  }

  /* ── Low-level primitives ───────────────────────── */
  private tone(freq: number, dur: number, opts: ToneOptions = {}): void {
    if (!this.ctx || this.muted || !this.masterSfx) return;
    const {
      type = 'sine', vol = 0.3,
      attack = 0.005, decay = 0, sustain = 1, release = 0.08,
      freqEnd, freqCurve = 'exp', pan = 0,
    } = opts;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      if (freqCurve === 'exp')
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      else
        osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.linearRampToValueAtTime(vol * sustain, t0 + attack + decay);
    g.gain.linearRampToValueAtTime(0, t0 + dur + release);

    let dest: AudioNode = this.masterSfx;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.masterSfx);
      dest = panner;
    }
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + release + 0.02);
  }

  private noise(dur: number, opts: NoiseOptions = {}): void {
    if (!this.ctx || this.muted || !this.masterSfx) return;
    const { vol = 0.2, filterFreq = 1500, filterType = 'lowpass', attack = 0.002, release = 0.05 } = opts;
    const t0 = this.ctx.currentTime;
    const bufSize = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.linearRampToValueAtTime(0, t0 + dur + release);
    src.connect(filter); filter.connect(g); g.connect(this.masterSfx);
    src.start(t0);
  }

  /* ── SFX dispatch ───────────────────────────────── */
  play(id: string, ...args: number[]): void {
    if (!this.ctx || this.muted) return;
    const fn = (this.SFX as Record<string, (...a: number[]) => void>)[id];
    if (fn) try { fn(...args); } catch { /* swallow */ }
  }

  private readonly SFX = {
    click:       () => this.tone(880, 0.04, { type: 'square', vol: 0.12, attack: 0.002 }),
    uiTick:      () => this.tone(1200, 0.03, { type: 'triangle', vol: 0.1 }),
    betChange:   () => this.tone(700, 0.05, { type: 'sine', vol: 0.15, freqEnd: 900 }),
    confirm:     () => {
      this.tone(784, 0.08, { type: 'triangle', vol: 0.18 });
      setTimeout(() => this.tone(1046, 0.12, { type: 'triangle', vol: 0.18 }), 80);
    },
    error:       () => this.tone(220, 0.18, { type: 'sawtooth', vol: 0.16, freqEnd: 110 }),
    dialogOpen:  () => this.tone(500, 0.08, { type: 'triangle', vol: 0.14, freqEnd: 800 }),
    dialogClose: () => this.tone(500, 0.08, { type: 'triangle', vol: 0.14, freqEnd: 300 }),

    reelStart:   () => {
      this.tone(220, 0.25, { type: 'sawtooth', vol: 0.12, freqEnd: 400, attack: 0.01 });
      this.noise(0.25, { vol: 0.05, filterFreq: 700 });
    },
    reelStop:    (i = 0) => {
      const base = 220 - i * 8;
      this.tone(base, 0.12, { type: 'square', vol: 0.14, freqEnd: base * 0.6 });
      this.noise(0.08, { vol: 0.06, filterFreq: 500 });
    },
    anticipation:() => this.noise(0.22, { vol: 0.04, filterFreq: 1200 }),

    smallWin:    () => {
      this.tone(880, 0.12, { type: 'triangle', vol: 0.18, freqEnd: 1320 });
      setTimeout(() => this.tone(1320, 0.1, { type: 'sine', vol: 0.12 }), 60);
    },
    niceWin:     () => {
      [660, 880, 1100, 1320].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.16, { type: 'triangle', vol: 0.2 }), i * 70));
    },
    bigWin:      () => {
      [440, 660, 880, 1100, 1320, 1760].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.2, { type: 'triangle', vol: 0.26 }), i * 80));
      setTimeout(() => this.noise(0.35, { vol: 0.1, filterFreq: 3000, filterType: 'highpass' }), 500);
    },
    megaWin:     () => {
      [440, 587, 740, 880, 1174, 1480, 1760].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.22, { type: 'sawtooth', vol: 0.22 }), i * 90));
      setTimeout(() => this.noise(0.5, { vol: 0.12, filterFreq: 4000, filterType: 'highpass' }), 700);
    },
    superWin:    () => {
      [523, 660, 784, 1046, 1318, 1568, 2093, 2637].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.28, { type: 'sawtooth', vol: 0.24 }), i * 100));
      setTimeout(() => this.noise(0.7, { vol: 0.14, filterFreq: 5000, filterType: 'highpass' }), 900);
    },

    morphOut:    () => {
      this.tone(900, 0.18, { type: 'triangle', vol: 0.12, freqEnd: 300 });
      this.noise(0.15, { vol: 0.05, filterFreq: 2500, filterType: 'bandpass' });
    },
    morphIn:     () => this.tone(400, 0.14, { type: 'triangle', vol: 0.14, freqEnd: 700 }),

    multAdvance: (step = 0) => {
      const base = 440 * Math.pow(1.26, step);
      this.tone(base, 0.12, { type: 'square', vol: 0.18, freqEnd: base * 2 });
      setTimeout(() => this.tone(base * 2, 0.08, { type: 'triangle', vol: 0.12 }), 60);
    },
    multCap:     () => {
      [1046, 1318, 1568, 2093].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.1, { type: 'square', vol: 0.18 }), i * 50));
    },

    goldenLand:  () => {
      this.tone(1568, 0.12, { type: 'triangle', vol: 0.16 });
      setTimeout(() => this.tone(2093, 0.2, { type: 'triangle', vol: 0.14 }), 80);
    },
    goldenConvert: () => {
      [660, 880, 1320, 1760, 2637].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.12, { type: 'sine', vol: 0.18 }), i * 50));
      setTimeout(() => this.noise(0.3, { vol: 0.08, filterFreq: 4000, filterType: 'highpass' }), 250);
    },

    burstImpact: () => {
      this.noise(0.2, { vol: 0.22, filterFreq: 600, filterType: 'lowpass' });
      this.tone(110, 0.15, { type: 'sawtooth', vol: 0.22, freqEnd: 40 });
    },
    burstExpand: () => this.tone(700, 0.18, { type: 'triangle', vol: 0.14, freqEnd: 1600 }),

    scatterLand: () => {
      this.tone(1568, 0.1, { type: 'triangle', vol: 0.18 });
      setTimeout(() => this.tone(1760, 0.1, { type: 'triangle', vol: 0.18 }), 60);
      setTimeout(() => this.tone(2093, 0.16, { type: 'triangle', vol: 0.20 }), 130);
    },
    scatterWin:  () => {
      [784, 1046, 1318, 1568, 2093].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.2, { type: 'sine', vol: 0.22 }), i * 80));
    },

    fsIntro:     () => {
      [523, 784, 1046, 1318, 1568].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.22, { type: 'triangle', vol: 0.22 }), i * 110));
    },
    fsEnd:       () => {
      [1568, 1318, 1046, 784, 523].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.2, { type: 'triangle', vol: 0.22 }), i * 80));
    },
    fsRetrigger: () => {
      [1046, 1568, 2093].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.14, { type: 'square', vol: 0.22 }), i * 90));
    },

    wheelSpin:   () => { /* music track handles background audio during wheel */ },
    wheelTick:   () => this.tone(1200, 0.025, { type: 'square', vol: 0.12 }),
    wheelLand:   () => {
      this.tone(440, 0.12, { type: 'square', vol: 0.2, freqEnd: 880 });
      setTimeout(() => this.tone(880, 0.2, { type: 'triangle', vol: 0.22 }), 100);
    },

    jackpot:     () => {
      [523, 659, 784, 1046, 1319, 1568, 2093].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.24, { type: 'sine', vol: 0.26 }), i * 120));
    },
  } as const;

  /* ── Music loops ────────────────────────────────── */
  playMusic(track: string): void {
    if (!this.ctx) return;
    if (this.currentMusicTrack === track && this.musicInterval) return;
    this.stopMusic();
    this.currentMusicTrack = track;
    const cfg = MUSIC_TRACKS[track];
    if (!cfg || !this.masterMusic) return;

    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    g.connect(this.masterMusic);
    this.musicGainNode = g;

    const beat    = 60 / cfg.tempo;
    const stepDur = beat / 2;
    const chord   = cfg.progression;
    let step = 0;

    const ctx = this.ctx;
    const loopFn = (): void => {
      if (!this.musicInterval) return;
      const t        = ctx.currentTime;
      const chordIdx = Math.floor(step / 8) % chord.length;
      const base     = chord[chordIdx];

      // Bass note every 4 steps
      if (step % 4 === 0) {
        const ob  = ctx.createOscillator(); ob.type = 'sine';
        ob.frequency.value = base * Math.pow(2, cfg.bassOct);
        const ogb = ctx.createGain();
        ogb.gain.setValueAtTime(0, t);
        ogb.gain.linearRampToValueAtTime(0.5, t + 0.02);
        ogb.gain.linearRampToValueAtTime(0, t + stepDur * 3.2);
        ob.connect(ogb); ogb.connect(g);
        ob.start(t); ob.stop(t + stepDur * 3.4);
      }
      // Arpeggio
      const arpPattern = [0, 2, 1, 3, 0, 3, 1, 2];
      const arpNote    = base * Math.pow(2, cfg.leadOct) * Math.pow(1.122, arpPattern[step % 8] * 2);
      const ol  = ctx.createOscillator(); ol.type = cfg.type;
      ol.frequency.value = arpNote;
      const ogl = ctx.createGain();
      ogl.gain.setValueAtTime(0, t);
      ogl.gain.linearRampToValueAtTime(0.3, t + 0.01);
      ogl.gain.linearRampToValueAtTime(0, t + stepDur * 0.9);
      ol.connect(ogl); ogl.connect(g);
      ol.start(t); ol.stop(t + stepDur);
      step++;
    };

    this.musicInterval = setInterval(loopFn, stepDur * 1000);
    loopFn();
  }

  stopMusic(): void {
    if (this.musicInterval) { clearInterval(this.musicInterval); this.musicInterval = null; }
    if (this.musicGainNode) {
      try { this.musicGainNode.disconnect(); } catch { /* ignore */ }
      this.musicGainNode = null;
    }
    this.currentMusicTrack = null;
  }
}
