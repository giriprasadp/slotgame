import Phaser from 'phaser';
import { ApiClient } from '../api/ApiClient';
import { ReelGrid } from '../game/ReelGrid';
import { HUD } from '../game/HUD';
import { AudioManager } from '../audio/AudioManager';
import {
  BET_LEVELS, getTiming, getWinTier, fmt,
  WHEEL_SEGMENTS, WHEEL_BONUS_NAMES, WHEEL_BONUS_COLORS,
  BUZZSAW_ORDER, BUZZSAW_BORDERS,
} from '../config/constants';
import { sleep, waitClickOrTimeout } from '../utils/helpers';
import type { SpinResponse, SpinType, ChainStep, WheelResult,
  JackpotResult, MansionResult, BuzzsawResult, MegaHatResult } from '../types/api';

type Machine = 'IDLE' | 'SPINNING' | 'EVALUATING' | 'MORPH_CHAIN'
             | 'FEATURE_CHECK' | 'WIN_PRESENTATION' | 'WHEEL_FEATURE';

interface SceneData {
  api:         ApiClient;
  balance:     number;
  betLevelIdx: number;
}

const GRID_X = 155;
const GRID_Y = 130;

export class GameScene extends Phaser.Scene {
  /* ---- Dependencies ---- */
  private api!: ApiClient;
  private reelGrid!: ReelGrid;
  private hud!: HUD;
  private audio!: AudioManager;

  /* ---- Machine state ---- */
  private machine: Machine = 'IDLE';
  private balance = 0;
  private betLevelIdx = 3;
  private quickSpin = false;
  private spinCount = 0;

  /* ---- Free Spins ---- */
  private isFsMode = false;
  private fsRemaining = 0;
  private fsRunningTotal = 0;
  private fsLockedBet = 0;

  /* ---- Current spin accumulator ---- */
  private chainTotal = 0;

  /* ---- Autoplay ---- */
  private autoplayActive = false;
  private autoplayRemaining = -1;
  private autoplayStopOnFeature = false;
  private autoplayStopOnBigWin  = false;

  /* ---- Analytics buffer ---- */
  private analyticsBuffer: unknown[] = [];

  constructor() { super({ key: 'GameScene' }); }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Scene lifecycle                                               */
  /* ══════════════════════════════════════════════════════════════ */

  init(data: SceneData): void {
    this.api         = data.api;
    this.balance     = data.balance;
    this.betLevelIdx = data.betLevelIdx;
  }

  create(): void {
    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0d0d23);

    // Reel frame / panel
    this.add.rectangle(GRID_X + 310, GRID_Y + 150, 660, 340, 0x1a1a3a)
      .setStrokeStyle(3, 0xFFD700, 0.6);

    // Reel grid
    this.reelGrid = new ReelGrid(this, GRID_X, GRID_Y);

    // HUD (DOM overlay)
    this.hud = new HUD();

    // Audio
    this.audio = new AudioManager();

    // Wire HUD events
    this.hud.subscribe('spin',         () => this.spinPressed());
    this.hud.subscribe('bet-down',     () => this.betDown());
    this.hud.subscribe('bet-up',       () => this.betUp());
    this.hud.subscribe('bet-max',      () => this.betMax());
    this.hud.subscribe('buy-fs',       () => this.openBuyFS());
    this.hud.subscribe('buy-wheel',    () => this.openBuyWheel());
    this.hud.subscribe('autoplay',     () => this.handleAutoplayBtn());
    this.hud.subscribe('autoplay-start',()=> this.confirmAutoplay());
    this.hud.subscribe('quick-toggle', () => this.toggleQuick());
    this.hud.subscribe('restart',      () => this.restart());

