import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Base path for GitHub Pages project sites. HashRouter keeps deep links working.
export default defineConfig({
  base: "/wuwa-translator-ocr/",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Use onnxruntime-web's "external wasm" build so the 30 MB binary is not
    // bundled into the JS chunk; it is served from public/ort instead.
    conditions: ["onnxruntime-web-use-extern-wasm", "module", "browser", "development|production"],
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
