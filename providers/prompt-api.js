import { createProviderSessionBase } from "./utils.js";

/** Коды языков, поддерживаемые Prompt API для аттестации (Chrome 149+). */
const PROMPT_API_LANGUAGES = ["de", "en", "es", "fr", "ja"];

export async function createPromptApiSession(provider, { systemPrompt, onProgress }) {
  onProgress?.(0);

  const loadStartedAt = performance.now();
  const session = await LanguageModel.create({
    initialPrompts: systemPrompt
      ? [{ role: "system", content: systemPrompt }]
      : [],
    expectedInputs: [{ type: "text", languages: PROMPT_API_LANGUAGES }],
    expectedOutputs: [{ type: "text", languages: PROMPT_API_LANGUAGES }],
  });
  const loadTimeMs = performance.now() - loadStartedAt;

  onProgress?.(1);

  return {
    provider,
    modelName: provider.modelName,
    loadTimeMs,
    get contextWindow() {
      return session.contextWindow ?? session.inputQuota ?? session.maxTokens ?? 0;
    },
    get contextUsage() {
      return session.contextUsage ?? session.inputUsage ?? session.tokensSoFar ?? 0;
    },
    async measureContextUsage(input) {
      if (session.measureContextUsage) {
        return session.measureContextUsage(input);
      }
      if (session.measureInputUsage) {
        return session.measureInputUsage(input);
      }
      if (session.countPromptTokens) {
        return session.countPromptTokens(input);
      }
      return 0;
    },
    async promptStreaming(prompt) {
      return session.promptStreaming(prompt);
    },
    destroy() {
      session.destroy();
    },
  };
}
