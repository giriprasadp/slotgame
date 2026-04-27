import { BET_LEVELS, fmt } from '../config/constants';
import type { BetLevel } from '../config/constants';
import { animateValue } from '../utils/helpers';

type Handler = () => void;

/** HUD — manages all DOM overlay elements */
export class HUD {
  private handlers = new Map<string, Handler>();
  private currentWin = 0;
  private _betLevelIdx = 3;

  constructor() {
    this.wireButtons();
  }

  /* ---- Event wiring ---- */
  private wireButtons(): void {
    this.on('btn-spin',       'click', () => this.emit('spin'));
    this.on('btn-bet-minus',  'click', () => this.emit('bet-down'));
    this.on('btn-bet-plus',   'click', () => this.emit('bet-up'));
    this.on('btn-bet-max',    'click', () => this.emit('bet-max'));
    this.on('btn-buy-fs',     'click', () => this.emit('buy-fs'));
    this.on('btn-buy-wheel',  'click', () => this.emit('buy-wheel'));
    this.on('btn-auto',       'click', () => this.emit('autoplay'));
    this.on('btn-quick',      'click', () => this.emit('quick-toggle'));
    this.on('btn-restart-now','click', () => this.emit('restart'));
    this.on('set-restart',    'click', () => { this.toggleSettings(false); this.showRestart(); });
    this.on('btn-settings',   'click', () => this.toggleSettings(true));
    this.on('btn-menu',       'click', () => this.toggleSettings(true));
    this.on('set-close',      'click', () => this.toggleSettings(false));
    this.on('btn-paytable',   'click', () => this.togglePaytable(true));
    this.on('pt-close',       'click', () => this.togglePaytable(false));
    this.on('btn-auto-start', 'click', () => this.emit('autoplay-start'));
    this.on('auto-close',     'click', () => this.closeAutoplayDialog());
    this.on('buy-close',      'click', () => this.closeBuyConfirm());
    this.on('btn-fullscreen', 'click', () => this.toggleFullscreen());

    // Settings sliders
    const musicSlider = document.getElementById('set-music') as HTMLInputElement;
    const sfxSlider   = document.getElementById('set-sfx')   as HTMLInputElement;
    if (musicSlider) musicSlider.addEventListener('input', () => {
      this.emit('music-vol', parseFloat(musicSlider.value) / 100);
    });
    if (sfxSlider) sfxSlider.addEventListener('input', () => {
      this.emit('sfx-vol', parseFloat(sfxSlider.value) / 100);
    });
  }

  on(id: string, event: string, cb: EventListener): void {
    document.getElementById(id)?.addEventListener(event, cb);
  }

  subscribe(event: string, handler: Handler): void {
    this.handlers.set(event, handler);
  }

