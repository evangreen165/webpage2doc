# Архитектура WebPage2Doc

Chrome-расширение (Manifest V3), которое превращает любую веб-страницу в чистый PDF, DOCX или Markdown с картинками. Всё выполняется локально в браузере пользователя — серверного бэкенда нет.

## 1. Обзор

- **Формат расширения**: Manifest V3, minimum Chrome 114.
- **Единственный UI** — Side Panel (React 18 + Vite + Tailwind + shadcn/ui), открывается кликом по иконке расширения.
- **Service worker минимален**: только `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
- **Всё локально**: страница, картинки и данные не покидают компьютер пользователя.

## 2. Компоненты

| Компонент | Роль |
|---|---|
| `content/content-script.ts` + `collector.ts` | Сбор снапшота страницы: DOM, `<img>`, `srcset`, `data-src`, CSS `background-image`, `<video>`/`<iframe>`, чистый HTML через @mozilla/readability |
| `sidepanel/` (React) | Весь конвейер: fetch картинок, рендеры (MD/DOCX/PDF), ZIP, `chrome.downloads`, история, i18n, тема |
| `background/service-worker.ts` | Открытие Side Panel по клику на иконку |

## 3. Поток генерации

```
[Вкладка]
   ▲ content script (collector): DOM → снапшот
   │   • <img src|data-src|srcset>, <picture>/<source>
   │   • getComputedStyle → background-image url(...)
   │   • <video>/<iframe src> → ссылки (не скачиваются)
   │   • @mozilla/readability → clean HTML (fallback: полный DOM)
   │   • резолв относительных URL → абсолютные
   └── tabs.sendMessage(W2D_COLLECT) ──────────────────┐
                                                     ▼
[Side Panel (React, chrome-extension:// страница)]
   ├─ 1. query active tab; если content script не инжектирован —
   │       chrome.scripting.executeScript(files:[content-script.js])
   ├─ 2. fetch изображений ЗДЕСЬ (host_permissions ⇒ CORS не блокирует)
   │       дедуп по хэшу, лимиты, data:-URL без скачивания
   ├─ 3. рендер по формату:
   │       MD   — turndown(+gfm) → document.md (картинки → images/img-0001.png)
   │       DOCX — docx-библиотека, блоки из clean HTML, ImageRun (base64)
   │       PDF  — clean document + наши print-CSS → html2pdf.js (html2canvas+jsPDF)
   ├─ 4. jszip: document.{pdf,docx,md} + images/ → blob
   ├─ 5. chrome.downloads.download(URL.createObjectURL(blob), saveAs:true)
   └─ 6. история → localStorage w2d.history.v1 (max 10)
```

Стадии конвейера в UI: `collect → extract → images → render → zip`, плюс состояния `queued`/`error`.

## 4. Протокол сообщений

- Запрос: `{ type: "W2D_COLLECT" }` через `chrome.tabs.sendMessage`.
- Ответ `Snapshot`:
  - `ok: boolean`
  - `error?: { code: "UNSUPPORTED_PAGE" | "EMPTY" | "TIMEOUT"; message: string }`
  - `title`, `url`, `lang?`
  - `html` — санитизированный, с абсолютными URL
  - `images: ImageCandidate[]` (`{ id, url, alt? }`)
  - `videos: { url, title? }[]`
  - `warnings: string[]`

- **Inject fallback**: если `sendMessage` упал с `chrome.runtime.lastError` (content script не загружен), панель делает `chrome.scripting.executeScript(files: ["content/content-script.js"])` и повторяет отправку.
- Системные страницы (`chrome://`, Web Store и т.п.) → `UNSUPPORTED_PAGE`.

## 5. Извлечение

- Промоушен ленивой загрузки: `data-src`/`data-original` → `src`.
- `@mozilla/readability` на **клоне** документа.
- Санитизация: удаление `script`, `style`, обработчиков `on*`, `src="javascript:"`, опасных `href`.
- Null от readability → fallback на полный DOM + warning `partial_content`.

## 6. Картинки

- Загрузка выполняется в контексте **панели** (а не content script) — `host_permissions: ["<all_urls>"]` обходит CORS.
- Дедупликация по содержимому (SHA-256).
- Лимиты: `MAX_IMAGES = 200`, `MAX_BYTES = 100 MB`, `FETCH_CONCURRENCY = 4`.
- `data:`-URL не качаются по сети.
- Недоступные/защищённые картинки → warning + alt-текст, генерация продолжается.

## 7. Рендеры

| Формат | Библиотека | Особенности |
|---|---|---|
| Markdown | turndown + turndown-plugin-gfm | таблицы, картинки → `images/img-0001.png` |
| DOCX | docx | h1–h6/p/ul/ol/pre/blockquote/table/img/hr; `ImageRun` с base64 |
| PDF | html2pdf.js (html2canvas + jsPDF) | рендерится **чистый документ** с print-CSS; pagebreak; кириллица из системных шрифтов; лимит ~50 страниц с warning |

## 8. ZIP и скачивание

- jszip: `document.{pdf,docx,md}` + папка `images/`.
- Имя файла: `webpage2doc/<slug>.<format>.zip`.
- `chrome.downloads.download(URL.createObjectURL(blob), { saveAs: true })`.

## 9. История

- `localStorage["w2d.history.v1"]`, максимум 10 записей.
- Запись: `{ id, url, title, format, date, size }`.
- Клик по записи запускает повторную генерацию.

## 10. Точки отказа

| Точка отказа | Поведение |
|---|---|
| CORS/403 на картинках | alt-текст + warning |
| Переполнение памяти при рендере (canvas) | рендер чистого документа, а не живого DOM; лимиты по байтам и страницам |
| Закрытие панели во время генерации | задача прерывается; предупреждение в UI; повтор из истории |
| Системные вкладки (`chrome://`) | `UNSUPPORTED_PAGE` |
| Страницы без content script | `chrome.scripting.executeScript` fallback |
| CSP MV3 | никакого удалённого кода — все библиотеки бандлятся Vite/esbuild |

## 11. Расширение

- **Новый формат**: реализовать интерфейс `render(snapshot, images) → Blob` и зарегистрировать в конвейере.
- **Новый источник изображений**: добавить сборщик в `content/collector.ts` (массив `images[]` уже задедуплицирован по URL).
