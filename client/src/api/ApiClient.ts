import type { SessionInitResponse, SpinResponse, SpinType } from '../types/api';

export class ApiClient {
  private readonly base: string;
  private token: string | null = null;
  private ready = false;

  constructor(base: string) {
    this.base = base;
  }

  /* ---- Internal ---- */

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errBody: { error?: string; message?: string } = {};
      try { errBody = await res.json(); } catch { /* swallow */ }
      const msg = errBody.error ?? errBody.message ?? `HTTP ${res.status}`;
      const err = Object.assign(new Error(msg), { status: res.status });
      throw err;
    }
    return res.json() as Promise<T>;
  }

  private post<T>(path: string, body: unknown) { return this.request<T>('POST', path, body); }
  private get<T>(path: string)                 { return this.request<T>('GET',  path);       }

  /* ---- Public ---- */

  async init(betLevelIdx = 3): Promise<SessionInitResponse> {
    const data = await this.post<SessionInitResponse>('/session/init', {
      betLevelIdx,
      platform: navigator.platform || 'web',
    });
    this.token = data.token;
    this.ready = true;
    return data;
  }

  spin(betLevelIdx: number, spinType: SpinType = 'manual'): Promise<SpinResponse> {
    if (!this.ready) return Promise.reject(new Error('API not initialised'));
    return this.post<SpinResponse>('/spin', { betLevelIdx, spinType });
  }

  buySpin(featureType: 'FS' | 'WHEEL', betLevelIdx: number): Promise<SpinResponse> {
    if (!this.ready) return Promise.reject(new Error('API not initialised'));
    return this.post<SpinResponse>('/spin/buy', { featureType, betLevelIdx });
  }

  sendAnalytics(events: unknown[]): void {
    if (!this.ready || events.length === 0) return;
    this.post('/analytics/batch', { events }).catch(() => { /* non-blocking */ });
  }

  /** Send analytics via keepalive fetch — survives page unload (GDD §19.1 #2 session_end). */
  sendBeaconAnalytics(events: unknown[]): void {
    if (!this.ready || events.length === 0) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    fetch(this.base + '/analytics/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => { /* non-blocking */ });
  }

  isReady() { return this.ready; }

  /** Lightweight live-check — returns current balance without creating a new session. */
  getBalance(): Promise<{ balance: number }> {
    if (!this.ready) return Promise.reject(new Error('API not initialised'));
    return this.request<{ balance: number }>('GET', '/wallet');
  }

  /** Reset economy on the current session (50,000 coins) — does NOT create a new session. */
  restart(): Promise<{ balance: number; betLevelIdx: number; restartCount: number }> {
    if (!this.ready) return Promise.reject(new Error('API not initialised'));
    return this.post('/session/restart', {});
  }
}
