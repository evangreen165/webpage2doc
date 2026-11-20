# Этап 5 — Картинки + ZIP (download images, embed base64 and package zip)

Коммит: `feat(assets): download images, embed base64 and package zip`

## Что сделано

### 1. `sidepanel/src/lib/config.ts` (новое)
- Лимиты по плану: `MAX_IMAGES = 200`, `MAX_BYTES = 100 МБ`, `MAX_HTML_CHARS = 10 МБ`, `MAX_PDF_PAGES = 50`, `FETCH_CONCURRENCY = 4`.

### 2. `sidepanel/src/lib/downloadImages.ts` (новое)
- Скачивание через `fetch` **в контексте панели** (`host_permissions: <all_urls>` обходит CORS).
- Пул воркеров — максимум 4 одновременных запроса (`FETCH_CONCURRENCY`).
- Каждый `Blob` конвертируется в Data URL через `FileReader`.
- Дедуп по содержимому (SHA-256 через `crypto.subtle`); `data:`-URL не качаются по сети.
- Лимиты: `MAX_IMAGES` (warning `image_limit_reached`), `MAX_BYTES` (warning `image_too_large`).
- Сбои (403/404/сеть) — картинка пропускается, warning `image_fetch_failed`.
- Результат: `{ id, url, base64, blob, filename }`, filename = `img-0001.<ext>` по MIME.

### 3. `sidepanel/src/lib/zip.ts` (новое)
- `jszip`: `createZip(entries)` — `document.*` в корень, картинки в `images/`; возвращает ZIP-Blob.

### 4. Рендеры
- **`markdown.ts`**: правило `image` — `src` заменяется на относительный путь `images/<filename>` (картинки работают после распаковки архива).
- **`docx.ts`**: `[Картинка]` заменён на реальные `ImageRun` (base64 из Data URL, тип png/jpg по MIME, размер из натуральных пикселей с ограничением ширины 640 px).
- **`pdf.ts`**: перед рендером `src` всех `<img>` заменяется на Base64 Data URL (html-to-image рендерит их без CORS).

### 5. `sidepanel/src/App.tsx`
- «Скачать»: скачивание картинок → рендер документа (с Base64 для PDF/DOCX или путями `images/` для MD) → `createZip` → `chrome.downloads.download(webpage2doc/<slug>.zip, saveAs: true)`.
- Warnings картинок выводятся в блоке предупреждений (i18n: `imageLimitReached`, `imageFetchFailed`, `imageTooLarge`).

## Как обошли CORS
- Картинки качаются **не** из content script (там CORS страницы), а из side panel, где действуют `host_permissions: <all_urls>` → `fetch` проходит без CORS.
- Для PDF/DOCX Base64 встраивается прямо в документ; для MD используется путь `images/<filename>` внутри ZIP.

## Проверка
- `npm run lint` — чисто; `tsc --noEmit` — чисто; `npm run build` — успешно (jszip в бандле).

## Ручная проверка (не автоматизируемая)
- ZIP скачивается; внутри `document.{pdf,docx,md}` и `images/`.
- В MD ссылки `images/img-0001.png`; в PDF/DOCX картинки встроены.
- Страница с битыми картинками → документ создаётся с warnings.
- Повторные URL не дублируются (хэш SHA-256).
