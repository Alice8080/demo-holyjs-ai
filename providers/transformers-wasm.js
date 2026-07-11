import { pipeline, TextStreamer, env } from "@huggingface/transformers";
import { createTransformersSession as createSession } from "./transformers-shared.js";

const ONNX_WASM_BASE = `${import.meta.env.BASE_URL}onnx/`;

let configured = false;

const configureTransformersEnv = () => {
  if (configured) {
    return;
  }
  configured = true;

  env.useBrowserCache = true;
  env.allowLocalModels = false;

  const onnxEnv = env.backends?.onnx;
  if (!onnxEnv?.wasm) {
    return;
  }

  // WASM-only runtime paths (без asyncify/WebGPU).
  onnxEnv.wasm.wasmPaths = {
    mjs: `${ONNX_WASM_BASE}ort-wasm-simd-threaded.mjs`,
    wasm: `${ONNX_WASM_BASE}ort-wasm-simd-threaded.wasm`,
  };

  if (typeof document !== "undefined") {
    onnxEnv.wasm.proxy = true;
  }

  if (!globalThis.crossOriginIsolated) {
    onnxEnv.wasm.numThreads = 1;
  }
};

export async function createTransformersSession(provider, options) {
  configureTransformersEnv();
  return createSession({ pipeline, TextStreamer }, provider, options);
}
