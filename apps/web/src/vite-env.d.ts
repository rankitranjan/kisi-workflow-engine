/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_ACCESS_KEY?: string;
  readonly VITE_API_URL?: string;
}

declare module "*.css";
