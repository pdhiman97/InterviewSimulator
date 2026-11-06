/// <reference types="vite/client" />

declare const process: {
  env: {
    JUDGE0_API_KEY?: string;
  };
};

interface ImportMetaEnv {
  readonly VITE_JUDGE0_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly JUDGE0_API_KEY?: string;
}
