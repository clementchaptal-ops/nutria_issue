import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite application configuration.
 * Sets up the React plugin, configures local development and preview servers,
 * and defines security headers required for cross-origin authentication workflows.
 */
export default defineConfig({
  // Enable the official React plugin for JSX compilation and Fast Refresh
  plugins: [react()],

  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
    // Security headers to facilitate popup-based cross-origin authentication
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  },

  // Preview server configuration for post-build verification
  preview: {
    // Replicate development security headers in the preview environment
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none',
    }
  }
})