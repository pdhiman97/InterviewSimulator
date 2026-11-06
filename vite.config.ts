import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react()
      ],
      define: {
        'process': {
          env: {
            API_KEY: env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '',
            GEMINI_API_KEY: env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '',
            ELEVEN_STT_API_KEY: env.VITE_ELEVEN_STT_API_KEY || env.ELEVEN_STT_API_KEY || '',
            JUDGE0_API_KEY: env.VITE_JUDGE0_API_KEY || env.JUDGE0_API_KEY || ''
          }
        },
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        'process.env.ELEVEN_STT_API_KEY': JSON.stringify(env.VITE_ELEVEN_STT_API_KEY || env.ELEVEN_STT_API_KEY),
        'process.env.JUDGE0_API_KEY': JSON.stringify(env.VITE_JUDGE0_API_KEY || env.JUDGE0_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
