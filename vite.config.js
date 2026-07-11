import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ["path", "url"],
      exclude: ["fs"],
    }),
  ],
  assetsInclude: ["**/*.wasm"],
  worker: {
    format: "es",
  },
  server: {
    port: 8080,
    open: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    port: 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("providers/transformers-wasm")) {
            return "transformers-wasm";
          }
          if (id.includes("providers/transformers-webgpu")) {
            return "transformers-webgpu";
          }
          if (id.includes("@huggingface/transformers")) {
            return "transformers";
          }
        },
      },
    },
  },
});
