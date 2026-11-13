// Copies the onnxruntime-web wasm binaries into public/ort so the app can run
// fully offline (and from GitHub Pages) without CDN requests.
import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "..", "node_modules", "onnxruntime-web", "dist");
const dest = join(root, "..", "public", "ort");

if (!existsSync(src)) {
  console.log("[copy-ort] onnxruntime-web not installed yet, skipping.");
  process.exit(0);
}

await mkdir(dest, { recursive: true });
const files = await readdir(src);
// Only the plain SIMD WASM build is used (execution provider: wasm, 1 thread).
const wanted = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"].filter((f) =>
  files.includes(f),
);
for (const f of wanted) {
  await cp(join(src, f), join(dest, f));
}
console.log(`[copy-ort] copied ${wanted.length} files to public/ort`);
