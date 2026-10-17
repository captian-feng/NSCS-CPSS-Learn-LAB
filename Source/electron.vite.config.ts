import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), service: resolve('src/workers/service.ts'), prepareBook: resolve('src/tools/prepare-book.ts') } } }
  },
  preload: { plugins: [externalizeDepsPlugin()], build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
  renderer: { plugins: [react(), {name:'dev-refresh-csp',apply:'serve',transformIndexHtml(html){return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")}}], build: { chunkSizeWarningLimit: 1600 } }
})
