/**
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked@13.0.3/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.es.mjs";

const NUMBER_FORMAT_LANGUAGE = "ru-RU";
const SYSTEM_PROMPT = "Вы отзывчивый и дружелюбный помощник.";

(async () => {
  const errorMessage = document.getElementById("error-message");
  const costSpan = document.getElementById("cost");
  const promptArea = document.getElementById("prompt-area");
  const problematicArea = document.getElementById("problematic-area");
  const promptInput = document.getElementById("prompt-input");
  const responseArea = document.getElementById("response-area");
  const copyLinkButton = document.getElementById("copy-link-button");
  const resetButton = document.getElementById("reset-button");
  const copyHelper = document.querySelector("small");
  const rawResponse = document.querySelector("details div");
  const form = document.querySelector("form");
  const maxTokensInfo = document.getElementById("max-tokens");
  const tokensLeftInfo = document.getElementById("tokens-left");
  const tokensSoFarInfo = document.getElementById("tokens-so-far");
  const memoryUsageInfo = document.getElementById("memory-usage");
  const lastResponseTimeInfo = document.getElementById("last-response-time");
  const tokensPerSecondInfo = document.getElementById("tokens-per-second");
  const selectedModelInfo = document.getElementById("selected-model");
  const modelLoadTimeInfo = document.getElementById("model-load-time");
  const peakMemoryUsageInfo = document.getElementById("peak-memory-usage");
  const processingModeInfo = document.getElementById("processing-mode");
  const responseTimeHistoryList = document.getElementById("response-time-history");

  const metricsState = {
    peakMemoryBytes: 0,
    responseTimeHistory: [],
    selectedModel: null,
    modelLoadTimeMs: null,
  };

  const formatMegabytes = (bytes) =>
    `${new Intl.NumberFormat(NUMBER_FORMAT_LANGUAGE, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(bytes / (1024 * 1024))} МБ`;

  const formatDuration = (milliseconds) => {
    if (milliseconds >= 1000) {
      return `${new Intl.NumberFormat(NUMBER_FORMAT_LANGUAGE, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(milliseconds / 1000)} с`;
    }

    return `${Math.round(milliseconds)} мс`;
  };

  const formatTokenCount = (count) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    let word = "токенов";

    if (mod10 === 1 && mod100 !== 11) {
      word = "токен";
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      word = "токена";
    }

    return `${count} ${word}`;
  };

  const getMemoryLimitBytes = () => {
    if (performance.memory?.jsHeapSizeLimit) {
      return performance.memory.jsHeapSizeLimit;
    }

    if (navigator.deviceMemory) {
      return navigator.deviceMemory * 1024 * 1024 * 1024;
    }

    return null;
  };

  const getContextUsage = () =>
    session?.contextUsage ?? session?.inputUsage ?? session?.tokensSoFar ?? 0;

  const updateMemoryMetrics = () => {
    const usedBytes = performance.memory?.usedJSHeapSize;
    if (!usedBytes) {
      return;
    }

    metricsState.peakMemoryBytes = Math.max(metricsState.peakMemoryBytes, usedBytes);
    const limitBytes = getMemoryLimitBytes();
    memoryUsageInfo.textContent = limitBytes
      ? `${formatMegabytes(usedBytes)} из ${formatMegabytes(limitBytes)}`
      : formatMegabytes(usedBytes);
    peakMemoryUsageInfo.textContent = formatMegabytes(metricsState.peakMemoryBytes);
  };

  const updateProcessingMode = () => {
    processingModeInfo.textContent = LanguageModel.__isPolyfill
      ? "Web Worker (фоновый поток)"
      : "Основной поток";
  };

  const updateSelectedModel = async () => {
    if (metricsState.selectedModel) {
      selectedModelInfo.textContent = metricsState.selectedModel;
      return;
    }

    selectedModelInfo.textContent = LanguageModel.__isPolyfill
      ? "smollm2-135m-instruct"
      : "Gemini Nano";
  };

  const updateModelLoadTime = () => {
    modelLoadTimeInfo.textContent =
      metricsState.modelLoadTimeMs === null
        ? "\u2014"
        : formatDuration(metricsState.modelLoadTimeMs);
  };

  const updateResponseTimeHistory = () => {
    responseTimeHistoryList.replaceChildren(
      ...metricsState.responseTimeHistory.map((durationMs) => {
        const item = document.createElement("li");
        item.textContent = formatDuration(durationMs);
        return item;
      }),
    );
  };

  const recordResponseMetrics = ({
    durationMs,
    outputTokens,
  }) => {
    lastResponseTimeInfo.textContent = formatDuration(durationMs);
    tokensPerSecondInfo.textContent =
      outputTokens > 0 && durationMs > 0
        ? `${new Intl.NumberFormat(NUMBER_FORMAT_LANGUAGE, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format((outputTokens / durationMs) * 1000)} токенов/с`
        : "\u2014";

    metricsState.responseTimeHistory.unshift(durationMs);
    updateResponseTimeHistory();
    updateMemoryMetrics();
  };

  responseArea.style.display = "none";

  let session = null;

  if (!("LanguageModel" in self)) {
    errorMessage.style.display = "block";
    errorMessage.innerHTML = `Ваш браузер не поддерживает Prompt API. Если вы используете Chrome, присоединитесь к <a href="https://goo.gle/chrome-ai-dev-preview-join">программе раннего доступа</a>, чтобы включить его.`;
    return;
  }

  promptArea.style.display = "block";
  copyLinkButton.style.display = "none";
  copyHelper.style.display = "none";

  const promptModel = async (highlight = false) => {
    copyLinkButton.style.display = "none";
    copyHelper.style.display = "none";
    problematicArea.style.display = "none";
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    responseArea.style.display = "block";
    const heading = document.createElement("h3");
    heading.classList.add("prompt", "speech-bubble");
    heading.textContent = prompt;
    responseArea.append(heading);
    const p = document.createElement("p");
    p.classList.add("response", "speech-bubble");
    p.textContent = "Генерация ответа...";
    responseArea.append(p);

    try {
      if (!session) {
        await updateSession();
        updateStats();
      }

      const usageBefore = getContextUsage();
      const startedAt = performance.now();
      const stream = await session.promptStreaming(prompt);

      let result = "";
      let previousChunk = "";
      for await (const chunk of stream) {
        const newChunk = chunk.startsWith(previousChunk)
          ? chunk.slice(previousChunk.length)
          : chunk;
        result += newChunk;
        p.innerHTML = DOMPurify.sanitize(marked.parse(result));
        rawResponse.innerText = result;
        previousChunk = chunk;
      }

      const durationMs = performance.now() - startedAt;
      const usageAfter = getContextUsage();
      recordResponseMetrics({
        durationMs,
        outputTokens: Math.max(usageAfter - usageBefore, 0),
      });
    } catch (error) {
      p.textContent = `Ошибка: ${error.message}`;
    } finally {
      if (highlight) {
        problematicArea.style.display = "block";
        problematicArea.querySelector("#problem").innerText =
          decodeURIComponent(highlight).trim();
      }
      copyLinkButton.style.display = "inline-block";
      copyHelper.style.display = "inline";
      updateStats();
    }
  };

  const updateStats = () => {
    if (!session) {
      return;
    }

    const numberFormat = new Intl.NumberFormat(NUMBER_FORMAT_LANGUAGE);

    // In the latest API shape, currently in Chrome Canary, `session.inputQuota` was
    // renamed to `session.contextWindow` and `session.inputUsage` was renamed to
    // `session.contextUsage`. Previously `session.maxTokens` was renamed to
    // `session.inputQuota` and `session.tokensSoFar` was renamed to `session.inputUsage`.
    // `session.tokensSoFar` was removed, but the value can be calculated by subtracting
    // `inputUsage` from `inputQuota`. All APIs shapes are checked in the code below.
    maxTokensInfo.textContent = numberFormat.format(
      session.contextWindow ?? session.inputQuota ?? session.maxTokens,
    );
    tokensLeftInfo.textContent = numberFormat.format(
      session.tokensSoFar ??
        session.contextWindow - session.contextUsage ??
        session.inputQuota - session.inputUsage,
    );
    tokensSoFarInfo.textContent = numberFormat.format(
      session.contextUsage ?? session.inputUsage ?? session.tokensSoFar,
    );
  };

  const resetUI = () => {
    responseArea.style.display = "none";
    responseArea.innerHTML = "";
    rawResponse.innerHTML = "";
    problematicArea.style.display = "none";
    copyLinkButton.style.display = "none";
    copyHelper.style.display = "none";
    maxTokensInfo.textContent = "";
    tokensLeftInfo.textContent = "";
    tokensSoFarInfo.textContent = "";
    promptInput.focus();
  };

  const resetResponseMetrics = () => {
    metricsState.responseTimeHistory = [];
    lastResponseTimeInfo.textContent = "\u2014";
    tokensPerSecondInfo.textContent = "\u2014";
    updateResponseTimeHistory();
  };

  const updateSession = async () => {
    resetUI();
    if (self.LanguageModel) {
      const loadStartedAt = performance.now();
      session = await LanguageModel.create({
        initialPrompts: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
        ],
      });
      metricsState.modelLoadTimeMs = performance.now() - loadStartedAt;
    }
    updateStats();
    updateModelLoadTime();
    updateMemoryMetrics();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await promptModel();
  });

  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event("submit"));
    }
  });

  promptInput.addEventListener("focus", () => {
    promptInput.select();
  });

  promptInput.addEventListener("input", async () => {
    if (!session) {
      return;
    }

    const value = promptInput.value.trim();
    if (!value) {
      return;
    }

    let cost;

    // The API that returns the token count for a prompt has been renamed
    // from `countPromptTokens(input)` to `measureInputUsage(input)` to
    // `measureContextUsage(input)`.
    // The code below ensures all cases are handled.
    if (session.countPromptTokens) {
      cost = await session.countPromptTokens(value);
    } else if (session.measureContextUsage) {
      cost = await session.measureContextUsage(value);
    } else if (session.measureInputUsage) {
      cost = await session.measureInputUsage(value);
    }

    if (!cost) {
      return;
    }
    costSpan.textContent = formatTokenCount(cost);
  });

  resetButton.addEventListener("click", async () => {
    promptInput.value = "";
    resetUI();
    resetResponseMetrics();
    session.destroy();
    session = null;
    await updateSession();
  });

  copyLinkButton.addEventListener("click", () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    const url = new URL(self.location.href);
    url.searchParams.set("prompt", encodeURIComponent(prompt));
    const selection = getSelection().toString() || "";
    if (selection) {
      url.searchParams.set("highlight", encodeURIComponent(selection));
    } else {
      url.searchParams.delete("highlight");
    }
    navigator.clipboard.writeText(url.toString()).catch((err) => {
      alert("Не удалось скопировать ссылку: ", err);
    });
    const text = copyLinkButton.textContent;
    copyLinkButton.textContent = "Скопировано";
    setTimeout(() => {
      copyLinkButton.textContent = text;
    }, 3000);
  });

  updateProcessingMode();
  await updateSelectedModel();

  if (!session) {
    await updateSession();
  }

  const params = new URLSearchParams(location.search);
  const urlPrompt = params.get("prompt");
  const highlight = params.get("highlight");
  if (urlPrompt) {
    promptInput.value = decodeURIComponent(urlPrompt).trim();
    await promptModel(highlight);
  }
})();
