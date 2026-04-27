/**
 * Game — top-level controller (no Phaser, no local RNG).
 * Drives: API calls, Renderer, AudioManager, all HUD DOM.
 */
import { Renderer, RendererCell } from './renderer/Renderer';
import { ApiClient } from './api/ApiClient';
import { AudioManager } from './audio/AudioManager';
import { sleep, animateValue } from './utils/helpers';
import {
  BET_LEVELS, DEFAULT_BET_IDX, BUY_FS_MULT, BUY_WHEEL_MULT,
  STARTING_BALANCE, MIN_PLAYABLE_BALANCE, WIN_TIERS, PAYLINES, MAX_WIN_MULT,
  PAYTABLE, SCATTER_PAY, PAY_ORDER_DISPLAY,
  WHEEL_SEGMENTS, WHEEL_BONUS_NAMES, WHEEL_BONUS_COLORS,
  BUZZSAW_ORDER, BUZZSAW_BORDERS, JACKPOT_TIERS,
  getTiming, getWinTier, fmt,
} from './config/constants';
import type {
  SpinResponse, ChainStep, ResolvedFeature,
  MansionResult, BuzzsawResult, MegaHatResult, JackpotResult, SpinType,
} from './types/api';

type Machine = 'IDLE' | 'SPINNING' | 'EVALUATING' | 'FEATURE' | 'PAUSED';

interface SpinRecord {
  idx:     number;
  ts:      Date;
  bet:     number;
  win:     number;
  feature: string;  // '' = none, 'FS' | 'WHEEL' etc.
}

export class Game {
  /* Core */
  private renderer!: Renderer;
  private audio: AudioManager;
  private api: ApiClient;

  /* Economy */
  private balance = STARTING_BALANCE;
  private sessionStart = STARTING_BALANCE;
  private betLevelIdx = DEFAULT_BET_IDX;
  private spinCount = 0;
  private chainTotal = 0;
  private lastWin = 0;

  /* State */
  private machine: Machine = 'IDLE';
  private quickSpin = false;
  private lastMilestoneWon = 0;
  private isFsMode = false;
  private fsRemaining = 0;
  private fsRunningTotal = 0;
  private fsLockedBet = 0;

  /* Autoplay */
  private autoplayActive = false;
  private autoplayCount = 25;
  private autoplayRemaining = -1;
  private autoplayStartMs = 0; // timestamp when current autoplay session started
  private autoplayStopOnFeature = true;
  private autoplayStopOnBigWin = false;
  private autoplayStopOnBalanceBelow: number | null = null;
  private autoplayStopOnSingleWinAbove: number | null = null;

  /* RG break active state */
  private rgBreakEndTime: number | null = null;
  private rgBreakTimer: ReturnType<typeof setInterval> | null = null;

  /* Pending buy feature */
  private pendingBuyType: 'FS' | 'WHEEL' | null = null;
  private buyHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private buyHoldProgress = 0;

  /* Spin history — last 50 spins (spec §3.12) */
  private spinHistory: SpinRecord[] = [];

  /* Economy restart counter (GDD §19.1 #10) */
  private restartCount = 0;

  /* Reality-check tracking (spec §4.11) */
  private sessionStartTime  = Date.now();
  private rcIntervalMs      = 60 * 60 * 1000; // 60 min default
  private rcTimer: ReturnType<typeof setInterval> | null = null;
  private rcTotalSpent      = 0;
  private rcTotalWon        = 0;
  private rcLastTick        = Date.now();

  /* Idle timer (spec §7 OVL-IDLE-REMINDER — 5 min inactivity) */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleTimeoutMs = 5 * 60_000;

  /* Tooltip (spec §6) */
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null;

  /* Settings persistence key */
  private readonly SETTINGS_KEY = 'huff-puff-settings';

  /* Pending bet-high confirmation */
  private pendingBetLevelIdx: number | null = null;

  /* RG limits */
  private sessionTimeLimitMs: number | null = null;   // null = no limit
  private sessionLossLimit: number | null = null;
  private sessionWinLimit: number | null = null;

  /* Accessibility & UX extras */
  private dwellTimer: ReturnType<typeof setTimeout> | null = null;
  private isDemoMode = false;

  /* Settings dirty flag (spec MOD-SETTINGS-UNSAVED) */
  private settingsDirty = false;

  /* Runtime flags for settings controls (spec §3.13) */
  private skipStopEnabled   = true;   // set-skipstop
  private spacebarSpin      = true;   // set-spacebar
  private showSessionNet    = true;   // set-show-net
  private autobetLock       = true;   // set-autobet-lock
  private voiceAnnouncer    = false;  // set-voice-ann
  private audioCuesEnabled  = false;  // set-audio-cues
  private srVerbose         = false;  // set-sr-verbose

  /* Quick-stop state (resolved by quickStopAll to break the reel-spin sleep) */
  private quickStopTriggered = false;
  private quickStopResolve: (() => void) | null = null;

  /* FS skip-animations flag (spec §3.3 fs-skip) */
  private fsSkipAnims = false;

