/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL — e.g. https://your-app.railway.app/api/v1
   *  Set to /api/v1 for local dev (proxied by Vite to localhost:3000). */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
