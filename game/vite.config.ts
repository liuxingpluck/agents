import { defineConfig } from 'vite';

// base './' 让构建产物可部署在任意子路径(GitHub Pages)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // 多页面:游戏本体 + AI 训练场
    rollupOptions: { input: { main: 'index.html', train: 'train.html' } },
  },
  worker: { format: 'es' },
});
