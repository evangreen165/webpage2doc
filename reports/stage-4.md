# Этап 4 — Рендеры (без картинок)

Коммит: `feat(render): markdown, docx and pdf generators`

## Что сделано

### 1. `sidepanel/src/lib/render/markdown.ts`
- `turndown` + `turndown-plugin-gfm` (таблицы, gfm-расширения).
- Правило `mediaLink`: `<iframe>`/`<video>` → `[Видео: url]`.
- Настройки: ATX-заголовки, fenced-код, `-` для списков, `---` для hr.

### 2. `sidepanel/src/lib/render/docx.ts`
- `docx` (`Document`/`Packer.toBlob`).
- Рекурсивный парсер HTML: `h1–h6` → заголовки, `p`, `ul` → bullets, `ol` → ручная нумерация, `blockquote` → отступ + курсив, `table` → `Table` с границами, `hr` → нижняя граница абзаца, `pre` → Consolas.
- Inline: `strong/b`, `em/i`, `br`, `a`, `img` → текст `[Картинка]` (картинки — на Этапе 5).

### 3. `sidepanel/src/lib/render/pdf.ts`
- `html2pdf.js` (`html2canvas` + `jsPDF`).
- Очищенный HTML оборачивается в полный документ с **print-CSS**: базовый шрифт `Arial, Times New Roman`, отступы `@page 10mm`, `page-break-after: avoid` для заголовков, `page-break-inside: avoid` для таблиц/картинок.
- `pagebreak: { mode: ["css","legacy"], avoid: ["h1","h2","h3","table","img"] }`.
- Рендер в скрытом контейнере → `outputPdf("blob")`.

### 4. `sidepanel/src/lib/format.ts` (новое)
- `slugify()` — имя файла из заголовка, `formatBytes()`.

### 5. `sidepanel/src/App.tsx`
- Селектор формата (PDF | DOCX | Markdown) + кнопка «Скачать».
- Скачивание **напрямую** через `chrome.downloads.download(URL.createObjectURL(blob), { filename: "webpage2doc/<slug>.<ext>", saveAs: true })`, без ZIP.
- Состояние `rendering` с текстом «Генерируем документ…».

### 6. i18n
- Ключи `actions.download`, `status.rendering`, `format.label`, `format.pdf/docx/md` в `ru.json`/`en.json`.

## Проверка
- `npm run lint` — чисто
- `tsc --noEmit` — чисто
- `npm run build` — успешно; turndown(+gfm), docx, html2pdf.js забандлены в панель (CSP соблюдён)

## Ручная проверка (не автоматизируемая)
- На одной статье генерируются `.md`, `.docx`, `.pdf` (кнопка «Скачать»).
- PDF с русским текстом корректный (кириллица из системных шрифтов Chrome).
- DOCX открывается в Word; MD валиден.
- iframe/видео в MD → `[Видео: url]`.

## Исправление: замена html2pdf.js на html2canvas + jspdf (CSP MV3)
Коммит: `fix(render): replace html2pdf.js with html2canvas+jspdf for mv3 compatibility`

**Проблема**: `html2pdf.js` использует `eval` и встроенные inline-обработчики → нарушение CSP Manifest V3: «Executing inline event handler violates the following Content Security Policy directive». Результат — пустой PDF.

**Исправление**:
- Удалены зависимости `html2pdf.js` и `@types/html2pdf.js`.
- Установлены `html2canvas@1.4.1` и `jspdf@4.2.1` (CSP-безопасные, только бандл без eval/inline).
- `sidepanel/src/lib/render/pdf.ts` переписан:
  - скрытый `div` (`position: absolute; left: -9999px; width: 800px`) с очищенным HTML + print-CSS;
  - добавление в DOM → снимок `html2canvas` со `scale: 2` → удаление `div` из DOM;
  - `jsPDF` (A4, поля 10 мм): картинка режется на страницы — пересчёт высоты в мм, `addPage()` при превышении `CONTENT_HEIGHT_MM`, отрицательный `position` смещает картинку вверх;
  - возврат `pdf.output("blob")`.
- Инлайн-скрипты отсутствуют: санитайзер экстрактора удаляет `script`/`style`/`on*`/`javascript:` до рендера; в обёртку печати добавляется только `<style>`.

**Проверка**: lint + tsc + build чисто; в консоли панели нет ошибок CSP; PDF генерируется (ручная проверка).

## Исправление 2: jsPDF.html + iframe-изоляция (пагинация и CSP)
Коммит: `fix(render): use jsPDF.html for proper pagination and iframe to bypass CSP`

