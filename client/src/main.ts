import './style.css';
import { ApiClient } from './api/ApiClient';
import { Game } from './Game';

// VITE_API_URL is set in .env (local) or as a build-arg / Railway env var (production).
// Local dev default: /api/v1 — Vite proxy forwards this to localhost:3000.
const apiBase = import.meta.env.VITE_API_URL ?? '/api/v1';
const api = new ApiClient(apiBase);
new Game(api).run().catch(err => console.error('[Game] Fatal error in run():', err));
