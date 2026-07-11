import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, "../node_modules/onnxruntime-web/dist");
const destDir = path.join(rootDir, "../public/onnx");
const files = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

await mkdir(destDir, { recursive: true });

for (const file of files) {
  await cp(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`Copied ${files.length} ONNX Runtime WASM files to public/onnx/`);
