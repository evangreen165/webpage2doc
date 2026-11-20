# Этап 3 — Извлечение и очистка (clean document extraction and preview)

Коммит: `feat(extractor): clean document extraction and preview`

## Что сделано

### 1. `sidepanel/src/lib/extractor.ts`
- Парсинг `snapshot.html` через `DOMParser`.
- **Промоушен ленивых картинок** перед Readability: `data-src`/`data-original`/`data-lazy-src` → `src`, `data-srcset` → `srcset` (для `img` и `source`) — чтобы Readability не выбросил ещё не загруженные изображения.
- **@mozilla/readability** (`new Readability(doc.cloneNode(true)).parse()`) на клоне документа.
- **Fallback**: если `parse()` вернул `null` (SPA, каталоги) — санитизированный исходный HTML + warning `partial_content`.
- **Санитизация** (применяется к обоим путям): удаление `script`, `style`, `noscript`, `template`, `link`, `meta`; удаление атрибутов `on*`; удаление `href/src/action/xlink:href` со схемами `javascript:`, `vbscript:`, `data:text/html:` — защита от XSS.
- Возврат `ExtractionResult { html, title?, usedFallback, warnings }`; `html` обёрнут в полный документ с `charset=utf-8`.

### 2. `sidepanel/src/components/PreviewPane.tsx`
- `<iframe sandbox="" referrerPolicy="no-referrer" srcDoc={html}>` — **без `allow-scripts`**, контент изолирован от интерфейса панели; стили плагина не влияют на превью и наоборот.

### 3. `sidepanel/src/App.tsx`
- После успешного сбора снапшот прогоняется через `extractCleanHtml`.
- Отображается `PreviewPane` с очищенным HTML (занимает всю оставшуюся высоту).
- При сработавшем fallback показывается предупреждение «Часть содержимого могла быть потеряна» + существующие warnings снапшота.

### 4. i18n
- Новые ключи в `ru.json`/`en.json`: `warnings.partialContent`, `preview.title`.

## Проверка
- `npm run lint` — чисто
- `tsc --noEmit` — чисто
- `npm run build` — успешно; `@mozilla/readability` забандлен в side panel (MV3 CSP соблюдён)

## Ручная проверка (не автоматизируемая)
- Статья с меню/футером → превью содержит только контент.
- В HTML превью нет `<script>` и атрибутов `style=`/`on*`.
- SPA/каталог → непустой документ + warning `partial_content`.
- Превью не исполняет JS (`sandbox=""` без `allow-scripts`).