  /* Grid state */
  private grid: RendererCell[][] = Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => ({ sym: 'S01', golden: false })),
  );

  constructor(api: ApiClient) {
    this.api = api;
    this.audio = new AudioManager();
  }

  /* ══════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════ */
  async run(): Promise<void> {
    // WebGL 2.0 check (spec §3.17 SCR-UNSUPPORTED)
    const canvas2 = document.createElement('canvas');
    const gl2 = canvas2.getContext('webgl2');
    if (!gl2) {
      const scrUnsupported = document.getElementById('unsupported-screen');
      const uaEl = document.getElementById('unsupported-browser-info');
      if (scrUnsupported) scrUnsupported.classList.remove('hidden');
      if (uaEl) uaEl.textContent = `Your browser: ${navigator.userAgent.split(') ')[0] + ')'}`;
      return;
    }

    this.setSplashStatus('Connecting to server…');
    this.setSplashProgress(20);

    let initData;
    try {
      initData = await this.api.init(this.betLevelIdx);
    } catch (err) {
      this.setSplashStatus('Connection failed — retrying…');
      await sleep(1500);
      try { initData = await this.api.init(this.betLevelIdx); }
      catch { this.setSplashStatus('Server offline. Please refresh.'); return; }
    }

    this.balance     = initData.balance;
    this.betLevelIdx = initData.betLevelIdx ?? this.betLevelIdx;
    this.sessionStart = this.balance;

    this.setSplashStatus('Loading assets…');
    this.setSplashProgress(70);
    await sleep(300);

    this.setSplashProgress(100);
    this.setSplashStatus('Ready!');
    await sleep(200);

    this.wireEvents();
    this.updateHUD();
    this.loadSettings();

    // Age gate — must be verified before seeing the game (spec §4)
    // Runs while splash is still visible; modal has z-index above splash
    await this.maybeShowAgeGate();

    // Orientation rotate hint (spec §6.4) — show once on mobile portrait first load
    if (window.innerWidth < 600 && window.innerHeight > window.innerWidth) {
      const hintShown = localStorage.getItem('huff-puff-rotate-hint');
      if (!hintShown) {
        this.el('rotate-hint')?.classList.remove('hidden');
        localStorage.setItem('huff-puff-rotate-hint', '1');
        this.el('rotate-hint-dismiss')?.addEventListener('click', () => {
          this.el('rotate-hint')?.classList.add('hidden');
        }, { once: true });
      }
    }

    // Show tap-to-play — must happen while splash is visible (before #app shown)
    const ttp = document.getElementById('tap-to-play');
    if (ttp) {
      ttp.classList.remove('hidden');
      await new Promise<void>(res => ttp.addEventListener('click', () => res(), { once: true }));
    }
    // Resume AudioContext on first user gesture (browsers require this)
    this.audio.resume();
    this.audio.playMusic('base');

    // Make app visible BEFORE creating renderer so the canvas element is in the layout
    const splash = document.getElementById('splash');
    const app    = document.getElementById('app');
    if (splash) splash.classList.add('hidden');
    if (app)    app.classList.remove('hidden');

    // Canvas is now in the DOM and visible — safe to create Renderer
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas) { console.error('game-canvas element not found'); return; }
    this.renderer = new Renderer(canvas);
    this.renderer.setGrid(this.grid);

    // Wire canvas tap-hold tooltips for symbols (spec §6 TIP-SCATTER/WILD/etc.)
    this.wireCanvasSymbolTooltips(canvas);

    // Demo mode (spec §3.15) — show watermark if ?demo in URL
    this.isDemoMode = new URLSearchParams(location.search).has('demo');
    if (this.isDemoMode) this.el('demo-watermark')?.classList.remove('hidden');

    // Tutorial — first-time only (spec §1.3); flag persisted in localStorage
    // Must run after #app is visible so the overlay can be interacted with
    const tutSeen = localStorage.getItem('huff-puff-tutorial-seen') === 'true';
    if (!tutSeen) await this.showTutorial();

    // Session-time chip ticker — update every 30s (spec §J.3)
    setInterval(() => {
      const min = Math.floor((Date.now() - this.sessionStartTime) / 60_000);
      const h = Math.floor(min / 60);
      const m = min % 60;
      const valEl = this.el('session-time-val');
      if (valEl) valEl.textContent = h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}:00`;
      this.el('session-time-chip')?.classList.toggle('warn', min >= 30);
    }, 30_000);

    // Start idle timer
    this.resetIdleTimer();

    // Reset idle timer on any user interaction
    ['pointerdown','keydown','touchstart'].forEach(evt => {
      document.addEventListener(evt, () => this.resetIdleTimer(), { passive: true });
    });

    // Session heartbeat every 10s (spec §10.5) — also measures RTT for network-quality check.
    // Uses GET /wallet (read-only) — must NOT call session/init which would create a new session.
    setInterval(() => {
      if (this.api.isReady()) {
        const t0 = Date.now();
        this.api.getBalance().then(d => {
          const rtt = Date.now() - t0;
          // Sync balance silently in case of external adjustment
          if (!this.isFsMode && this.machine === 'IDLE') {
            this.balance = d.balance;
            this.setBalanceEl(this.balance);
          }
          if (rtt > 500) this.showNetworkQualityModal();
        }).catch(() => {});
      }
    }, 10_000);

    // DevTools detection (spec MOD-DEVTOOLS-DETECTED — production only)
    if ((import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD) {
      const threshold = 160;
      setInterval(() => {
        if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
          this.el('devtools-modal')?.classList.remove('hidden');
          this.el('dt-exit')?.addEventListener('click', () => { window.location.href = '/'; }, { once: true });
        }
      }, 2000);
    }

    // Wire tooltips (spec §6 TIP-* inventory)
    this.wireTooltip('btn-spin',        'Spin the reels (Space / Enter)');
    this.wireTooltip('btn-quick',       'Turbo Spin — skip reel animations (T)');
    this.wireTooltip('btn-auto',        'Autoplay — spin automatically (A)');
    this.wireTooltip('btn-open-buy',    'Buy Feature — purchase Free Spins or Wheel entry (B)');
    this.wireTooltip('btn-sound',       'Toggle sound on/off (M)');
    this.wireTooltip('btn-fullscreen',  'Enter/exit fullscreen (F)');
    this.wireTooltip('btn-paytable',    'View symbol pays & game rules (P)');
    this.wireTooltip('btn-info',        'Game information & rules (I)');
    this.wireTooltip('btn-history',     'Recent spin history (H)');
    this.wireTooltip('btn-settings',    'Settings — audio, gameplay, accessibility, limits');
    this.wireTooltip('bet-display',     'Current bet per spin — use ▲▼ to change');
    // TIP-QUICKSPIN: tooltip on the quickspin checkbox label (spec §6 TIP-QUICKSPIN)
    this.wireTooltip('set-quickspin',   'Quickspin — cuts win animations for fastest play');
    // TIP-BET-LOCKED: show locked message during FS
    ['btn-bet-minus','btn-bet-plus'].forEach(id => {
      const el = this.el(id);
      if (!el) return;
      el.addEventListener('mouseenter', () => {
        const text = this.isFsMode
          ? `Bet locked during feature. Trigger bet: ${this.el('bet-value')?.textContent ?? '—'}`
          : 'Change bet';
        this.tooltipTimer = setTimeout(() => this.showTooltipFor(text, el), 600);
      });
      el.addEventListener('mouseleave', () => this.hideTooltipEl());
    });
    this.wireTooltip('btn-bet-max',     'Set maximum bet level');
    this.wireTooltip('session-time-chip','Session duration — tap to view reality check');
    this.wireTooltip('mult-ladder',     'Win multiplier — advances with each cascade step');
    this.wireTooltip('btn-home',        'Return to lobby. Active session progress is saved.');
    this.wireTooltip('session-net',     'Your session profit/loss so far this session.');
    this.startRealityCheckTimer();

    // GDD §19.1 #1 — session_start
    this.track('session_start', {
      startingBalance: this.balance,
      platform: navigator.platform || 'web',
      appVersion: '1.0.0',
      screenResolution: `${screen.width}x${screen.height}`,
    });

    // GDD §19.1 #2 — session_end (keepalive fetch survives page unload)
    window.addEventListener('beforeunload', () => {
      const sessionDuration = Date.now() - this.sessionStartTime;
      const sessionRTP = this.rcTotalSpent > 0
        ? Math.round((this.rcTotalWon / this.rcTotalSpent) * 10000) / 10000
        : 0;
      this.api.sendBeaconAnalytics([{
        event: 'session_end',
        ts: Date.now(),
        session_spin_count: this.spinCount,
        bet_level: this.betLevelIdx,
        balance: this.balance,
        sessionDuration,
        totalSpins: this.spinCount,
        totalWagered: this.rcTotalSpent,
        totalWon: this.rcTotalWon,
        sessionRTP,
        endReason: 'unload',
      }]);
    });
  }

  /* ══════════════════════════════════════════════════════
     SPIN FLOW
  ══════════════════════════════════════════════════════ */
  private async doSpin(spinType: SpinType = 'manual'): Promise<void> {
    if (this.machine !== 'IDLE') return;
    // RG limits check before every base spin (spec §J.4)
    if (!this.isFsMode && !this.checkRgLimits()) return;
    const betLevel = BET_LEVELS[this.betLevelIdx];
    const cost     = this.isFsMode ? 0 : betLevel.total;

    if (!this.isFsMode) {
      if (this.balance < MIN_PLAYABLE_BALANCE) { this.showRestartModal(); return; }
      // Auto-reduce bet to highest affordable level (GDD §14.2)
      if (this.balance < cost) {
        let reduced = this.betLevelIdx;
        while (reduced > 0 && this.balance < BET_LEVELS[reduced].total) reduced--;
        if (this.balance < BET_LEVELS[0].total) { this.showRestartModal(); return; }
        this.betLevelIdx = reduced;
        this.setBetEl();
        this.toastBetCapped(BET_LEVELS[this.betLevelIdx].total);
      }
    }

    // ── BUY FEATURE FAST-PATH (GDD §13.1) ──────────────────────────
    // Buy spins go straight to the feature — no reel spin, no chain replay.
    // The /spin/buy response has grid:[], chain:[] so attempting reel animation
    // would crash accessing response.grid[r][i].sym.
    if (spinType === 'buy_fs' || spinType === 'buy_wheel') {
      this.machine = 'SPINNING';
      this.setControlsEnabled(false, false);
      this.setLastWinEl(0);
      let buyResponse: SpinResponse;
      try {
        buyResponse = await this.api.buySpin(spinType === 'buy_fs' ? 'FS' : 'WHEEL', this.betLevelIdx);
      } catch (err) {
        this.machine = 'IDLE';
        this.setControlsEnabled(true);
        this.setSpinLabel('SPIN');
        const status = (err as { status?: number }).status;
        if (status === 503) this.showMaintenanceModal();
        else if (status === 429) this.toastRateLimit();
        else if (status === 401 || status === 403) this.el('session-expired-overlay')?.classList.remove('hidden');
        else this.showServerErrorModal(status ? `HTTP ${status}` : '');
        return;
      }
      this.balance = buyResponse.balanceAfter;
      this.setBalanceEl(this.balance);
      this.spinCount++;
      // FS buy sets up a free-spins session
      if (buyResponse.freeSpinsState) {
        this.fsRemaining    = buyResponse.freeSpinsState.remaining;
        this.fsRunningTotal = buyResponse.freeSpinsState.runningTotal;
      }
      this.machine = 'IDLE';
      await this.processFeatures(buyResponse, 'buy');
      this.lastWin = buyResponse.totalWin;
      this.updateHUD();
      this.setControlsEnabled(true);
      this.setSpinLabel('SPIN');
      return;
    }
    // ── END BUY FAST-PATH ────────────────────────────────────────────

    this.machine = 'SPINNING';
    this.vibrate(20);
    // DS AE03 — spin
    this.track('spin', {
      spinNumber: this.spinCount + 1,
      gameMode:  this.isFsMode ? 'free_spin' : 'base',
      betLevel:  this.betLevelIdx,
      totalBet:  betLevel.total,
      spinType,
    });
    this.setControlsEnabled(false, true); // spin btn stays live for quick-stop
    this.setSpinLabel('STOP');
    this.renderer.clearWinHighlight();
    this.renderer.setAnticipation([]);
    this.setLastWinEl(0); // clear previous win display

    const timing  = getTiming(this.quickSpin);
    const stagger = timing.reelStagger;
    const spinDur = timing.reelSpinDur;

    // Start all reel spins
    for (let i = 0; i < 5; i++) this.renderer.startReelSpin(i);
    this.audio.play('reelStart');

    // Breakable sleep — quickStopAll() resolves this early via quickStopResolve
    this.quickStopTriggered = false;
    const spinWait = new Promise<void>(res => {
      this.quickStopResolve = res;
      sleep(spinDur + 4 * stagger).then(res);
    });

    // Concurrent: API + wait for all reels to reach max-speed (or quick-stop)
    const apiCall = this.api.spin(this.betLevelIdx, spinType);

    let response: SpinResponse;
    try {
      [response] = await Promise.all([
        apiCall,
        spinWait,
      ]) as [SpinResponse, void];
    } catch (err) {
      this.quickStopResolve = null;
      for (let i = 0; i < 5; i++) this.renderer.stopReel(i);
      this.machine = 'IDLE';
      this.setControlsEnabled(true);
      this.setSpinLabel('SPIN');
      // Show appropriate error modal based on HTTP status
      const status = (err as { status?: number }).status;
      if (status === 503) {
        this.showMaintenanceModal();
      } else if (status === 429) {
        this.toastRateLimit();
      } else if (status === 401 || status === 403) {
        this.el('session-expired-overlay')?.classList.remove('hidden');
      } else if (!status) {
        // No HTTP status = network drop (ERR-NETWORK-001) → OVL-RECONNECT with 60s timeout
        if (!this.isFsMode) this.showReconnectOverlay('Connection lost. Attempting to reconnect…');
        this.track('error', { errorType: 'server', errorCode: 'ERR-NETWORK-001' });
      } else if (!this.isFsMode) {
        this.showServerErrorModal(status ? `HTTP ${status}` : '');
        this.track('error', { errorType: 'server', errorCode: `ERR-SERVER-${status}` });
      }
      // Re-throw so runFreeSpins can break out of its loop on failure
      throw err;
    }
    this.quickStopResolve = null;

    // Stop reels one-by-one with server grid symbols (skip stagger delays if quick-stopped)
    const stopStart = performance.now();
    const fsTriggered = response.features.some(f => f.type === 'FS_TRIGGER');
    for (let i = 0; i < 5; i++) {
      if (!this.quickStopTriggered) {
        const elapsed = performance.now() - stopStart;
        await sleep(Math.max(0, i * stagger - elapsed));
      }
      // Update grid column immediately so renderer shows correct symbols when reel stops
      for (let r = 0; r < 3; r++) {
        this.grid[r][i] = { sym: response.grid[r][i].sym, golden: response.grid[r][i].golden };
      }
      this.renderer.setGrid(this.grid);
      this.renderer.stopReel(i);
      this.audio.play('reelStop', i);

      // Scatter anticipation: count scatters landed so far; glow remaining reels (spec §5.4)
      if (!this.quickStopTriggered && fsTriggered && i < 4) {
        let scattersSoFar = 0;
        for (let c = 0; c <= i; c++) {
          for (let r = 0; r < 3; r++) {
            if (response.grid[r][c].sym === 'S01') scattersSoFar++;
          }
        }
        if (scattersSoFar >= 1) {
          const remaining = Array.from({ length: 4 - i }, (_, k) => i + 1 + k);
          this.renderer.setAnticipation(remaining);
        }
      }
    }
    // Clear anticipation glows once all reels are stopped
    this.renderer.setAnticipation([]);

    // Wait for last reel's deceleration to complete (DECEL_DUR=420ms) + visual settle
    // Skip on quick-stop — a short settle is enough
    await sleep(this.quickStopTriggered ? 80 : timing.reelStagger + 460);

    // Disable spin button during evaluation phase
    this.setControlsEnabled(false, false);

    // Update balance from server
    this.balance = response.balanceAfter;
    this.setBalanceEl(this.balance);
    this.spinCount++;

    // Update FS state if active
    if (response.freeSpinsState) {
      this.fsRemaining    = response.freeSpinsState.remaining;
      // Use server's running total directly — backend accumulates per spin but only
      // credits via totalWin on the LAST FS spin, so response.totalWin is 0 for spins 1-9.
      this.fsRunningTotal = response.freeSpinsState.runningTotal;
      this.updateFsBanner();
    } else if (this.isFsMode) {
      // Last FS spin: server sets freeSpinsState=null when session completes.
      // response.totalWin here is the full session payout credited to balance.
      this.fsRemaining    = 0;           // CRITICAL: causes runFreeSpins while-loop to exit
      this.fsRunningTotal += response.totalWin;
      this.updateFsBanner();
    }

    this.machine = 'EVALUATING';
    await this.replayChain(response);

    // Show a brief toast on 0-win spins so players know the result — avoids confusion
    // where balance visibly drops with no feedback (spec §7 UX clarity).
    if (response.totalWin === 0 && !this.isFsMode) {
      this.showToast('No win — try again!', 1200);
    }

    this.srAnnounce(response.totalWin > 0 ? `Win: ${fmt(response.totalWin)} coins` : 'No win');

    // Voice announcer (spec §7.4) — speak win amount via SpeechSynthesis
    if (this.voiceAnnouncer && response.totalWin > 0 && 'speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(`You won ${fmt(response.totalWin)} coins`);
      utt.rate = 1.1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utt);
    }

    // Audio-only win cues (spec §7.6) — audible beep for screen-reader / audio-cue users
    if (this.audioCuesEnabled && response.totalWin > 0) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      } catch { /* AudioContext not available */ }
    }

    // Reset machine to IDLE *before* processFeatures so recursive FS spins can proceed
    this.machine = 'IDLE';

    // Scatter near-miss toast (spec TST-SCATTER-NEAR) — exactly 2 scatters, no FS triggered
    if (!this.isFsMode && response.features.length === 0 && response.scatterWin === 0) {
      const scatterCells = this.grid.flat().filter(c => c.sym === 'S01').length;
      if (scatterCells === 2) this.toastScatterNear();
    }

    await this.processFeatures(response);

    // Don't overwrite lastWin if a FS session just ran — runFreeSpins set it to the FS total.
    if (!response.features.some(f => f.type === 'FS_TRIGGER')) {
      this.lastWin = response.totalWin;
    }
    this.updateHUD();

    // Record in spin history (spec §3.12 — last 50 spins)
    const featureTag = response.features.length > 0
      ? response.features.map(f => f.type === 'FS_TRIGGER' ? 'FS' : f.type === 'WHEEL' ? 'WHEEL' : f.type).join(',')
      : (this.isFsMode ? 'FS' : '');
    const spinBet = BET_LEVELS[this.betLevelIdx].total;
    this.spinHistory.unshift({
      idx:     this.spinCount,
      ts:      new Date(),
      bet:     spinBet,
      win:     this.lastWin,
      feature: featureTag,
    });
    if (this.spinHistory.length > 50) this.spinHistory.length = 50;
    // Track cumulative for reality check
    if (!this.isFsMode) this.rcTotalSpent += spinBet;
    this.rcTotalWon += this.lastWin;
    this.checkCoinMilestone();

    // Re-enable only if not in FS mode (runFreeSpins re-enables when FS round ends)
    if (!this.isFsMode) {
      this.setControlsEnabled(true);
      this.setSpinLabel('SPIN');
      if (this.autoplayActive) this.tickAutoplay();
    }
    // GDD §19.1 #4 — spin_result with full chain metadata
    const spinBetTotal    = BET_LEVELS[this.betLevelIdx].total;
    const spinWinMultiple = spinBetTotal > 0 ? response.totalWin / spinBetTotal : 0;
    const paylinesWon     = response.chain.reduce((n, s) => n + s.lineWins.length, 0);
    const scatters        = response.chain.reduce((acc, s) => Math.max(acc, s.scatterCount), 0);
    const goldens         = response.chain.reduce((n, s) => n + s.goldenConversions.length, 0);
    const bursts          = response.chain.reduce((n, s) => n + s.bursts.length, 0);
    this.track('spin_result', {
      bet:           spinBetTotal,
      totalWin:      response.totalWin,
      winMultiple:   Math.round(spinWinMultiple * 100) / 100,
      winTier:       getWinTier(spinWinMultiple).id,
      chainLength:   response.chainLength,
      maxMultiplier: response.maxMultiplier,
      paylinesWon,
      scatters,
      goldens,
      bursts,
      spinCount:     this.spinCount,
      spinMode:      this.isFsMode ? 'free_spin' : 'base',
    });
  }

  /* ══════════════════════════════════════════════════════
     CHAIN REPLAY
  ══════════════════════════════════════════════════════ */
  private async replayChain(response: SpinResponse): Promise<void> {
    const timing   = getTiming(this.quickSpin);
    const hlDur    = timing.winHighlightDur;
    const morphDur = timing.morphStepDur;
    const betTotal = BET_LEVELS[this.betLevelIdx].total;

    let runningTotal = 0;

    for (const step of response.chain) {
      if (step.stepWin === 0 && step.scatterWin === 0) continue;

      const stepGain = step.stepWin + step.scatterWin;
      runningTotal += stepGain;

      // Highlight winning cells
      const winSet = new Set(step.winCells.map(c => `${c.row},${c.reel}`));
      this.renderer.setWinCells(winSet);

      if (step.lineWins.length > 0) {
        // Build counts map: line number → how many reels matched (3/4/5)
        const lineCounts: Record<number, number> = {};
        for (const lw of step.lineWins) lineCounts[lw.line] = lw.count;
        this.renderer.setWinLines(step.lineWins.map(lw => lw.line), hlDur, lineCounts);
      }

      // ALWAYS show multiplier badge during chain (even ×1 at step 0)
      this.showMultiplier(step.multiplier);
      // Toast when multiplier advances beyond ×1
      if (step.multiplier > 1) this.toastMultAdv(step.multiplier);

      // Particles on each winning cell + floating +amount text
      for (const wc of step.winCells) {
        this.renderer.spawnWinParticles(wc.row, wc.reel);
      }

      // Fly-up win amount per win line
      for (const lw of step.lineWins) {
        const pos = lw.positions[Math.floor(lw.positions.length / 2)];
        if (pos) this.renderer.flyWin(pos.row, pos.reel, lw.pay);
      }
      if (step.scatterWin > 0 && step.scatterPositions.length > 0) {
        this.audio.play('scatterWin');
        const sp = step.scatterPositions[0];
        this.renderer.flyWin(sp.row, sp.reel, step.scatterWin);
      }

      // Animate last-win counter + flash it
      const winEl = this.el('last-win');
      winEl?.classList.add('win-flash');
      animateValue(
        runningTotal - stepGain,
        runningTotal,
        Math.min(hlDur * 0.8, 600),
        v => this.setLastWinEl(v),
      );
      setTimeout(() => winEl?.classList.remove('win-flash'), hlDur);

      // Burst wilds
      for (const burst of step.bursts) {
        this.renderer.flashBurst(burst.origin.row, burst.origin.reel);
        this.renderer.spawnBurstParticles(burst.origin.row, burst.origin.reel);
        for (const t of burst.targets) this.renderer.spawnBurstParticles(t.row, t.reel, 6);
        this.audio.play('burstImpact');
        this.audio.play('burstExpand');
      }

      // Golden conversions (SFX13/14)
      if (step.goldenConversions.length > 0) this.audio.play('goldenConvert');

      // Scatter present this step (SFX17 scatter land — first scatter per step)
      if (step.scatterCount > 0) this.audio.play('scatterLand');

      // Play win sound appropriate to current win multiple (DS SFX04-08)
      {
        const stepMult = betTotal > 0 ? runningTotal / betTotal : 0;
        const stepTier = getWinTier(stepMult);
        this.audio.play(
          stepTier.id === 'super' ? 'superWin'
          : stepTier.id === 'mega' ? 'megaWin'
          : stepTier.id === 'big'  ? 'bigWin'
          : stepTier.id === 'nice' ? 'niceWin'
          : 'smallWin'
        );
      }
      await sleep(hlDur);

      // Morph out → apply server morph → morph in
      if (step.morphedCells.length > 0) {
        this.audio.play('morphOut');
        for (const wc of step.winCells) this.renderer.flashMorph(wc.row, wc.reel);
        await sleep(morphDur * 0.4);

        for (const mc of step.morphedCells) {
          this.grid[mc.row][mc.reel] = { sym: mc.sym, golden: mc.golden };
        }
        this.renderer.setGrid(this.grid);
        this.renderer.clearWinHighlight();
        this.audio.play('morphIn');
        await sleep(morphDur * 0.4);
      } else {
        this.renderer.clearWinHighlight();
      }
    }

    // Big-win celebration + named toast
    if (runningTotal > 0) {
      const mult = runningTotal / betTotal;
      if (mult >= 15) this.vibrate([60, 30, 60]);
      else this.vibrate(30);
      const tier = getWinTier(mult);
      if (mult >= MAX_WIN_MULT) {
        // OVL-MAXWIN cap reached — locked modal, cannot skip (DS §15.5)
        await this.showMaxWinModal(runningTotal);
        this.track('big_win', { winTier: 'maxwin', winAmount: runningTotal, winMultiple: Math.round(mult * 100) / 100, source: this.isFsMode ? 'free_spin' : 'base', celebrationSkipped: false });
      } else if (tier.id !== 'standard' && tier.id !== 'nice') {
        // Fire big-win toast only for the 'big' tier (15–29.99×)
        if (tier.id === 'big') this.toastBigWin();
        // During autospin: cap to 1200ms so the flow continues smoothly
        const celebDur = this.autoplayActive ? 1200 : tier.dur;
        await this.showCelebration(tier.label, runningTotal, celebDur);
        // DS §19 AE09 — big_win
        this.track('big_win', {
          winTier:            tier.id,
          winAmount:          runningTotal,
          winMultiple:        Math.round(mult * 100) / 100,
          source:             this.isFsMode ? 'free_spin' : 'base',
          celebrationSkipped: this.autoplayActive,
        });
      }
      // Autoplay: stop on big win if user opted in
      if (this.autoplayActive && this.autoplayStopOnBigWin && tier.id !== 'standard' && tier.id !== 'nice') {
        this.stopAutoplay('big win');
      }
      // Autoplay: stop if single win exceeds threshold
      if (this.autoplayActive && this.autoplayStopOnSingleWinAbove !== null && runningTotal >= this.autoplayStopOnSingleWinAbove) {
        this.stopAutoplay('single win above threshold');
      }
    }

    this.hideMultiplier();
  }

  /* ══════════════════════════════════════════════════════
     FEATURE HANDLING
  ══════════════════════════════════════════════════════ */
  private async processFeatures(response: SpinResponse, triggerSource: 'natural' | 'scatter' | 'buy' = 'natural'): Promise<void> {
    for (const feat of response.features) {
      if (this.autoplayActive && this.autoplayStopOnFeature) this.stopAutoplay('feature triggered');

      if (feat.type === 'FS_TRIGGER') {
        // Guard against server bug: FS_TRIGGER should never appear during an active FS session
        if (this.isFsMode) continue;
        const spinsAwarded = response.freeSpinsState?.remaining ?? 10;
        const fsSrc = triggerSource === 'buy' ? 'buy' : 'scatter';
        this.toastFsTriggered(spinsAwarded);
        this.machine = 'FEATURE';
        this.vibrate([80, 50, 120]);
        // DS AE05 — feature_trigger
        this.track('feature_trigger', { featureType: 'FS', triggerSource: fsSrc, scatterCount: feat.scatterCount, buyCost: triggerSource === 'buy' ? BET_LEVELS[this.betLevelIdx].total * BUY_FS_MULT : 0 });
        await this.showFsIntroOverlay(spinsAwarded);
        this.isFsMode       = true;
        this.fsRemaining    = response.freeSpinsState?.remaining ?? 10;
        this.fsRunningTotal = 0;
        this.fsLockedBet    = BET_LEVELS[this.betLevelIdx].total;
        this.showFsBanner();
        // Must be IDLE so runFreeSpins → doSpin('free_spin') passes the machine guard
        this.machine = 'IDLE';
        await this.runFreeSpins();
      } else if (feat.type === 'FS_RETRIGGER') {
        this.machine = 'FEATURE';
        this.toastFsRetrigger(feat.spinsAdded);
        this.showFsRetriggerIndicator(); // spec §3.3 fs-retrigger-ind
        await this.showFeatureOverlay('RETRIGGER!', `+${feat.spinsAdded} free spins!`);
        this.fsRemaining = response.freeSpinsState?.remaining ?? 0;
        this.updateFsBanner();
        // Restore IDLE so the runFreeSpins while-loop can call doSpin again
        this.machine = 'IDLE';
      } else if (feat.type === 'WHEEL') {
        this.machine = 'FEATURE';
        this.toastWheelTriggered();
        this.vibrate([80, 50, 120]);
        // DS AE05 — feature_trigger
        this.track('feature_trigger', { featureType: 'WHEEL', triggerSource, scatterCount: 0, buyCost: triggerSource === 'buy' ? BET_LEVELS[this.betLevelIdx].total * BUY_WHEEL_MULT : 0 });
        await this.showWheelIntroOverlay();
        await this.showWheelFeature(feat.wheelResult);
        this.machine = 'IDLE';
      }
    }
  }

  private async runFreeSpins(): Promise<void> {
    // Lock all controls for the duration of the FS round
    this.setControlsEnabled(false, false);
    this.setSpinLabel('FREE SPIN');
    this.fsSkipAnims = false;
    const prefsQuickSpin = this.quickSpin; // remember pre-FS quickSpin state

    // Server drives fsRemaining — no pre-decrement here.
    // Each doSpin call updates this.fsRemaining from response.freeSpinsState.
    try {
      while (this.isFsMode && this.fsRemaining > 0) {
        await this.doSpin('free_spin');
        await sleep(150);
      }
    } catch {
      // Network/server error mid-FS — abort the round cleanly
      this.isFsMode = false;
      this.fsRemaining = 0;
      this.fsSkipAnims = false;
      this.quickSpin = prefsQuickSpin;
      this.el('btn-quick')?.classList.toggle('active', this.quickSpin);
      this.hideFsBanner();
      this.setControlsEnabled(true);
      this.setSpinLabel('SPIN');
      this.showToast('Connection lost — free spins interrupted. Please retry.', 2500, true);
      return;
    }

    this.isFsMode = false;
    this.fsSkipAnims = false;
    this.quickSpin = prefsQuickSpin; // restore pre-FS turbo state
    this.el('btn-quick')?.classList.toggle('active', this.quickSpin);
    this.hideFsBanner();
    const total = this.fsRunningTotal;
    this.fsRunningTotal = 0;
    // Publish FS total as lastWin so HUD stays correct after base-game doSpin resumes
    this.lastWin = total;
    this.setLastWinEl(total);
    this.track('free_spins_complete', { totalWin: total });
    this.audio.play('fsEnd'); // SFX21
    this.audio.stopMusic();
    await this.showFsOutroOverlay(total);
    await this.showFeatureComplete(total, 'FREE SPINS COMPLETE');

    // Re-enable controls now that FS is over.
    // NOTE: do NOT call tickAutoplay() here — the base-game doSpin that triggered FS
    // will call it exactly once after processFeatures() returns.
    this.setControlsEnabled(true);
    this.setSpinLabel('SPIN');
    this.audio.playMusic('base');
  }

  /* ══════════════════════════════════════════════════════
     WHEEL FEATURE  (GDD §12.3 + §12.8 state flow)
     WF_INTRO → WF_SPIN → WF_REVEAL → WF_BONUS_DISPATCH → WF_PAYOUT → WF_EXIT
  ══════════════════════════════════════════════════════ */
  private async showWheelFeature(result: import('./types/api').WheelResult): Promise<void> {
    const overlay  = this.el('wheel-overlay');
    const resultEl = this.el('wheel-result');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (resultEl) resultEl.textContent = '';

    this.audio.play('wheelSpin');
    this.audio.playMusic('wheel');

    // GDD §12.3: animate with phases — returns a Promise that resolves when landing is done
    const wCanvas = document.getElementById('wheel-canvas') as HTMLCanvasElement | null;
    const totalDur = wCanvas ? await this.animateWheelCanvas(wCanvas, result) : 5500;

    this.audio.stopMusic();

    const bonusName = WHEEL_BONUS_NAMES[result.bonusType] ?? result.bonusType;
    if (resultEl) resultEl.textContent = '🎉 ' + bonusName + '!';
    this.audio.play('wheelLand');
    await sleep(1200);

    overlay.classList.add('hidden');
    await this.showBonusResult(result);
    this.audio.playMusic('base');
    void totalDur; // suppress unused warning
  }

  /** GDD §12.3 — 4 phases: buildup(500ms) + accel(800ms) + full(1500ms) + decel+bounce(2200ms)
   *  Returns total duration so caller can await. */
  private animateWheelCanvas(wCanvas: HTMLCanvasElement, result: import('./types/api').WheelResult): Promise<number> {
    const ctx = wCanvas.getContext('2d');
    if (!ctx) return Promise.resolve(0);

    const W   = wCanvas.width;
    const H   = wCanvas.height;
    const cx  = W / 2;
    const cy  = H / 2;
    const n   = WHEEL_SEGMENTS.length;   // 12
    const seg = Math.PI * 2 / n;
    const outerR = Math.min(cx, cy) - 20;
    const innerR = outerR * 0.32;

    // Phase durations (ms) — GDD §12.3
    const T_BUILDUP  =  500;  // pre-spin wobble / buildup
    const T_ACCEL    =  800;  // acceleration
    const T_FULL     = 1500;  // full speed
    const T_DECEL    = 1800;  // deceleration into landing
    const T_BOUNCE   =  400;  // landing bounce
    const TOTAL      = T_BUILDUP + T_ACCEL + T_FULL + T_DECEL + T_BOUNCE;

    // Target rotation: land result.segment.idx under top pointer
    // During full-speed, wheel does 5 full rotations; decel brings it to final angle.
    const fullSpeedRot = Math.PI * 2 * 5;
    const targetAngle  = Math.PI * 2 * 2 - result.segment.idx * seg;  // 2 more rotations in decel
    const finalRot     = fullSpeedRot + targetAngle;
    const maxSpeed     = fullSpeedRot / (T_ACCEL + T_FULL) * 1000;  // radians/sec at peak

    let lastTickSeg = -1;
    const start = performance.now();

    // Easing helpers
    const easeIn  = (t: number) => t * t;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const drawFrame = (rot: number) => {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(cx, cy);

      for (let i = 0; i < n; i++) {
        const a0    = rot + i * seg - Math.PI / 2 - seg / 2;
        const a1    = a0 + seg;
        const type  = WHEEL_SEGMENTS[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, outerR, a0, a1);
        ctx.closePath();
        ctx.fillStyle = WHEEL_BONUS_COLORS[type];
        ctx.fill();
        ctx.strokeStyle = '#1C1414';
        ctx.lineWidth   = 3;
        ctx.stroke();

        const labelA = a0 + seg / 2;
        ctx.save();
        ctx.rotate(labelA);
        ctx.translate((outerR + innerR) / 2, 0);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle    = '#fff';
        ctx.font         = `bold ${Math.round(outerR * 0.085)}px Inter,sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur   = 4;
        ctx.fillText(WHEEL_BONUS_NAMES[type].split(' ')[0], 0, 0);
        ctx.restore();
      }

      // Centre hub
      ctx.beginPath();
      ctx.arc(0, 0, innerR, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
      grad.addColorStop(0, '#FFCA63');
      grad.addColorStop(1, '#8F5C13');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#1C1414';
      ctx.lineWidth   = 4;
      ctx.stroke();
      ctx.restore();

      // Fixed pointer arrow at top
      ctx.save();
      ctx.fillStyle   = '#D64545';
      ctx.strokeStyle = '#1C1414';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(cx,      cy - outerR - 12);
      ctx.lineTo(cx - 16, cy - outerR + 12);
      ctx.lineTo(cx + 16, cy - outerR + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    return new Promise(resolve => {
      const tick = (now: number) => {
        const elapsed = now - start;
        let rot: number;

        if (elapsed < T_BUILDUP) {
          // Phase 1: buildup wobble — very slow oscillation
          const p = elapsed / T_BUILDUP;
          rot = Math.sin(p * Math.PI * 4) * 0.08;
        } else if (elapsed < T_BUILDUP + T_ACCEL) {
          // Phase 2: accelerate
          const p = (elapsed - T_BUILDUP) / T_ACCEL;
          rot = fullSpeedRot * easeIn(p) * (T_ACCEL / (T_ACCEL + T_FULL));
        } else if (elapsed < T_BUILDUP + T_ACCEL + T_FULL) {
          // Phase 3: full speed (constant)
          const accelEnd = fullSpeedRot * (T_ACCEL / (T_ACCEL + T_FULL));
          const p = (elapsed - T_BUILDUP - T_ACCEL) / T_FULL;
          rot = accelEnd + (fullSpeedRot - accelEnd) * p;
        } else if (elapsed < T_BUILDUP + T_ACCEL + T_FULL + T_DECEL) {
          // Phase 4: decelerate to final angle
          const p   = (elapsed - T_BUILDUP - T_ACCEL - T_FULL) / T_DECEL;
          rot = fullSpeedRot + targetAngle * easeOut(p);
        } else {
          // Phase 5: landing bounce
          const p      = (elapsed - T_BUILDUP - T_ACCEL - T_FULL - T_DECEL) / T_BOUNCE;
          const bounce = Math.sin(p * Math.PI * 3) * 0.05 * (1 - p);  // decaying oscillation
          rot = finalRot + bounce;
        }

        drawFrame(rot);

        // Tick sound each time pointer crosses a new segment
        const pointerSeg = Math.floor(((rot + Math.PI / 2 + Math.PI * 2 * 20) % (Math.PI * 2)) / seg) % n;
        if (pointerSeg !== lastTickSeg) {
          this.audio.play('wheelTick');
          lastTickSeg = pointerSeg;
        }

        if (elapsed < TOTAL) {
          requestAnimationFrame(tick);
        } else {
          drawFrame(finalRot); // lock on final position
          resolve(TOTAL);
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private async showBonusResult(result: import('./types/api').WheelResult): Promise<void> {
    const overlay = this.el('bonus-overlay');
    const inner   = this.el('bonus-inner');
    if (!overlay || !inner) return;

    const type = result.bonusType;

    if (type === 'WH_JP') {
      await this.showJackpotBonus(result.bonus as JackpotResult, overlay, inner);
    } else if (type === 'WH_MN') {
      await this.showMansionBonus(result.bonus as MansionResult, overlay, inner);
    } else if (type === 'WH_BZ') {
      await this.showBuzzsawBonus(result.bonus as BuzzsawResult, overlay, inner);
    } else {
      await this.showMegaHatBonus(result.bonus as MegaHatResult, overlay, inner);
    }

    // NOTE: this.balance was already set from response.balanceAfter, which includes the
    // wheel payout. Do NOT add totalPayout again — that would double-count it.
    this.lastWin = result.totalPayout;
    this.setLastWinEl(this.lastWin);
    this.setBalanceEl(this.balance);
    // DS AE07 — wheel_feature_complete
    const _jpResult   = result.bonusType === 'WH_JP' ? (result.bonus as import('./types/api').JackpotResult) : null;
    const _mnResult   = result.bonusType === 'WH_MN' ? (result.bonus as import('./types/api').MansionResult) : null;
    const _bzResult   = result.bonusType === 'WH_BZ' ? (result.bonus as import('./types/api').BuzzsawResult) : null;
    const _mhResult   = result.bonusType === 'WH_MH' ? (result.bonus as import('./types/api').MegaHatResult) : null;
    this.track('wheel_feature_complete', {
      wheelOutcome:  result.bonusType,
      totalWin:      result.totalPayout,
      jackpotTier:   _jpResult?.tier ?? null,
      mansionCount:  _mnResult?.mansionCount ?? null,
      buzzsawCount:  _bzResult?.rowBuzzsaws ? _bzResult.rowBuzzsaws.filter(n => n > 0).length : null,
      hatSpaces:     _mhResult?.spaceCount ?? null,
    });
    await this.showWheelOutroOverlay(result.totalPayout);
    await this.showFeatureComplete(result.totalPayout, 'BONUS COMPLETE');
  }

  /* ── SCR-JACKPOT (spec §3.5) ─────────────────────────────── */
  private async showJackpotBonus(r: JackpotResult, overlay: HTMLElement, inner: HTMLElement): Promise<void> {
    const tierDefs = [
      { id: 'Grand', label: 'GRAND', mult: JACKPOT_TIERS.find(t => t.id === 'Grand')?.base ?? 500 },
      { id: 'Major', label: 'MAJOR', mult: JACKPOT_TIERS.find(t => t.id === 'Major')?.base ?? 100 },
      { id: 'Minor', label: 'MINOR', mult: JACKPOT_TIERS.find(t => t.id === 'Minor')?.base ?? 25  },
      { id: 'Mini',  label: 'MINI',  mult: JACKPOT_TIERS.find(t => t.id === 'Mini')?.base  ?? 10  },
    ];
    const bet = BET_LEVELS[this.betLevelIdx].total;

    inner.innerHTML = `
      <div class="bonus-title">JACKPOT</div>
      <div class="bonus-desc">Spinning to reveal your tier…</div>
      <div class="jackpot-grid" id="jp-tiles">
        ${tierDefs.map(t => `
          <div class="jackpot-tile" data-tier="${t.id}">
            <div class="jackpot-tile-name">${t.label}</div>
            <div class="jackpot-tile-val">${t.mult}×</div>
            <div class="jackpot-tile-coins">${fmt(t.mult * bet)}</div>
          </div>`).join('')}
      </div>
      <div id="bonus-status" class="bonus-status">&nbsp;</div>
      <div id="bonus-total" class="bonus-total" aria-live="assertive">&nbsp;</div>
      <p class="bonus-tap-hint">Tap anywhere to continue</p>`;
    overlay.classList.remove('hidden');
    await sleep(300);

    const tiles = Array.from(inner.querySelectorAll<HTMLElement>('.jackpot-tile'));
    const winnerIdx = tierDefs.findIndex(t => t.id === r.tier);
    const highlight = (idx: number) => {
      tiles.forEach((t, i) => t.classList.toggle('highlight', i === idx));
    };

    // Phase 1: fast spin — cycles in order then random flicker, 40 steps
    for (let i = 0; i < 40; i++) {
      const next = i < 28 ? i % 4 : Math.floor(Math.random() * 4);
      highlight(next);
      this.audio.play('uiTick');
      await sleep(55 + i * 2); // gradually slow: 55ms → 135ms
    }

    // Phase 2: slow crawl toward winner, 10 more steps
    for (let step = 0; step < 10; step++) {
      const idx = (step < 7)
        ? Math.floor(Math.random() * 4)
        : (step === 7 ? (winnerIdx + 3) % 4 : (step === 8 ? (winnerIdx + 1) % 4 : winnerIdx));
      highlight(idx);
      this.audio.play('uiTick');
      await sleep(160 + step * 20);
    }

    highlight(-1); // clear all briefly
    await sleep(150);

    // Phase 3: lock-in winner with particle burst
    tiles.forEach((t, i) => {
      if (i === winnerIdx) t.classList.add('winner');
      else t.classList.add('loser');
    });
    this.audio.play('jackpot');

    // Spawn coin burst centred on winner tile
    const winTile = tiles[winnerIdx];
    const wRect   = winTile.getBoundingClientRect();
    const oRect   = overlay.getBoundingClientRect();
    this.spawnJackpotBurst(
      overlay,
      wRect.left - oRect.left + wRect.width  / 2,
      wRect.top  - oRect.top  + wRect.height / 2,
    );
    await sleep(400);

    const totEl  = inner.querySelector<HTMLElement>('#bonus-total');
    const statEl = inner.querySelector<HTMLElement>('#bonus-status');
    const descEl = inner.querySelector<HTMLElement>('.bonus-desc');
    if (descEl) descEl.textContent = `${r.tier.toUpperCase()} JACKPOT`;
    if (statEl) statEl.textContent = `${r.scale}× your bet`;
    animateValue(0, r.payout, 1500, v => { if (totEl) totEl.textContent = `WIN: ${fmt(v)} coins`; });
    await sleep(1800);

    await new Promise<void>(res => {
      overlay.addEventListener('click', () => res(), { once: true });
      setTimeout(res, 4000);
    });
    overlay.classList.add('hidden');
  }

  /** Coin-burst particle canvas spawned on top of the bonus overlay */
  private spawnJackpotBurst(container: HTMLElement, cx: number, cy: number): void {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;width:100%;height:100%';
    canvas.width  = container.clientWidth  || window.innerWidth;
    canvas.height = container.clientHeight || window.innerHeight;
    container.appendChild(canvas);
    const pCtx    = canvas.getContext('2d')!;
    const COLORS  = ['#FFC24A','#FFE289','#fff','#E3A02C','#ff7b3a','#5BB86E'];
    const parts   = Array.from({ length: 70 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 400;
      return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 140,
        r: 3 + Math.random() * 6, color: COLORS[Math.floor(Math.random() * COLORS.length)], life: 1 };
    });
    let last = performance.now(), rafId = 0;
    const tick = (now: number) => {
      const dt = Math.min(40, now - last) / 1000; last = now;
      pCtx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of parts) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.life -= dt * 1.0;
        if (p.life <= 0) continue;
        alive++;
        pCtx.globalAlpha = Math.max(0, p.life);
        pCtx.beginPath(); pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        pCtx.fillStyle = p.color; pCtx.fill();
      }
      pCtx.globalAlpha = 1;
      if (alive > 0) rafId = requestAnimationFrame(tick);
      else { cancelAnimationFrame(rafId); canvas.remove(); }
    };
    rafId = requestAnimationFrame(tick);
  }

  /* ── SCR-MANSION (GDD §12.5) ─────────────────────────────── */
  // Payout table: 1=1×, 3=3×, 6=10×, 10=50×, 15=500× (interpolated linearly between)
  private async showMansionBonus(r: MansionResult, overlay: HTMLElement, inner: HTMLElement): Promise<void> {
    // GDD §12.5 payout milestones for the progress bar
    const MANSION_MILESTONES = [
      { count: 1, mult: 1 }, { count: 3, mult: 3 }, { count: 6, mult: 10 },
      { count: 10, mult: 50 }, { count: 15, mult: 500 },
    ];
    const totalRounds = r.events.length;

    inner.innerHTML = `
      <div class="bonus-title">MANSION BONUS</div>
      <div class="bonus-desc">Each hat becomes a mansion — more mansions, bigger payout!</div>
      <div class="mansion-milestones">
        ${MANSION_MILESTONES.map(m => `<div class="mansion-ms" data-count="${m.count}"><span class="mansion-ms-val">${m.count}</span><span class="mansion-ms-mult">${m.mult}×</span></div>`).join('')}
      </div>
      <div class="mansion-grid" id="mansion-grid" role="grid" aria-label="Mansion bonus grid"></div>
      <div id="bonus-status" class="bonus-status" aria-live="polite">Round 1 / ${totalRounds}</div>
      <div id="bonus-total" class="bonus-total" aria-live="assertive">&nbsp;</div>
      <p class="bonus-tap-hint">Tap anywhere to continue</p>`;
    overlay.classList.remove('hidden');
    this.audio.play('dialogOpen');

    const gridEl  = inner.querySelector<HTMLElement>('#mansion-grid')!;
    const statEl  = inner.querySelector<HTMLElement>('#bonus-status')!;
    const totEl   = inner.querySelector<HTMLElement>('#bonus-total')!;
    const cells: HTMLElement[] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const el = document.createElement('div');
      el.className = 'mansion-cell';
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: empty`);
      gridEl.appendChild(el);
      cells.push(el);
    }
    await sleep(400);

    let mansionCount = 0;

    const highlightMilestone = (count: number) => {
      inner.querySelectorAll<HTMLElement>('.mansion-ms').forEach(el => {
        const ms = parseInt(el.dataset.count ?? '0');
        el.classList.toggle('mansion-ms-reached', count >= ms);
        el.classList.toggle('mansion-ms-active',  count === ms);
      });
    };

    for (const ev of r.events) {
      statEl.textContent = `Round ${(ev.round ?? 0) + 1} / ${totalRounds}`;
      if (ev.type === 'miss') { await sleep(180); continue; }

      const targetRow  = (ev.type === 'relocate' ? ev.row  : ev.row)  as number | undefined;
      const targetReel = (ev.type === 'relocate' ? ev.reel : ev.reel) as number | undefined;
      if (targetRow !== undefined && targetReel !== undefined) {
        const idx = targetRow * 5 + targetReel;
        cells[idx].textContent = '🎩';
        cells[idx].classList.remove('mansion');
        cells[idx].classList.add('hat');
        cells[idx].setAttribute('aria-label', `Row ${targetRow + 1} col ${targetReel + 1}: hat dropping`);
        this.audio.play('smallWin');
        await sleep(320);
        cells[idx].classList.remove('hat');
        cells[idx].classList.add('mansion');
        cells[idx].textContent = '🏰';
        mansionCount++;
        cells[idx].setAttribute('aria-label', `Row ${targetRow + 1} col ${targetReel + 1}: mansion`);
        highlightMilestone(mansionCount);
        await sleep(100);
      }
      if (ev.type === 'fullbonus') {
        this.audio.play('niceWin');
        totEl.textContent = `Full screen bonus! +${fmt(10 * BET_LEVELS[this.betLevelIdx].total)}`;
        await sleep(280);
      }
    }

    statEl.textContent = `${mansionCount} mansion${mansionCount !== 1 ? 's' : ''} built!`;
    const winAudio = r.payout >= BET_LEVELS[this.betLevelIdx].total * 50 ? 'bigWin'
                   : r.payout > 0 ? 'niceWin' : 'smallWin';
    this.audio.play(winAudio);
    animateValue(0, r.payout, 1200, v => { totEl.textContent = `${mansionCount} mansions — WIN: ${fmt(v)} coins`; });
    await sleep(1400);

    await new Promise<void>(res => {
      overlay.addEventListener('click', () => res(), { once: true });
      setTimeout(res, 6000);
    });
    overlay.classList.add('hidden');
    this.audio.play('dialogClose');
  }

  /* ── SCR-BUZZSAW (GDD §12.6) ─────────────────────────────── */
  // Buzzsaws move L→R across row: straw(1×)→wood(3×)→brick(8×)→mansion(25×)
  private async showBuzzsawBonus(r: BuzzsawResult, overlay: HTMLElement, inner: HTMLElement): Promise<void> {
    inner.innerHTML = `
      <div class="bonus-title">BUZZSAW BONUS</div>
      <div class="bonus-desc">Buzzsaws sweep across each row — straw → wood → brick → mansion!</div>
      <div class="bonus-sub-row">
        <span class="bonus-stat-lbl">SAWS</span>
        <span id="bz-saws" class="bonus-stat-val">0 / ${r.rowBuzzsaws.reduce((a, b) => a + b, 0)}</span>
      </div>
      <div class="buzzsaw-grid" id="buzz-grid" role="grid" aria-label="Buzzsaw bonus grid"></div>
      <div class="bz-legend">
        <span class="bz-leg straw">Straw 1×</span>
        <span class="bz-leg wood">Wood 3×</span>
        <span class="bz-leg brick">Brick 8×</span>
        <span class="bz-leg mansion">Mansion 25×</span>
      </div>
      <div id="bonus-total" class="bonus-total" aria-live="assertive">&nbsp;</div>
      <p class="bonus-tap-hint">Tap anywhere to continue</p>`;
    overlay.classList.remove('hidden');
    this.audio.play('dialogOpen');

    const gridEl = inner.querySelector<HTMLElement>('#buzz-grid')!;
    const sawsEl = inner.querySelector<HTMLElement>('#bz-saws')!;
    const totEl  = inner.querySelector<HTMLElement>('#bonus-total')!;
    const cells: HTMLElement[] = [];
    const totalSaws = r.rowBuzzsaws.reduce((a, b) => a + b, 0);

    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const el = document.createElement('div');
      el.className = 'buzz-cell';
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: empty`);
      gridEl.appendChild(el);
      cells.push(el);
    }
    await sleep(400);

    let sawsDone = 0;

    for (let row = 0; row < 3; row++) {
      const count = r.rowBuzzsaws[row] ?? 0;
      if (count === 0) continue;

      for (let k = 0; k < count; k++) {
        sawsDone++;
        sawsEl.textContent = `${sawsDone} / ${totalSaws}`;

        // Animate the saw sweeping L→R across this row (GDD §12.6)
        for (let col = 0; col < 5; col++) {
          const idx = row * 5 + col;
          // Show saw passing through cell
          cells[idx].classList.add('saw-active');
          await sleep(70);

          const curLvl = BUZZSAW_ORDER.findIndex(cls => cells[idx].classList.contains(cls));
          const nextLvl = Math.min(BUZZSAW_ORDER.length - 1, (curLvl === -1 ? 0 : curLvl) + 1);
          const nextCls = BUZZSAW_ORDER[nextLvl];
          BUZZSAW_ORDER.forEach(cls => cells[idx].classList.remove(cls));
          cells[idx].classList.remove('saw-active');
          if (nextCls !== 'none') cells[idx].classList.add(nextCls);
          const mult = BUZZSAW_BORDERS[nextCls] ?? 0;
          cells[idx].textContent = mult > 0 ? `${mult}×` : '';
          cells[idx].setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: ${nextCls} (${mult}×)`);
          this.audio.play('uiTick');
          await sleep(60);
        }
        await sleep(200);
      }
    }

    // Final tally
    const winAudio = r.payout >= BET_LEVELS[this.betLevelIdx].total * 50 ? 'bigWin'
                   : r.payout > 0 ? 'niceWin' : 'smallWin';
    this.audio.play(winAudio);
    animateValue(0, r.payout, 1000, v => { totEl.textContent = `${r.total}× total — WIN: ${fmt(v)} coins`; });
    await sleep(1400);

    await new Promise<void>(res => {
      overlay.addEventListener('click', () => res(), { once: true });
      setTimeout(res, 6000);
    });
    overlay.classList.add('hidden');
    this.audio.play('dialogClose');
  }

  /* ── SCR-MEGAHAT (GDD §12.7) ─────────────────────────────── */
  // Oversized hats cover 4-15 spaces. Prize cells revealed one-by-one with coin values.
  private async showMegaHatBonus(r: MegaHatResult, overlay: HTMLElement, inner: HTMLElement): Promise<void> {
    inner.innerHTML = `
      <div class="bonus-title">MEGA HAT BONUS</div>
      <div class="bonus-desc">${r.spaceCount} oversized hat space${r.spaceCount !== 1 ? 's' : ''} — non-hat cells reveal prizes!</div>
      <div class="megahat-grid" id="mh-grid" role="grid" aria-label="Mega hat bonus grid"></div>
      <div class="bonus-sub-row">
        <span class="bonus-stat-lbl">PRIZES</span>
        <span id="mh-prizes" class="bonus-stat-val">0</span>
        <span class="bonus-stat-sep">·</span>
        <span class="bonus-stat-lbl">RUNNING</span>
        <span id="mh-running" class="bonus-stat-val">0×</span>
      </div>
      <div id="bonus-total" class="bonus-total" aria-live="assertive">&nbsp;</div>
      <p class="bonus-tap-hint">Tap anywhere to continue</p>`;
    overlay.classList.remove('hidden');
    this.audio.play('dialogOpen');

    const gridEl    = inner.querySelector<HTMLElement>('#mh-grid')!;
    const prizesEl  = inner.querySelector<HTMLElement>('#mh-prizes')!;
    const runningEl = inner.querySelector<HTMLElement>('#mh-running')!;
    const totEl     = inner.querySelector<HTMLElement>('#bonus-total')!;
    const cells: HTMLElement[] = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      const el = document.createElement('div');
      el.className = 'megahat-cell unrevealed';
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: hidden`);
      el.textContent = '?';
      gridEl.appendChild(el);
      cells.push(el);
    }
    await sleep(500);

    let prizeCount   = 0;
    let runningTotal = 0;

    for (let i = 0; i < 15; i++) {
      const row   = Math.floor(i / 5);
      const col   = i % 5;
      const isHat = r.grid[row]?.[col] === 'hat';
      const prize = r.prizeGrid[row]?.[col] ?? 0;

      cells[i].classList.remove('unrevealed');
      cells[i].classList.add('revealing');
      await sleep(40);
      cells[i].classList.remove('revealing');

      if (isHat) {
        cells[i].textContent = '🎩';
        cells[i].classList.add('hat');
        cells[i].setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: hat`);
      } else {
        cells[i].textContent = prize > 0 ? `${prize}×` : '—';
        cells[i].classList.add(prize > 0 ? 'prize' : 'empty');
        cells[i].setAttribute('aria-label', `Row ${row + 1} col ${col + 1}: ${prize > 0 ? prize + ' times' : 'empty'}`);
        if (prize > 0) {
          prizeCount++;
          runningTotal += prize;
          prizesEl.textContent  = String(prizeCount);
          runningEl.textContent = `${runningTotal}×`;
        }
      }
      this.audio.play('uiTick');
      await sleep(110);
    }

    const winAudio = r.payout >= BET_LEVELS[this.betLevelIdx].total * 50 ? 'bigWin'
                   : r.payout > 0 ? 'niceWin' : 'smallWin';
    this.audio.play(winAudio);
    animateValue(0, r.payout, 1000, v => { totEl.textContent = `${r.total}× total — WIN: ${fmt(v)} coins`; });
    await sleep(1400);

    await new Promise<void>(res => {
      overlay.addEventListener('click', () => res(), { once: true });
      setTimeout(res, 6000);
    });
    overlay.classList.add('hidden');
    this.audio.play('dialogClose');
  }

  /* ══════════════════════════════════════════════════════
     AUTOPLAY
  ══════════════════════════════════════════════════════ */
  private tickAutoplay(): void {
    if (!this.autoplayActive) return;
    if (this.autoplayRemaining === 0) { this.stopAutoplay('all spins complete'); return; }
    // Stop if balance has fallen below the configured threshold
    if (this.autoplayStopOnBalanceBelow !== null && this.balance <= this.autoplayStopOnBalanceBelow) {
      this.stopAutoplay('balance below threshold'); return;
    }
    if (this.autoplayRemaining > 0) this.autoplayRemaining--;
    this.updateAutoBtn();
    setTimeout(() => this.doSpin('autoplay').catch(() => {}), 300);
  }

  private stopAutoplay(reason = 'manually stopped'): void {
    this.autoplayActive    = false;
    this.autoplayRemaining = 0;   // Ensures tickAutoplay exits cleanly if spin is mid-flight
    this.updateAutoBtn();
    this.toastAutoplayStopped(reason);
    // DS AE13 — autoplay_stop
    this.track('autoplay_stop', {
      reason,
      spinsCompleted: this.autoplayCount - Math.max(0, this.autoplayRemaining),
      totalWagered:   this.rcTotalSpent,
      totalWon:       this.rcTotalWon,
      duration:       Math.round((Date.now() - this.autoplayStartMs) / 1000),
    });
    if (reason === 'all spins complete') {
      this.showAutoplayEndOverlay().catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════════════
     HUD & DOM HELPERS
  ══════════════════════════════════════════════════════ */
  private el(id: string): HTMLElement | null { return document.getElementById(id); }

  private updateHUD(): void {
    this.setBalanceEl(this.balance);
    this.setBetEl();
    this.setLastWinEl(this.lastWin);
    const net = this.balance - this.sessionStart;
    const sn  = this.el('session-net');
    if (sn) { sn.textContent = (net >= 0 ? '+' : '') + fmt(Math.abs(net)); sn.style.color = net >= 0 ? '#5BB86E' : '#d9534f'; }
  }

  private setBalanceEl(n: number): void {
    const el = this.el('balance');
    if (el) el.textContent = fmt(Math.round(n));
  }

  private setLastWinEl(n: number): void {
    const v = fmt(Math.round(n));
    const el  = this.el('last-win');   if (el)  el.textContent = v;
    const el2 = this.el('win-amount'); if (el2) el2.textContent = v;
  }

  private setBetEl(): void {
    const lvl = BET_LEVELS[this.betLevelIdx];
    const bv  = this.el('bet-value'); if (bv) bv.textContent = fmt(lvl.total);
    const bl  = this.el('bet-level'); if (bl) bl.textContent = String(lvl.lvl);
    const sd  = this.el('stake-display'); if (sd) sd.textContent = fmt(lvl.total);
    const bfc = this.el('buy-fs-cost');    if (bfc) bfc.textContent = fmt(lvl.total * BUY_FS_MULT);
    const bwc = this.el('buy-wheel-cost'); if (bwc) bwc.textContent = fmt(lvl.total * BUY_WHEEL_MULT);
  }

  private setSpinLabel(label: string): void {
    const btn = this.el('btn-spin');
    if (btn) btn.textContent = label;
  }

  /**
   * @param on        true = enable all controls
   * @param spinAlive true = spin button stays clickable (quick-stop during reel spin)
   */
  private setControlsEnabled(on: boolean, spinAlive = on): void {
    // btn-auto is intentionally excluded — it must always be clickable to stop autospin mid-spin
    const ids = ['btn-bet-minus','btn-bet-plus','btn-bet-max','btn-buy-fs','btn-buy-wheel','btn-quick','btn-open-buy'];
    for (const id of ids) {
      const el = this.el(id) as HTMLButtonElement | null;
      if (el) { el.disabled = !on; el.classList.toggle('disabled', !on); }
    }
    const spin = this.el('btn-spin') as HTMLButtonElement | null;
    if (spin) { spin.disabled = !spinAlive; spin.classList.toggle('disabled', !spinAlive); }
    // Keep btn-auto always enabled; just reflect active state visually
    const auto = this.el('btn-auto') as HTMLButtonElement | null;
    if (auto) { auto.disabled = false; auto.classList.remove('disabled'); }
  }

  /** Multiplier value → [1,2,3,5] maps to node indices 0..3 */
  private multNodeIndex(v: number): number {
    if (v <= 1) return 0;
    if (v === 2) return 1;
    if (v === 3) return 2;
    return 3;
  }

  private showMultiplier(v: number): void {
    const badge = this.el('multiplier-badge');
    const val   = this.el('multiplier-value');
    if (badge) {
      badge.classList.remove('hidden');
      badge.style.animation = 'none';
      void badge.offsetWidth;
      badge.style.animation = '';
    }
    if (val) val.textContent = `×${v}`;
    // Activate ladder up to current node
    const active = this.multNodeIndex(v);
    for (let i = 0; i <= 3; i++) {
      this.el(`mult-step-${i}`)?.classList.toggle('active', i <= active);
    }
    for (let i = 0; i <= 2; i++) {
      this.el(`mult-line-${i}`)?.classList.toggle('active', i < active);
    }
  }

  private hideMultiplier(): void {
    this.el('multiplier-badge')?.classList.add('hidden');
    for (let i = 0; i <= 3; i++) this.el(`mult-step-${i}`)?.classList.remove('active');
    for (let i = 0; i <= 2; i++) this.el(`mult-line-${i}`)?.classList.remove('active');
  }

  private showFsBanner(): void  {
    this.el('fs-banner')?.classList.remove('hidden');
    // Swap multiplier ladder labels to FS values ×2/×4/×6/×10 (spec §3.3)
    const fsLabels = ['×2', '×4', '×6', '×10'];
    fsLabels.forEach((lbl, i) => {
      const node = this.el(`mult-step-${i}`);
      if (node) { const sp = node.querySelector('span'); if (sp) sp.textContent = lbl; }
      node?.setAttribute('aria-label', `Times ${lbl.replace('×', '')}`);
    });
  }
  private hideFsBanner(): void  {
    this.el('fs-banner')?.classList.add('hidden');
    // Restore base-game multiplier ladder labels ×1/×2/×3/×5
    const baseLabels = ['×1', '×2', '×3', '×5'];
    baseLabels.forEach((lbl, i) => {
      const node = this.el(`mult-step-${i}`);
      if (node) { const sp = node.querySelector('span'); if (sp) sp.textContent = lbl; }
      node?.setAttribute('aria-label', `Times ${lbl.replace('×', '')}`);
    });
  }
  private updateFsBanner(): void {
    const rem  = this.el('fs-remaining'); if (rem) rem.textContent = String(this.fsRemaining);
    const tot  = this.el('fs-total');     if (tot) tot.textContent = fmt(this.fsRunningTotal);
  }
  /** Flash retrigger indicator (spec §3.3 fs-retrigger-ind) */
  private showFsRetriggerIndicator(): void {
    const el = this.el('fs-retrigger-ind');
    if (!el) return;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
  }

  private updateAutoBtn(): void {
    const btn = this.el('btn-auto');
    if (!btn) return;
    if (this.autoplayActive) {
      const rem = this.autoplayRemaining < 0 ? '∞' : String(this.autoplayRemaining);
      btn.textContent = `STOP (${rem})`;
      btn.classList.add('active');
    } else {
      btn.textContent = 'AUTO';
      btn.classList.remove('active');
    }
  }

  private setSplashProgress(pct: number): void {
    const bar = this.el('splash-bar') as HTMLElement | null;
    if (bar) bar.style.width = pct + '%';
  }

  private setSplashStatus(msg: string): void {
    const el = this.el('splash-status');
    if (el) el.textContent = msg;
  }

  /* ── Toast queue (spec §5 — stacked FIFO, max 3) ──────────── */
  private readonly MAX_TOASTS = 3;
  private toastTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  /**
   * Enqueue a toast notification (spec §5).
   * @param msg       Display text (may include icon prefix)
   * @param dur       Auto-dismiss ms
   * @param assertive true = aria-live assertive + red border; 'win' = gold border
   */
  private showToast(
    msg: string,
    dur = 2500,
    assertive: boolean | 'win' = false,
  ): void {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;

    // Evict oldest if already at max
    while (stack.children.length >= this.MAX_TOASTS) {
      const oldest = stack.firstElementChild as HTMLElement | null;
      if (oldest) this.dismissToast(oldest, true);
    }

    // Build item
    const item = document.createElement('div');
    item.className = 'toast-item';
    if (assertive === true)  item.classList.add('toast-assertive');
    if (assertive === 'win') item.classList.add('toast-win');
    // Set role based on urgency
    item.setAttribute('role', assertive === true ? 'alert' : 'status');
    item.textContent = msg;
    stack.appendChild(item);

    // Auto-dismiss
    const timer = setTimeout(() => this.dismissToast(item), dur);
    this.toastTimers.set(item, timer);

    // Click-to-dismiss
    item.addEventListener('click', () => this.dismissToast(item, true), { once: true });
  }

  private dismissToast(item: HTMLElement, immediate = false): void {
    const timer = this.toastTimers.get(item);
    if (timer) { clearTimeout(timer); this.toastTimers.delete(item); }
    if (immediate || !item.isConnected) { item.remove(); return; }
    item.classList.add('toast-out');
    item.addEventListener('animationend', () => item.remove(), { once: true });
  }

  // ── Named toast helpers (spec §5) ──────────────────────────

  private toastFsTriggered(spins: number): void {
    this.showToast(`✨ ${spins} Free Spins!`, 2000, 'win');
  }
  private toastFsRetrigger(added: number): void {
    this.showToast(`🔄 Retrigger! +${added} spins`, 2000, 'win');
  }
  private toastWheelTriggered(): void {
    this.showToast('🎡 Wheel Feature!', 2000, 'win');
  }
  private toastGoldenConverted(): void {
    this.showToast('🌟 Golden became a Wild!', 2500);
  }
  private toastScatterNear(): void {
    this.showToast('✨ Close! One more Scatter for Free Spins.', 2000);
  }
  private toastMultAdv(mult: number): void {
    this.showToast(`⚡ Multiplier ×${mult}!`, 1500);
  }
  private toastBigWin(): void {
    this.showToast('💰 Big Win!', 3000, 'win');
  }
  private toastBetCapped(newBet: number): void {
    this.showToast(`⚠ Bet lowered to ${fmt(newBet)} (balance low).`, 2000, true);
  }
  private toastAutoplayStarted(count: number): void {
    const label = count < 0 ? '∞' : String(count);
    this.showToast(`▶ Autoplay: ${label} spins`, 1500);
  }
  private toastAutoplayStopped(reason: string): void {
    this.showToast(`⏹ Autoplay stopped: ${reason}`, 2500);
  }
  private toastSoundToggled(on: boolean): void {
    this.showToast(on ? '🔊 Sound on' : '🔇 Sound off', 1000);
  }
  private toastTurboToggled(on: boolean): void {
    this.showToast(on ? '⚡ Turbo on' : '⚡ Turbo off', 1000);
  }
  private toastConnectionRestored(): void {
    this.showToast('✓ You\'re back online.', 2000);
  }
  private toastRateLimit(): void {
    this.showToast('⏱ Slow down — spin cooldown.', 2000, true);
  }
  private toastQuickspinEnabled(): void {         // TST-QUICKSPIN-ENABLED
    this.showToast('⚡⚡ Quickspin on', 1500);
  }
  private toastCoinMilestone(amt: number): void { // TST-COIN-MILESTONE
    this.showToast(`💰 Session win ${fmt(amt)}`, 2000, 'win');
  }
  private toastFeatureSaved(): void {             // TST-FEATURE-SAVED
    this.showToast('✓ Progress saved.', 1000);
  }
  private toastCopied(): void {                   // TST-COPIED
    this.showToast('✓ Copied.', 1000);
  }

  private showRestartModal(): void {
    const net  = this.balance - STARTING_BALANCE;
    const rs   = this.el('restart-stats');
    if (rs) rs.innerHTML = `Spins: ${this.spinCount}<br>Net: ${fmt(net)}`;
    this.el('restart-modal')?.classList.remove('hidden');
    this.track('low_balance_shown', { balance: this.balance });
    this.track('error', { errorType: 'server', errorCode: 'ERR-FUNDS-001', balance: this.balance });
  }

  /* ── OVL-TUTORIAL  (spec §1.3) ─────────────────── */
  private showTutorial(): Promise<void> {
    return new Promise(res => {
      const ov = this.el('tutorial-overlay');
      if (!ov) { res(); return; }
      ov.classList.remove('hidden');
      let step = 0;
      const steps = [this.el('tut-step-1'), this.el('tut-step-2'), this.el('tut-step-3')];
      const dots  = [this.el('tut-dot-0'), this.el('tut-dot-1'), this.el('tut-dot-2')];
      const nextBtn = this.el('tut-next');
      const skipBtn = this.el('tut-skip');

      const showStep = (i: number) => {
        steps.forEach((s, j) => s?.classList.toggle('hidden', j !== i));
        dots.forEach((d, j) => d?.classList.toggle('active', j === i));
        if (nextBtn) nextBtn.textContent = i === 2 ? 'Play!' : 'Next';
      };

      const done = () => {
        ov.classList.add('hidden');
        localStorage.setItem('huff-puff-tutorial-seen', 'true');
        this.track('tutorial_completed', { step });
        res();
      };

      const skip = () => {
        const sm = this.el('tutorial-skip-modal');
        if (!sm) { done(); return; }
        sm.classList.remove('hidden');
        this.el('ts-skip-confirm')?.addEventListener('click', () => { sm.classList.add('hidden'); done(); }, { once: true });
        this.el('ts-continue')?.addEventListener('click', () => sm.classList.add('hidden'), { once: true });
      };

      skipBtn?.addEventListener('click', skip);
      nextBtn?.addEventListener('click', () => {
        if (step < 2) { step++; showStep(step); }
        else done();
      });
      showStep(0);
    });
  }

  /* ── OVL-WHEEL-INTRO  (spec §4.4) ─────────────── */
  private showWheelIntroOverlay(): Promise<void> {
    return new Promise(res => {
      const ov = this.el('wheel-intro-overlay');
      if (!ov) { res(); return; }
      ov.classList.remove('hidden');
      const skipBtn = this.el('wheel-intro-skip');
      const done = () => { ov.classList.add('hidden'); res(); };

      // Skip button appears after 1s; hold-press 600ms to activate
      let holdTimer: ReturnType<typeof setTimeout> | null = null;
      setTimeout(() => skipBtn?.classList.remove('hidden'), 1000);
      skipBtn?.addEventListener('pointerdown', () => { holdTimer = setTimeout(done, 600); });
      skipBtn?.addEventListener('pointerup',   () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });
      skipBtn?.addEventListener('pointerleave',() => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });

      setTimeout(done, 2500);
    });
  }

  /* ── OVL-WHEEL-OUTRO  (spec §4.4) ─────────────── */
  private showWheelOutroOverlay(total: number): Promise<void> {
    return new Promise(res => {
      const ov    = this.el('wheel-outro-overlay');
      const totEl = this.el('wheel-outro-total');
      if (!ov) { res(); return; }
      ov.classList.remove('hidden');
      if (totEl) animateValue(0, total, 1500, v => { totEl.textContent = fmt(v); });
      const done = () => { ov.classList.add('hidden'); res(); };
      this.el('wheel-outro-ok')?.addEventListener('click', done, { once: true });
      setTimeout(done, 3000);
    });
  }

  /* ── MOD-MAX-WIN-REACHED  (spec §8) ────────────── */
  private showMaxWinModal(amount: number): Promise<void> {
    return new Promise(res => {
      const m   = this.el('max-win-modal');
      const amt = this.el('max-win-amount');
      if (!m) { res(); return; }
      if (amt) animateValue(0, amount, 1500, v => { amt.textContent = fmt(v); });
      m.classList.remove('hidden');
      this.track('max_win_reached', { amount });
      this.el('mw-collect')?.addEventListener('click', () => { m.classList.add('hidden'); res(); }, { once: true });
    });
  }

  /* ── MOD-NETWORK-QUALITY  (spec §8) ────────────── */
  private showNetworkQualityModal(): void {
    const m = this.el('network-quality-modal');
    if (!m || !m.classList.contains('hidden')) return;
    m.classList.remove('hidden');
    this.track('network_slow_shown');
    this.el('nq-continue')?.addEventListener('click', () => m.classList.add('hidden'), { once: true });
    this.el('nq-exit')?.addEventListener('click',    () => { m.classList.add('hidden'); window.location.href = '/'; }, { once: true });
  }

  /* ── MOD-RG-BREAK-ACTIVE  (spec §5) ─────────────── */
  showRgBreakModal(remainingMs: number): void {
    this.rgBreakEndTime = Date.now() + remainingMs;
    const m      = this.el('rg-break-modal');
    const timeEl = this.el('rb-time-remaining');
    if (!m) return;
    m.classList.remove('hidden');
    this.track('rg_break_shown');
    if (this.rgBreakTimer) clearInterval(this.rgBreakTimer);
    this.rgBreakTimer = setInterval(() => {
      const left = Math.max(0, (this.rgBreakEndTime ?? 0) - Date.now());
      const mins = Math.floor(left / 60_000);
      const secs = Math.floor((left % 60_000) / 1000);
      if (timeEl) timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
      if (left <= 0) {
        clearInterval(this.rgBreakTimer!);
        this.rgBreakTimer = null;
        m.classList.add('hidden');
      }
    }, 1000);
    this.el('rb-exit')?.addEventListener('click', () => { window.location.href = '/'; }, { once: true });
    this.el('rb-wait')?.addEventListener('click', () => m.classList.add('hidden'), { once: true });
  }

  /* ── MOD-CONFIG-ERROR  (spec §10) ─────────────────── */
  showConfigErrorModal(): void {
    const m = this.el('config-error-modal');
    if (!m) return;
    m.classList.remove('hidden');
    this.track('config_error_shown');
    this.el('ce-refresh')?.addEventListener('click', () => window.location.reload(), { once: true });
    this.el('ce-exit')?.addEventListener(    'click', () => { window.location.href = '/'; }, { once: true });
  }

  /* ── MOD-CONCURRENT-SESSION  (spec §8) ─────────── */
  showConcurrentSessionModal(): void {
    const m = this.el('concurrent-session-modal');
    if (!m) return;
    m.classList.remove('hidden');
    this.track('concurrent_session_detected');
    this.el('cs-switch')?.addEventListener('click', () => m.classList.add('hidden'), { once: true });
    this.el('cs-exit')?.addEventListener('click',   () => { window.location.href = '/'; }, { once: true });
  }

  /* ── MOD-HIDDEN-DEVIATION  (spec §8) ───────────── */
  showHiddenDeviationModal(): void {
    const m = this.el('hidden-deviation-modal');
    if (!m) return;
    m.classList.remove('hidden');
    this.track('hidden_deviation_flag');
    this.el('hd-support')?.addEventListener('click', () => { window.open('/support', '_blank'); });
    this.el('hd-exit')?.addEventListener('click',    () => { window.location.href = '/'; }, { once: true });
  }

  /* ── OVL-MAINT-WARNING  (spec §7) ─────────────── */
  private maintCountdown: ReturnType<typeof setInterval> | null = null;
  showMaintWarning(secondsUntil = 10): void {
    const ovl = this.el('maint-warning-ovl');
    const ctr = this.el('mw-countdown');
    if (!ovl || !ctr) return;
    let secs = secondsUntil;
    ctr.textContent = String(secs);
    ovl.classList.remove('hidden');
    this.track('maintenance_shown', { eta_s: secs });
    if (this.maintCountdown) clearInterval(this.maintCountdown);
    this.maintCountdown = setInterval(() => {
      secs -= 1;
      ctr.textContent = String(Math.max(0, secs));
      if (secs <= 0) { clearInterval(this.maintCountdown!); this.maintCountdown = null; }
    }, 1000);
  }

  /* ── MOD-AGE-GATE  (spec §4) ────────────────── */
  private maybeShowAgeGate(): Promise<void> {
    const VERIFIED_KEY = 'huff-puff-age-verified';
    if (localStorage.getItem(VERIFIED_KEY)) return Promise.resolve();
    const m = this.el('age-gate-modal');
    if (!m) return Promise.resolve();

    // Populate Day dropdown (1–31)
    const dayEl = this.el('ag-dob-day') as HTMLSelectElement | null;
    if (dayEl && dayEl.options.length === 1) {
      for (let d = 1; d <= 31; d++) {
        const o = document.createElement('option');
        o.value = String(d); o.textContent = String(d).padStart(2, '0');
        dayEl.appendChild(o);
      }
    }
    // Populate Year dropdown (current year down to 120 years ago)
    const yearEl = this.el('ag-dob-year') as HTMLSelectElement | null;
    if (yearEl && yearEl.options.length === 1) {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= currentYear - 120; y--) {
        const o = document.createElement('option');
        o.value = String(y); o.textContent = String(y);
        yearEl.appendChild(o);
      }
    }

    return new Promise<void>(resolve => {
      m.classList.remove('hidden');
      this.track('age_gate_shown');
      // Focus first select for keyboard/screen-reader accessibility
      setTimeout(() => dayEl?.focus(), 100);

      const onConfirm = () => {
        const errEl = this.el('ag-error');
        const day   = parseInt((this.el('ag-dob-day')   as HTMLSelectElement | null)?.value ?? '');
        const month = parseInt((this.el('ag-dob-month') as HTMLSelectElement | null)?.value ?? '');
        const year  = parseInt((this.el('ag-dob-year')  as HTMLSelectElement | null)?.value ?? '');

        if (!day || !month || !year) {
          if (errEl) { errEl.textContent = 'Please select your full date of birth.'; errEl.classList.remove('hidden'); }
          return;
        }
        const dob = new Date(year, month - 1, day);
        const now = new Date();
        const age = now.getFullYear() - dob.getFullYear() -
          (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
        if (age < 18) {
          if (errEl) { errEl.textContent = 'You must be 18 or over to play.'; errEl.classList.remove('hidden'); }
          this.track('age_gate_failed');
          return;
        }
        localStorage.setItem(VERIFIED_KEY, '1');
        m.classList.add('hidden');
        this.track('age_gate_passed');
        resolve();
      };

      this.el('ag-confirm')?.addEventListener('click', onConfirm);
      this.el('ag-exit')?.addEventListener('click', () => {
        this.track('age_gate_failed');
        window.location.href = '/';
      }, { once: true });
    });
  }

  /* ── MOD-CASHIER-REDIRECT  (spec §8) ───────────── */
  private showCashierRedirectModal(cashierUrl = '/cashier'): void {
    const m = this.el('cashier-redirect-modal');
    if (!m) return;
    m.classList.remove('hidden');
    this.track('cashier_redirect');
    this.el('cr-go')?.addEventListener('click',     () => { m.classList.add('hidden'); window.location.href = cashierUrl; }, { once: true });
    this.el('cr-cancel')?.addEventListener('click', () => m.classList.add('hidden'), { once: true });
  }

  /* ── Analytics (spec §10.4) ─────────────────────── */
  private track(event: string, data: Record<string, unknown> = {}): void {
    this.api.sendAnalytics([{
      event, ts: Date.now(),
      session_spin_count: this.spinCount,
      bet_level: this.betLevelIdx,
      balance: this.balance,
      ...data,
    }]);
  }

  /* ── Haptics (spec §5.5) ─────────────────────────── */
  private vibrate(pattern: number | number[]): void {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  }

  /* ── Screen-reader announcement (spec §7.4) ─────── */
  private srAnnounce(msg: string): void {
    const srEl = this.el('set-sr-verbose') as HTMLInputElement | null;
    if (!srEl?.checked) return;
    const announce = this.el('sr-announce');
    if (!announce) return;
    announce.textContent = '';
    requestAnimationFrame(() => { announce.textContent = msg; });
  }

  /* ── FS intro overlay (spec OVL-FS-INTRO §7) ────── */
  private showFsIntroOverlay(spinsAwarded: number): Promise<void> {
    return new Promise(res => {
      const ov      = this.el('fs-intro-overlay');
      const spinsEl = this.el('fs-intro-spins');
      if (!ov) { res(); return; }
      if (spinsEl) spinsEl.textContent = String(spinsAwarded);
      ov.classList.remove('hidden');
      this.audio.play('fsIntro');
      this.audio.playMusic('fs');
      const done = () => { ov.classList.add('hidden'); res(); };
      this.el('fs-intro-ok')?.addEventListener('click', done, { once: true });
      setTimeout(done, 3000);
    });
  }

  /* ── FS outro overlay (spec OVL-FS-OUTRO §7) ────── */
  private showFsOutroOverlay(total: number): Promise<void> {
    return new Promise(res => {
      const ov    = this.el('fs-outro-overlay');
      const totEl = this.el('fs-outro-total');
      if (!ov) { res(); return; }
      ov.classList.remove('hidden');
      if (totEl) animateValue(0, total, 1500, v => { totEl.textContent = fmt(v); });
      const done = () => { ov.classList.add('hidden'); res(); };
      this.el('fs-outro-ok')?.addEventListener('click', done, { once: true });
      setTimeout(done, 3500);
    });
  }

  /* ── OVL-FEATURE-COMPLETE  (spec §7 — shown after any feature ends) ── */
  private showFeatureComplete(totalWin: number, label = 'FEATURE COMPLETE'): Promise<void> {
    return new Promise(res => {
      const ovl     = this.el('feature-complete-overlay');
      const titleEl = this.el('fc-heading');
      const amtEl   = this.el('fc-total');
      if (!ovl || totalWin <= 0) { res(); return; }
      if (titleEl) titleEl.textContent = label;
      if (amtEl)   amtEl.textContent   = '0';
      ovl.classList.remove('hidden');
      animateValue(0, totalWin, 1500, v => { if (amtEl) amtEl.textContent = fmt(v); });
      const handle = () => { ovl.classList.add('hidden'); res(); };
      ovl.addEventListener('click', handle, { once: true });
      setTimeout(handle, 3500);
    });
  }

  /* ── Autoplay-end overlay (spec OVL-AUTOPLAY-END §7) ── */
  private showAutoplayEndOverlay(): Promise<void> {
    return new Promise(res => {
      const ov    = this.el('autoplay-end-overlay');
      const stats = this.el('autoplay-end-stats');
      if (!ov) { res(); return; }
      if (stats) {
        const net = this.balance - this.sessionStart;
        stats.innerHTML = `Spins: <strong>${this.spinCount}</strong>&nbsp;&nbsp;Net: <strong style="color:${net >= 0 ? '#5BB86E' : '#d9534f'}">${net >= 0 ? '+' : ''}${fmt(net)}</strong>`;
      }
      ov.classList.remove('hidden');
      const done = () => { ov.classList.add('hidden'); res(); };
      this.el('autoplay-end-ok')?.addEventListener('click', done, { once: true });
      setTimeout(done, 8000); // auto-dismiss after 8s if user doesn't click
    });
  }

  /* ── Feature overlay helpers ───────────────────── */
  private showFeatureOverlay(title: string, desc: string, btnLabel = 'OK'): Promise<void> {
    return new Promise(res => {
      const overlay = this.el('feature-overlay');
      const t       = this.el('feature-title');
      const d       = this.el('feature-desc');
      const ok      = this.el('feature-ok');
      if (!overlay) { res(); return; }
      if (t)  t.textContent   = title;
      if (d)  d.textContent   = desc;
      if (ok) ok.textContent  = btnLabel;
      overlay.classList.remove('hidden');
      const handle = () => { overlay.classList.add('hidden'); res(); };
      ok?.addEventListener('click', handle, { once: true });
      overlay.addEventListener('click', e => { if (e.target === overlay) handle(); }, { once: true });
      setTimeout(handle, 12000);
    });
  }

  private showCelebration(label: string, amount: number, dur: number): Promise<void> {
    return new Promise(res => {
      const overlay  = this.el('celebration');
      const tierEl   = this.el('celebration-tier');
      const amtEl    = this.el('celebration-amount');
      const hintEl   = this.el('celebration-hint');
      const badgeEl  = this.el('celebration-auto-badge');
      if (!overlay) { res(); return; }
      if (tierEl) tierEl.textContent = label;
      if (amtEl)  amtEl.textContent  = '0';
      // Show autospin remaining badge / hint depending on mode
      if (this.autoplayActive) {
        const rem = this.autoplayRemaining < 0 ? '∞' : String(this.autoplayRemaining);
        if (badgeEl) { badgeEl.textContent = `AUTO SPIN — ${rem} remaining`; badgeEl.classList.remove('hidden'); }
        if (hintEl)  hintEl.classList.add('hidden');
      } else {
        if (badgeEl) badgeEl.classList.add('hidden');
        if (hintEl)  hintEl.classList.remove('hidden');
      }
      overlay.classList.remove('hidden');

      // Coin particle shower on celebration canvas
      const pCanvas = overlay.querySelector('canvas') as HTMLCanvasElement | null;
      let rafId = 0;
      if (pCanvas) {
        pCanvas.width  = overlay.clientWidth  || window.innerWidth;
        pCanvas.height = overlay.clientHeight || window.innerHeight;
        const pCtx = pCanvas.getContext('2d')!;
        const COLORS = ['#FFC24A','#E3A02C','#FFE289','#ff7b3a','#5BB86E','#fff'];
        type Coin = { x:number; y:number; vx:number; vy:number; r:number; color:string; angle:number; spin:number };
        const coins: Coin[] = [];
        for (let i = 0; i < 80; i++) {
          coins.push({
            x: Math.random() * pCanvas.width,
            y: -20 - Math.random() * pCanvas.height * 0.5,
            vx: (Math.random() - 0.5) * 180,
            vy: 80 + Math.random() * 200,
            r: 5 + Math.random() * 9,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 6,
          });
        }
        let last = performance.now();
        const tick = (now: number) => {
          const dt = Math.min(40, now - last) / 1000;
          last = now;
          pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
          for (const c of coins) {
            c.x += c.vx * dt; c.y += c.vy * dt; c.angle += c.spin * dt;
            c.vy += 300 * dt; // gravity
            if (c.y > pCanvas.height + 20) { c.y = -20; c.x = Math.random() * pCanvas.width; c.vy = 80 + Math.random() * 200; }
            pCtx.save();
            pCtx.translate(c.x, c.y);
            pCtx.rotate(c.angle);
            pCtx.beginPath();
            pCtx.ellipse(0, 0, c.r, c.r * Math.abs(Math.cos(c.angle * 2)) + 2, 0, 0, Math.PI * 2);
            pCtx.fillStyle = c.color;
            pCtx.fill();
            pCtx.restore();
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      }

      // Count-up animation for win amount
      animateValue(0, amount, dur * 0.7, v => { if (amtEl) amtEl.textContent = fmt(v); });

      const handle = () => {
        cancelAnimationFrame(rafId);
        if (pCanvas) { const pCtx = pCanvas.getContext('2d'); pCtx?.clearRect(0, 0, pCanvas.width, pCanvas.height); }
        overlay.classList.add('hidden');
        res();
      };
      overlay.addEventListener('click', handle, { once: true });
      setTimeout(handle, dur + 1000);
    });
  }

  /* ══════════════════════════════════════════════════════
     EVENT WIRING
  ══════════════════════════════════════════════════════ */
  private wireEvents(): void {
    // FS skip animations button (spec §3.3 fs-skip) — enables quick-spin for remaining FS
    this.el('btn-fs-skip')?.addEventListener('click', () => {
      if (this.isFsMode) {
        this.fsSkipAnims = true;
        this.quickSpin = true; // fast-forward remaining spins
        this.showToast('Skipping animations…', 1200);
      }
    });

    // Spin
    this.el('btn-spin')?.addEventListener('click', () => {
      if (this.machine === 'IDLE') this.doSpin('manual').catch(() => {});
      // Skip-stop only fires if the setting is enabled (spec §3.13 Gameplay tab)
      else if (this.machine === 'SPINNING' && this.skipStopEnabled) this.quickStopAll();
    });
    // Dwell-click — 600 ms hover triggers spin (spec §7.7)
    this.el('btn-spin')?.addEventListener('mouseenter', () => {
      const dwellEl = this.el('set-dwell') as HTMLInputElement | null;
      if (!dwellEl?.checked) return;
      if (this.machine !== 'IDLE') return;
      const btn = this.el('btn-spin');
      btn?.classList.add('dwell-active');
      this.dwellTimer = setTimeout(() => {
        btn?.classList.remove('dwell-active');
        if (this.machine === 'IDLE') this.doSpin('manual').catch(() => {});
      }, 600);
    });
    this.el('btn-spin')?.addEventListener('mouseleave', () => {
      if (this.dwellTimer !== null) { clearTimeout(this.dwellTimer); this.dwellTimer = null; }
      this.el('btn-spin')?.classList.remove('dwell-active');
    });

    // Bet
    this.el('btn-bet-minus')?.addEventListener('click', () => {
      // Autoplay bet-lock: block bet change during autoplay if autobetLock is on (spec §3.13)
      if (this.autoplayActive && this.autobetLock) { this.showToast('Bet locked during Autoplay'); return; }
      if (this.machine !== 'IDLE' || this.isFsMode) return;
      const prev = this.betLevelIdx;
      this.betLevelIdx = Math.max(0, this.betLevelIdx - 1);
      this.setBetEl();
      if (this.betLevelIdx !== prev) this.track('bet_change', { previousBet: BET_LEVELS[prev].total, newBet: BET_LEVELS[this.betLevelIdx].total, changeType: 'decrease', currentBalance: this.balance });
    });
    this.el('btn-bet-plus')?.addEventListener('click', () => {
      if (this.autoplayActive && this.autobetLock) { this.showToast('Bet locked during Autoplay'); return; }
      if (this.machine !== 'IDLE' || this.isFsMode) return;
      const next = Math.min(BET_LEVELS.length - 1, this.betLevelIdx + 1);
      if (this.needsBetHighConfirm(next)) { this.promptBetHigh(next); return; }
      const prev = this.betLevelIdx;
      this.betLevelIdx = next;
      this.setBetEl();
      if (this.betLevelIdx !== prev) this.track('bet_change', { previousBet: BET_LEVELS[prev].total, newBet: BET_LEVELS[this.betLevelIdx].total, changeType: 'increase', currentBalance: this.balance });
    });
    this.el('btn-bet-max')?.addEventListener('click', () => {
      if (this.machine !== 'IDLE' || this.isFsMode) return;
      const next = BET_LEVELS.length - 1;
      if (this.needsBetHighConfirm(next)) { this.promptBetHigh(next); return; }
      const prev = this.betLevelIdx;
      this.betLevelIdx = next;
      this.setBetEl();
      if (this.betLevelIdx !== prev) this.track('bet_change', { previousBet: BET_LEVELS[prev].total, newBet: BET_LEVELS[this.betLevelIdx].total, changeType: 'max', currentBalance: this.balance });
    });

    // Quick spin
    this.el('btn-quick')?.addEventListener('click', () => {
      this.quickSpin = !this.quickSpin;
      this.el('btn-quick')?.classList.toggle('active', this.quickSpin);
      const qCb = this.el('set-quick') as HTMLInputElement | null;
      if (qCb) qCb.checked = this.quickSpin;
      if (this.quickSpin) this.toastQuickspinEnabled();
      else this.toastTurboToggled(false);
    });

    // Autoplay — btn-auto is never disabled so it can always stop a running session
    this.el('btn-auto')?.addEventListener('click', () => {
      if (this.autoplayActive) {
        // Stop regardless of machine state: zero the counter and deactivate.
        // The in-flight doSpin will complete, then tickAutoplay sees autoplayActive=false and exits.
        this.stopAutoplay('manually stopped');
        return;
      }
      if (this.machine !== 'IDLE' || this.isFsMode) return; // don't open config mid-spin
      this.el('autoplay-config')?.classList.remove('hidden');
      this.track('autoplay_config_opened');
    });
    this.el('auto-close')?.addEventListener('click', () => {
      this.el('autoplay-config')?.classList.add('hidden');
      this.track('autoplay_config_cancelled');
    });
    this.el('auto-start')?.addEventListener('click', () => {
      this.el('autoplay-config')?.classList.add('hidden');
      this.autoplayActive   = true;
      this.autoplayRemaining = this.autoplayCount;
      this.autoplayStartMs   = Date.now();
      this.updateAutoBtn();
      this.toastAutoplayStarted(this.autoplayCount);
      // DS AE12 — autoplay_start
      this.track('autoplay_start', {
        spinsRequested: this.autoplayCount,
        totalBet:       BET_LEVELS[this.betLevelIdx].total,
        stopConditions: {
          onFeature:     this.autoplayStopOnFeature,
          onBigWin:      this.autoplayStopOnBigWin,
          balanceBelow:  this.autoplayStopOnBalanceBelow,
          singleWinAbove: this.autoplayStopOnSingleWinAbove,
        },
      });
      this.doSpin('autoplay').catch(() => {});
    });
    document.querySelectorAll('.auto-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.auto-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.autoplayCount = Number((pill as HTMLElement).dataset.count);
      });
    });
    const stopFeat = this.el('auto-stop-feature') as HTMLInputElement | null;
    const stopBig  = this.el('auto-stop-bigwin')  as HTMLInputElement | null;
    stopFeat?.addEventListener('change', () => { this.autoplayStopOnFeature = stopFeat.checked; });
    stopBig?.addEventListener('change',  () => { this.autoplayStopOnBigWin  = stopBig.checked; });

    // Advanced stop conditions modal (MOD-AUTOPLAY-STOPCONDITIONS)
    this.el('ap-advanced-btn')?.addEventListener('click', () => {
      this.el('autoplay-stopcond-modal')?.classList.remove('hidden');
    });
    this.el('asc-save')?.addEventListener('click', () => {
      const balCb  = this.el('asc-stop-balance')  as HTMLInputElement | null;
      const balVal = this.el('asc-balance-val')    as HTMLInputElement | null;
      const winCb  = this.el('asc-stop-winabove')  as HTMLInputElement | null;
      const winVal = this.el('asc-winabove-val')   as HTMLInputElement | null;
      this.autoplayStopOnBalanceBelow   = (balCb?.checked && balVal?.value) ? parseFloat(balVal.value) : null;
      this.autoplayStopOnSingleWinAbove = (winCb?.checked && winVal?.value) ? parseFloat(winVal.value) : null;
      this.el('autoplay-stopcond-modal')?.classList.add('hidden');
      this.track('autoplay_stop_conditions_saved', {
        balanceBelow: this.autoplayStopOnBalanceBelow,
        winAbove: this.autoplayStopOnSingleWinAbove,
      });
    });
    this.el('asc-cancel')?.addEventListener('click', () => {
      this.el('autoplay-stopcond-modal')?.classList.add('hidden');
    });

    // Buy Feature panel (footer button opens the panel)
    this.el('btn-open-buy')?.addEventListener('click', () => {
      if (this.machine !== 'IDLE' || this.isFsMode || this.autoplayActive) {
        this.showToast('Buy Feature unavailable right now'); return;
      }
      this.el('buy-feature-panel')?.classList.remove('hidden');
    });
    this.el('buy-panel-close')?.addEventListener('click', () =>
      this.el('buy-feature-panel')?.classList.add('hidden')
    );

    // Buy FS
    this.el('btn-buy-fs')?.addEventListener('click', () => {
      if (this.machine !== 'IDLE') return;
      this.el('buy-feature-panel')?.classList.add('hidden');
      this.pendingBuyType = 'FS';
      this.track('buy_feature_fs_initiated');
      const cost = BET_LEVELS[this.betLevelIdx].total * BUY_FS_MULT;
      const desc  = this.el('buy-desc');  if (desc)  desc.textContent  = 'Buy 10 Free Spins';
      const price = this.el('buy-price'); if (price) price.textContent = `Cost: ${fmt(cost)} coins`;
      this.el('buy-confirm')?.classList.remove('hidden');
    });

    // Buy Wheel
    this.el('btn-buy-wheel')?.addEventListener('click', () => {
      if (this.machine !== 'IDLE') return;
      this.el('buy-feature-panel')?.classList.add('hidden');
      this.pendingBuyType = 'WHEEL';
      this.track('buy_feature_wheel_initiated');
      const cost = BET_LEVELS[this.betLevelIdx].total * BUY_WHEEL_MULT;
      const desc  = this.el('buy-desc');  if (desc)  desc.textContent  = 'Buy Wheel Feature';
      const price = this.el('buy-price'); if (price) price.textContent = `Cost: ${fmt(cost)} coins`;
      this.el('buy-confirm')?.classList.remove('hidden');
    });

    this.el('buy-close')?.addEventListener('click', () => {
      this.el('buy-confirm')?.classList.add('hidden');
      this.track('buy_feature_cancelled', { feature: this.pendingBuyType });
      this.pendingBuyType = null;
    });

    // Hold-to-confirm button
    this.wireBuyHold();

    // Sound toggle
    this.el('btn-sound')?.addEventListener('click', () => {
      const btn = this.el('btn-sound') as HTMLButtonElement | null;
      if (!btn) return;
      const muted = btn.dataset.muted === 'true';
      btn.dataset.muted = String(!muted);
      btn.textContent   = muted ? '🔊' : '🔇';
      btn.setAttribute('aria-label', muted ? 'Sound on' : 'Sound off (muted)');
      this.audio.setMuted(!muted);  // actually mute/unmute the AudioManager
      this.toastSoundToggled(muted); // muted was true → now on, and vice versa
    });

    // Fullscreen
    this.el('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });

    // Settings open/close
    this.el('btn-settings')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).setAttribute('data-modal-opener', '');
      this.openModal('settings');  // set-close wired manually below to handle dirty check
      this.track('settings_opened');
    });

    // Settings tabs (spec §3.13)
    document.querySelectorAll<HTMLElement>('.st-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.st-tab-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-selected', String(b === btn));
        });
        const panelId = btn.getAttribute('aria-controls') ?? '';
        document.querySelectorAll('.st-tab-panel').forEach(p => {
          p.classList.toggle('hidden', p.id !== panelId);
        });
      });
    });

    // Audio sliders (spec §3.13 Audio tab)
    const wireSlider = (id: string, valId: string, cb?: (v: number) => void) => {
      const el = this.el(id) as HTMLInputElement | null;
      const valEl = this.el(valId);
      el?.addEventListener('input', () => {
        if (valEl) valEl.textContent = `${el.value}%`;
        cb?.(parseInt(el.value) / 100);
      });
    };
    wireSlider('set-master', 'set-master-val');
    wireSlider('set-music',  'set-music-val',  (v) => this.audio.setMusicVol(v));
    wireSlider('set-sfx',    'set-sfx-val',    (v) => this.audio.setSfxVol(v));
    wireSlider('set-ambient','set-ambient-val');

    // Accessibility controls (spec §3.13 Accessibility tab)
    (this.el('set-reduce-motion') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => {
        document.body.classList.toggle('reduce-motion', (e.target as HTMLInputElement).checked);
      });
    (this.el('set-high-contrast') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => {
        document.body.classList.toggle('high-contrast', (e.target as HTMLInputElement).checked);
      });
    (this.el('set-colorblind') as HTMLSelectElement | null)
      ?.addEventListener('change', (e) => {
        document.body.classList.remove('colorblind-protanopia','colorblind-deuteranopia','colorblind-tritanopia');
        const v = (e.target as HTMLSelectElement).value;
        if (v) document.body.classList.add(`colorblind-${v}`);
      });
    (this.el('set-text-size') as HTMLSelectElement | null)
      ?.addEventListener('change', (e) => {
        document.body.dataset.textSize = (e.target as HTMLSelectElement).value;
      });
    (this.el('set-focus-ring') as HTMLSelectElement | null)
      ?.addEventListener('change', (e) => {
        document.documentElement.style.setProperty('--focus-ring-width', `${(e.target as HTMLSelectElement).value}px`);
      });

    // Gameplay settings (spec §3.13 Gameplay tab)
    (this.el('set-skipstop') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.skipStopEnabled = (e.target as HTMLInputElement).checked; });
    (this.el('set-spacebar') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.spacebarSpin = (e.target as HTMLInputElement).checked; });
    (this.el('set-show-net') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => {
        this.showSessionNet = (e.target as HTMLInputElement).checked;
        const netEl = this.el('session-net');
        if (netEl) netEl.style.visibility = this.showSessionNet ? '' : 'hidden';
      });
    (this.el('set-autobet-lock') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.autobetLock = (e.target as HTMLInputElement).checked; });

    // Accessibility: audio-only cues, voice announcer, SR verbose (spec §3.13)
    (this.el('set-audio-cues') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.audioCuesEnabled = (e.target as HTMLInputElement).checked; });
    (this.el('set-voice-ann') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.voiceAnnouncer = (e.target as HTMLInputElement).checked; });
    (this.el('set-sr-verbose') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => { this.srVerbose = (e.target as HTMLInputElement).checked; });

    // Limits — reality check interval (spec §3.13 Limits tab)
    (this.el('set-rg-interval') as HTMLSelectElement | null)
      ?.addEventListener('change', (e) => {
        const mins = parseInt((e.target as HTMLSelectElement).value);
        this.rcIntervalMs = mins * 60 * 1000;
        this.startRealityCheckTimer(); // restart with new interval
      });

    // Limits — session time (spec §J.4)
    (this.el('set-session-time') as HTMLSelectElement | null)
      ?.addEventListener('change', (e) => {
        const mins = parseInt((e.target as HTMLSelectElement).value);
        this.sessionTimeLimitMs = isNaN(mins) || mins === 0 ? null : mins * 60_000;
      });

    // Limits — loss / win limits (spec §J.4)
    (this.el('set-loss-limit') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        this.sessionLossLimit = isNaN(v) || v <= 0 ? null : v;
      });
    (this.el('set-win-limit') as HTMLInputElement | null)
      ?.addEventListener('change', (e) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        this.sessionWinLimit = isNaN(v) || v <= 0 ? null : v;
      });

    // MOD-REALITY buttons (spec §4.11)
    this.el('rc-continue')?.addEventListener('click', () => {
      this.el('reality-modal')?.classList.add('hidden');
      if (this.machine === 'PAUSED') this.machine = 'IDLE';
      this.rcLastTick = Date.now();
      this.track('reality_check_continued');
    });
    this.el('rc-break')?.addEventListener('click', () => {
      this.el('reality-modal')?.classList.add('hidden');
      this.track('reality_check_break');
      this.showToast('⏸ 5-minute break started. Take care!');
      // 5-min cool-down: disable spin, re-enable after 5 min
      this.setControlsEnabled(false);
      setTimeout(() => {
        if (this.machine !== 'SPINNING' && this.machine !== 'FEATURE') {
          this.machine = 'IDLE';
          this.setControlsEnabled(true);
          this.showToast('✅ Break over — welcome back!');
        }
        this.rcLastTick = Date.now();
      }, 5 * 60 * 1000);
    });
    this.el('rc-exit')?.addEventListener('click', () => {
      this.track('reality_check_closed');
      // Navigate up to lobby (operator-provided URL; fallback to parent or same)
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
      else { this.el('reality-modal')?.classList.add('hidden'); }
    });

    // Info (spec §3.11)
    this.el('btn-info')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).setAttribute('data-modal-opener', '');
      this.openModal('info-panel', 'inf-close');
    });
    this.el('inf-goto-paytable')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.el('info-panel')?.classList.add('hidden');
      this.buildPaytable();
      this.el('paytable')?.classList.remove('hidden');
    });

    // History (spec §3.12)
    this.el('btn-history')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).setAttribute('data-modal-opener', '');
      this.buildHistory();
      this.openModal('history-panel', 'hs-close');
      this.track('history_viewed', { spinCount: this.spinHistory.length });
    });
    this.el('hs-filter')?.addEventListener('change', () => this.buildHistory());
    this.el('hs-export')?.addEventListener('click', () => this.exportHistoryCsv());
    const quickCb = this.el('set-quick') as HTMLInputElement | null;
    quickCb?.addEventListener('change', () => {
      this.quickSpin = quickCb.checked;
      this.el('btn-quick')?.classList.toggle('active', this.quickSpin);
    });
    // Info search (spec inf-search §3.11)
    this.el('inf-search')?.addEventListener('input', () => {
      const q = (this.el('inf-search') as HTMLInputElement | null)?.value.toLowerCase().trim() ?? '';
      document.querySelectorAll<HTMLElement>('.inf-section').forEach(sec => {
        const text = sec.textContent?.toLowerCase() ?? '';
        sec.style.display = q === '' || text.includes(q) ? '' : 'none';
      });
    });

    // Buy Feature affordability check on panel open
    this.el('buy-panel-close')?.addEventListener('click', () => {});
    this.el('btn-open-buy')?.addEventListener('click', () => this.updateBuyAffordability(), true);

    // Paytable
    this.el('btn-paytable')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).setAttribute('data-modal-opener', '');
      this.buildPaytable();
      this.updatePaytableNav(0);
      this.openModal('paytable', 'pt-close');
    });
    document.querySelectorAll('.pt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pt-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const n = Number((tab as HTMLElement).dataset.tab);
        this.buildPaytable(n);
        this.updatePaytableNav(n);
      });
    });
    this.el('pt-page-prev')?.addEventListener('click', () => this.stepPaytableTab(-1));
    this.el('pt-page-next')?.addEventListener('click', () => this.stepPaytableTab(1));

    // Restart
    this.el('btn-restart-now')?.addEventListener('click', () => this.restartEconomy());
    this.el('btn-add-funds')?.addEventListener('click', () => {
      this.el('restart-modal')?.classList.add('hidden');
      this.showCashierRedirectModal();
    });

    // Keyboard  (spec §2 hotkey map)
    document.addEventListener('keydown', e => {
      // Ignore hotkeys while any text input is focused
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Esc — close any open modal/panel
      if (e.code === 'Escape') {
        e.preventDefault();
        const panels = ['buy-feature-panel','buy-confirm','paytable','settings','autoplay-config','restart-modal','info-panel','history-panel','reality-modal','hotkey-help-overlay'];
        for (const id of panels) {
          const el = this.el(id);
          if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); break; }
        }
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        // Respect set-spacebar setting (Space only; Enter always works)
        if (e.code === 'Space' && !this.spacebarSpin) return;
        this.el('btn-spin')?.click(); return;
      }
      if (e.code === 'ArrowUp')   { e.preventDefault(); this.el('btn-bet-plus')?.click(); return; }
      if (e.code === 'ArrowDown') { e.preventDefault(); this.el('btn-bet-minus')?.click(); return; }
      if (e.code === 'KeyT')  this.el('btn-quick')?.click();
      if (e.code === 'KeyQ')  this.el('btn-quick')?.click();
      if (e.code === 'KeyA')  this.el('btn-auto')?.click();
      if (e.code === 'KeyP')  this.el('btn-paytable')?.click();
      if (e.code === 'KeyI')  this.el('btn-info')?.click();
      if (e.code === 'KeyH')  this.el('btn-history')?.click();
      if (e.code === 'KeyM')  this.el('btn-sound')?.click();
      if (e.code === 'KeyS')  this.toggleSpinSound();
      if (e.code === 'KeyB')  this.el('btn-open-buy')?.click();
      if (e.code === 'KeyF')  this.el('btn-fullscreen')?.click();
      // Accessibility focus jumps (spec §2)
      if (e.code === 'Digit1') { e.preventDefault(); (this.el('btn-bet-minus')  as HTMLElement | null)?.focus(); }
      if (e.code === 'Digit2') { e.preventDefault(); (this.el('game-canvas')    as HTMLElement | null)?.focus(); }
      if (e.code === 'Digit3') { e.preventDefault(); (this.el('btn-spin')       as HTMLElement | null)?.focus(); }
      // ? key — TIP-HELP-MENU (spec §6 — hotkey reference panel)
      if (e.key === '?') { e.preventDefault(); this.toggleHotkeyHelp(); }
    });

    // Session-time chip → open reality check (spec §J.3)
    this.el('session-time-chip')?.addEventListener('click', () => this.showRealityCheck());

    // Hotkey help overlay close button (spec §6 TIP-HELP-MENU)
    this.el('hk-close')?.addEventListener('click', () => {
      this.el('hotkey-help-overlay')?.classList.add('hidden');
    });

    // OVL-IDLE-REMINDER dismiss (spec §7)
    this.el('btn-idle-dismiss')?.addEventListener('click', () => {
      this.el('idle-overlay')?.classList.add('hidden');
      this.resetIdleTimer();
    });

    // OVL-RECONNECT retry (spec §7 / §9.4)
    this.el('btn-reconnect-retry')?.addEventListener('click', () => {
      const msg = this.el('reconnect-msg');
      if (msg) msg.textContent = 'Retrying…';
      this.api.init(this.betLevelIdx)
        .then(d => {
          this.balance = d.balance;
          this.updateHUD();
          this.hideReconnectOverlay();
          this.toastConnectionRestored();
        })
        .catch(() => {
          if (msg) msg.textContent = 'Still unable to connect. Please check your internet connection.';
        });
    });

    // Tab-visibility mute (spec §9.4 — mute audio when app backgrounded)
    document.addEventListener('visibilitychange', () => {
      const muteOnBg = (this.el('set-mute') as HTMLInputElement | null)?.checked ?? true;
      if (document.hidden) {
        if (muteOnBg) this.audio.setMuted(true);
      } else {
        // Only restore if the user hasn't manually muted via the sound button
        const userMuted = (this.el('btn-sound') as HTMLButtonElement | null)?.dataset.muted === 'true';
        if (!userMuted) this.audio.setMuted(false);
      }
    });

    // Settings — track changes; show Save button; MOD-SETTINGS-UNSAVED on close with unsaved
    document.getElementById('settings')?.addEventListener('change', () => {
      this.settingsDirty = true;
      this.el('st-save')?.classList.remove('hidden');
    }, true);
    this.el('st-save')?.addEventListener('click', () => {
      this.saveSettings();
      this.settingsDirty = false;
      this.el('st-save')?.classList.add('hidden');
      this.track('settings_change', { setting: 'all', previousValue: null, newValue: 'saved' });
    });
    this.el('st-reset')?.addEventListener('click', () => { this.resetSettingsToDefaults(); this.settingsDirty = false; });

    // Intercept set-close: show MOD-SETTINGS-UNSAVED if dirty
    this.el('set-close')?.addEventListener('click', () => {
      if (this.settingsDirty) {
        this.el('settings-unsaved-modal')?.classList.remove('hidden');
        this.track('settings_unsaved_prompt');
        return;
      }
      this.el('settings')?.classList.add('hidden');
    });
    this.el('su-save')?.addEventListener('click', () => {
      this.saveSettings();
      this.settingsDirty = false;
      this.el('st-save')?.classList.add('hidden');
      this.el('settings-unsaved-modal')?.classList.add('hidden');
      this.el('settings')?.classList.add('hidden');
      this.track('settings_change', { setting: 'all', previousValue: null, newValue: 'saved' });
    });
    this.el('su-discard')?.addEventListener('click', () => {
      this.loadSettings();
      this.settingsDirty = false;
      this.el('st-save')?.classList.add('hidden');
      this.el('settings-unsaved-modal')?.classList.add('hidden');
      this.el('settings')?.classList.add('hidden');
    });
    this.el('su-cancel')?.addEventListener('click', () => {
      this.el('settings-unsaved-modal')?.classList.add('hidden');
    });
    this.el('st-reset')?.addEventListener('click', () => this.resetSettingsToDefaults());

    // RG self-exclude buttons (spec §3.14)
    this.el('rg-selfexclude-24h')?.addEventListener('click', () => {
      this.track('self_exclusion_requested', { type: '24h' });
      this.showToast('⏸ 24-hour break started. See you tomorrow!', 3000, true);
      this.el('settings')?.classList.add('hidden');
    });
    this.el('rg-selfexclude-30d')?.addEventListener('click', () => {
      this.track('self_exclusion_requested', { type: '30d' });
      window.open('https://www.begambleaware.org', '_blank', 'noopener');
    });
    this.el('rg-selfexclude-perm')?.addEventListener('click', () => {
      this.track('self_exclusion_requested', { type: 'permanent' });
      window.open('https://www.begambleaware.org', '_blank', 'noopener');
    });
    this.el('rg-deposit-limit')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showCashierRedirectModal();
    });

    // Language change (spec MOD-LANG-CHANGE §4)
    let pendingLang = localStorage.getItem('huff-puff-locale') ?? 'en-US';
    this.el('set-lang')?.addEventListener('change', (e) => {
      const sel = e.currentTarget as HTMLSelectElement;
      pendingLang = sel.value;
      const m = this.el('lang-change-modal');
      if (m) { m.classList.remove('hidden'); (m.querySelector('#lc-reload') as HTMLElement | null)?.focus(); }
      this.track('lang_change_confirm', { locale: pendingLang });
    });
    this.el('lc-reload')?.addEventListener('click', () => {
      localStorage.setItem('huff-puff-locale', pendingLang);
      location.reload();
    }, { once: true });
    this.el('lc-cancel')?.addEventListener('click', () => {
      this.el('lang-change-modal')?.classList.add('hidden');
      const sel = this.el('set-lang') as HTMLSelectElement | null;
      if (sel) sel.value = localStorage.getItem('huff-puff-locale') ?? 'en-US';
    });

    // MOD-SERVER-ERROR buttons
    this.el('se-retry')?.addEventListener('click', () => {
      this.el('server-error-modal')?.classList.add('hidden');
      if (this.machine === 'PAUSED') { this.machine = 'IDLE'; this.setControlsEnabled(true); this.setSpinLabel('SPIN'); }
    });
    this.el('se-exit')?.addEventListener('click', () => {
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
      else this.el('server-error-modal')?.classList.add('hidden');
    });

    // MOD-RECONNECT-FAILED buttons
    this.el('rf-retry')?.addEventListener('click', () => {
      this.el('reconnect-failed-modal')?.classList.add('hidden');
      this.showReconnectOverlay('Retrying connection…');
      const msg = this.el('reconnect-msg');
      this.api.init(this.betLevelIdx)
        .then(d => { this.balance = d.balance; this.updateHUD(); this.hideReconnectOverlay(); this.toastConnectionRestored(); })
        .catch(() => { this.hideReconnectOverlay(); this.showServerErrorModal(); if (msg) msg.textContent = 'Still unable to connect.'; });
    });
    this.el('rf-exit')?.addEventListener('click', () => {
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
      else this.el('reconnect-failed-modal')?.classList.add('hidden');
    });

    // MOD-BET-HIGH buttons
    this.el('bh-confirm')?.addEventListener('click', () => {
      this.el('bet-high-modal')?.classList.add('hidden');
      if (this.pendingBetLevelIdx !== null) {
        this.track('bet_high_confirm_confirmed', { newBet: BET_LEVELS[this.pendingBetLevelIdx].total });
        const prevBet = BET_LEVELS[this.betLevelIdx].total;
        this.betLevelIdx = this.pendingBetLevelIdx;
        this.pendingBetLevelIdx = null;
        this.setBetEl();
        this.track('bet_change', { previousBet: prevBet, newBet: BET_LEVELS[this.betLevelIdx].total, changeType: 'high_confirm', currentBalance: this.balance });
      }
    });
    this.el('bh-cancel')?.addEventListener('click', () => {
      this.el('bet-high-modal')?.classList.add('hidden');
      this.track('bet_high_confirm_cancelled');
      this.pendingBetLevelIdx = null;
    });

    // MOD-CONFIRM-EXIT-FEATURE buttons
    this.el('ef-exit')?.addEventListener('click', () => {
      this.el('exit-feature-modal')?.classList.add('hidden');
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
    });
    this.el('ef-stay')?.addEventListener('click', () => {
      this.el('exit-feature-modal')?.classList.add('hidden');
    });

    // MOD-MAINTENANCE close
    this.el('mt-close')?.addEventListener('click', () => this.el('maintenance-modal')?.classList.add('hidden'));

    // MOD-RG-LIMIT-HIT exit
    this.el('rl-exit')?.addEventListener('click', () => {
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
      else window.location.reload();
    });

    // SCR-SESSION-EXPIRED buttons
    this.el('sx-resume')?.addEventListener('click', () => {
      this.el('session-expired-overlay')?.classList.add('hidden');
      this.api.init(this.betLevelIdx)
        .then(d => { this.balance = d.balance; this.updateHUD(); })
        .catch(() => this.showServerErrorModal());
    });
    this.el('sx-exit')?.addEventListener('click', () => {
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
      else window.location.reload();
    });

    // Home button: intercept during FS or Wheel feature (spec §4 MOD-CONFIRM-EXIT-FEATURE)
    this.el('btn-home')?.addEventListener('click', () => {
      if (this.machine === 'FEATURE' || this.isFsMode) {
        this.el('exit-feature-modal')?.classList.remove('hidden');
        this.track('exit_feature_confirm_shown');
        return;
      }
      // During autoplay, confirm before exiting (MOD-CONFIRM-EXIT-GAME)
      if (this.autoplayActive) {
        const m = this.el('confirm-exit-game-modal');
        if (m) {
          m.classList.remove('hidden');
          this.track('exit_game_confirm_shown');
          return;
        }
      }
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
    });

    // MOD-CONFIRM-EXIT-GAME button handlers
    this.el('ceg-stop-exit')?.addEventListener('click', () => {
      this.el('confirm-exit-game-modal')?.classList.add('hidden');
      this.stopAutoplay('exit game');
      const lobby = (window as Window & { LOBBY_URL?: string }).LOBBY_URL;
      if (lobby) window.location.href = lobby;
    });
    this.el('ceg-continue')?.addEventListener('click', () => {
      this.el('confirm-exit-game-modal')?.classList.add('hidden');
    });
  }

  private quickStopAll(): void {
    // Resolve the breakable spin-wait sleep so the code skips past Promise.all immediately
    this.quickStopTriggered = true;
    this.quickStopResolve?.();
    this.quickStopResolve = null;
    for (let i = 0; i < 5; i++) this.renderer.stopReel(i);
  }

  /* ── Hold-to-confirm logic ─────────────────────── */
  private wireBuyHold(): void {
    const holdBtn = this.el('buy-hold');
    if (!holdBtn) return;

    let holdStart = 0;
    let rafId = 0;
    const HOLD_DUR = 1200;

    const tick = (): void => {
      const pct = Math.min(1, (Date.now() - holdStart) / HOLD_DUR);
      const ring = holdBtn.querySelector('.hold-ring') as HTMLElement | null;
      if (ring) ring.style.background =
        `conic-gradient(#E3A02C ${Math.floor(pct * 360)}deg, rgba(255,255,255,.1) 0deg)`;
      if (pct < 1) { rafId = requestAnimationFrame(tick); return; }

      // Confirmed
      cancelAnimationFrame(rafId);
      this.el('buy-confirm')?.classList.add('hidden');
      if (ring) ring.style.background = '';
      const type = this.pendingBuyType;
      this.pendingBuyType = null;
      if (type) {
        // DS AE08 — buy_feature
        const buyCost = type === 'FS'
          ? BET_LEVELS[this.betLevelIdx].total * BUY_FS_MULT
          : BET_LEVELS[this.betLevelIdx].total * BUY_WHEEL_MULT;
        this.track('buy_feature', { featureType: type, cost: buyCost, balanceBefore: this.balance, balanceAfter: this.balance - buyCost });
        // DS AE05 — feature_trigger (buy source)
        this.track('feature_trigger', { featureType: type, triggerSource: 'buy', scatterCount: 0, buyCost });
        this.doBuyFeature(type);
      }
    };

    holdBtn.addEventListener('pointerdown', () => {
      holdStart = Date.now();
      rafId = requestAnimationFrame(tick);
    });
    holdBtn.addEventListener('pointerup',    () => { cancelAnimationFrame(rafId); const ring = holdBtn.querySelector('.hold-ring') as HTMLElement | null; if (ring) ring.style.background = ''; });
    holdBtn.addEventListener('pointerleave', () => { cancelAnimationFrame(rafId); const ring = holdBtn.querySelector('.hold-ring') as HTMLElement | null; if (ring) ring.style.background = ''; });
  }

  private doBuyFeature(type: 'FS' | 'WHEEL'): void {
    this.doSpin(type === 'FS' ? 'buy_fs' : 'buy_wheel').catch(() => {});
  }

  /* ── Restart economy ───────────────────────────── */
  private restartEconomy(): void {
    // GDD §19.1 #10 — economy_restart (capture metrics BEFORE resetting counters)
    this.restartCount++;
    this.track('economy_restart', {
      restartNumber:        this.restartCount,
      spinsPlayed:          this.spinCount,
      totalWagered:         this.rcTotalSpent,
      totalWon:             this.rcTotalWon,
      timeSinceLastRestart: Math.round((Date.now() - this.sessionStartTime) / 1000),
    });
    this.balance       = STARTING_BALANCE;
    this.sessionStart  = STARTING_BALANCE;
    this.spinCount     = 0;
    this.lastWin       = 0;
    this.rcTotalSpent  = 0;
    this.rcTotalWon    = 0;
    this.sessionStartTime = Date.now();
    this.rcLastTick    = Date.now();
    this.spinHistory   = [];
    this.updateHUD();
    this.el('restart-modal')?.classList.add('hidden');
    this.el('settings')?.classList.add('hidden');
    this.showToast('Economy restarted!');
    // Reset balance on the current session (preserves session ID + analytics continuity)
    this.api.restart().then(d => { this.balance = d.balance; this.updateHUD(); }).catch(() => {});
  }

  /* ── Reality check timer (spec §4.11) ─────────── */
  private startRealityCheckTimer(): void {
    if (this.rcTimer) clearInterval(this.rcTimer);
    this.rcLastTick = Date.now();
    this.rcTimer = setInterval(() => {
      if (Date.now() - this.rcLastTick >= this.rcIntervalMs) {
        this.showRealityCheck();
        this.rcLastTick = Date.now();
      }
    }, 30_000); // poll every 30s
  }

  /* ── Focus trap (spec §7.8 WCAG A11y) ─────────── */
  /**
   * Traps keyboard focus within `container` while it's visible.
   * Returns a cleanup function; call it when the modal closes.
   */
  private trapFocus(container: HTMLElement): () => void {
    const sel = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled])',
      'select:not([disabled])', 'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>(sel));

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };

    // Focus first focusable element in modal
    const focusable = getFocusable();
    if (focusable.length > 0) focusable[0].focus();

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }

  /**
   * Open a modal by ID, trap focus inside it, and auto-release trap on close.
   * The trap is released when the modal gains the 'hidden' class or when
   * the close button (matching `closeId`) is clicked.
   */
  private openModal(modalId: string, closeId?: string): void {
    const modal = this.el(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    const release = this.trapFocus(modal);

    const cleanup = () => {
      modal.classList.add('hidden');
      release();
      // Restore focus to previously focused element
      (document.querySelector('[data-modal-opener]') as HTMLElement | null)?.focus();
    };

    if (closeId) {
      this.el(closeId)?.addEventListener('click', cleanup, { once: true });
    }
    // MutationObserver: release when hidden class added externally
    const obs = new MutationObserver(() => {
      if (modal.classList.contains('hidden')) { release(); obs.disconnect(); }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  private showRealityCheck(): void {
    // only fire between spins
    if (this.machine !== 'IDLE') return;
    const elapsedMin = Math.round((Date.now() - this.sessionStartTime) / 60_000);
    const timeEl  = this.el('rc-time-val');
    const spentEl = this.el('rc-spent');
    const wonEl   = this.el('rc-won');
    const netEl   = this.el('rc-net');
    if (timeEl)  timeEl.textContent  = `${elapsedMin} minute${elapsedMin !== 1 ? 's' : ''}`;
    if (spentEl) spentEl.textContent = fmt(this.rcTotalSpent);
    if (wonEl)   wonEl.textContent   = fmt(this.rcTotalWon);
    if (netEl) {
      const net = this.rcTotalWon - this.rcTotalSpent;
      netEl.textContent = (net >= 0 ? '+' : '') + fmt(Math.abs(net));
      netEl.style.color = net >= 0 ? 'var(--c-success)' : 'var(--c-error)';
    }
    this.el('reality-modal')?.classList.remove('hidden');
    this.track('reality_check_shown', { elapsedMin, net: this.rcTotalWon - this.rcTotalSpent });
  }

  /* ── Info builder (spec §3.11) ────────────────────
   * The content is static HTML in index.html (accordion);
   * this method exists for future dynamic content injection.
   */
  // private buildInfo(): void {} // static HTML handled in index.html

  /* ── History builder (spec §3.12) ───────────────── */
  private buildHistory(): void {
    const list = this.el('hs-list');
    const summary = this.el('hs-summary');
    const filter  = (this.el('hs-filter') as HTMLSelectElement | null)?.value ?? 'all';
    if (!list) return;

    // Apply filter
    let records = this.spinHistory;
    if (filter === 'wins')    records = records.filter(r => r.win > 0 && !r.feature);
    if (filter === 'features') records = records.filter(r => r.feature !== '');
    if (filter === 'losses')  records = records.filter(r => r.win === 0);

    if (summary) {
      const total = this.spinHistory.length;
      const wins  = this.spinHistory.filter(r => r.win > 0).length;
      summary.textContent = total > 0 ? `${total} spins · ${wins} wins` : '';
    }

    if (records.length === 0) {
      list.innerHTML = `<div class="hs-empty">${
        this.spinHistory.length === 0
          ? 'No spins yet — start playing! 🎰'
          : 'No spins match the filter.'
      }</div>`;
      return;
    }

    list.innerHTML = records.map(r => {
      const hhmm = r.ts.toTimeString().slice(0, 5);
      const isWin = r.win > 0;
      const net   = r.win - r.bet;
      const badgeCls  = r.feature ? 'hs-badge-feature' : isWin ? 'hs-badge-win' : 'hs-badge-loss';
      const badgeTxt  = r.feature || (isWin ? 'WIN' : '—');
      const winCls    = isWin ? 'hs-win-pos' : 'hs-win-neg';
      const netCls    = net >= 0 ? 'hs-net-pos' : 'hs-net-neg';
      const netTxt    = (net >= 0 ? '+' : '') + fmt(net);
      return `
        <div class="hs-row" role="listitem" data-spin-idx="${r.idx}" tabindex="0" aria-label="Spin ${r.idx}: bet ${fmt(r.bet)}, win ${fmt(r.win)}">
          <div class="hs-row-head">
            <span class="hs-row-num">#${String(r.idx).padStart(4,'0')}</span>
            <span class="hs-row-time">${hhmm}</span>
            <span class="hs-row-bet">Bet ${fmt(r.bet)}</span>
            <span class="hs-row-badge ${badgeCls}">${badgeTxt}</span>
          </div>
          <div class="hs-row-detail">
            <span class="hs-win-val ${winCls}">Win ${fmt(r.win)}</span>
            <span class="hs-net-val ${netCls}">${netTxt}</span>
            ${r.feature ? `<span class="hs-feat-tag">★ ${r.feature}</span>` : ''}
          </div>
          <div class="hs-row-expand">
            <span class="hs-expand-date">${r.ts.toLocaleDateString()}</span>
            ${r.feature ? `<span class="hs-expand-feature">Feature: ${r.feature}</span>` : ''}
            <button class="hs-copy-id btn-ghost" data-spin-id="${r.idx}" aria-label="Copy spin ID ${r.idx}" title="Copy spin ID">⧉ Copy ID</button>
          </div>
        </div>`;
    }).join('');

    // tap-to-expand rows (spec hs-row-expand §3.12)
    list.querySelectorAll<HTMLElement>('.hs-row').forEach(row => {
      const toggle = (): void => {
        const expanded = row.classList.toggle('expanded');
        row.setAttribute('aria-expanded', String(expanded));
        const idx = Number(row.dataset['spinIdx']);
        if (expanded) this.track('history_row_expanded', { spinIdx: idx });
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    // Copy spin ID buttons (spec TST-COPIED §5)
    list.querySelectorAll<HTMLElement>('.hs-copy-id').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();  // don't toggle expand
        const id = btn.dataset['spinId'] ?? '';
        navigator.clipboard?.writeText(`spin-${id}`).then(() => this.toastCopied()).catch(() => {});
      });
    });
  }

  /* ── History CSV export (spec hs-export §3.12) ───────── */
  private exportHistoryCsv(): void {
    if (this.spinHistory.length === 0) return;
    const header = 'Spin #,Date,Time,Bet,Win,Net,Feature\n';
    const rows = this.spinHistory.map(r => {
      const net = r.win - r.bet;
      const netStr = net >= 0 ? '+' + net : String(net);
      return [r.idx, r.ts.toLocaleDateString(), r.ts.toTimeString().slice(0, 5),
              r.bet, r.win, netStr, r.feature || ''].join(',');
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'huff-puff-history-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.track('history_exported', { rows: this.spinHistory.length });
  }

  /* ── Paytable page navigation (spec pt-page-prev/next §3.10) ─ */
  private readonly PT_TAB_COUNT = 6;
  private currentPtTab = 0;

  private updatePaytableNav(tab: number): void {
    this.currentPtTab = tab;
    const prev = this.el('pt-page-prev') as HTMLButtonElement | null;
    const next = this.el('pt-page-next') as HTMLButtonElement | null;
    if (prev) prev.disabled = tab === 0;
    if (next) next.disabled = tab === this.PT_TAB_COUNT - 1;
    const indicator = this.el('pt-page-indicator');
    if (indicator) {
      indicator.innerHTML = Array.from({ length: this.PT_TAB_COUNT }, (_, i) =>
        '<span class="pt-page-dot' + (i === tab ? ' active' : '') + '" aria-hidden="true"></span>'
      ).join('');
    }
    const betRef = this.el('pt-bet-reference') as HTMLElement | null;
    if (betRef) {
      betRef.textContent = tab === 0
        ? 'Values shown at current bet: ' + fmt(BET_LEVELS[this.betLevelIdx].total) + ' coins'
        : '';
    }
  }

  private stepPaytableTab(delta: number): void {
    const next = Math.max(0, Math.min(this.PT_TAB_COUNT - 1, this.currentPtTab + delta));
    if (next === this.currentPtTab) return;
    document.querySelectorAll('.pt-tab').forEach((t, i) => {
      t.classList.toggle('active', i === next);
      t.setAttribute('aria-selected', String(i === next));
    });
    this.buildPaytable(next);
    this.updatePaytableNav(next);
  }

  /* ── Buy Feature affordability (spec bf-fs-unaffordable §3.9) ─ */
  private updateBuyAffordability(): void {
    const bet       = BET_LEVELS[this.betLevelIdx].total;
    const fsCost    = bet * BUY_FS_MULT;
    const wheelCost = bet * BUY_WHEEL_MULT;
    const fsUnaff   = this.el('bf-fs-unaffordable');
    const whUnaff   = this.el('bf-wheel-unaffordable');
    const fsBuy     = this.el('btn-buy-fs') as HTMLButtonElement | null;
    const whBuy     = this.el('btn-buy-wheel') as HTMLButtonElement | null;
    if (fsUnaff && fsBuy) {
      const cant = this.balance < fsCost;
      fsUnaff.classList.toggle('hidden', !cant);
      fsBuy.disabled = cant;
    }
    if (whUnaff && whBuy) {
      const cant = this.balance < wheelCost;
      whUnaff.classList.toggle('hidden', !cant);
      whBuy.disabled = cant;
    }
  }

  /* ── Reset settings to defaults (spec st-reset §3.13) ──── */
  private resetSettingsToDefaults(): void {
    localStorage.removeItem(this.SETTINGS_KEY);
    const setRange = (id: string, val: number, valId: string): void => {
      const el = this.el(id) as HTMLInputElement | null;
      if (el) el.value = String(val);
      const ve = this.el(valId);
      if (ve) ve.textContent = val + '%';
    };
    const setCheck  = (id: string, val: boolean): void => { const el = this.el(id) as HTMLInputElement  | null; if (el) el.checked = val; };
    const setSelect = (id: string, val: string):  void => { const el = this.el(id) as HTMLSelectElement | null; if (el) el.value   = val; };
    setRange('set-master',  100, 'set-master-val');
    setRange('set-music',    80, 'set-music-val');
    setRange('set-sfx',      90, 'set-sfx-val');
    setRange('set-ambient',  60, 'set-ambient-val');
    setCheck('set-mute', true);
    setCheck('set-quick', false);
    setCheck('set-quickspin', false);
    setCheck('set-reduce-motion', false);
    setCheck('set-high-contrast', false);
    setCheck('set-dwell', false);
    setCheck('set-sr-verbose', false);
    setCheck('set-audio-cues', false);
    setSelect('set-colorblind', '');
    setSelect('set-text-size', 'medium');
    setSelect('set-focus-ring', '2');
    setSelect('set-rg-interval', '60');
    document.body.classList.remove('reduce-motion', 'high-contrast');
    this.quickSpin = false;
    this.el('btn-quick')?.classList.remove('active');
    // Gameplay extras defaults (spec §3.13)
    setCheck('set-skipstop', true);
    setCheck('set-spacebar', true);
    setCheck('set-show-net', true);
    setCheck('set-autobet-lock', true);
    setCheck('set-voice-ann', false);
    setCheck('set-audio-cues', false);
    setCheck('set-sr-verbose', false);
    this.skipStopEnabled = true;
    this.spacebarSpin = true;
    this.showSessionNet = true;
    this.autobetLock = true;
    this.voiceAnnouncer = false;
    this.audioCuesEnabled = false;
    this.srVerbose = false;
    const netResetEl = this.el('session-net'); if (netResetEl) netResetEl.style.visibility = '';
    this.el('st-save')?.classList.add('hidden');
    this.track('settings_reset');
    this.showToast('Settings reset to defaults.', 2000);
  }


  /* ── OVL-RECONNECT with 60s auto-transition to MOD-RECONNECT-FAILED (spec §4.12) ── */
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private showReconnectOverlay(msg = 'Connection lost. Please wait.'): void {
    const ovl = this.el('reconnect-overlay');
    if (!ovl || !ovl.classList.contains('hidden')) return; // already shown
    const msgEl = this.el('reconnect-msg');
    if (msgEl) msgEl.textContent = msg;
    ovl.classList.remove('hidden');
    // Spec §4.12: after 60s without reconnect → MOD-RECONNECT-FAILED
    if (this.reconnectTimeoutId !== null) clearTimeout(this.reconnectTimeoutId);
    this.reconnectTimeoutId = setTimeout(() => {
      if (!ovl.classList.contains('hidden')) {
        ovl.classList.add('hidden');
        this.el('reconnect-failed-modal')?.classList.remove('hidden');
        this.track('reconnect_failed');
        this.track('error', { errorType: 'server', errorCode: 'ERR-NETWORK-003' });
      }
    }, 60_000);
  }

  private hideReconnectOverlay(): void {
    if (this.reconnectTimeoutId !== null) { clearTimeout(this.reconnectTimeoutId); this.reconnectTimeoutId = null; }
    this.el('reconnect-overlay')?.classList.add('hidden');
  }

  /* ── TST-COIN-MILESTONE (spec §5) ───────────── */
  private checkCoinMilestone(): void {
    const milestones = [50, 100, 200, 500, 1000, 2000, 5000];
    const next = milestones.find(m => m > this.lastMilestoneWon && this.rcTotalWon >= m);
    if (next !== undefined) {
      this.lastMilestoneWon = next;
      this.toastCoinMilestone(next);
      this.track('session_milestone', { amount: next });
    }
  }

  /* ── Settings persistence (spec Part D/E) ───────────────── */

  /* ── Server error modal (spec §8 ERR-SERVER-500) ────────── */
  private showServerErrorModal(code = ''): void {
    const modal = this.el('server-error-modal');
    if (!modal) return;
    const codeEl = this.el('se-code');
    if (codeEl) codeEl.textContent = code ? `Error code: ${code}` : '';
    modal.classList.remove('hidden');
    this.machine = 'PAUSED';
    this.setControlsEnabled(false);
  }

  /* ── Modal for 503 maintenance (spec §8 ERR-SERVER-503) ─── */
  private showMaintenanceModal(eta = ''): void {
    const modal = this.el('maintenance-modal');
    if (!modal) return;
    const etaEl = this.el('mt-eta');
    if (etaEl) etaEl.textContent = eta ? `Expected back: ${eta}` : '';
    modal.classList.remove('hidden');
    this.machine = 'PAUSED';
    this.setControlsEnabled(false);
  }

  /* ── RG limit hit (spec §8 ERR-RG-001) ──────────────────── */
  private showRgLimitModal(msg: string, limitType = 'unknown'): void {
    const modal = this.el('rg-limit-modal');
    if (!modal) return;
    const msgEl = this.el('rl-msg');
    if (msgEl) msgEl.textContent = msg;
    modal.classList.remove('hidden');
    this.stopAutoplay('rg limit');
    this.machine = 'PAUSED';
    this.setControlsEnabled(false);
    this.track('rg_limit_hit', { limit_type: limitType });
    this.track('error', { errorType: 'server', errorCode: 'ERR-RG-001', type: limitType });
  }

  /* ── High-bet confirmation helpers (spec MOD-BET-HIGH) ───── */
  private needsBetHighConfirm(newIdx: number): boolean {
    const confirmCb = this.el('set-confirm-bigbet') as HTMLInputElement | null;
    if (!confirmCb?.checked) return false;
    // Threshold: 5 × minimum bet (approximately "high" relative to default)
    const minBet = BET_LEVELS[0].total;
    return BET_LEVELS[newIdx].total >= minBet * 5;
  }

  private promptBetHigh(newIdx: number): void {
    this.pendingBetLevelIdx = newIdx;
    const amtEl = this.el('bh-amount');
    if (amtEl) amtEl.textContent = fmt(BET_LEVELS[newIdx].total) + ' coins';
    this.el('bet-high-modal')?.classList.remove('hidden');
    this.track('bet_high_confirm_shown', { bet: BET_LEVELS[newIdx].total });
  }

  /* ── RG enforcement helpers (spec §J.4) ──────────────────── */
  private checkRgLimits(): boolean {
    // Session time limit
    if (this.sessionTimeLimitMs != null) {
      const elapsed = Date.now() - this.sessionStartTime;
      if (elapsed >= this.sessionTimeLimitMs) {
        this.showRgLimitModal('You\'ve reached your session time limit. Your session will now end.', 'session_time');
        return false;
      }
    }
    // Session loss limit
    if (this.sessionLossLimit != null && this.rcTotalSpent - this.rcTotalWon >= this.sessionLossLimit) {
      this.showRgLimitModal('You\'ve reached your session loss limit. Your session will now end.', 'session_loss');
      return false;
    }
    // Session win limit
    if (this.sessionWinLimit != null && this.rcTotalWon >= this.sessionWinLimit) {
      this.showRgLimitModal('You\'ve reached your session win limit. Congratulations — your session ends here.', 'session_win');
      return false;
    }
    return true;
  }  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(this.SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;

      // Helper appliers
      const setRange = (id: string, valId: string, key: string) => {
        const el = this.el(id) as HTMLInputElement | null;
        if (!el || s[key] == null) return;
        el.value = String(s[key]);
        const valEl = this.el(valId);
        if (valEl) valEl.textContent = `${s[key]}%`;
      };
      const setCheck = (id: string, key: string) => {
        const el = this.el(id) as HTMLInputElement | null;
        if (!el || s[key] == null) return;
        el.checked = Boolean(s[key]);
      };
      const setSelect = (id: string, key: string) => {
        const el = this.el(id) as HTMLSelectElement | null;
        if (!el || s[key] == null) return;
        el.value = String(s[key]);
      };

      // Audio
      setRange('set-master', 'set-master-val', 'master');
      setRange('set-music',  'set-music-val',  'music');
      setRange('set-sfx',    'set-sfx-val',    'sfx');
      setRange('set-ambient','set-ambient-val','ambient');
      setCheck('set-mute', 'mute');

      // Gameplay
      setCheck('set-quick', 'quick');
      setCheck('set-quickspin', 'quickspin');
      if (s['quick'] != null) {
        this.quickSpin = Boolean(s['quick']);
        this.el('btn-quick')?.classList.toggle('active', this.quickSpin);
      }

      // Accessibility
      setCheck('set-reduce-motion', 'reduceMotion');
      if (s['reduceMotion']) document.body.classList.add('reduce-motion');
      setCheck('set-high-contrast', 'highContrast');
      if (s['highContrast']) document.body.classList.add('high-contrast');
      setSelect('set-colorblind', 'colorblind');
      if (s['colorblind']) document.body.classList.add(`colorblind-${s['colorblind']}`);
      setSelect('set-text-size', 'textSize');
      if (s['textSize']) document.body.dataset.textSize = String(s['textSize']);
      setSelect('set-focus-ring', 'focusRing');
      if (s['focusRing']) document.documentElement.style.setProperty('--focus-ring-width', `${s['focusRing']}px`);

      // Limits
      setSelect('set-rg-interval', 'rgInterval');
      if (s['rgInterval'] != null) {
        this.rcIntervalMs = Number(s['rgInterval']) * 60_000;
        this.startRealityCheckTimer();
      }
      const lossEl = this.el('set-loss-limit') as HTMLInputElement | null;
      if (lossEl && s['lossLimit'] != null) {
        lossEl.value = String(s['lossLimit']);
        const v = parseFloat(String(s['lossLimit']));
        this.sessionLossLimit = isNaN(v) || v <= 0 ? null : v;
      }
      const winEl = this.el('set-win-limit') as HTMLInputElement | null;
      if (winEl && s['winLimit'] != null) {
        winEl.value = String(s['winLimit']);
        const v = parseFloat(String(s['winLimit']));
        this.sessionWinLimit = isNaN(v) || v <= 0 ? null : v;
      }
      setSelect('set-session-time', 'sessionTime');
      if (s['sessionTime'] != null) {
        const mins = parseInt(String(s['sessionTime']));
        this.sessionTimeLimitMs = isNaN(mins) || mins === 0 ? null : mins * 60_000;
      }

      // Gameplay extras (spec §3.13)
      setCheck('set-skipstop', 'skipStop');
      this.skipStopEnabled = s['skipStop'] !== false;
      setCheck('set-spacebar', 'spacebarSpin');
      this.spacebarSpin = s['spacebarSpin'] !== false;
      setCheck('set-show-net', 'showNet');
      this.showSessionNet = s['showNet'] !== false;
      if (!this.showSessionNet) { const n = this.el('session-net'); if (n) n.style.visibility = 'hidden'; }
      setCheck('set-autobet-lock', 'autobetLock');
      this.autobetLock = s['autobetLock'] !== false;
      // Accessibility extras
      setCheck('set-voice-ann', 'voiceAnn');
      this.voiceAnnouncer = !!s['voiceAnn'];
      setCheck('set-audio-cues', 'audioCues');
      this.audioCuesEnabled = !!s['audioCues'];
      setCheck('set-sr-verbose', 'srVerbose');
      this.srVerbose = !!s['srVerbose'];
      setCheck('set-dwell', 'dwell');
    } catch { /* ignore corrupt storage */ }
  }

  private saveSettings(): void {
    try {
      const get = (id: string) => this.el(id) as (HTMLInputElement | HTMLSelectElement) | null;
      const settings = {
        master:       (get('set-master') as HTMLInputElement | null)?.value,
        music:        (get('set-music')  as HTMLInputElement | null)?.value,
        sfx:          (get('set-sfx')    as HTMLInputElement | null)?.value,
        ambient:      (get('set-ambient')as HTMLInputElement | null)?.value,
        mute:         (get('set-mute')   as HTMLInputElement | null)?.checked,
        quick:        (get('set-quick')  as HTMLInputElement | null)?.checked,
        quickspin:    (get('set-quickspin') as HTMLInputElement | null)?.checked,
        reduceMotion: (get('set-reduce-motion') as HTMLInputElement | null)?.checked,
        highContrast: (get('set-high-contrast') as HTMLInputElement | null)?.checked,
        colorblind:   (get('set-colorblind') as HTMLSelectElement | null)?.value,
        textSize:     (get('set-text-size')  as HTMLSelectElement | null)?.value,
        focusRing:    (get('set-focus-ring') as HTMLSelectElement | null)?.value,
        rgInterval:   (get('set-rg-interval') as HTMLSelectElement | null)?.value,
        lossLimit:    (get('set-loss-limit')  as HTMLInputElement  | null)?.value,
        winLimit:     (get('set-win-limit')   as HTMLInputElement  | null)?.value,
        sessionTime:  (get('set-session-time') as HTMLSelectElement | null)?.value,
        skipStop:     (get('set-skipstop')    as HTMLInputElement | null)?.checked,
        spacebarSpin: (get('set-spacebar')    as HTMLInputElement | null)?.checked,
        showNet:      (get('set-show-net')    as HTMLInputElement | null)?.checked,
        autobetLock:  (get('set-autobet-lock') as HTMLInputElement | null)?.checked,
        voiceAnn:     (get('set-voice-ann')   as HTMLInputElement | null)?.checked,
        audioCues:    (get('set-audio-cues')  as HTMLInputElement | null)?.checked,
        srVerbose:    (get('set-sr-verbose')  as HTMLInputElement | null)?.checked,
        dwell:        (get('set-dwell')        as HTMLInputElement | null)?.checked,
      };
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
      this.toastFeatureSaved();
    } catch { /* quota exceeded or private mode */ }
  }

  /* ── Idle timer (spec §7 OVL-IDLE-REMINDER) ─────────────── */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const idle = this.el('idle-overlay');
      if (idle) idle.classList.remove('hidden');
    }, this.idleTimeoutMs);
  }

  /* ── Tooltip system (spec §6 TIP-*) ─────────────────────── */

  /** Symbol descriptions for canvas tap-hold tooltips (spec §6 TIP-SCATTER/WILD/BURSTING/GOLDEN). */
  private static readonly SYM_TIPS: Record<string, string> = {
    S01: '3+ Scatters = 10 Free Spins. Pays 2/10/50× bet anywhere.',
    W01: 'Wild — substitutes for all pay symbols except Scatter, Bonus, and Golden.',
    W02: 'Bursting Wild — expands up to 4 adjacent cells into Wilds.',
    G01: 'Golden — converts its landing cell to a Wild on the next cascade.',
    B01: '3 Bonus symbols on reels 1, 3 & 5 triggers the Wheel of Fortune.',
  };

  private wireCanvasSymbolTooltips(canvas: HTMLCanvasElement): void {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.machine !== 'IDLE') return;
      const rect = canvas.getBoundingClientRect();
      const cell = this.renderer.getCellAt(e.clientX - rect.left, e.clientY - rect.top);
      if (!cell) return;
      const sym = this.grid[cell.row]?.[cell.col]?.sym;
      if (!sym) return;
      const text = Game.SYM_TIPS[sym];
      if (!text) return;
      holdTimer = setTimeout(() => {
        // Position anchor at cell centre for tooltip placement
        const ga = this.renderer['gridArea'] as { x: number; y: number; w: number; h: number };
        const cs = this.renderer['cellSize'] as number;
        const cx = rect.left + ga.x + (cell.col + 0.5) * cs;
        const cy = rect.top  + ga.y + (cell.row + 0.5) * cs;
        const fakeAnchor = { getBoundingClientRect: () => ({ left: cx - 10, right: cx + 10, top: cy - 10, bottom: cy + 10, width: 20, height: 20 }) } as unknown as HTMLElement;
        this.showTooltipFor(text, fakeAnchor);
      }, 400);
    });
    canvas.addEventListener('pointerup',    () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } this.hideTooltipEl(); });
    canvas.addEventListener('pointerleave', () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } this.hideTooltipEl(); });
  }

  private showTooltipFor(text: string, anchor: HTMLElement): void {
    const tip = this.el('tooltip');
    if (!tip) return;

    tip.textContent = text;
    tip.removeAttribute('aria-hidden');
    tip.classList.remove('hidden');

    // Position below the anchor, clamp to viewport
    const r = anchor.getBoundingClientRect();
    const tipW = 200; // approximate max-width
    let left = r.left + r.width / 2 - tipW / 2;
    let top  = r.bottom + 6;
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
    if (top + 60 > window.innerHeight) top = r.top - 48;
    tip.style.left = `${left}px`;
    tip.style.top  = `${top}px`;
  }

  private hideTooltipEl(): void {
    if (this.tooltipTimer) { clearTimeout(this.tooltipTimer); this.tooltipTimer = null; }
    const tip = this.el('tooltip');
    if (tip) { tip.classList.add('hidden'); tip.setAttribute('aria-hidden', 'true'); }
  }

  /* ── TIP-HELP-MENU (spec §6 — ? hotkey panel) ──── */
  private toggleHotkeyHelp(): void {
    const ovl = this.el('hotkey-help-overlay');
    if (!ovl) return;
    const isHidden = ovl.classList.contains('hidden');
    ovl.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      // Wire close button once
      this.el('hk-close')?.addEventListener('click', () => {
        ovl.classList.add('hidden');
      }, { once: true });
    }
  }

  /* ── S hotkey — toggle spin SFX only (spec §2) ─── */
  private spinSoundEnabled = true;
  private toggleSpinSound(): void {
    this.spinSoundEnabled = !this.spinSoundEnabled;
    this.showToast(`Spin sound ${this.spinSoundEnabled ? 'on' : 'off'}`, 1000);
  }

  private wireTooltip(id: string, text: string): void {
    const el = this.el(id);
    if (!el) return;
    el.addEventListener('mouseenter', () => {
      this.tooltipTimer = setTimeout(() => this.showTooltipFor(text, el as HTMLElement), 600);
    });
    el.addEventListener('mouseleave', () => this.hideTooltipEl());
    el.addEventListener('focus',      () => this.showTooltipFor(text, el as HTMLElement));
    el.addEventListener('blur',       () => this.hideTooltipEl());
  }

  /* ── Paytable builder ──────────────────────────── */
  private buildPaytable(tab = 0): void {
    const body = this.el('pt-body');
    if (!body) return;
    const NAMES: Record<string, string> = {
      C04:'Wolf', C03:'Pig (Bricks)', C02:'Pig (Sticks)', C01:'Pig (Straw)',
      S08:'Gem Red', S07:'Gem Green', S06:'Gem Blue',
      S05:'Ace', S04:'King', S03:'Queen', S02:'Jack', S01:'10',
    };
    const EMOJI: Record<string, string> = {
      C04:'🐺', C03:'🐷', C02:'🐷', C01:'🐷',
      S08:'🔴', S07:'🟢', S06:'🔵',
      S05:'🅰', S04:'🅺', S03:'🅠', S02:'🅙', S01:'🔟',
    };
    const bet = BET_LEVELS[this.betLevelIdx].total;

    if (tab === 0) {
      /* ── Symbols tab ─────────────────────────────── */
      // Split into Premium (C-series) and Standard (S-series)
      const premiumIds = PAY_ORDER_DISPLAY.filter(id => id.startsWith('C'));
      const standardIds = PAY_ORDER_DISPLAY.filter(id => id.startsWith('S'));
      const makeRows = (ids: string[]) => ids.map(id => {
        const [p3, p4, p5] = PAYTABLE[id];
        return `<tr>
          <td><span class="pt-emoji">${EMOJI[id]}</span> <span class="pt-sym-name">${NAMES[id]}</span></td>
          <td class="pt-pay-cell">${p3}×<span class="pt-coins">${fmt(p3 * bet)}</span></td>
          <td class="pt-pay-cell">${p4}×<span class="pt-coins">${fmt(p4 * bet)}</span></td>
          <td class="pt-pay-cell">${p5}×<span class="pt-coins">${fmt(p5 * bet)}</span></td>
        </tr>`;
      }).join('');
      body.innerHTML = `
        <p class="pt-hint">All wins left-to-right · Values shown at current bet: <b>${fmt(bet)}</b> coins</p>
        <p class="pt-group-label">⭐ PREMIUM SYMBOLS</p>
        <table class="pt-table">
          <thead><tr><th>Symbol</th><th>3 of a kind</th><th>4 of a kind</th><th>5 of a kind</th></tr></thead>
          <tbody>${makeRows(premiumIds)}</tbody>
        </table>
        <p class="pt-group-label" style="margin-top:12px">🃏 STANDARD SYMBOLS</p>
        <table class="pt-table">
          <thead><tr><th>Symbol</th><th>3 of a kind</th><th>4 of a kind</th><th>5 of a kind</th></tr></thead>
          <tbody>${makeRows(standardIds)}</tbody>
        </table>`;

    } else if (tab === 1) {
      /* ── Specials tab ────────────────────────────── */
      body.innerHTML = `
        <div class="pt-card-row">
          <div class="pt-card">
            <div class="pt-card-icon">🃏</div>
            <div class="pt-card-title">Wild <span class="pt-sym-id">W01</span></div>
            <div class="pt-card-desc">Substitutes for all pay symbols. Does not replace Scatter, Bonus, or Golden.</div>
          </div>
          <div class="pt-card">
            <div class="pt-card-icon">💥</div>
            <div class="pt-card-title">Bursting Wild <span class="pt-sym-id">W02</span></div>
            <div class="pt-card-desc">Expands up to 4 adjacent cells into W01 Wilds after each winning cascade step.</div>
          </div>
        </div>
        <div class="pt-card-row">
          <div class="pt-card">
            <div class="pt-card-icon">⭐</div>
            <div class="pt-card-title">Scatter <span class="pt-sym-id">SC01</span> — pays anywhere</div>
            <div class="pt-card-desc">
              <table class="pt-mini-table">
                <tr><td>3 Scatters</td><td>2× bet + <b>10 Free Spins</b></td><td class="pt-coins">${fmt(2*bet)}</td></tr>
                <tr><td>4 Scatters</td><td>10× bet + <b>10 Free Spins</b></td><td class="pt-coins">${fmt(10*bet)}</td></tr>
                <tr><td>5 Scatters</td><td>50× bet + <b>10 Free Spins</b></td><td class="pt-coins">${fmt(50*bet)}</td></tr>
              </table>
            </div>
          </div>
          <div class="pt-card">
            <div class="pt-card-icon">✨</div>
            <div class="pt-card-title">Golden Modifier <span class="pt-sym-id">G01</span></div>
            <div class="pt-card-desc">Its landing cell becomes a golden cell. On a win, golden cells convert to Bursting Wilds (W02) before burst resolution.</div>
          </div>
        </div>`;

    } else if (tab === 2) {
      /* ── Multipliers tab ─────────────────────────── */
      body.innerHTML = `
        <p class="pt-hint">The multiplier increases with each winning cascade step and is applied to all wins in that step.</p>
        <div class="pt-card-row">
          <div class="pt-card">
            <div class="pt-card-title">🎰 Base Game</div>
            <div class="pt-card-desc">
              <div class="pt-mult-chain">
                <div class="pt-mult-step"><span class="pt-mult-badge">×1</span><span>Step 0</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge">×2</span><span>Step 1</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge">×3</span><span>Step 2</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge pt-mult-cap">×5</span><span>Step 3+ (cap)</span></div>
              </div>
            </div>
          </div>
          <div class="pt-card">
            <div class="pt-card-title">🆓 Free Spins</div>
            <div class="pt-card-desc">
              <div class="pt-mult-chain">
                <div class="pt-mult-step"><span class="pt-mult-badge">×2</span><span>Step 0</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge">×4</span><span>Step 1</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge">×6</span><span>Step 2</span></div>
                <div class="pt-mult-arrow">→</div>
                <div class="pt-mult-step"><span class="pt-mult-badge pt-mult-cap">×10</span><span>Step 3+ (cap)</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pt-rules-list">
          <div>✔ Multiplier advances after each winning cascade step</div>
          <div>✔ Only line wins advance the multiplier — scatter-only does not</div>
          <div>✔ Resets to starting value at the beginning of each new spin</div>
          <div>✖ Does not carry between Base Game and Free Spins</div>
        </div>`;

    } else if (tab === 3) {
      /* ── Features tab ────────────────────────────── */
      body.innerHTML = `
        <div class="pt-card-row">
          <div class="pt-card">
            <div class="pt-card-icon">🆓</div>
            <div class="pt-card-title">Free Spins</div>
            <div class="pt-card-desc">
              Triggered by <b>3+ Scatters</b> anywhere on the grid.<br><br>
              Scatter pays credited first, then 10 spins begin at the same bet.<br><br>
              <b>Retrigger</b> (extra spins awarded on re-trigger):
              <table class="pt-mini-table" style="margin-top:6px">
                <tr><td>3 Scatters</td><td>+5 spins</td></tr>
                <tr><td>4 Scatters</td><td>+8 spins</td></tr>
                <tr><td>5 Scatters</td><td>+10 spins</td></tr>
              </table>
              <span class="pt-note">Max 100 spins per session</span>
            </div>
          </div>
          <div class="pt-card">
            <div class="pt-card-icon">🎡</div>
            <div class="pt-card-title">Wheel Feature</div>
            <div class="pt-card-desc">
              Triggers randomly (0.5% per base spin, 1% in Free Spins) or via Buy Feature.<br><br>
              <b>Wheel outcomes:</b>
              <table class="pt-mini-table" style="margin-top:6px">
                <tr><td>🏆 Jackpot</td><td>4 segments</td></tr>
                <tr><td>🏠 Mansion Bonus</td><td>3 segments</td></tr>
                <tr><td>🔪 Buzzsaw Bonus</td><td>3 segments</td></tr>
                <tr><td>🎩 Mega Hat</td><td>2 segments</td></tr>
              </table>
            </div>
          </div>
        </div>
        <div class="pt-card" style="margin-top:8px">
          <div class="pt-card-title">🏆 Jackpot Tiers</div>
          <div class="pt-card-desc">
            <table class="pt-mini-table">
              <tr><td>Mini</td><td>10× bet</td><td class="pt-coins">${fmt(10*bet)}</td><td>50% chance</td></tr>
              <tr><td>Minor</td><td>25× bet</td><td class="pt-coins">${fmt(25*bet)}</td><td>30% chance</td></tr>
              <tr><td>Major</td><td>100× bet</td><td class="pt-coins">${fmt(100*bet)}</td><td>15% chance</td></tr>
              <tr><td>Grand</td><td>500× bet</td><td class="pt-coins">${fmt(500*bet)}</td><td>5% chance</td></tr>
            </table>
          </div>
        </div>
        <div class="pt-card" style="margin-top:8px">
          <div class="pt-card-title">💰 Buy Feature Costs</div>
          <div class="pt-card-desc">
            <table class="pt-mini-table">
              <tr><td>Buy Free Spins</td><td>75× bet</td><td class="pt-coins">${fmt(75*bet)}</td></tr>
              <tr><td>Buy Wheel</td><td>50× bet</td><td class="pt-coins">${fmt(50*bet)}</td></tr>
            </table>
          </div>
        </div>`;

    } else if (tab === 4) {
      /* ── Paylines tab ────────────────────────────── */
      // Build visual 3×5 mini-grid for each payline
      const plBlocks = PAYLINES.map((pl, i) => {
        // pl = [row for reel 0, row for reel 1, ... row for reel 4]
        // Build 3 rows × 5 cols grid; highlight cells that are ON this payline
        let grid = '';
        for (let row = 0; row < 3; row++) {
          for (let reel = 0; reel < 5; reel++) {
            const on = pl[reel] === row;
            grid += `<div class="${on ? 'on' : ''}"></div>`;
          }
        }
        return `<div class="payline-block">
          <div class="payline-num">${i + 1}</div>
          <div class="payline-preview">${grid}</div>
        </div>`;
      }).join('');
      body.innerHTML = `
        <p class="pt-hint">10 fixed paylines · wins pay left-to-right only · all lines always active</p>
        <div class="pt-paylines">${plBlocks}</div>`;

    } else {
      /* ── Rules & RTP tab ─────────────────────────── */
      body.innerHTML = `
        <div class="pt-card-row">
          <div class="pt-card">
            <div class="pt-card-title">📊 Game Stats</div>
            <div class="pt-card-desc">
              <table class="pt-mini-table">
                <tr><td>RTP</td><td><b>95.5%</b></td></tr>
                <tr><td>Volatility</td><td><b>Medium-High</b></td></tr>
                <tr><td>Grid</td><td><b>5 reels × 3 rows</b></td></tr>
                <tr><td>Paylines</td><td><b>10 fixed</b></td></tr>
                <tr><td>Max win</td><td><b>10,000× bet</b></td></tr>
              </table>
            </div>
          </div>
          <div class="pt-card">
            <div class="pt-card-title">📜 General Rules</div>
            <div class="pt-card-desc">
              <div class="pt-rules-list">
                <div>✔ Wins pay left-to-right on fixed paylines</div>
                <div>✔ Only highest win per line pays</div>
                <div>✔ Scatter wins are added to line wins</div>
                <div>✔ All paylines active on every spin</div>
                <div>✔ Malfunction voids all pays</div>
                <div>✔ 18+ only · Play responsibly</div>
              </div>
            </div>
          </div>
        </div>`;
    }
  }
}