  private emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.();
  }

  /* ---- Balance / bet display ---- */
  updateBalance(n: number): void {
    const el = document.getElementById('hud-balance');
    if (el) el.textContent = fmt(Math.round(n));
  }

  updateBet(level: BetLevel): void {
    const el = document.getElementById('hud-bet');
    if (el) el.textContent = `BET: ${fmt(level.total)}`;
    this._betLevelIdx = BET_LEVELS.indexOf(level);
    this.refreshBetButtons();
  }

  async setLastWin(n: number): Promise<void> {
    const el = document.getElementById('hud-win');
    if (!el) return;
    if (n === 0) { el.textContent = '0'; this.currentWin = 0; return; }
    await animateValue(this.currentWin, n, 600, v => { el.textContent = fmt(Math.round(v)); });
    this.currentWin = n;
  }

  setMultiplier(mult: number, visible = true): void {
    const el = document.getElementById('hud-multiplier');
    if (!el) return;
    el.textContent = `×${mult}`;
    el.style.display = visible && mult > 1 ? 'flex' : 'none';
  }

  /* ---- FS banner ---- */
  showFSBanner(remaining: number, running: number): void {
    const banner = document.getElementById('fs-banner');
    if (banner) banner.classList.remove('hidden');
    this.updateFSBanner(remaining, running);
  }

  updateFSBanner(remaining: number, running: number): void {
    const rem = document.getElementById('fs-remaining');
    const win = document.getElementById('fs-running-win');
    if (rem) rem.textContent = String(remaining);
    if (win) win.textContent = fmt(Math.round(running));
  }

  hideFSBanner(): void {
    document.getElementById('fs-banner')?.classList.add('hidden');
  }

  /* ---- Controls ---- */
  setControlsEnabled(on: boolean): void {
    const ids = ['btn-spin','btn-bet-minus','btn-bet-plus','btn-bet-max','btn-buy-fs','btn-buy-wheel','btn-auto'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('disabled', !on);
    }
    const spin = document.getElementById('btn-spin') as HTMLButtonElement | null;
    if (spin) spin.disabled = !on;
  }

  setSpinLabel(label: string): void {
    const el = document.getElementById('btn-spin-label');
    if (el) el.textContent = label;
  }

  setAutoplayActive(on: boolean): void {
    document.getElementById('btn-auto')?.classList.toggle('active', on);
  }

  setQuickActive(on: boolean): void {
    document.getElementById('btn-quick')?.classList.toggle('active', on);
  }

  private refreshBetButtons(): void {
    const down = document.getElementById('btn-bet-minus');
    const up   = document.getElementById('btn-bet-plus');
    if (down) down.classList.toggle('disabled', this._betLevelIdx <= 0);
    if (up)   up.classList.toggle('disabled',   this._betLevelIdx >= BET_LEVELS.length - 1);
  }

  /* ---- Overlays ---- */
  showRestart(): void { document.getElementById('restart-overlay')?.classList.remove('hidden'); }
  hideRestart(): void { document.getElementById('restart-overlay')?.classList.add('hidden'); }

  toast(msg: string, durationMs = 2200): void {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent          = msg;
    el.style.opacity        = '1';
    el.style.pointerEvents  = 'auto';
    clearTimeout((el as any)._toastTimer);
    (el as any)._toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }, durationMs);
  }

  showCelebration(label: string, win: number, color: string): void {
    const ov  = document.getElementById('celebration-overlay');
    const lbl = document.getElementById('celebration-label');
    const amt = document.getElementById('celebration-amount');
    if (ov)  ov.classList.remove('hidden');
    if (lbl) { lbl.textContent = label; lbl.style.color = color; }
    if (amt) amt.textContent = `${fmt(Math.round(win))} coins`;
  }

  hideCelebration(): void {
    document.getElementById('celebration-overlay')?.classList.add('hidden');
  }

  /* ---- Feature intros ---- */
  showFeatureIntro(title: string, desc: string): Promise<void> {
    return new Promise(resolve => {
      const ov = document.getElementById('feature-intro-overlay');
      const t  = document.getElementById('feature-intro-title');
      const d  = document.getElementById('feature-intro-desc');
      const btn = document.getElementById('feature-intro-btn');
      if (!ov || !btn) { resolve(); return; }
      if (t) t.textContent = title;
      if (d) d.textContent = desc;
      ov.classList.remove('hidden');
      const go = () => { btn.removeEventListener('click', go); ov.classList.add('hidden'); resolve(); };
      btn.addEventListener('click', go);
    });
  }

  /* ---- Buy confirm ---- */
  openBuyConfirm(type: 'FS' | 'WHEEL', cost: number, onConfirm: Handler): void {
    const ov    = document.getElementById('buy-overlay');
    const title = document.getElementById('buy-title');
    const amt   = document.getElementById('buy-cost');
    const btn   = document.getElementById('buy-confirm');
    if (!ov || !btn) return;
    if (title) title.textContent = type === 'FS' ? 'Buy Free Spins' : 'Buy Wheel Feature';
    if (amt)   amt.textContent   = `Cost: ${fmt(cost)} coins`;
    ov.classList.remove('hidden');
    const handler = () => {
      btn.removeEventListener('click', handler);
      this.closeBuyConfirm();
      onConfirm();
    };
    btn.addEventListener('click', handler);
  }

  closeBuyConfirm(): void {
    document.getElementById('buy-overlay')?.classList.add('hidden');
  }

  /* ---- Autoplay dialog ---- */
  openAutoplayDialog(): void {
    document.getElementById('auto-overlay')?.classList.remove('hidden');
  }

  closeAutoplayDialog(): void {
    document.getElementById('auto-overlay')?.classList.add('hidden');
  }

  getAutoplaySettings(): { count: number; stopOnFeature: boolean; stopOnBigWin: boolean } {
    const sel  = document.getElementById('auto-count') as HTMLSelectElement | null;
    const feat = document.getElementById('auto-stop-feature') as HTMLInputElement | null;
    const big  = document.getElementById('auto-stop-bigwin')  as HTMLInputElement | null;
    return {
      count:          parseInt(sel?.value ?? '10', 10),
      stopOnFeature:  !!feat?.checked,
      stopOnBigWin:   !!big?.checked,
    };
  }

  /* ---- Bonus overlay ---- */
  getBonusOverlay(): { overlay: HTMLElement; inner: HTMLElement } | null {
    const ov = document.getElementById('bonus-overlay');
    const in_ = document.getElementById('bonus-inner');
    if (!ov || !in_) return null;
    return { overlay: ov, inner: in_ };
  }

  showBonusOverlay(): void   { document.getElementById('bonus-overlay')?.classList.remove('hidden'); }
  hideBonusOverlay(): void   { document.getElementById('bonus-overlay')?.classList.add('hidden');    }

  /* ---- Wheel overlay ---- */
  showWheelOverlay(): void   { document.getElementById('wheel-overlay')?.classList.remove('hidden'); }
  hideWheelOverlay(): void   { document.getElementById('wheel-overlay')?.classList.add('hidden');    }
  setWheelResult(t: string): void {
    const el = document.getElementById('wheel-result');
    if (el) el.textContent = t;
  }

  /* ---- Settings / paytable ---- */
  private toggleSettings(on: boolean): void {
    document.getElementById('settings-overlay')?.classList.toggle('hidden', !on);
  }
  private togglePaytable(on: boolean): void {
    document.getElementById('paytable-overlay')?.classList.toggle('hidden', !on);
  }

  /* ---- Fullscreen ---- */
  private toggleFullscreen(): void {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }
}
