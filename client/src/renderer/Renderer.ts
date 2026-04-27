/**
 * Renderer — Professional casino-grade Canvas 2D renderer.
 * Reel physics: acceleration → full-speed blur → deceleration → overshoot bounce → settle.
 * Matches Light & Wonder / Huff N Puff visual quality.
 */
import { SYMBOLS, PAYLINES, SPIN_POOL } from '../config/constants';

export interface RendererCell { sym: string; golden: boolean }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; age: number; color: string; size: number;
  gravity?: number;
}
interface FloatingWin  { row: number; reel: number; amount: number; age: number; life: number }
interface BurstFlash   { row: number; reel: number; age: number }
interface WinLineDraw  { lines: number[]; counts: Record<number, number>; t: number; dur: number }

/** All distances in virtual pixels (cellSize units), time in ms */
interface ReelState {
  phase:      'idle' | 'lurch' | 'accel' | 'full' | 'decel';
  // Strip: infinite tape of symbol IDs. offsetY is the number of px scrolled DOWN from index 0.
  strip:      string[];
  offsetY:    number;   // monotonically increasing, never wraps
  speed:      number;   // px/ms (instantaneous)
  // Decel target
  targetY:    number;
  decStartY:  number;
  decStartSpd:number;
  decDur:     number;
  decStartAt: number;
  // Lurch — initial upward nudge (visual only, uses ctx.translate)
  lurchAmt:   number;
  lurchDur:   number;
  lurchAt:    number;
  startedAt:  number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private W = 1280; private H = 720;
  private gridArea = { x: 0, y: 0, w: 0, h: 0 };
  private cellSize = 100;

  // ── Reel physics constants ───────────────────────
  private static readonly MAX_SPEED    = 2.6;  // px/ms at full spin
  private static readonly ACCEL_DUR    = 160;  // ms to reach full speed (quadratic ease-in)
  private static readonly LURCH_AMT    = 14;   // px upward nudge before launch
  private static readonly LURCH_DUR    = 90;   // ms of lurch
  private static readonly DECEL_DUR    = 420;  // ms deceleration (quartic ease-out)

  private reelStates: ReelState[] = Array.from({ length: 5 }, () => ({
    phase: 'idle' as const,
    strip: [], offsetY: 0, speed: 0,
    targetY: 0, decStartY: 0, decStartSpd: 0, decDur: 0, decStartAt: 0,
    lurchAmt: 0, lurchDur: 0, lurchAt: 0,
    startedAt: 0,
  }));

  private grid: RendererCell[][] | null = null;
  private winCells: Set<string> | null = null;
  private winPulse = 0;
  private particles: Particle[] = [];
  private floatingWins: FloatingWin[] = [];
  private morphFlash: Record<string, number> = {};
  private burstFlashes: BurstFlash[] = [];
  private goldenShimmer = 0;
  private winLineDraw: WinLineDraw | null = null;
  private anticipationReels: Set<number> = new Set();
  private lastT = 0;

