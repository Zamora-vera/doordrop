import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

const packageVersion = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export default defineConfig(() => {
  return {
    plugins: [
    {
      name: 'cf-disable-rocket-loader',
      transformIndexHtml(html) {
        return html.replace(
          /<script(?![^>]*data-cfasync)([^>]*type=["']module["'][^>]*)>/gi,
          (_m, attrs) => `<script data-cfasync="false"${attrs}>`
        );
      },
    },react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
      '__APP_VERSION__': JSON.stringify(packageVersion)
    },
    server: {
      allowedHosts: ['ship24go.com', 'www.ship24go.com', 'ce2f3596.ship24go.com', 'localhost', '127.0.0.1'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
