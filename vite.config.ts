import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base 设为相对路径：构建产物可直接以 file:// 或任意子路径打开
export default defineConfig({
  base: './',
  plugins: [react()],
});
