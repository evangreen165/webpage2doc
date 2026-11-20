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
