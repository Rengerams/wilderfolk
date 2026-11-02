import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The preview proxy forwards a hostname that changes per sandbox. Vite >= 6.1 appends
// __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS to allowedHosts; we also read it here so a
// comma-separated list works on older Vite versions.
const extraHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: extraHosts.length > 0 ? extraHosts : undefined,
    // Single origin: the browser only talks to the Vite dev server on port 3000.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://api:4000",
        changeOrigin: false,
      },
    },
    watch: { usePolling: true, interval: 400 },
  },
})
