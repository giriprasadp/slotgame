export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Animate a numeric value with rAF over `durationMs`, calling `onUpdate` each frame */
export function animateValue(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (v: number) => void,
): Promise<void> {
  return new Promise(resolve => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      onUpdate(lerp(from, to, easeOut(t)));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

/** Return a promise that resolves either after maxMs or when the user clicks anywhere */
export function waitClickOrTimeout(maxMs: number): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener('pointerdown', finish, true);
      resolve();
    };
    const timer = setTimeout(finish, maxMs);
    document.addEventListener('pointerdown', finish, { once: true, capture: true });
  });
}
