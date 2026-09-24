import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ranti UCSM',
        short_name: 'Ranti',
        description: 'Plataforma de intercambio seguro de bienes universitarios',
        theme_color: '#0B4A22',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          // Más adelante agregaremos iconos reales de 192x192 y 512x512 aquí
        ]
      }
    })
  ],
})