  constructor(canvasEl: HTMLCanvasElement) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(t => this.loop(t));
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W   = Math.max(320, Math.floor(rect.width));
    this.H   = Math.max(240, Math.floor(rect.height));
    this.canvas.width  = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width  = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const pad    = Math.min(this.W, this.H) * 0.04;
    const availW = this.W - pad * 2;
    const availH = this.H - pad * 2;
    const cellByW = Math.floor(availW / 5);
    const cellByH = Math.floor(availH / 3);
    this.cellSize = Math.min(cellByW, cellByH);
    const gw = this.cellSize * 5;
    const gh = this.cellSize * 3;
    this.gridArea = { x: (this.W - gw) / 2, y: (this.H - gh) / 2, w: gw, h: gh };
  }

  /* ── Public API ─────────────────────────────────── */

  setGrid(g: RendererCell[][]): void { this.grid = g; }

  /** Returns {row, col} (0-based) for a canvas CSS-pixel coordinate, or null if outside grid. */
  getCellAt(cssX: number, cssY: number): { row: number; col: number } | null {
    const ga = this.gridArea;
    if (cssX < ga.x || cssX > ga.x + ga.w || cssY < ga.y || cssY > ga.y + ga.h) return null;
    const col = Math.floor((cssX - ga.x) / this.cellSize);
    const row = Math.floor((cssY - ga.y) / this.cellSize);
    if (col < 0 || col > 4 || row < 0 || row > 2) return null;
    return { row, col };
  }
  setWinCells(s: Set<string>): void  { this.winCells = s; this.winPulse = 0; }
  clearWinHighlight(): void          { this.winCells = null; this.winPulse = 0; this.winLineDraw = null; }

  /** Show one or more payline traces for the current step. dur should match winHighlightDur.
   *  counts: Record<lineNumber, matchCount> — used to split line into bright (matched) + dim tail. */
  setWinLines(lines: number[], dur = 800, counts: Record<number, number> = {}): void {
    this.winLineDraw = lines.length ? { lines, counts, t: 0, dur } : null;
  }
  /** Convenience single-line shim (backward compat). */
  setWinLine(line: number | null, dur = 800): void {
    this.setWinLines(line ? [line] : [], dur);
  }
  setAnticipation(reels: number[]): void { this.anticipationReels = new Set(reels); }

  startReelSpin(reelIdx: number): void {
    const r = this.reelStates[reelIdx];
    const now = performance.now();

    // Pre-fill strip: start with the current grid column so the lurch visually
    // lifts the visible symbols upward before they blur.
    const colSyms: string[] = [];
    if (this.grid) {
      for (let row = 0; row < 3; row++) {
        colSyms.push(this.grid[row]?.[reelIdx]?.sym ?? this.randomSym());
      }
    }
    // Build: [above-viewport pad] [current grid] [launch pad of randoms]
    const preLen = 6;
    const launchPad = 80;
    r.strip = [
      ...Array.from({ length: preLen }, () => this.randomSym()),
      ...colSyms,
      ...Array.from({ length: launchPad }, () => this.randomSym()),
    ];

    // offsetY so row-0 of current grid is visible at the top:
    // index = preLen, position = preLen * cellSize
    r.offsetY   = preLen * this.cellSize;
    r.speed     = 0;
    r.startedAt = now;
    r.lurchAmt  = Renderer.LURCH_AMT;
    r.lurchDur  = Renderer.LURCH_DUR;
    r.lurchAt   = now;
    r.phase     = 'lurch';
  }

  stopReel(reelIdx: number): void {
    const r = this.reelStates[reelIdx];
    if (r.phase === 'idle' || r.phase === 'decel') return;
    const now = performance.now();
    const cs  = this.cellSize;

    // How far will we travel during cubic ease-out decel?
    // For cubic ease-out: integral of (1-t)^2 over [0,1] = 1/3
    // So total distance = speed * decDur / 3
    const decDur  = Renderer.DECEL_DUR;
    const decDist = r.speed * decDur / 3;

    // The reel must stop with the 3 grid symbols exactly in rows 0-1-2.
    // landingIdx = first symbol visible at row 0 = index into strip
    const rawLanding = (r.offsetY + decDist) / cs;
    const landingIdx = Math.ceil(rawLanding) + 1; // +1 safety margin

    // Extend strip to accommodate
    while (r.strip.length < landingIdx + 8) r.strip.push(this.randomSym());

    // Plant target grid symbols
    const g = this.grid;
    if (g) {
      r.strip[landingIdx]     = g[0]?.[reelIdx]?.sym ?? this.randomSym();
      r.strip[landingIdx + 1] = g[1]?.[reelIdx]?.sym ?? this.randomSym();
      r.strip[landingIdx + 2] = g[2]?.[reelIdx]?.sym ?? this.randomSym();
    }

    const targetY = landingIdx * cs;  // always a cell-aligned position

    r.targetY     = targetY;
    r.decStartY   = r.offsetY;
    r.decStartSpd = r.speed;
    r.decDur      = decDur;
    r.decStartAt  = now;
    r.phase       = 'decel';
  }

  flashMorph(row: number, reel: number): void { this.morphFlash[`${row},${reel}`] = 0; }
  flashBurst(row: number, reel: number): void { this.burstFlashes.push({ row, reel, age: 0 }); }
  flyWin(row: number, reel: number, amount: number): void {
    this.floatingWins.push({ row, reel, amount, age: 0, life: 1200 });
  }

  spawnBurstParticles(row: number, reel: number, count = 12): void {
    const { x, y } = this.cellCenter(row, reel);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 200;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 700 + Math.random() * 300, age: 0,
        color: Math.random() < 0.5 ? '#E3A02C' : '#FFC24A',
        size: 4 + Math.random() * 4,
      });
    }
  }

  spawnWinParticles(row: number, reel: number): void {
    const { x, y } = this.cellCenter(row, reel);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = 80 + Math.random() * 120;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 700, age: 0, color: '#FFC24A', size: 3 + Math.random() * 3,
        gravity: 320,
      });
    }
  }

  get gridInfo() { return { area: this.gridArea, cellSize: this.cellSize }; }

  /* ── Internal loop ──────────────────────────────── */

  private loop(t: number): void {
    requestAnimationFrame(tt => this.loop(tt));
    const dt = Math.min(50, t - (this.lastT || t));
    this.lastT = t;
    this.update(dt, t);
    this.draw(t);
  }

  private update(dt: number, t: number): void {
    this.winPulse      = (this.winPulse + dt) % 2000;
    this.goldenShimmer = (this.goldenShimmer + dt * 0.2) % 2000;

    const MAX  = Renderer.MAX_SPEED;
    for (let i = 0; i < 5; i++) {
      const r = this.reelStates[i];
      if (r.phase === 'idle') continue;

      if (r.phase === 'lurch') {
        // Visual-only upward nudge before launch. offsetY doesn't scroll yet.
        // The draw code reads lurchAt/lurchDur/lurchAmt to compute displacement.
        const p = Math.min(1, (t - r.lurchAt) / r.lurchDur);
        if (p >= 1) {
          r.phase     = 'accel';
          r.startedAt = t;
        }

      } else if (r.phase === 'accel') {
        // Quadratic ease-in acceleration
        const p   = Math.min(1, (t - r.startedAt) / Renderer.ACCEL_DUR);
        r.speed   = MAX * p * p;
        r.offsetY += r.speed * dt;
        if (p >= 1) { r.speed = MAX; r.phase = 'full'; }

      } else if (r.phase === 'full') {
        r.speed    = MAX;
        r.offsetY += MAX * dt;

      } else if (r.phase === 'decel') {
        // Quartic ease-out: decelerates firmly, no overshoot, clean stop
        const p   = Math.min(1, (t - r.decStartAt) / r.decDur);
        const ep  = 1 - Math.pow(1 - p, 4);
        r.offsetY = r.decStartY + (r.targetY - r.decStartY) * ep;
        r.speed   = r.decStartSpd * Math.pow(1 - p, 3);
        if (p >= 1) {
          r.offsetY = r.targetY;
          r.speed   = 0;
          r.phase   = 'idle';
        }
      }
    }

    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      if (p.gravity) p.vy += p.gravity * dt / 1000;
    }
    this.particles = this.particles.filter(p => p.age < p.life);

    for (const f of this.floatingWins) f.age += dt;
    this.floatingWins = this.floatingWins.filter(f => f.age < f.life);

    for (const k in this.morphFlash) {
      this.morphFlash[k] += dt;
      if (this.morphFlash[k] > 600) delete this.morphFlash[k];
    }
    for (const b of this.burstFlashes) b.age += dt;
    this.burstFlashes = this.burstFlashes.filter(b => b.age < 800);

    if (this.winLineDraw) {
      this.winLineDraw.t += dt;
      if (this.winLineDraw.t > this.winLineDraw.dur) this.winLineDraw = null;
    }
  }

  private draw(t: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawBackground();
    this.drawFrame();
    this.drawGrid(t);
    this.drawWinOverlay();
    this.drawParticles();
    this.drawFloatingWins();
  }

  private drawBackground(): void {
    const { W, H, ctx } = this;
    // Deep atmospheric gradient — dark center, warm edges
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.05, W * 0.5, H * 0.5, H * 0.9);
    bg.addColorStop(0,   '#2c1810');
    bg.addColorStop(0.5, '#1a0c08');
    bg.addColorStop(1,   '#0a0404');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle vignette corners
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.3, W * 0.5, H * 0.5, H * 0.85);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  private drawFrame(): void {
    const { ctx, gridArea: { x, y, w, h }, cellSize: cs } = this;
    const pad = cs * 0.22;

    // ── Outer cabinet shadow ──────────────────────
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur  = 40;
    this.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 22);
    const outerGrad = ctx.createLinearGradient(0, y - pad, 0, y + h + pad);
    outerGrad.addColorStop(0,   '#9a3d2c');
    outerGrad.addColorStop(0.4, '#6b2418');
    outerGrad.addColorStop(1,   '#2e0e08');
    ctx.fillStyle = outerGrad;
    ctx.fill();
    ctx.restore();

    // ── Inner recess (dark backing behind symbols) ─
    ctx.save();
    this.roundRect(x - 3, y - 3, w + 6, h + 6, 12);
    ctx.fillStyle = '#0d0608';
    ctx.fill();
    ctx.restore();

    // ── Per-column alternate tint (subtle depth) ──
    for (let c = 0; c < 5; c++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + c * cs, y, cs, h);
      ctx.fillStyle = c % 2 === 0
        ? 'rgba(255,255,255,.012)'
        : 'rgba(0,0,0,.06)';
      ctx.fill();
      ctx.restore();
    }

    // ── Column dividers (vertical separators) ─────
    ctx.save();
    ctx.lineWidth = 2;
    for (let c = 1; c < 5; c++) {
      const divX = x + c * cs;
      const divGrad = ctx.createLinearGradient(0, y, 0, y + h);
      divGrad.addColorStop(0,   'rgba(255,255,255,.05)');
      divGrad.addColorStop(0.5, 'rgba(255,255,255,.18)');
      divGrad.addColorStop(1,   'rgba(255,255,255,.05)');
      ctx.strokeStyle = divGrad;
      ctx.beginPath();
      ctx.moveTo(divX, y + cs * 0.06);
      ctx.lineTo(divX, y + h - cs * 0.06);
      ctx.stroke();
    }
    ctx.restore();

    // ── Rim highlight (top edge bevel) ────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth   = 1.5;
    this.roundRect(x - pad + 2, y - pad + 2, w + pad * 2 - 4, h + pad * 2 - 4, 22);
    ctx.stroke();
    ctx.restore();
  }

  private drawGrid(t: number): void {
    if (!this.grid) return;
    const { ctx, gridArea: { x, y }, cellSize: cs } = this;

    for (let c = 0; c < 5; c++) {
      const r = this.reelStates[c];
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + c * cs, y, cs, cs * 3);
      ctx.clip();

      if (r.phase === 'lurch') {
        // Visual-only upward nudge on the static grid via canvas translate.
        // Never changes offsetY or which strip symbols appear — no flicker.
        const lurchP  = Math.min(1, (t - r.lurchAt) / r.lurchDur);
        const nudge   = -r.lurchAmt * Math.sin(lurchP * Math.PI); // 0 → peak → 0
        ctx.translate(0, nudge);
        for (let row = 0; row < 3; row++) {
          const cell = this.grid![row]?.[c];
          if (cell) this.drawSymbol(x + c * cs, y + row * cs, cs, cell, 1, t);
        }

      } else if (r.phase !== 'idle') {
        // ── Active scroll (accel / full / decel) ─────────────────────────────
        const topIdx  = Math.floor(r.offsetY / cs);
        const partial = r.offsetY - topIdx * cs;  // sub-cell fractional scroll

        // Speed ratio [0,1] for blur intensity
        const speedRatio = Math.min(1, r.speed / Renderer.MAX_SPEED);

        // ── Motion blur: ghost copies trailing upward ─────────────────────────
        if (speedRatio > 0.15) {
          for (let layer = 1; layer <= 5; layer++) {
            const t2         = layer / 5;
            const ghostOff   = t2 * speedRatio * cs * 0.85;
            const ghostAlpha = (1 - t2) * speedRatio * 0.2;
            if (ghostAlpha < 0.01) continue;
            for (let row = -1; row <= 3; row++) {
              const idx = topIdx + row;
              if (idx < 0 || idx >= r.strip.length) continue;
              const drawY = y + row * cs - partial - ghostOff;
              if (drawY + cs < y || drawY > y + cs * 3) continue;
              this.drawSymbol(x + c * cs, drawY, cs, { sym: r.strip[idx], golden: false }, ghostAlpha, t);
            }
          }
        }

        // ── Speed-dependent dark overlay (makes blur more convincing at full speed)
        if (speedRatio > 0.05) {
          ctx.save();
          const blurGrad = ctx.createLinearGradient(x + c * cs, y, x + c * cs, y + cs * 3);
          const ba = speedRatio * 0.5;
          blurGrad.addColorStop(0,   `rgba(18,9,7,${ba})`);
          blurGrad.addColorStop(0.25,`rgba(18,9,7,0)`);
          blurGrad.addColorStop(0.75,`rgba(18,9,7,0)`);
          blurGrad.addColorStop(1,   `rgba(18,9,7,${ba})`);
          ctx.fillStyle = blurGrad;
          ctx.fillRect(x + c * cs, y, cs, cs * 3);
          ctx.restore();
        }

        // ── Primary symbols ───────────────────────────────────────────────────
        const symAlpha = 1 - speedRatio * 0.5;
        for (let row = -1; row <= 3; row++) {
          const idx = topIdx + row;
          if (idx < 0 || idx >= r.strip.length) continue;
          const drawY = y + row * cs - partial;
          if (drawY + cs < y || drawY > y + cs * 3) continue;
          this.drawSymbol(x + c * cs, drawY, cs, { sym: r.strip[idx], golden: false }, symAlpha, t);
        }

        // ── Top/bottom vignette ───────────────────────────────────────────────
        ctx.save();
        const vig = ctx.createLinearGradient(x + c * cs, y, x + c * cs, y + cs * 3);
        vig.addColorStop(0,    'rgba(13,6,5,.88)');
        vig.addColorStop(0.14, 'rgba(13,6,5,0)');
        vig.addColorStop(0.86, 'rgba(13,6,5,0)');
        vig.addColorStop(1,    'rgba(13,6,5,.88)');
        ctx.fillStyle = vig;
        ctx.fillRect(x + c * cs, y, cs, cs * 3);
        ctx.restore();

      } else {
        // ── Idle/settled: draw grid symbols cleanly ──────────────────────────
        for (let row = 0; row < 3; row++) {
          const cell = this.grid![row]?.[c];
          if (!cell) continue;
          const isWin   = !!(this.winCells?.has(`${row},${c}`));
          // Dim non-winning cells while win highlight is active so winners pop visually
          const dimAlpha = (this.winCells && !isWin) ? 0.28 : 1;
          const morphAge = this.morphFlash[`${row},${c}`];
          if (morphAge !== undefined) {
            const p = morphAge / 600;
            ctx.globalAlpha = Math.max(0.1, 1 - p) * dimAlpha;
          } else {
            ctx.globalAlpha = dimAlpha;
          }
          this.drawSymbol(x + c * cs, y + row * cs, cs, cell, 1, t, isWin);
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
    }

    // Burst rings
    for (const b of this.burstFlashes) {
      const pct = b.age / 800;
      const { x: cx, y: cy } = this.cellCenter(b.row, b.reel);
      ctx.save();
      ctx.globalAlpha = 1 - pct;
      ctx.strokeStyle = '#FFC24A';
      ctx.lineWidth   = 4 + (1 - pct) * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.5 + pct * cs * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Anticipation glow
    if (this.anticipationReels.size > 0) {
      for (const rIdx of this.anticipationReels) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,200,80,.08)';
        ctx.fillRect(x + rIdx * cs, y, cs, cs * 3);
        ctx.restore();
      }
    }
  }

  private drawWinOverlay(): void {
    if (!this.winCells) return;
    const { ctx, gridArea, cellSize, winPulse } = this;
    const pulse = 0.5 + 0.5 * Math.sin(winPulse / 250);

    // Filled golden overlay on winning cells
    ctx.save();
    ctx.fillStyle = `rgba(227,160,44,${0.13 + 0.10 * pulse})`;
    for (const key of this.winCells) {
      const [row, reel] = key.split(',').map(Number);
      const cx = gridArea.x + reel * cellSize;
      const cy = gridArea.y + row  * cellSize;
      this.roundRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4, 10);
      ctx.fill();
    }
    ctx.restore();

    // Glowing border stroke
    ctx.save();
    ctx.strokeStyle = `rgba(255,194,74,${0.7 + 0.3 * pulse})`;
    ctx.lineWidth   = 3 + pulse * 3;
    ctx.shadowColor = '#FFC24A';
    ctx.shadowBlur  = 12 + pulse * 16;
    for (const key of this.winCells) {
      const [row, reel] = key.split(',').map(Number);
      const cx = gridArea.x + reel * cellSize;
      const cy = gridArea.y + row  * cellSize;
      this.roundRect(cx + 3, cy + 3, cellSize - 6, cellSize - 6, 10);
      ctx.stroke();
    }
    ctx.restore();

    if (this.winLineDraw) {
      const alpha  = 0.65 + 0.35 * Math.sin(winPulse / 180);
      const LINE_COLORS = [
        '#FFE040','#FF7043','#66BB6A','#42A5F5','#AB47BC',
        '#26C6DA','#FF7043','#9CCC65','#FFA726','#EC407A',
      ];
      for (const lineIdx of this.winLineDraw.lines) {
        const payline = PAYLINES[lineIdx - 1];
        if (!payline) continue;
        const color = LINE_COLORS[(lineIdx - 1) % LINE_COLORS.length];
        const matchCount = this.winLineDraw.counts[lineIdx] ?? 5; // default full line

        // Helper to get pixel centre of a reel position on this payline
        const px = (r: number) => gridArea.x + r * cellSize + cellSize / 2;
        const py = (r: number) => gridArea.y + payline[r] * cellSize + cellSize / 2;

        // ── Outer glow — matched reels only ──────────────────────────────────
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineWidth   = 14;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 22;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.beginPath();
        for (let r = 0; r < matchCount; r++) {
          if (r === 0) ctx.moveTo(px(r), py(r)); else ctx.lineTo(px(r), py(r));
        }
        ctx.stroke();
        ctx.restore();

        // ── Inner bright line — matched reels only ────────────────────────────
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = alpha * 0.9;
        ctx.lineWidth   = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.beginPath();
        for (let r = 0; r < matchCount; r++) {
          if (r === 0) ctx.moveTo(px(r), py(r)); else ctx.lineTo(px(r), py(r));
        }
        ctx.stroke();
        ctx.restore();

        // ── Node dots — matched reels only, no tail ───────────────────────────
        ctx.save();
        ctx.globalAlpha = alpha;
        for (let r = 0; r < matchCount; r++) {
          ctx.beginPath();
          ctx.arc(px(r), py(r), 8, 0, Math.PI * 2);
          ctx.fillStyle   = '#FFFFFF';
          ctx.shadowColor = color;
          ctx.shadowBlur  = 16;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px(r), py(r), 5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      this.ctx.save();
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle   = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private drawFloatingWins(): void {
    const { ctx, cellSize } = this;
    for (const f of this.floatingWins) {
      const p      = f.age / f.life;
      const { x, y } = this.cellCenter(f.row, f.reel);
      ctx.save();
      ctx.globalAlpha  = 1 - p;
      ctx.font         = `bold ${Math.floor(cellSize * 0.3)}px Inter,sans-serif`;
      ctx.textAlign    = 'center';
      ctx.fillStyle    = '#FFC24A';
      ctx.shadowColor  = '#E3A02C';
      ctx.shadowBlur   = 14;
      ctx.fillText(`+${Math.floor(f.amount)}`, x, y - p * 60);
      ctx.restore();
    }
  }

  /* ── Symbol drawing ─────────────────────────────── */

  private drawSymbol(
    x: number, y: number, size: number,
    cell: RendererCell, alpha = 1, _t = 0, highlight = false,
  ): void {
    const sym = SYMBOLS[cell.sym];
    if (!sym) return;
    const ctx   = this.ctx;
    const pad   = size * 0.08;
    const cx    = x + size / 2;
    const cy    = y + size / 2;
    const inner = size - pad * 2;

    ctx.save();
    ctx.globalAlpha *= alpha;

    // Background tile
    this.roundRect(x + pad, y + pad, inner, inner, size * 0.14);
    const bgGrad = ctx.createLinearGradient(0, y + pad, 0, y + pad + inner);
    if (cell.sym === 'W01' || cell.sym === 'W02') {
      bgGrad.addColorStop(0, '#FFC24A'); bgGrad.addColorStop(1, '#B8701A');
    } else if (cell.sym === 'SC01') {
      bgGrad.addColorStop(0, '#E26A4A'); bgGrad.addColorStop(1, '#5E1B12');
    } else if (cell.golden) {
      bgGrad.addColorStop(0, '#FFE289'); bgGrad.addColorStop(1, '#B8701A');
    } else if (sym.cat === 'character') {
      bgGrad.addColorStop(0, '#4a3a3a'); bgGrad.addColorStop(1, '#2a1c1c');
    } else {
      bgGrad.addColorStop(0, '#2a1f1f'); bgGrad.addColorStop(1, '#18100e');
    }
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Border
    ctx.lineWidth   = Math.max(1, size * 0.02);
    ctx.strokeStyle = highlight ? '#FFC24A' : 'rgba(255,255,255,.08)';
    ctx.stroke();

    // Highlight glow
    if (highlight) {
      const pulse = 0.5 + 0.5 * Math.sin(this.winPulse / 200);
      ctx.save();
      ctx.shadowColor  = '#FFC24A';
      ctx.shadowBlur   = 12 + pulse * 10;
      ctx.strokeStyle  = `rgba(255,200,80,${0.7 + 0.3 * pulse})`;
      ctx.lineWidth    = 2 + pulse * 2;
      this.roundRect(x + pad, y + pad, inner, inner, size * 0.14);
      ctx.stroke();
      ctx.restore();
    }

    // Symbol content
    if (sym.cat === 'character') {
      this.drawCharacter(cx, cy, size * 0.85, cell.sym);
    } else if (sym.cat === 'basic' && ['S01','S02','S03','S04','S05'].includes(cell.sym)) {
      this.drawCard(cx, cy, size * 0.75, cell.sym);
    } else if (sym.cat === 'basic') {
      this.drawGem(cx, cy, size * 0.55, sym.color);
    } else if (cell.sym === 'W01' || cell.sym === 'W02') {
      this.drawWild(cx, cy, size * 0.7, cell.sym === 'W02');
    } else if (cell.sym === 'SC01') {
      this.drawScatter(cx, cy, size * 0.6);
    }

    // Golden shimmer
    if (cell.golden) {
      const shimmer = 0.3 + 0.2 * Math.sin(this.goldenShimmer / 200);
      ctx.save();
      ctx.globalAlpha = shimmer;
      ctx.fillStyle   = '#FFE289';
      this.roundRect(x + pad, y + pad, inner, inner, size * 0.14);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#FFF3B0'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private drawCard(cx: number, cy: number, size: number, symId: string): void {
    const sym = SYMBOLS[symId];
    const ctx = this.ctx;
    ctx.save();
    const w = size * 0.75, h = size * 0.95;
    this.roundRect(cx - w / 2, cy - h / 2, w, h, 8);
    ctx.fillStyle   = '#f5e8d0'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle   = sym.color;
    ctx.font        = `bold ${Math.floor(size * 0.6)}px "Georgia",serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sym.glyph, cx, cy);
    ctx.restore();
  }

  private drawGem(cx: number, cy: number, size: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.85, cy - size * 0.25);
    ctx.lineTo(cx + size * 0.55, cy + size);
    ctx.lineTo(cx - size * 0.55, cy + size);
    ctx.lineTo(cx - size * 0.85, cy - size * 0.25);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, cy - size, 0, cy + size);
    grad.addColorStop(0, this.lighten(color, 0.5));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, this.darken(color, 0.3));
    ctx.fillStyle   = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.3, cy - size * 0.4);
    ctx.lineTo(cx + size * 0.3, cy - size * 0.4);
    ctx.lineTo(cx, cy + size * 0.3);
    ctx.closePath();
    ctx.fillStyle = this.lighten(color, 0.3); ctx.fill();
    ctx.restore();
  }

  private drawCharacter(cx: number, cy: number, size: number, symId: string): void {
    const ctx = this.ctx;
    const emojiMap: Record<string, string> = { C01:'🐖', C02:'🐷', C03:'🐽', C04:'🐺' };
    const houseMap: Record<string, string> = { C01:'🌾', C02:'🪵', C03:'🧱', C04:''   };
    ctx.save();
    ctx.font          = `${Math.floor(size * 0.85)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.textAlign     = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emojiMap[symId] ?? '?', cx, cy - size * 0.08);
    if (houseMap[symId]) {
      ctx.font = `${Math.floor(size * 0.3)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.fillText(houseMap[symId], cx, cy + size * 0.34);
    }
    ctx.font      = `600 ${Math.max(9, Math.floor(size * 0.12))}px Inter,sans-serif`;
    ctx.fillStyle = '#F4EADE';
    ctx.fillText(SYMBOLS[symId].name.split(' ')[0], cx, cy + size * 0.48);
    ctx.restore();
  }

  private drawWild(cx: number, cy: number, size: number, burst: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle    = burst ? '#FFE289' : '#FFC24A';
    ctx.font         = `900 ${Math.floor(size * 0.8)}px "Cinzel",Georgia,serif`;
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#8F5C13'; ctx.shadowBlur = 10;
    ctx.fillText('W', cx, cy - size * 0.05);
    ctx.shadowBlur   = 0;
    ctx.font         = `600 ${Math.floor(size * 0.14)}px Inter,sans-serif`;
    ctx.fillStyle    = '#5a2216';
    ctx.fillText(burst ? 'BURST' : 'WILD', cx, cy + size * 0.36);
    if (burst) {
      ctx.strokeStyle = 'rgba(255,80,50,.7)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * size * 0.36, cy + Math.sin(a) * size * 0.36);
        ctx.lineTo(cx + Math.cos(a) * size * 0.48, cy + Math.sin(a) * size * 0.48);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawScatter(cx: number, cy: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle   = '#FFC24A'; ctx.strokeStyle = '#5E1B12'; ctx.lineWidth = 2;
    ctx.shadowColor = '#E0A82E'; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? size : size * 0.44;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const px = Math.cos(a) * r; const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#5E1B12';
    ctx.font        = `700 ${Math.floor(size * 0.42)}px Inter,sans-serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FS', 0, 2);
    ctx.restore();
  }

  /* ── Helpers ────────────────────────────────────── */

  private cellCenter(row: number, reel: number) {
    return {
      x: this.gridArea.x + reel * this.cellSize + this.cellSize / 2,
      y: this.gridArea.y + row  * this.cellSize + this.cellSize / 2,
    };
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  private lighten(hex: string, amount: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    return `rgb(${Math.min(255, Math.floor(r + (255-r)*amount))},${Math.min(255, Math.floor(g + (255-g)*amount))},${Math.min(255, Math.floor(b + (255-b)*amount))})`;
  }
  private darken(hex: string, amount: number): string {
    const [r, g, b] = this.hexToRgb(hex);
    return `rgb(${Math.floor(r*(1-amount))},${Math.floor(g*(1-amount))},${Math.floor(b*(1-amount))})`;
  }
  private hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  private randomSym(): string {
    return SPIN_POOL[Math.floor(Math.random() * SPIN_POOL.length)];
  }
}
