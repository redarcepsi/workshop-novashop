import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev (npm run dev), Vite joue le rôle de la passerelle nginx :
// les appels /api/* sont redirigés vers les services exposés par docker compose.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth': 'http://localhost:8001',
      '/api/shop': 'http://localhost:8002',
    },
  },
})
