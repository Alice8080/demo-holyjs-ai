/**
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { marked } from "https://cdn.jsdelivr.net/npm/marked@13.0.3/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.es.mjs";
import {
  createProviderSession,
  getAvailableProviders,
  getDefaultProviderId,
  getProvider,
  getProviderSelectLabel,
  getProviderSizeLabel,
  probeWebGpuAvailability,
  resolveProviderId,
} from "./providers/index.js";

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
  const submitButton = document.getElementById("submit-button");
  const providerSelect = document.getElementById("provider-select");
  const providerApplyButton = document.getElementById("provider-apply-button");
  const providerDescription = document.getElementById("provider-description");
  const loadStatus = document.getElementById("load-status");
  const loadProgress = document.getElementById("load-progress");
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
  const selectedBackendInfo = document.getElementById("selected-backend");
  const selectedRuntimeInfo = document.getElementById("selected-runtime");
  const modelLoadTimeInfo = document.getElementById("model-load-time");
  const peakMemoryUsageInfo = document.getElementById("peak-memory-usage");
  const processingModeInfo = document.getElementById("processing-mode");
  const responseTimeHistoryList = document.getElementById("response-time-history");

  const metricsState = {
    peakMemoryBytes: 0,
    responseTimeHistory: [],
    modelLoadTimeMs: null,
  };

  let session = null;
  let activeProviderId;
  let isLoadingProvider = false;

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

  const getContextUsage = () => session?.contextUsage ?? 0;

  const updateMemoryMetrics = () => {
    const usedBytes = performance.memory?.usedJSHeapSize;
    if (!usedBytes) {
      return;
    }

    metricsState.peakMemoryBytes = Math.max(
      metricsState.peakMemoryBytes,
      usedBytes,
    );
    const limitBytes = getMemoryLimitBytes();
    memoryUsageInfo.textContent = limitBytes
      ? `${formatMegabytes(usedBytes)} из ${formatMegabytes(limitBytes)}`
      : formatMegabytes(usedBytes);
    peakMemoryUsageInfo.textContent = formatMegabytes(
      metricsState.peakMemoryBytes,
    );
  };

  const updateProviderInfo = () => {
    const provider = getProvider(activeProviderId);
    const sizeText = getProviderSizeLabel(provider);

    selectedModelInfo.textContent = provider.modelName;
    selectedBackendInfo.textContent = provider.library;
    selectedRuntimeInfo.textContent = provider.runtimeLabel;
    processingModeInfo.textContent = provider.processingMode;
    providerDescription.textContent = [
      provider.library,
      provider.runtimeLabel,
      provider.modelName,
      sizeText,
    ]
      .filter(Boolean)
      .join(" · ");
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

  const recordResponseMetrics = ({ durationMs, outputTokens }) => {
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

  const setLoadState = ({ text, progress = null, visible = true }) => {
    loadStatus.textContent = text;
    loadStatus.hidden = !visible;
    loadProgress.hidden = !visible;
    if (progress === null) {
      loadProgress.removeAttribute("value");
    } else {
      loadProgress.value = progress;
    }
  };

  const populateProviderSelect = () => {
    const availableProviders = getAvailableProviders();
    providerSelect.replaceChildren();

    if (availableProviders.length === 0) {
      errorMessage.style.display = "block";
      errorMessage.textContent =
        "Нет доступных бэкендов. Используйте Chrome с Prompt API или установите зависимости локальных библиотек.";
      return false;
    }

    const groups = new Map();
    for (const provider of availableProviders) {
      if (!groups.has(provider.group)) {
        groups.set(provider.group, []);
      }
      groups.get(provider.group).push(provider);
    }

    for (const [groupName, providers] of groups) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = groupName;
      for (const provider of providers) {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = getProviderSelectLabel(provider);
        optgroup.append(option);
      }
      providerSelect.append(optgroup);
    }

    if (!availableProviders.some((provider) => provider.id === activeProviderId)) {
      activeProviderId = availableProviders[0].id;
    }

    providerSelect.value = activeProviderId;
    return true;
  };

  responseArea.style.display = "none";

  const updateStats = () => {
    if (!session) {
      return;
    }

    const numberFormat = new Intl.NumberFormat(NUMBER_FORMAT_LANGUAGE);
    const contextWindow = session.contextWindow ?? 0;
    const contextUsage = session.contextUsage ?? 0;

    maxTokensInfo.textContent = numberFormat.format(contextWindow);
    tokensSoFarInfo.textContent = numberFormat.format(contextUsage);
    tokensLeftInfo.textContent = numberFormat.format(
      Math.max(contextWindow - contextUsage, 0),
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
    costSpan.textContent = "";
    promptInput.focus();
  };

  const resetResponseMetrics = () => {
    metricsState.responseTimeHistory = [];
    lastResponseTimeInfo.textContent = "\u2014";
    tokensPerSecondInfo.textContent = "\u2014";
    updateResponseTimeHistory();
  };

  const destroySession = () => {
    if (session) {
      session.destroy();
      session = null;
    }
  };

  const updateSession = async (providerId = activeProviderId) => {
    if (isLoadingProvider) {
      return;
    }

    const resolvedId = resolveProviderId(providerId);

    isLoadingProvider = true;
    activeProviderId = resolvedId;
    providerSelect.value = resolvedId;
    providerApplyButton.disabled = true;
    submitButton.disabled = true;
    resetButton.disabled = true;

    destroySession();
    resetUI();
    resetResponseMetrics();
    updateProviderInfo();

    const provider = getProvider(resolvedId);
    setLoadState({
      text: `Загрузка: ${provider.label}…`,
      progress: 0,
      visible: true,
    });

    try {
      session = await createProviderSession(resolvedId, {
        systemPrompt: SYSTEM_PROMPT,
        onProgress: (value) => {
          setLoadState({
            text: `Загрузка: ${provider.label} — ${Math.round(value * 100)}%`,
            progress: value,
            visible: true,
          });
        },
      });

      metricsState.modelLoadTimeMs = session.loadTimeMs ?? null;
      setLoadState({ text: `Готово: ${provider.label}`, progress: 1, visible: true });
      setTimeout(() => setLoadState({ text: "", visible: false }), 1500);
    } catch (error) {
      console.error(error);
      setLoadState({
        text: `Ошибка загрузки ${provider.label}: ${error.message}`,
        visible: true,
      });
      errorMessage.style.display = "block";
      errorMessage.textContent = error.message;
      throw error;
    } finally {
      isLoadingProvider = false;
      providerApplyButton.disabled = false;
      submitButton.disabled = false;
      resetButton.disabled = false;
      updateStats();
      updateModelLoadTime();
      updateMemoryMetrics();
    }
  };

  const promptModel = async (highlight = false) => {
    copyLinkButton.style.display = "none";
    copyHelper.style.display = "none";
    problematicArea.style.display = "none";

    const prompt = promptInput.value.trim();
    if (!prompt) {
      return;
    }

    if (!session) {
      await updateSession(activeProviderId);
    }

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
      const startedAt = performance.now();
      const stream = await session.promptStreaming(prompt);
      const usageBefore = getContextUsage();

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
      const outputTokens =
        session.lastOutputTokenCount ??
        Math.max(usageAfter - usageBefore, 0);
      recordResponseMetrics({
        durationMs,
        outputTokens,
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

  await probeWebGpuAvailability();
  activeProviderId = getDefaultProviderId();

  if (!populateProviderSelect()) {
    return;
  }

  promptArea.style.display = "block";
  errorMessage.style.display = "none";
  copyLinkButton.style.display = "none";
  copyHelper.style.display = "none";
  updateProviderInfo();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await promptModel();
  });

  promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
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
      costSpan.textContent = "";
      return;
    }

    const cost = await session.measureContextUsage(value);
    if (!cost) {
      costSpan.textContent = "";
      return;
    }

    costSpan.textContent = formatTokenCount(cost);
  });

  providerApplyButton.addEventListener("click", async () => {
    const nextProviderId = providerSelect.value;
    if (nextProviderId === activeProviderId && session) {
      return;
    }

    errorMessage.style.display = "none";
    promptInput.value = "";
    await updateSession(nextProviderId);
  });

  resetButton.addEventListener("click", async () => {
    promptInput.value = "";
    resetUI();
    resetResponseMetrics();
    await updateSession(activeProviderId);
  });

  copyLinkButton.addEventListener("click", () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      return;
    }

    const url = new URL(self.location.href);
    url.searchParams.set("provider", activeProviderId);
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

  const params = new URLSearchParams(location.search);
  const urlProvider = params.get("provider");
  const urlPrompt = params.get("prompt");
  const highlight = params.get("highlight");

  if (urlProvider && getProvider(urlProvider)) {
    activeProviderId = resolveProviderId(urlProvider);
    providerSelect.value = activeProviderId;
    updateProviderInfo();
  }

  await updateSession(activeProviderId);

  if (urlPrompt) {
    promptInput.value = decodeURIComponent(urlPrompt).trim();
    await promptModel(highlight);
  }
})();
