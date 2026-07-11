/**
 * Конфигурация бэкендов для сравнения локального инференса.
 *
 * WebGPU — ускорение через GPU (Chrome 113+).
 * WASM   — инференс через WebAssembly на CPU (работает шире, обычно медленнее).
 *
 * sizeBytes — приблизительный размер весов для скачивания (не VRAM).
 */
const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

export const formatModelSize = (bytes) => {
  if (bytes == null) {
    return null;
  }

  if (bytes >= GB) {
    return `${new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(bytes / GB)} ГБ`;
  }

  return `${new Intl.NumberFormat("ru-RU").format(Math.round(bytes / MB))} МБ`;
};

export const getProviderSelectLabel = (provider) => {
  const sizeText = getProviderSizeLabel(provider);

  return sizeText ? `${provider.label} — ${sizeText}` : provider.label;
};

export const getProviderSizeLabel = (provider) =>
  provider.sizeLabel ??
  (provider.sizeBytes != null ? formatModelSize(provider.sizeBytes) : null);

export const PROVIDERS = [
  {
    id: "prompt-api",
    group: "Prompt API",
    label: "Gemini Nano (встроенная модель Chrome)",
    library: "Chrome Prompt API",
    runtime: "native",
    runtimeLabel: "Встроенный движок Chrome",
    modelName: "Gemini Nano",
    sizeLabel: "~1,7 ГБ, встроена",
    processingMode: "Основной поток (встроенная модель)",
    isAvailable: () =>
      "LanguageModel" in globalThis &&
      !globalThis.LanguageModel?.__isPolyfill,
  },
  {
    id: "transformers-webgpu",
    group: "Transformers.js",
    label: "Gemma 3 1B — WebGPU",
    library: "Transformers.js",
    runtime: "webgpu",
    runtimeLabel: "WebGPU",
    modelName: "onnx-community/gemma-3-1b-it-ONNX-GQA",
    sizeBytes: 790 * MB,
    device: "webgpu",
    dtype: "q4f16",
    processingMode: "Web Worker + WebGPU",
    docsUrl: "https://github.com/huggingface/transformers.js",
  },
  {
    id: "transformers-wasm",
    group: "Transformers.js",
    label: "Qwen3 0.6B — WASM",
    library: "Transformers.js",
    runtime: "wasm",
    runtimeLabel: "WASM (CPU)",
    // Gemma 3 1B q8 ≈ 1,5 ГБ — не помещается в WASM-память браузера (bad_alloc).
    modelName: "onnx-community/Qwen3-0.6B-ONNX",
    sizeBytes: 589 * MB,
    device: "wasm",
    dtype: "q8",
    maxNewTokens: 256,
    contextWindow: 8192,
    processingMode: "Web Worker + WASM (ONNX proxy)",
    docsUrl: "https://github.com/huggingface/transformers.js",
  },
];

export const DEFAULT_PROVIDER_ID = "prompt-api";

export const getProvider = (id) =>
  PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];

export const getAvailableProviders = () =>
  PROVIDERS.filter(
    (provider) => !provider.isAvailable || provider.isAvailable(),
  );

export const getDefaultProviderId = () => {
  const available = getAvailableProviders();
  const preferred = available.find((p) => p.id === DEFAULT_PROVIDER_ID);
  return preferred?.id ?? available[0]?.id ?? PROVIDERS[0].id;
};
