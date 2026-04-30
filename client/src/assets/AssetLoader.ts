/**
 * AssetLoader — preloads all symbol and UI PNGs extracted from PSD files.
 * Symbol images are served from /pearls/symbols/ (Vite copies public/ verbatim).
 *
 * Mapping: game symbol ID → image file
 */

/** Map from symbol ID → loaded HTMLImageElement (or null if not available) */
export type ImageMap = Record<string, HTMLImageElement>;

// Symbol ID → filename in /pearls/symbols/
const SYMBOL_FILES: Record<string, string> = {
  S01:  'sym-10.png',
  S02:  'sym-j.png',
  S03:  'sym-q.png',
  S04:  'sym-k.png',
  S05:  'sym-a.png',
  S06:  'sym-plant.png',       // Gem Blue  → coral/plant
  S07:  'sym-starfish.png',    // Gem Green → starfish
  S08:  'sym-fish.png',        // Gem Red   → tropical fish
  C01:  'sym-sea-fish.png',    // Pig Straw  → sea fish (lowest char)
  C02:  'sym-bonus.png',       // Pig Sticks → treasure chest (BONUS)
  C03:  'sym-free-spin.png',   // Pig Bricks → octopus (FREE SPIN art)
  C04:  'sym-jackpot.png',     // Wolf       → diver (top premium)
  W01:  'sym-wild.png',        // Wild       → mermaid
  W02:  'sym-wild.png',        // Golden Wild → same, drawn with golden overlay
  SC01: 'sym-scatter.png',     // Scatter    → pearl shell
  // G01 has no dedicated image — it's a modifier, always replaced before display
};

// UI images (background, frame, etc.)
const UI_FILES: Record<string, string> = {
  'reel-frame':        '/pearls/ui/reel-frame.png',
  'main-screen':       '/pearls/bg.png',
  'home-screen':       '/pearls/home-screen.png',
  'game-title':        '/pearls/game-title.png',
  'main-screen-blurred': '/pearls/bg-blurred.png',
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => {
      console.warn(`[AssetLoader] Failed to load: ${src}`);
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  });
}

export class AssetLoader {
  readonly symbols: ImageMap = {};
  readonly ui:      ImageMap = {};

  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const entries: { key: string; src: string; map: ImageMap }[] = [];

    for (const [id, file] of Object.entries(SYMBOL_FILES)) {
      entries.push({ key: id, src: `/pearls/symbols/${file}`, map: this.symbols });
    }
    for (const [key, src] of Object.entries(UI_FILES)) {
      entries.push({ key, src, map: this.ui });
    }

    let loaded = 0;
    const total = entries.length;

    // Load all in parallel; failures are non-fatal (falls back to vector rendering)
    await Promise.all(entries.map(async ({ key, src, map }) => {
      try {
        map[key] = await loadImage(src);
      } catch {
        // silently fall back to vector drawing
      } finally {
        loaded++;
        onProgress?.(loaded, total);
      }
    }));

    console.log(`[AssetLoader] Loaded ${Object.keys(this.symbols).length}/${Object.keys(SYMBOL_FILES).length} symbols, ${Object.keys(this.ui).length}/${Object.keys(UI_FILES).length} UI images`);
  }
}
