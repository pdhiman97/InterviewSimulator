/// <reference types="vite/client" />

declare const process: {
  env: {
    API_KEY?: string;
    GEMINI_API_KEY?: string;
    ELEVEN_STT_API_KEY?: string;
    JUDGE0_API_KEY?: string;
  };
};

interface ImportMetaEnv {
  readonly VITE_ELEVEN_STT_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_JUDGE0_API_KEY?: string;
  readonly ELEVEN_STT_API_KEY?: string;
  readonly GEMINI_API_KEY?: string;
  readonly JUDGE0_API_KEY?: string;
}
