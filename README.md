# Демо Prompt API — сравнение локальных LLM

Интерактивное демо для сравнения **встроенного Prompt API** (Gemini Nano в Chrome) с **Transformers.js**:

| Бэкенд | Модель | Среда | Размер |
| --- | --- | --- | --- |
| Prompt API | Gemini Nano (v3Nano) | встроенная | ~4 ГБ |
| Transformers.js | Gemma 3 1B (GQA) | WebGPU | ~790 МБ |
| Transformers.js | Qwen3 0.6B | WASM | ~589 МБ |

Форк от [демо Prompt API](https://github.com/GoogleChromeLabs/web-ai-demos/tree/main/prompt-api-playground).

## Требования

- **Chrome 113+** с WebGPU (для GPU-бэкенда)
- **HTTPS** или `localhost`
- **Prompt API** (Gemini Nano) — опционально
- **8+ ГБ RAM** рекомендуется для Gemma 3 1B

## Запуск

```bash
npm install
npm start
```

Откройте `http://localhost:8080`.

## Бэкенды

### Prompt API — Gemini Nano

Встроенная модель Chrome, без скачивания весов через демо. Фактический размер на диске зависит от версии Chrome и железа (вариант 2B/4B, CPU/GPU). Проверка: `chrome://on-device-internals` → Model Status → Folder size (например v3Nano ~4 075 MiB на CPU).

### Transformers.js — Gemma 3 1B

| ID | Среда | Квантизация |
| --- | --- | --- |
| `transformers-webgpu` | WebGPU | `q4f16`, Gemma 3 1B GQA |
| `transformers-wasm` | WASM (CPU) | `q8`, Qwen3 0.6B |

WASM-вариант использует **Qwen3 0.6B** (~589 МБ): Gemma 3 1B в формате q8 занимает ~1,5 ГБ и не помещается в WASM-память браузера (`std::bad_alloc`). WebGPU-варiant — Gemma 3 1B GQA с `q4f16`. При `npm install` скрипт копирует runtime ONNX Runtime WASM в `public/onnx/`.

## Структура проекта

```
providers/
  config.js       # Список бэкендов
  transformers.js # Transformers.js
  prompt-api.js   # Chrome Prompt API
script.js         # UI и метрики
```

## Лицензия

Apache-2.0.
