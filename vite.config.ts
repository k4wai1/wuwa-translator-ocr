import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Base path for GitHub Pages project sites. HashRouter keeps deep links working.
export default defineConfig({
  base: "/wuwa-translator-ocr/",
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
