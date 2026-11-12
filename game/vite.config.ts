import { defineConfig } from 'vite';

// base './' 让构建产物可部署在任意子路径(GitHub Pages)
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
