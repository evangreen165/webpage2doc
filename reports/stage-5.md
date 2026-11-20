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

## Исправление: картинки в PDF/DOCX + опция «без ZIP»
Коммит: `fix(render): fix docx image binary, await pdf image load, add zip toggle`

**Проблемы**:
- `docx` (`ImageRun`) не принимал строку с префиксом `data:image/...;base64,` → картинки пустые.
- `html-to-image` снимал скриншот до отрисовки Base64-картинок → пустые места в PDF.

**Исправление**:
- `docx.ts`: `base64ToUint8Array(dataUrl)` — отрезается префикс до запятой, `atob()` + `Uint8Array.from(binary, c => c.charCodeAt(0))`; в `ImageRun.data` передаётся именно `Uint8Array`.
- `pdf.ts`: после замены `src` на Base64 и вставки в скрытый `div` ожидается загрузка всех `<img>` (`img.complete` → resolve; иначе `onload`/`onerror` → resolve) и только затем `toJpeg`.
- `App.tsx`: чекбокс «Скачивать в ZIP (с папкой картинок)» — **по умолчанию выключен**:
  - ВЫКЛ: скачивается только документ (`.pdf`/`.docx`/`.md`) напрямую через `chrome.downloads.download`, картинки для PDF/DOCX встроены внутрь;
  - ВКЛ: документ + `images/` упаковываются в ZIP (как раньше).
- i18n: ключ `options.zip` в `ru.json`/`en.json`.

**Проверка**: lint + tsc + build чисто; в PDF/DOCX картинки видны; оба режима скачивания работают (ручная проверка).

## Исправление 2: надёжное сопоставление картинок по `data-w2d-id` + PNG для DOCX
Коммит: `fix(render): map images by data-id, convert to png for docx, add dom paint delay for pdf`

**Проблема**: сопоставление скачанных картинок с `<img>` по URL ненадёжно — в `outerHTML` атрибуты `src` хранятся в относительном виде, и после парсинга в панели они не совпадают с абсолютными URL кандидатов. Также `docx` не поддерживает WebP/AVIF.

**Исправление**:
- `extractor.ts`: `extractCleanHtml(snapshot)` — каждому `<img>` присваивается `data-w2d-id` (id кандидата `img-0001`…), сопоставление через резолв `src` относительно `snapshot.url` → абсолютный URL → id.
- `docx.ts`: картинки ищутся по `data-w2d-id`; `convertToPng(base64)` — `new Image()` → canvas → `toDataURL('image/png')` (гарантированный формат); в `ImageRun.data` передаётся PNG как `Uint8Array` (`atob` + charCodeAt).
- `pdf.ts`: `src` подменяется на сохранённый Base64 по `data-w2d-id`; перед `toJpeg` добавлены `await document.fonts.ready` + `await new Promise(r => setTimeout(r, 1000))` (DOM успевает отрисовать Base64), плюс ожидание `img.complete`/`onload`/`onerror`.

**Проверка**: lint + tsc + build чисто; картинки в PDF/DOCX не битые (ручная проверка).

## Исправление 3: пуленепробиваемый DOCX (fetch), защита от зависания PDF, финальная зачистка CSP
Коммит: `fix(render): bulletproof docx arraybuffer, prevent pdf hang, final csp strip`

**Проблемы**: PDF зависал (блокирующая задержка 1000 мс), DOCX пустой, CSP-ошибки оставались.

**Исправление**:
- `docx.ts`: `atob()`/`charCodeAt()` полностью удалены; `base64ToArrayBuffer(dataUrl)` через `await fetch(dataUrl).arrayBuffer()` → `Uint8Array` — этот массив передаётся в `ImageRun` (после конвертации в PNG через canvas).
- `pdf.ts`:
  - убрана блокирующая задержка `setTimeout(1000)`;
  - загрузка картинок с жёстким таймаутом 2 с на каждую (`setTimeout(resolve, 2000)`) — если не загрузилась, идём дальше;
  - перед `toJpeg` финальная зачистка: у всех элементов скрытого `div` удаляются атрибуты `on*`;
  - `console.log("Найдено картинок для вставки:", images.length)` — контроль `data-w2d-id`.
- `sidepanel/index.html` проверен: единственный `<script>` — module-вход `/src/main.tsx` (внешний `src`, разрешён CSP `'self'`), инлайн-обработчиков нет.

**Проверка**: lint + tsc + build чисто; PDF не зависает; DOCX с картинками; CSP-ошибок нет (ручная проверка).
