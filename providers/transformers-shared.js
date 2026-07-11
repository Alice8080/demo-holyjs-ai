import {
  approximateTokens,
  createProviderSessionBase,
  createTextStream,
} from "./utils.js";

export async function createTransformersSession(
  { pipeline, TextStreamer },
  provider,
  { systemPrompt, onProgress },
) {
  const base = createProviderSessionBase({
    provider,
    contextWindow: provider.contextWindow ?? 8192,
    systemPrompt,
  });

  let generator;
  let tokenizer;
  let loadTimeMs = 0;
  let lastOutputTokenCount = 0;
  const maxNewTokens = provider.maxNewTokens ?? 512;
  const useApproximateTokenCount =
    provider.device === "wasm" || provider.device === "cpu";

  const dispatchProgress = (value) => {
    onProgress?.(Math.min(1, Math.max(0, value)));
  };

  dispatchProgress(0);
  const loadStartedAt = performance.now();

  generator = await pipeline("text-generation", provider.modelName, {
    device: provider.device,
    dtype: provider.dtype,
    progress_callback(data) {
      if (data.status === "progress" && typeof data.progress === "number") {
        dispatchProgress(data.progress / 100);
      } else if (
        data.status === "progress_total" &&
        typeof data.progress === "number"
      ) {
        dispatchProgress(data.progress / 100);
      } else if (data.status === "ready") {
        dispatchProgress(1);
      }
    },
  });

  tokenizer = generator.tokenizer;
  loadTimeMs = performance.now() - loadStartedAt;
  dispatchProgress(1);

  const toMessages = (prompt) => {
    const messages = base.getMessages(prompt);
    if (provider.modelName.toLowerCase().includes("gemma")) {
      const systemIndex = messages.findIndex(
        (message) => message.role === "system",
      );
      if (systemIndex !== -1) {
        const systemMessage = messages[systemIndex];
        const nextUserIndex = messages.findIndex(
          (message, index) => message.role === "user" && index > systemIndex,
        );
        if (nextUserIndex !== -1) {
          messages[nextUserIndex].content =
            `${systemMessage.content}\n\n${messages[nextUserIndex].content}`;
          messages.splice(systemIndex, 1);
        } else {
          systemMessage.role = "user";
        }
      }
    }
    return messages;
  };

  const countMessages = async (messages) => {
    const inputIds = tokenizer.apply_chat_template(messages, {
      tokenize: true,
      add_generation_prompt: false,
      return_tensor: false,
    });
    return inputIds.length;
  };

  const countTextTokens = (text) => {
    if (!text?.trim()) {
      return 0;
    }

    const encoded = tokenizer(text, { add_special_tokens: false });
    const dims = encoded.input_ids.dims;
    return dims.length === 2 ? dims[1] : dims[0];
  };

  const messagesForCount = () => {
    const messages = [...base.history];
    if (!systemPrompt) {
      return messages;
    }

    if (provider.modelName.toLowerCase().includes("gemma")) {
      const firstUserIndex = messages.findIndex(
        (message) => message.role === "user",
      );
      if (firstUserIndex !== -1) {
        messages[firstUserIndex] = {
          ...messages[firstUserIndex],
          content: `${systemPrompt}\n\n${messages[firstUserIndex].content}`,
        };
      } else {
        messages.unshift({ role: "user", content: systemPrompt });
      }
      return messages;
    }

    messages.unshift({ role: "system", content: systemPrompt });
    return messages;
  };

  const estimatePromptCost = (input) => {
    const messages = toMessages(input);
    return approximateTokens(
      messages.map((message) => message.content).join(" "),
    );
  };

  return {
    provider,
    modelName: provider.modelName,
    loadTimeMs,
    get contextWindow() {
      return base.contextWindow;
    },
    get contextUsage() {
      return base.contextUsage;
    },
    get lastOutputTokenCount() {
      return lastOutputTokenCount;
    },
    async measureContextUsage(input) {
      if (useApproximateTokenCount) {
        return estimatePromptCost(input);
      }

      const messages = toMessages(input);
      return countMessages(messages);
    },
    async promptStreaming(prompt) {
      lastOutputTokenCount = 0;
      const messages = toMessages(prompt);
      const formattedPrompt = tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });

      base.setContextUsage(
        useApproximateTokenCount
          ? estimatePromptCost(prompt)
          : await countMessages(messages),
      );

      const stream = createTextStream(async ({ push, finish, fail }) => {
        try {
          const streamer = new TextStreamer(tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: (text) => {
              push(text);
            },
          });

          const output = await generator(formattedPrompt, {
            max_new_tokens: maxNewTokens,
            do_sample: false,
            return_full_text: false,
            add_special_tokens: false,
            streamer,
          });

          const text = output?.[0]?.generated_text ?? "";
          lastOutputTokenCount = countTextTokens(text);
          base.appendTurn(prompt, text, {
            syncUsage: useApproximateTokenCount,
          });

          if (!useApproximateTokenCount) {
            base.setContextUsage(await countMessages(messagesForCount()));
          }

          finish();
        } catch (error) {
          fail(error);
        }
      });

      return stream;
    },
    destroy() {
      void generator?.dispose?.();
      generator = null;
      tokenizer = null;
    },
  };
}