**Проблемы**:
1. Ручная нарезка канваса резала изображения пополам на границах страниц.
2. Вставка скрытого `div` с HTML напрямую в `document.body` панели вызывала ошибки CSP (inline event handler).

**Исправление** (`sidepanel/src/lib/render/pdf.ts`):
- HTML больше не вставляется в `document.body` панели: создаётся `<iframe sandbox="allow-same-origin">` (`position: absolute; left: -9999px; width: 800px; height: 1000px; border: none`), контент записывается в `iframe.contentDocument.body` — стили и скрипты изолированы от панели, ошибки CSP исчезают.
- Пагинация через встроенный `jsPDF.html(body, { html2canvas: { scale: 2 }, autoPaging: "text", margin: 10, windowWidth: 800 })` — блоки (абзацы, изображения, таблицы) переносятся целиком.
- В print-CSS добавлены `img { page-break-inside: avoid; max-width: 100% }` и `figure, p { page-break-inside: avoid }` — движок не разрывает картинки и абзацы.
- После рендера iframe удаляется (`iframe.remove()`), возвращается `pdf.output("blob")`.

**Проверка**: lint + tsc + build чисто; PDF с целыми изображениями на границах страниц; без CSP-ошибок в консоли (ручная проверка).

## Исправление 3: DOMPurify + скрытый div вместо iframe
Коммит: `fix(render): use DOMPurify and hidden div for stable jsPDF generation`

**Проблемы предыдущего решения**:
- Текст в PDF превращался в «кракозябры», картинки накладывались — iframe-изоляция ломала рендер шрифтов/layout.
- Ошибки CSP остались: самописный санитайзер пропускал inline-события.

**Исправление**:
- Установлены `dompurify@3.4.18` (+ `@types/dompurify`).
- `extractor.ts`: самописная санитизация заменена на `DOMPurify.sanitize(html, { FORBID_TAGS: ['style','script'], FORBID_ATTR: ['onerror','onload','onclick'] })` — гарантированно удаляет все inline-обработчики (`on*`), `style` и `script`; применяется и к результату Readability, и к fallback.
- `pdf.ts`: `<iframe>` убран. Скрытый `div` (`position: fixed; left: 0; top: 0; z-index: -9999; opacity: 0; pointer-events: none; width: 800px; background: white`) вставляется в `document.body`; внутрь кладётся очищенный HTML без `<html>/<body>` с базовыми стилями шрифта (`body { font-family: Arial, sans-serif; color: black; line-height: 1.5 }`, `img { max-width: 100%; height: auto }` и page-break-правилами).
- Рендер: `await pdf.html(div, { html2canvas: { scale: 2, useCORS: true, logging: false }, autoPaging: 'text', margin: [10,10,10,10] })`.
- После рендера `div.remove()`; возвращается `pdf.output("blob")`.

**Проверка**: lint + tsc + build чисто; PDF без кракозябр и наложений, изображения не режутся; в консоли нет CSP-ошибок (ручная проверка).

## Исправление 4: прозрачность div и санитизация стилей для CSP
Коммит: `fix(render): fix hidden div opacity for jsPDF and sanitize styles for CSP`

**Проблемы**:
- `html2canvas` внутри `jsPDF.html()` игнорирует элементы с `opacity: 0` → пустой PDF.
- `html2canvas` обрабатывал инлайн-стили/скрипты → ошибки CSP.

**Исправление**:
- `pdf.ts`, скрытый div: `position: absolute; top: 0; left: 0; width: 800px; z-index: 9999; opacity: 0.01; pointer-events: none; background: white` — `opacity: 0.01` (не 0), положительный `z-index`, чтобы браузер отрисовал элемент.
- `extractor.ts`, DOMPurify: `DOMPurify.sanitize(html, { ADD_TAGS: ['style','table','thead','tbody','tr','th','td','img'], ADD_ATTR: ['style','target'] })` — `<style>` сохраняется, `<script>` и все `on*`-атрибуты удаляются по умолчанию DOMPurify.
- `pdf.ts`, рендер: `await pdf.html(div, { html2canvas: { scale: 2, useCORS: true, logging: false, onclone: ... }, autoPaging: 'text', margin: [10,10,10,10], windowWidth: 800 })`; `onclone` удаляет `<style>`, содержащие `eval`/`javascript:` — устранение CSP-ошибок от html2canvas.
- Защита текстовых рендеров: в `markdown.ts` и `docx.ts` добавлен пропуск тегов `style`/`script`/`noscript`/`template`, чтобы CSS не протекал в MD/DOCX.

**Проверка**: lint + tsc + build чисто; PDF непустой, страницы корректные; CSP-ошибок нет (ручная проверка).
