import Phaser from 'phaser';
import { ApiClient } from '../api/ApiClient';
import { sleep } from '../utils/helpers';

export class BootScene extends Phaser.Scene {
  private api!: ApiClient;

  constructor() { super({ key: 'BootScene' }); }

  init(_data: unknown): void {
    this.api = this.registry.get('api') as ApiClient;
  }

  create(): void {
    const { width, height } = this.scale;

    // Dark background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a);

    // Title
    this.add.text(width / 2, height * 0.28, 'HUFF & PUFF', {
      fontSize: '52px',
      fontFamily: '"Georgia", serif',
      color: '#FFD700',
      stroke: '#8F5C13',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.38, 'Cascading Morph Slot', {
      fontSize: '18px',
      fontFamily: 'sans-serif',
      color: '#aaaacc',
    }).setOrigin(0.5);

    // Progress bar
    const barW  = 340;
    const barH  = 16;
    const barX  = width / 2 - barW / 2;
    const barY  = height * 0.58;
    this.add.rectangle(barX + barW / 2, barY + barH / 2, barW, barH, 0x222244);
    const fill = this.add.rectangle(barX, barY + barH / 2, 0, barH, 0xFFD700).setOrigin(0, 0.5);
    const status = this.add.text(width / 2, barY + 30, 'Connecting to server…', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#8899bb',
    }).setOrigin(0.5);

    const setProgress = (pct: number, msg: string) => {
      this.tweens.add({ targets: fill, width: barW * pct, duration: 180, ease: 'Power1' });
      status.setText(msg);
    };

    // Simulated step messages while we wait for init
    const steps = [
      [0.15, 'Loading reels…'],
      [0.35, 'Tuning oscillators…'],
      [0.55, 'Weighting paylines…'],
      [0.75, 'Polishing jackpots…'],
    ] as [number, string][];

    let stepIdx = 0;
    const stepTimer = this.time.addEvent({
      delay: 320,
      callback: () => {
        if (stepIdx < steps.length) {
          const [p, m] = steps[stepIdx++];
          setProgress(p, m);
        }
      },
      loop: true,
    });

    // Kick off API init
    this.api.init().then(data => {
      stepTimer.remove();
      setProgress(1.0, 'Ready!');

      // Show TAP TO PLAY after short delay
      this.time.delayedCall(500, () => {
        const tapBtn = document.getElementById('tap-to-play');
        tapBtn?.classList.remove('hidden');
        tapBtn?.addEventListener('click', () => {
          tapBtn.classList.add('hidden');
          document.getElementById('splash-overlay')?.classList.add('hidden');
          this.scene.start('GameScene', {
            api:          this.api,
            balance:      data.balance,
            betLevelIdx:  data.betLevelIdx ?? 3,
          });
        }, { once: true });
      });
    }).catch((err: Error) => {
      stepTimer.remove();
      setProgress(0, '');
      status.setText(`Connection failed: ${err.message}`);
      status.setColor('#FF6666');

      // Retry button
      const retryBtn = this.add.text(width / 2, height * 0.7, '[ RETRY ]', {
        fontSize: '18px', fontFamily: 'sans-serif', color: '#FFD700',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      retryBtn.on('pointerdown', () => {
        retryBtn.destroy();
        this.scene.restart({ api: this.api });
      });
    });
  }
}
