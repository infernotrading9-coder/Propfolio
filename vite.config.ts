import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // Set COOP headers to handle Google OAuth properly
      // Remove COEP to allow external resources like Stripe.js and Google scripts
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  },
  preview: {
    headers: {
      // Also set headers for preview builds
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
  }
})
