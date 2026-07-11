/**
 * Создаёт async-итератор из callback-based стриминга.
 */
export function createTextStream(generate) {
  const queue = [];
  let resolveWait = null;
  let done = false;
  let error = null;

  const notify = () => {
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  generate({
    push(text) {
      queue.push(text);
      notify();
    },
    finish() {
      done = true;
      notify();
    },
    fail(err) {
      error = err;
      done = true;
      notify();
    },
  }).catch((err) => {
    error = err;
    done = true;
    notify();
  });

  return (async function* () {
    let accumulated = "";
    while (true) {
      if (error) {
        throw error;
      }

      while (queue.length > 0) {
        accumulated += queue.shift();
        yield accumulated;
      }

      if (done) {
        break;
      }

      await new Promise((resolve) => {
        resolveWait = resolve;
      });
    }
  })();
}

export function approximateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function createProviderSessionBase({
  provider,
  contextWindow = 8192,
  systemPrompt,
}) {
  const history = [];
  let contextUsage = systemPrompt ? approximateTokens(systemPrompt) : 0;

  const syncUsage = () => {
    contextUsage = history.reduce(
      (total, message) => total + approximateTokens(message.content),
      systemPrompt ? approximateTokens(systemPrompt) : 0,
    );
  };

  return {
    provider,
    history,
    contextWindow,
    get contextUsage() {
      return contextUsage;
    },
    setContextUsage(value) {
      contextUsage = value;
    },
    syncUsage,
    getMessages(prompt) {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push(...history);
      messages.push({ role: "user", content: prompt });
      return messages;
    },
    appendTurn(prompt, response, { syncUsage: shouldSyncUsage = true } = {}) {
      history.push({ role: "user", content: prompt });
      history.push({ role: "assistant", content: response });
      if (shouldSyncUsage) {
        syncUsage();
      }
    },
  };
}