    // Keyboard shortcuts
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-SPACE', () => this.spinPressed());
      this.input.keyboard.on('keydown-ENTER', () => this.spinPressed());
      this.input.keyboard.on('keydown-Q',     () => this.toggleQuick());
      this.input.keyboard.on('keydown-A',     () => this.handleAutoplayBtn());
    }

    // Flush analytics every 8 s
    this.time.addEvent({
      delay: 8000, loop: true,
      callback: () => this.flushAnalytics(),
    });

    // Initial UI state
    this.hud.updateBalance(this.balance);
    this.hud.updateBet(BET_LEVELS[this.betLevelIdx]);
    this.hud.setMultiplier(1, false);
    this.hud.setControlsEnabled(true);
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Spin entry points                                             */
  /* ══════════════════════════════════════════════════════════════ */

  private spinPressed(): void {
    if (this.autoplayActive) { this.stopAutoplay(); return; }
    if (this.machine !== 'IDLE') return;
    this.doSpin('manual');
  }

  private async doSpin(spinType: SpinType = 'manual'): Promise<void> {
    if (this.machine !== 'IDLE') return;

    const bet = this.isFsMode
      ? this.fsLockedBet
      : BET_LEVELS[this.betLevelIdx].total;

    if (!this.isFsMode && this.balance < bet) {
      this.hud.toast('Insufficient balance');
      if (this.balance < BET_LEVELS[0].total) this.hud.showRestart();
      else this.autoDowngradeBet();
      return;
    }

    this.machine = 'SPINNING';
    this.hud.setControlsEnabled(false);
    this.hud.setMultiplier(1, false);
    this.chainTotal = 0;
    this.spinCount++;

    this.track('spin', {
      spinNumber: this.spinCount,
      gameMode: this.isFsMode ? 'FS' : 'BASE',
      betLevel: this.betLevelIdx + 1,
      totalBet: bet,
      spinType,
    });

    // Start reel spin animation
    this.reelGrid.startSpinning(this.quickSpin);
    this.audio.play('reelStart');

    const timing = getTiming(this.quickSpin);

    // API call runs concurrently with minimum spin duration
    let response: SpinResponse;
    try {
      ([response] = await Promise.all([
        this.api.spin(this.betLevelIdx, spinType),
        sleep(timing.reelSpinDur),
      ]));
    } catch (err: unknown) {
      this.machine = 'IDLE';
      this.reelGrid.stopSpinning();
      this.hud.toast((err instanceof Error ? err.message : 'Network error') + ' — please retry');
      this.hud.setControlsEnabled(true);
      if (this.autoplayActive) this.stopAutoplay();
      return;
    }

    // Stop reels staggered with server symbols
    for (let col = 0; col < 5; col++) {
      if (col > 0) await sleep(timing.reelStagger);
      const syms   = response.grid.map(row => row[col].sym);
      const goldens = response.grid.map(row => row[col].golden);
      await this.reelGrid.stopReel(col, syms, goldens);
      this.audio.play('reelStop');
    }
    await sleep(350);

    // Sync balance immediately (reflects deduct)
    this.balance = response.balanceAfter;
    this.hud.updateBalance(this.balance);

    // Track FS mode transitions
    const wasFsMode = this.isFsMode;
    if (response.freeSpinsState) {
      this.isFsMode       = true;
      this.fsRemaining    = response.freeSpinsState.remaining;
      this.fsRunningTotal = response.freeSpinsState.runningTotal;
      this.fsLockedBet    = response.freeSpinsState.lockedBet;
      this.hud.updateFSBanner(this.fsRemaining, this.fsRunningTotal);
    } else if (wasFsMode) {
      // FS just completed — clear local state
      this.isFsMode = false;
    }

    // Replay the server chain
    this.machine = 'EVALUATING';
    await this.replayChain(response);

    // Process features (FS trigger, retrigger, wheel)
    this.machine = 'FEATURE_CHECK';
    await this.processFeatures(response, wasFsMode);

    // Finalize
    await this.finalizeSpin(response, wasFsMode);
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Chain replay                                                  */
  /* ══════════════════════════════════════════════════════════════ */

  private async replayChain(response: SpinResponse): Promise<void> {
    const timing = getTiming(this.quickSpin);

    for (const step of response.chain) {
      if (!step.hasLineWin && step.scatterWin === 0) break;

      this.machine = 'MORPH_CHAIN';
      this.chainTotal += step.stepWin;

      // Multiplier badge
      if (step.hasLineWin) this.hud.setMultiplier(step.multiplier, true);

      // Highlight winning cells
      this.reelGrid.highlightCells(step.winCells);
      if (step.lineWins.length > 0) this.reelGrid.showWinLine(step.lineWins[0].line);

      // Win particles
      for (const { row, reel } of step.winCells) {
        this.reelGrid.spawnWinParticles(row, reel);
      }

      // Win audio
      const wm = step.stepWin / response.bet;
      if (wm >= 30)     this.audio.play('megaWin');
      else if (wm >= 15) this.audio.play('bigWin');
      else if (wm >= 5)  this.audio.play('niceWin');
      else               this.audio.play('smallWin');

      if (step.scatterWin > 0) this.audio.play('scatterWin');

      // Bursts
      for (const burst of step.bursts) {
        this.audio.play('burstImpact');
        for (const t of burst.targets) this.reelGrid.flashBurst(t.row, t.reel);
      }

      // Golden conversion audio
      if (step.goldenConversions.length > 0) this.audio.play('goldenConvert');

      // Multiplier advance audio
      if (step.stepIndex > 0 && step.hasLineWin) this.audio.play('multAdvance');

      // Animate win counter
      await this.hud.setLastWin(this.chainTotal);

      await sleep(timing.winHighlightDur);

      // Collect cells to morph-out (all winners except SC01 scatters)
      const toMorph = step.winPositions
        .map(k => { const [r, c] = k.split(',').map(Number); return { row: r, reel: c }; })
        .filter(({ row, reel }) => this.reelGrid.getSym(row, reel) !== 'SC01');

      if (toMorph.length === 0) {
        this.reelGrid.clearHighlights();
        break; // scatter-only step — chain ends
      }

      // Morph-out animation
      this.audio.play('morphOut');
      await this.reelGrid.morphOut(toMorph);

      // Apply server morphed cells
      this.reelGrid.applyMorphedCells(step.morphedCells);

      this.reelGrid.clearHighlights();
      this.audio.play('morphIn');
      await this.reelGrid.morphIn(step.morphedCells.map(m => ({ row: m.row, reel: m.reel })));

      await sleep(timing.morphStepDur * 0.15);
    }

    this.reelGrid.clearHighlights();
    this.hud.setMultiplier(1, false);
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Feature resolution                                            */
  /* ══════════════════════════════════════════════════════════════ */

  private async processFeatures(response: SpinResponse, wasFsMode: boolean): Promise<void> {
    for (const feat of response.features) {
      if (feat.type === 'FS_TRIGGER') {
        await this.enterFreeSpins(feat.scatterCount, response);
      } else if (feat.type === 'FS_RETRIGGER') {
        if (response.freeSpinsState) {
          this.fsRemaining    = response.freeSpinsState.remaining;
          this.fsRunningTotal = response.freeSpinsState.runningTotal;
          this.hud.updateFSBanner(this.fsRemaining, this.fsRunningTotal);
        }
        this.hud.toast(`Retrigger! +${feat.spinsAdded} Free Spins`);
        this.audio.play('fsRetrigger');
        await sleep(800);
      } else if (feat.type === 'WHEEL') {
        await this.enterWheelFromResult(feat.wheelResult, response.bet);
      }
    }

    // FS just completed
    if (wasFsMode && !this.isFsMode) {
      await this.exitFreeSpins(response.totalWin);
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Free Spins flow                                               */
  /* ══════════════════════════════════════════════════════════════ */

  private async enterFreeSpins(scatterCount: number, response: SpinResponse): Promise<void> {
    this.audio.play('fsIntro');

    this.track('feature_trigger', { featureType: 'free_spins', scatterCount });

    await this.hud.showFeatureIntro(
      'FREE SPINS!',
      `${scatterCount} Scatters award ${this.fsRemaining} Free Spins.\n` +
      `Boosted multipliers: ×2 → ×4 → ×6 → ×10`,
    );

    this.hud.showFSBanner(this.fsRemaining, this.fsRunningTotal);
  }

  private async exitFreeSpins(totalWin: number): Promise<void> {
    const bet = this.fsLockedBet;
    const mult = bet > 0 ? (totalWin / bet).toFixed(2) : '0';

    this.track('free_spins_complete', { sessionTotalWin: totalWin });

    this.hud.hideFSBanner();
    this.audio.play('fsIntro');

    await this.hud.showFeatureIntro(
      'FREE SPINS COMPLETE',
      `Total Won: ${fmt(Math.round(totalWin))} coins (${mult}× bet)`,
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Wheel feature                                                 */
  /* ══════════════════════════════════════════════════════════════ */

  private async enterWheelFromResult(wheelResult: WheelResult, bet: number): Promise<void> {
    this.machine = 'WHEEL_FEATURE';
    this.track('feature_trigger', { featureType: 'wheel' });

    await this.hud.showFeatureIntro(
      'WHEEL FEATURE!',
      'Spin the wheel for a bonus prize.',
    );

    this.hud.showWheelOverlay();
    this.hud.setWheelResult('');

    await this.animateWheel(wheelResult.segment.idx);

    const name = WHEEL_BONUS_NAMES[wheelResult.bonusType];
    this.hud.setWheelResult(`${name}!`);
    this.audio.play('wheelLand');
    await sleep(900);
    this.hud.hideWheelOverlay();

    // Run the pre-computed bonus animation
    let bonusWin = 0;
    if (wheelResult.bonusType === 'WH_JP') {
      bonusWin = await this.runJackpotBonus(wheelResult.bonus as JackpotResult, bet);
    } else if (wheelResult.bonusType === 'WH_MN') {
      bonusWin = await this.runMansionBonus(wheelResult.bonus as MansionResult, bet);
    } else if (wheelResult.bonusType === 'WH_BZ') {
      bonusWin = await this.runBuzzsawBonus(wheelResult.bonus as BuzzsawResult, bet);
    } else if (wheelResult.bonusType === 'WH_MH') {
      bonusWin = await this.runMegaHatBonus(wheelResult.bonus as MegaHatResult, bet);
    }

    this.chainTotal += bonusWin;
    this.track('wheel_feature_complete', { wheelOutcome: wheelResult.bonusType, totalWin: bonusWin });
  }

  /* ---- Wheel canvas animation ---- */
  private animateWheel(targetIdx: number): Promise<void> {
    const canvas = document.getElementById('wheel-canvas') as HTMLCanvasElement | null;
    if (!canvas) return Promise.resolve();
    const ctx = canvas.getContext('2d')!;
    const seg = WHEEL_SEGMENTS;
    const n   = seg.length;
    const cx  = canvas.width / 2, cy = canvas.height / 2;
    const outerR = Math.min(cx, cy) - 20;
    const innerR = outerR * 0.35;
    const segAngle = (Math.PI * 2) / n;

    const rotations  = 4 + Math.random() * 2;
    const finalRot   = rotations * Math.PI * 2 + ((n / 4) * segAngle - targetIdx * segAngle);
    const dur        = this.quickSpin ? 2500 : 5500;
    const start      = performance.now();
    let lastTickSeg  = -1;

    return new Promise(resolve => {
      const step = (now: number) => {
        const p    = Math.min(1, (now - start) / dur);
        const ease = 1 - Math.pow(1 - p, 3);
        const rot  = finalRot * ease;
        this.drawWheel(ctx, seg, n, segAngle, cx, cy, outerR, innerR, rot);

        const pointerSeg = Math.floor(((rot + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / segAngle) % n;
        if (pointerSeg !== lastTickSeg) { this.audio.play('wheelTick'); lastTickSeg = pointerSeg; }

        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private drawWheel(
    ctx: CanvasRenderingContext2D,
    segments: string[], n: number, segAngle: number,
    cx: number, cy: number, outerR: number, innerR: number, rot: number,
  ): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < n; i++) {
      const a0 = rot + i * segAngle - Math.PI / 2 - segAngle / 2;
      const a1 = a0 + segAngle;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, outerR, a0, a1); ctx.closePath();
      ctx.fillStyle   = WHEEL_BONUS_COLORS[segments[i]] ?? '#888';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();

      const la = a0 + segAngle / 2;
      ctx.save();
      ctx.rotate(la);
      ctx.translate((outerR + innerR) / 2, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(WHEEL_BONUS_NAMES[segments[i]]?.split(' ')[0] ?? '', 0, 0);
      ctx.restore();
    }
    // Hub
    ctx.beginPath(); ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
    g.addColorStop(0, '#FFCA63'); g.addColorStop(1, '#8F5C13');
    ctx.fillStyle = g; ctx.fill();

    ctx.restore();

    // Pointer
    ctx.save(); ctx.fillStyle = '#D64545'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR - 12);
    ctx.lineTo(cx - 14, cy - outerR + 8);
    ctx.lineTo(cx + 14, cy - outerR + 8);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Bonus mini-games (server supplies pre-computed result)        */
  /* ══════════════════════════════════════════════════════════════ */

  private async runJackpotBonus(result: JackpotResult, bet: number): Promise<number> {
    const b = this.hud.getBonusOverlay();
    if (!b) return result.payout;
    const { overlay, inner } = b;

    inner.innerHTML = `
      <div class="bonus-title">JACKPOT</div>
      <div class="bonus-desc">One of four tiers awaits…</div>
      <div class="jackpot-grid">
        ${['Grand','Major','Minor','Mini'].map(t => `
          <div class="jackpot-tile" data-tier="${t}">
            <div class="jackpot-tile-name">${t}</div>
          </div>`).join('')}
      </div>
      <div class="bonus-total" id="bonus-total">&nbsp;</div>`;
    overlay.classList.remove('hidden');
    await sleep(600);

    const tiles = inner.querySelectorAll<HTMLElement>('.jackpot-tile');
    for (let i = 0; i < 12; i++) {
      tiles.forEach((t, idx) => { t.style.transform = idx === i % 4 ? 'scale(1.12)' : 'scale(1)'; });
      this.audio.play('uiTick');
      await sleep(110);
    }
    tiles.forEach(t => { t.style.transform = ''; });
    await sleep(200);

    tiles.forEach(t => {
      if (t.dataset['tier'] === result.tier) t.classList.add('winner');
      else t.classList.add('loser');
    });
    this.audio.play('jackpot');
    const tot = inner.querySelector<HTMLElement>('#bonus-total');
    if (tot) tot.textContent = `${result.tier} — WIN: ${fmt(result.payout)} coins`;
    await sleep(2600);
    overlay.classList.add('hidden');
    return result.payout;
  }

  private async runMansionBonus(result: MansionResult, _bet: number): Promise<number> {
    const b = this.hud.getBonusOverlay();
    if (!b) return result.payout;
    const { overlay, inner } = b;

    inner.innerHTML = `
      <div class="bonus-title">MANSION BONUS</div>
      <div class="bonus-desc">Hats land on cells, each becomes a mansion!</div>
      <div class="mansion-grid" id="mansion-grid"></div>
      <div id="mansion-status" class="bonus-desc">—</div>
      <div class="bonus-total" id="bonus-total">&nbsp;</div>`;
    overlay.classList.remove('hidden');

    const grid = document.getElementById('mansion-grid')!;
    const cells: HTMLElement[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const el = document.createElement('div');
      el.className = 'mansion-cell';
      grid.appendChild(el); cells.push(el);
    }
    await sleep(400);

    for (const ev of result.events) {
      const status = document.getElementById('mansion-status');
      if (status) status.textContent = `Round ${ev.round + 1}`;
      if (ev.type === 'miss') { await sleep(160); continue; }
      if (ev.row !== undefined && ev.reel !== undefined) {
        const idx = ev.row * 5 + ev.reel;
        cells[idx].textContent = '🎩'; cells[idx].classList.add('hat');
        this.audio.play('smallWin'); await sleep(300);
        cells[idx].classList.remove('hat'); cells[idx].classList.add('mansion');
        cells[idx].textContent = '🏰';
      }
      if (ev.type === 'fullbonus') { this.audio.play('niceWin'); await sleep(240); }
    }

    const tot = inner.querySelector<HTMLElement>('#bonus-total');
    if (tot) tot.textContent = `${result.mansionCount} mansions — WIN: ${fmt(result.payout)} coins`;
    if (result.payout > 0) this.audio.play('bigWin');
    await sleep(2400);
    overlay.classList.add('hidden');
    return result.payout;
  }

  private async runBuzzsawBonus(result: BuzzsawResult, _bet: number): Promise<number> {
    const b = this.hud.getBonusOverlay();
    if (!b) return result.payout;
    const { overlay, inner } = b;

    inner.innerHTML = `
      <div class="bonus-title">BUZZSAW BONUS</div>
      <div class="bonus-desc">Buzzsaws upgrade cell borders row by row!</div>
      <div class="buzzsaw-grid" id="buzz-grid"></div>
      <div class="bonus-total" id="bonus-total">&nbsp;</div>`;
    overlay.classList.remove('hidden');

    const gridEl = document.getElementById('buzz-grid')!;
    const cells: HTMLElement[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const el = document.createElement('div'); el.className = 'buzz-cell';
      gridEl.appendChild(el); cells.push(el);
    }
    await sleep(400);

    for (let r = 0; r < 3; r++) {
      const count = result.rowBuzzsaws[r] ?? 0;
      for (let k = 0; k < count; k++) {
        for (let c = 0; c < 5; c++) {
          const idx = r * 5 + c;
          const cur = BUZZSAW_ORDER.findIndex(cls => cells[idx].classList.contains(cls));
          const newLvl = Math.min(BUZZSAW_ORDER.length - 1, (cur === -1 ? 0 : cur) + 1);
          const newCls = BUZZSAW_ORDER[newLvl];
          BUZZSAW_ORDER.forEach(cls => cells[idx].classList.remove(cls));
          if (newCls !== 'none') cells[idx].classList.add(newCls);
          const mult = BUZZSAW_BORDERS[newCls] ?? 0;
          cells[idx].textContent = mult > 0 ? `${mult}×` : '';
          this.audio.play('uiTick'); await sleep(85);
        }
        await sleep(120);
      }
    }

    const tot = inner.querySelector<HTMLElement>('#bonus-total');
    if (tot) tot.textContent = `${result.total}× total — WIN: ${fmt(result.payout)} coins`;
    if (result.payout > 0) this.audio.play(result.payout > _bet * 15 ? 'bigWin' : 'niceWin');
    await sleep(2400);
    overlay.classList.add('hidden');
    return result.payout;
  }

  private async runMegaHatBonus(result: MegaHatResult, _bet: number): Promise<number> {
    const b = this.hud.getBonusOverlay();
    if (!b) return result.payout;
    const { overlay, inner } = b;

    inner.innerHTML = `
      <div class="bonus-title">MEGA HAT BONUS</div>
      <div class="bonus-desc">${result.spaceCount} hat spaces — non-hat cells award prizes!</div>
      <div class="megahat-grid" id="mh-grid"></div>
      <div class="bonus-total" id="bonus-total">&nbsp;</div>`;
    overlay.classList.remove('hidden');

    const gridEl = document.getElementById('mh-grid')!;
    const cells: HTMLElement[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const el = document.createElement('div'); el.className = 'megahat-cell';
      gridEl.appendChild(el); cells.push(el);
    }
    await sleep(400);

    for (let i = 0; i < 15; i++) {
      const r = Math.floor(i / 5), c = i % 5;
      if (result.grid[r]?.[c] === 'hat') {
        cells[i].textContent = '🎩'; cells[i].classList.add('hat');
      } else {
        cells[i].textContent = String(result.prizeGrid[r]?.[c] ?? 0);
        cells[i].classList.add('prize');
      }
      this.audio.play('uiTick'); await sleep(105);
    }

    const tot = inner.querySelector<HTMLElement>('#bonus-total');
    if (tot) tot.textContent = `${result.total}× total — WIN: ${fmt(result.payout)} coins`;
    if (result.payout > 0) this.audio.play(result.payout > _bet * 15 ? 'bigWin' : 'niceWin');
    await sleep(2400);
    overlay.classList.add('hidden');
    return result.payout;
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Spin finalization                                             */
  /* ══════════════════════════════════════════════════════════════ */

  private async finalizeSpin(response: SpinResponse, wasFsMode: boolean): Promise<void> {
    this.machine = 'WIN_PRESENTATION';

    // The definitive win is totalWin from server (includes FS credit on completion)
    const win = response.totalWin;
    this.balance = response.balanceAfter;
    this.hud.updateBalance(this.balance);

    if (win > 0) {
      await this.hud.setLastWin(win);

      // Big win celebration
      const effectiveBet = wasFsMode ? this.fsLockedBet : BET_LEVELS[this.betLevelIdx].total;
      const mult = effectiveBet > 0 ? win / effectiveBet : 0;
      const tier = getWinTier(mult);

      if (mult >= 5) {
        this.hud.showCelebration(tier.label, win, tier.color);
        await waitClickOrTimeout(tier.dur);
        this.hud.hideCelebration();

        this.track('big_win', { winTier: tier.id, winAmount: win, winMultiple: mult });
      }
    }

    this.track('spin_result', {
      totalWin: win, spinId: response.spinId,
      chainLength: response.chainLength, maxMultiplier: response.maxMultiplier,
    });

    // Continue FS auto-spin if remaining
    if (this.isFsMode && this.fsRemaining > 0) {
      this.machine = 'IDLE';
      await sleep(this.quickSpin ? 250 : 420);
      await this.doSpin('free_spin');
      return;
    }

    this.machine = 'IDLE';
    this.hud.setControlsEnabled(true);

    // Balance exhausted?
    if (this.balance < BET_LEVELS[0].total && !this.isFsMode) {
      this.hud.showRestart();
      this.stopAutoplay();
      return;
    }

    // Autoplay continuation
    if (this.autoplayActive) {
      let stop = false;
      if (this.autoplayStopOnFeature && response.features.length > 0) stop = true;
      if (this.autoplayStopOnBigWin  && win / BET_LEVELS[this.betLevelIdx].total >= 15) stop = true;
      if (this.autoplayRemaining === 0) stop = true;

      if (stop) { this.stopAutoplay(); return; }

      this.autoplayRemaining = Math.max(-1, this.autoplayRemaining - 1);
      await sleep(this.quickSpin ? 200 : 380);
      if (this.autoplayActive) this.doSpin('autoplay');
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Buy Feature                                                   */
  /* ══════════════════════════════════════════════════════════════ */

  private openBuyFS(): void {
    if (this.machine !== 'IDLE') return;
    const cost = BET_LEVELS[this.betLevelIdx].total * 75;
    if (this.balance < cost) { this.hud.toast('Insufficient balance'); return; }
    this.hud.openBuyConfirm('FS', cost, () => this.executeBuyFS());
  }

  private openBuyWheel(): void {
    if (this.machine !== 'IDLE') return;
    const cost = BET_LEVELS[this.betLevelIdx].total * 50;
    if (this.balance < cost) { this.hud.toast('Insufficient balance'); return; }
    this.hud.openBuyConfirm('WHEEL', cost, () => this.executeBuyWheel());
  }

  private async executeBuyFS(): Promise<void> {
    if (this.machine !== 'IDLE') return;
    this.machine = 'SPINNING';
    this.hud.setControlsEnabled(false);
    this.chainTotal = 0;

    let response: SpinResponse;
    try {
      response = await this.api.buySpin('FS', this.betLevelIdx);
    } catch (err: unknown) {
      this.machine = 'IDLE';
      this.hud.toast((err instanceof Error ? err.message : 'Error') + ' — retry');
      this.hud.setControlsEnabled(true);
      return;
    }

    this.balance = response.balanceAfter;
    this.hud.updateBalance(this.balance);

    if (response.freeSpinsState) {
      this.isFsMode       = true;
      this.fsRemaining    = response.freeSpinsState.remaining;
      this.fsRunningTotal = response.freeSpinsState.runningTotal;
      this.fsLockedBet    = response.freeSpinsState.lockedBet;
    }

    this.machine = 'FEATURE_CHECK';
    await this.processFeatures(response, false);
    await this.finalizeSpin(response, false);
  }

  private async executeBuyWheel(): Promise<void> {
    if (this.machine !== 'IDLE') return;
    this.machine = 'SPINNING';
    this.hud.setControlsEnabled(false);
    this.chainTotal = 0;

    let response: SpinResponse;
    try {
      response = await this.api.buySpin('WHEEL', this.betLevelIdx);
    } catch (err: unknown) {
      this.machine = 'IDLE';
      this.hud.toast((err instanceof Error ? err.message : 'Error') + ' — retry');
      this.hud.setControlsEnabled(true);
      return;
    }

    this.balance = response.balanceAfter;
    this.hud.updateBalance(this.balance);

    this.machine = 'FEATURE_CHECK';
    await this.processFeatures(response, false);
    await this.finalizeSpin(response, false);
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Bet controls                                                  */
  /* ══════════════════════════════════════════════════════════════ */

  private betUp(): void {
    if (this.machine !== 'IDLE' || this.isFsMode) return;
    if (this.betLevelIdx < BET_LEVELS.length - 1) {
      this.betLevelIdx++;
      this.hud.updateBet(BET_LEVELS[this.betLevelIdx]);
      this.audio.play('click');
    }
  }

  private betDown(): void {
    if (this.machine !== 'IDLE' || this.isFsMode) return;
    if (this.betLevelIdx > 0) {
      this.betLevelIdx--;
      this.hud.updateBet(BET_LEVELS[this.betLevelIdx]);
      this.audio.play('click');
    }
  }

  private betMax(): void {
    if (this.machine !== 'IDLE' || this.isFsMode) return;
    for (let i = BET_LEVELS.length - 1; i >= 0; i--) {
      if (BET_LEVELS[i].total <= this.balance) {
        this.betLevelIdx = i;
        this.hud.updateBet(BET_LEVELS[i]);
        this.audio.play('click');
        return;
      }
    }
  }

  private autoDowngradeBet(): void {
    while (this.betLevelIdx > 0 && BET_LEVELS[this.betLevelIdx].total > this.balance) {
      this.betLevelIdx--;
    }
    this.hud.updateBet(BET_LEVELS[this.betLevelIdx]);
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Autoplay                                                      */
  /* ══════════════════════════════════════════════════════════════ */

  private handleAutoplayBtn(): void {
    if (this.autoplayActive) { this.stopAutoplay(); return; }
    this.hud.openAutoplayDialog();
  }

  private confirmAutoplay(): void {
    if (this.machine !== 'IDLE') return;
    const settings = this.hud.getAutoplaySettings();
    this.hud.closeAutoplayDialog();
    this.startAutoplay(settings.count, settings.stopOnFeature, settings.stopOnBigWin);
  }

  private startAutoplay(count: number, stopOnFeature: boolean, stopOnBigWin: boolean): void {
    this.autoplayActive       = true;
    this.autoplayRemaining    = count;
    this.autoplayStopOnFeature = stopOnFeature;
    this.autoplayStopOnBigWin  = stopOnBigWin;
    this.hud.setAutoplayActive(true);
    this.track('autoplay_start', { spinsRequested: count });
    this.doSpin('autoplay');
  }

  private stopAutoplay(): void {
    this.autoplayActive = false;
    this.hud.setAutoplayActive(false);
    this.track('autoplay_stop', { reason: 'manual_or_complete' });
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Quick spin & restart                                          */
  /* ══════════════════════════════════════════════════════════════ */

  private toggleQuick(): void {
    this.quickSpin = !this.quickSpin;
    this.hud.setQuickActive(this.quickSpin);
    this.audio.play('click');
  }

  private async restart(): Promise<void> {
    this.stopAutoplay();
    this.machine    = 'IDLE';
    this.isFsMode   = false;
    this.hud.hideFSBanner();
    this.hud.hideRestart();

    try {
      const data    = await this.api.init(this.betLevelIdx);
      this.balance  = data.balance;
      this.betLevelIdx = data.betLevelIdx;
      this.hud.updateBalance(this.balance);
      this.hud.updateBet(BET_LEVELS[this.betLevelIdx]);
      this.hud.setControlsEnabled(true);
      this.hud.toast('New session started');
    } catch {
      this.hud.toast('Restart failed — please refresh the page');
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Analytics                                                     */
  /* ══════════════════════════════════════════════════════════════ */

  private track(event: string, params: Record<string, unknown> = {}): void {
    this.analyticsBuffer.push({ ts: Date.now(), event, ...params });
    if (this.analyticsBuffer.length >= 50) this.flushAnalytics();
  }

  private flushAnalytics(): void {
    if (this.analyticsBuffer.length === 0) return;
    const toSend = this.analyticsBuffer.splice(0);
    this.api.sendAnalytics(toSend);
  }
}
