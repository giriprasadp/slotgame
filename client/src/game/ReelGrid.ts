import Phaser from 'phaser';
import { SymbolCell, CELL_W, CELL_H } from './SymbolCell';
import { PAYLINES } from '../config/constants';
import { sleep } from '../utils/helpers';
import type { ApiCell, MorphedCell } from '../types/api';

const COLS = 5;
const ROWS = 3;
const GAP_X = 6;
const GAP_Y = 6;

export class ReelGrid extends Phaser.GameObjects.Container {
  private cells: SymbolCell[][] = [];  // [row][col]
  private spinTimers: Phaser.Time.TimerEvent[] = [];
  private winLineGfx: Phaser.GameObjects.Graphics;

  readonly cellW = CELL_W + GAP_X;
  readonly cellH = CELL_H + GAP_Y;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // Create grid
    for (let r = 0; r < ROWS; r++) {
      this.cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        const cx = c * this.cellW;
        const cy = r * this.cellH;
        const cell = new SymbolCell(scene, cx, cy);
        scene.add.existing(cell);
        this.add(cell);
        this.cells[r][c] = cell;
      }
    }

    // Win line layer (drawn on top)
    this.winLineGfx = scene.add.graphics();
    this.add(this.winLineGfx);

    scene.add.existing(this);
  }

  /* ---- Grid access ---- */
  getCell(row: number, reel: number): SymbolCell { return this.cells[row][reel]; }
  getSym(row: number, reel: number): string      { return this.cells[row][reel].sym; }

  cellPos(row: number, reel: number): { x: number; y: number } {
    return {
      x: this.x + reel * this.cellW,
      y: this.y + row  * this.cellH,
    };
  }

  setGrid(grid: ApiCell[][]): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r]?.[c];
        if (cell) this.cells[r][c].setSym(cell.sym, cell.golden);
      }
    }
  }

  setCell(row: number, reel: number, sym: string, golden: boolean): void {
    this.cells[row][reel].setSym(sym, golden);
  }

  /* ---- Spin animation ---- */
  startSpinning(quick = false): void {
    this.stopSpinTimers();
    const interval = quick ? 55 : 90;
    for (let c = 0; c < COLS; c++) {
      const col = c;
      const timer = this.scene.time.addEvent({
        delay: interval,
        callback: () => {
          const sym = SymbolCell.randomSym();
          for (let r = 0; r < ROWS; r++) {
            this.cells[r][col].setSym(sym, false, 0.65);
          }
        },
        loop: true,
      });
      this.spinTimers.push(timer);
    }
  }

  /** Stop a single reel and snap to final symbols (with bounce). Returns a Promise. */
  stopReel(reelIdx: number, syms: string[], goldens: boolean[]): Promise<void> {
    const timer = this.spinTimers[reelIdx];
    if (timer) { timer.remove(); }

    for (let r = 0; r < ROWS; r++) {
      this.cells[r][reelIdx].setSym(syms[r], goldens[r]);
    }

    const targets = [0, 1, 2].map(r => this.cells[r][reelIdx]);
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets,
        scaleY: { from: 0.88, to: 1 },
        duration: 130,
        ease: 'Back.Out',
        onComplete: () => resolve(),
      });
    });
  }

  stopSpinning(): void {
    this.stopSpinTimers();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.cells[r][c].setAlpha(1);
      }
    }
  }

  private stopSpinTimers(): void {
    for (const t of this.spinTimers) t.remove();
    this.spinTimers = [];
  }

  /* ---- Win highlighting ---- */
  highlightCells(cells: { row: number; reel: number }[]): void {
    for (const { row, reel } of cells) {
      this.cells[row][reel].setHighlight(true);
    }
  }

  clearHighlights(): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.cells[r][c].setHighlight(false);
      }
    }
    this.winLineGfx.clear();
  }

  showWinLine(lineIdx: number): void {
    const payline = PAYLINES[lineIdx - 1] ?? PAYLINES[0]; // 1-indexed
    this.winLineGfx.clear();
    this.winLineGfx.lineStyle(3, 0xffffff, 0.7);
    this.winLineGfx.beginPath();
    for (let c = 0; c < COLS; c++) {
      const r   = payline[c];
      const px  = c * this.cellW;
      const py  = r * this.cellH;
      if (c === 0) this.winLineGfx.moveTo(px, py);
      else         this.winLineGfx.lineTo(px, py);
    }
    this.winLineGfx.strokePath();
  }

  flashBurst(row: number, reel: number): void {
    this.cells[row][reel].flashBurst();
  }

  /* ---- Morph animations ---- */
  morphOut(cells: { row: number; reel: number }[]): Promise<void> {
    const targets = cells.map(c => this.cells[c.row][c.reel]);
    if (targets.length === 0) return Promise.resolve();
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets,
        alpha: 0,
        scaleX: 0.8,
        scaleY: 0.8,
        duration: 200,
        ease: 'Power2.In',
        onComplete: () => resolve(),
      });
    });
  }

  morphIn(cells: { row: number; reel: number }[]): Promise<void> {
    const targets = cells.map(c => this.cells[c.row][c.reel]);
    if (targets.length === 0) return Promise.resolve();
    // Reset scale before tweening in
    for (const t of targets) { t.setScale(0.8); t.setAlpha(0); }
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Back.Out',
        onComplete: () => resolve(),
      });
    });
  }

  applyMorphedCells(morphedCells: MorphedCell[]): void {
    for (const mc of morphedCells) {
      this.cells[mc.row][mc.reel].setSym(mc.sym, mc.golden);
    }
  }

  /** Spawn simple particle burst at a cell position */
  spawnWinParticles(row: number, reel: number): void {
    const cx = reel * this.cellW;
    const cy = row  * this.cellH;
    // Use Phaser tweens to animate small rectangles outward
    for (let i = 0; i < 6; i++) {
      const p = this.scene.add.rectangle(
        this.x + cx, this.y + cy, 8, 8,
        [0xFFD700, 0xFFFFFF, 0xFF7B3A][i % 3],
      );
      const angle = (i / 6) * Math.PI * 2;
      const dist  = 40 + Math.random() * 30;
      this.scene.tweens.add({
        targets: p,
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 400 + Math.random() * 200,
        onComplete: () => p.destroy(),
      });
    }
  }

  /* ---- Total dimensions (for layout) ---- */
  get totalWidth():  number { return COLS * this.cellW - GAP_X; }
  get totalHeight(): number { return ROWS * this.cellH - GAP_Y; }
}
