import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [svelte()],
  build: { outDir: '../build/web', emptyOutDir: true, sourcemap: false },
});
