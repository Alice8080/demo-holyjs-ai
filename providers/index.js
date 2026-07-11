import { getProvider, resolveProviderId } from "./config.js";

const TRANSFORMERS_PROVIDER_IDS = new Set([
  "transformers-webgpu",
  "transformers-wasm",
]);

export const isTransformersProvider = (providerId) =>
  TRANSFORMERS_PROVIDER_IDS.has(providerId);

export async function createProviderSession(providerId, options) {
  const resolvedId = resolveProviderId(providerId);
  const provider = getProvider(resolvedId);

  switch (resolvedId) {
    case "prompt-api":
      return (await import("./prompt-api.js")).createPromptApiSession(
        provider,
        options,
      );
    case "transformers-webgpu":
      return (await import("./transformers-webgpu.js")).createTransformersSession(
        provider,
        options,
      );
    case "transformers-wasm":
      return (await import("./transformers-wasm.js")).createTransformersSession(
        provider,
        options,
      );
    default:
      throw new Error(`Неизвестный провайдер: ${provider.id}`);
  }
}

export {
  getProvider,
  getAvailableProviders,
  getDefaultProviderId,
  getProviderSelectLabel,
  getProviderSizeLabel,
  probeWebGpuAvailability,
  resolveProviderId,
} from "./config.js";
