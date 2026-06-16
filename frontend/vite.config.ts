import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Deduplicate algosdk v3: force algosdk-v3 imports to resolve to
      // the same copy arccjs uses, preventing dual-package instanceof failures
      // in ensureAddress() when Address objects cross module boundaries.
      'algosdk-v3': path.resolve(__dirname, 'node_modules/arccjs/node_modules/algosdk'),
    },
  },
})
