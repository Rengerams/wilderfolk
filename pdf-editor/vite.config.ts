import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Sandbox preview only: the proxy forwards the sandbox host as the Host header, and the sandbox
// id changes on every environment rebuild, so the allowlist must cover the whole wildcard domain.
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
    // Bind mounts do not deliver filesystem events reliably.
    watch: { usePolling: true, interval: 400 },
  },
  build: { chunkSizeWarningLimit: 2400 },
})
