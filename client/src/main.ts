import './style.css';
import { ApiClient } from './api/ApiClient';
import { Game } from './Game';

// VITE_API_URL is injected at build time via .env / docker build-arg.
// Falls back to localhost:3000 for local development.
const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api/v1';
const api = new ApiClient(apiBase);
new Game(api).run().catch(err => console.error('[Game] Fatal error in run():', err));
