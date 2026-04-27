import Phaser from 'phaser';
import { SYMBOLS, SPIN_POOL } from '../config/constants';
import type { SymInfo } from '../config/constants';

export const CELL_W = 118;
export const CELL_H = 100;

/** A single symbol cell rendered with Phaser graphics + text */
export class SymbolCell extends Phaser.GameObjects.Container {
  private bg!: Phaser.GameObjects.Rectangle;
  private glyphText!: Phaser.GameObjects.Text;
  private labelText!: Phaser.GameObjects.Text;
  private goldenBorder!: Phaser.GameObjects.Rectangle;
  private highlightFx!: Phaser.GameObjects.Rectangle;

  private _sym = 'S01';
  private _golden = false;

  constructor(scene: Phaser.Scene, x: number, y: number, sym = 'S01', golden = false) {
    super(scene, x, y);

    const info = this.infoFor(sym);

    this.bg = scene.add.rectangle(0, 0, CELL_W - 4, CELL_H - 4, info.color, 1)
      .setStrokeStyle(2, 0x1a1a2e);
    this.glyphText = scene.add.text(0, -8, info.glyph, {
      fontSize: '28px', fontFamily: 'monospace', color: '#ffffff',
    }).setOrigin(0.5, 0.5);
    this.labelText = scene.add.text(0, 22, info.label, {
      fontSize: '11px', fontFamily: 'sans-serif', color: '#ffffffcc',
    }).setOrigin(0.5, 0.5);

    // Golden shimmer border (hidden by default)
    this.goldenBorder = scene.add.rectangle(0, 0, CELL_W, CELL_H, 0xFFD700, 0)
      .setStrokeStyle(4, 0xFFD700);

    // Win highlight overlay
    this.highlightFx = scene.add.rectangle(0, 0, CELL_W - 4, CELL_H - 4, 0xFFFFFF, 0);

    this.add([this.bg, this.glyphText, this.labelText, this.goldenBorder, this.highlightFx]);
    this.setSize(CELL_W, CELL_H);

    if (golden) this.setGolden(true);
    this._sym   = sym;
    this._golden = golden;
  }

  /* ---- Accessors ---- */
  get sym() { return this._sym; }

  setSym(sym: string, golden: boolean, alphaOverride?: number): void {
    this._sym    = sym;
    this._golden = golden;
    const info   = this.infoFor(sym);
    this.bg.setFillStyle(info.color);
    this.glyphText.setText(info.glyph);
    this.labelText.setText(info.label);
    if (alphaOverride !== undefined) this.setAlpha(alphaOverride);
    else this.setAlpha(1);
    this.setGolden(golden);
  }

  setGolden(g: boolean): void {
    this._golden = g;
    this.goldenBorder.setAlpha(g ? 0.9 : 0);
    if (g) {
      this.scene.tweens.add({
        targets: this.goldenBorder,
        alpha: { from: 0.5, to: 1 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    } else {
      this.scene.tweens.killTweensOf(this.goldenBorder);
    }
  }

  setHighlight(on: boolean): void {
    this.scene.tweens.killTweensOf(this.highlightFx);
    if (on) {
      this.scene.tweens.add({
        targets: this.highlightFx,
        alpha: { from: 0, to: 0.35 },
        duration: 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    } else {
      this.highlightFx.setAlpha(0);
    }
  }

  flashBurst(): void {
    this.scene.tweens.add({
      targets: this,
      scaleX: { from: 1.2, to: 1 },
      scaleY: { from: 1.2, to: 1 },
      duration: 180,
      ease: 'Back.Out',
    });
    this.scene.tweens.add({
      targets: this.highlightFx,
      alpha: { from: 0.8, to: 0 },
      duration: 250,
    });
  }

  /* ---- Helpers ---- */
  private infoFor(sym: string): SymInfo {
    return SYMBOLS[sym] ?? { color: 0x444444, glyph: sym, label: sym };
  }

  static randomSym(): string {
    return SPIN_POOL[Math.floor(Math.random() * SPIN_POOL.length)];
  }
}
