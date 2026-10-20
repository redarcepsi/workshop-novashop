import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En dev (npm run dev), les appels /api/* sont transmis à la passerelle nginx de docker compose :
// les API ne sont pas publiées sur l'hôte, nginx (port 8080) est le seul point d'entrée.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
