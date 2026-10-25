import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Alleen voor de Base44-sandbox: de proxy stuurt een wisselende hostnaam door en de
// bind-mounts leveren geen bestandssysteem-events, dus polling en een host-allowlist.
const sandboxHostDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN
const isSandboxPreview = process.env.BASE44_PREVIEW_MODE === "1"

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts:
      isSandboxPreview && sandboxHostDomain ? [`.${sandboxHostDomain}`] : undefined,
    watch: { usePolling: true, interval: 400 },
  },
  build: { chunkSizeWarningLimit: 2400 },
})
