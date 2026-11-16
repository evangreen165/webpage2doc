# Этап 2 — Сбор контента (page snapshot via content script)

Коммит: `feat(collector): page snapshot via content script`

## Что сделано

### 1. `content/collector.ts`
- **Изображения**: кандидаты из `img src`, `data-src`/`data-original`/`data-lazy-src`, `srcset` (выбирается кандидат с наибольшим дескриптором `w`/`x`), `<picture>/<source>`, CSS `background-image` через `getComputedStyle` по всем элементам `body`.
- **Видео/фреймы**: `video[src]`, `video source[src]`, `iframe[src]` — сохраняются только URL (+ `title`, если есть).
- **Резолв относительных URL** в абсолютные через `new URL(raw, document.baseURI)`.
- **Дедупликация URL** через `Set` (по абсолютному URL).
- **Идентификаторы** кандидатов: `img-0001`, `img-0002`, …
- **Ошибки**: `UNSUPPORTED_PAGE` (протокол не http/https), `EMPTY` (нет `<body>`).

### 2. `content/content-script.ts`
- Слушатель `chrome.runtime.onMessage` на `W2D_COLLECT`, синхронный ответ `Snapshot` через `sendResponse`.

### 3. `sidepanel/src/lib/types.ts` (новый)
- Общие типы: `CollectRequest`, `ImageCandidate`, `VideoCandidate`, `Snapshot`, `SnapshotErrorCode`.

### 4. `sidepanel/src/lib/bridge.ts` (новый)
- `collectFromTab(tabId)`: `chrome.tabs.sendMessage(W2D_COLLECT)` → при `chrome.runtime.lastError` инжект `content/content-script.js` через `chrome.scripting.executeScript` → повторная отправка.
- Если инжект не удался (системная страница) — `UNSUPPORTED_PAGE`; нет ответа — `EMPTY`; таймаут 10 с — `TIMEOUT`.

### 5. `sidepanel/src/App.tsx`
- Кнопка «Сгенерировать» → `chrome.tabs.query({active, currentWindow})` → `collectFromTab(tab.id)`.
- Вывод: заголовок страницы, «Найдено: N изображений, M видео», список warnings.
- Ошибки с понятными сообщениями через i18n: `UNSUPPORTED_PAGE` / `TIMEOUT` / `EMPTY` / «вкладка недоступна».

### 6. i18n
- Новые ключи в `ru.json` / `en.json`: `actions.generate`, `status.collecting`, `results.found`, `results.warnings`, `errors.*`.

## Проверка
- `npm run lint` — чисто
- `tsc --noEmit` — чисто
- `npm run build` — сборка успешна; в `dist/content/content-script.js` присутствует слушатель `W2D_COLLECT`; в `dist/sidepanel/assets` — обновлённый бандл панели

## Ручная проверка (не автоматизируемая)
`chrome://extensions` → Load unpacked `dist/`:
- на `https://example.com` кнопка показывает «Найдено: … изображений, … видео»;
- на странице с CSS-фоном находится `background-image`;
- на `chrome://extensions` — сообщение «Эта страница не поддерживается»;
- относительные URL резолвятся в абсолютные.

## Исправление локализации ошибок
Коммит: `fix(ui): localize error messages`

**Проблема**: текст ошибки попадал в `useState` уже переведённым (готовой строкой на русском), поэтому при переключении языка RU→EN сообщение «Эта страница не поддерживается» оставалось русским.

**Исправление**:
- `App.tsx`: вместо строки в состоянии теперь хранится **код ошибки** (`UNSUPPORTED_PAGE`, `TIMEOUT`, `EMPTY`, `NO_TAB`, `GENERIC`); текст рендерится в момент отрисовки через `t(\`errors.${errorCode}\`)`, поэтому при смене языка компонент перерисовывается и переводится заново.
- Ключи в `ru.json`/`en.json` переименованы под коды ошибок: `errors.UNSUPPORTED_PAGE`, `errors.TIMEOUT`, `errors.EMPTY`, `errors.NO_TAB`, `errors.GENERIC` (оба языка).

**Проверка**: lint + tsc + build чисто; в собранном бандле ошибки переводятся динамически через i18next.
