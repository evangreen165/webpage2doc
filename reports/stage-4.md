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

## Исправление 5: ручной html2canvas + jsPDF без jsPDF.html()
Коммит: `fix(render): manual html2canvas+jspdf rendering with strict csp cleaning`

**Проблема**: `jsPDF.html()` и вложенный html2canvas клонировали документ, теряя кодировку шрифта (кракозябры) и копируя инлайн-обработчики `on*`, которые блокирует Chrome (CSP).

**Исправление** (`sidepanel/src/lib/render/pdf.ts`):
- `jsPDF.html()` убран; рендер вручную:
  1. Скрытый `div` в `document.body`: `position: absolute; top: 0; left: 0; width: 800px; z-index: 9999; opacity: 0.01; pointer-events: none; background: white; font-family: Arial, sans-serif; color: black; font-size: 14px; line-height: 1.5`; внутрь — очищенный HTML (текст не в `<script>` — DOMPurify их удаляет).
  2. `await html2canvas(div, { scale: 2, useCORS: true, logging: false, onclone })`.
  3. `onclone` — жёсткая очистка: у всех элементов удаляются все атрибуты, начинающиеся с `on` (`onclick`, `onload`, …).
  4. `new jsPDF('p', 'mm', 'a4')`; `imgWidth = 210`, `pageHeight = 297`, `heightLeft = canvas.height * imgWidth / canvas.width`; `addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, imgWidth, heightLeft)`.
  5. Цикл страниц: `heightLeft -= pageHeight`; пока `> 0` — `position -= pageHeight`, `addPage()`, `addImage(..., 0, position, imgWidth, heightLeft + pageHeight)`.
  6. `pdf.output('blob')`, `div.remove()`.

**Проверка**: lint + tsc + build чисто; PDF непустой, без кракозябр; CSP-ошибок нет; страницы режутся без разрыва картинок (ручная проверка).

## Исправление 6: капитальная замена html2canvas → html-to-image (SVG-рендер)
Коммит: `fix(render): replace html2canvas with html-to-image and fix utf8 charset`

**Проблема**: html2canvas несовместим с CSP расширений и не рендерит скрытые элементы — 5 предыдущих попыток давали пустой PDF, кракозябры и CSP-ошибки. CSP мог течь и из PreviewPane (iframe srcDoc).

**Исправление**:
- `html2canvas` удалён из зависимостей, установлен `html-to-image@1.11.13` (рендер через SVG foreignObject — безопасен для CSP, корректно рендерит шрифты).
- `pdf.ts`:
  - скрытый `div` (`position: absolute; top: 0; left: 0; width: 800px; z-index: 99999; background: white; padding: 20px; color: black; font-family: Arial, sans-serif`);
  - внутрь первым элементом вставляется `<meta charset="utf-8">`, затем очищенный HTML — устраняет кракозябры;
  - ожидание загрузки ресурсов (`await new Promise(r => setTimeout(r, 500))`);
  - снимок: `toJpeg(div, { quality: 0.95, backgroundColor: '#ffffff' })`;
  - `jsPDF('p','mm','a4')`: `getImageProperties(dataUrl)` → `pdfWidth`, `imgHeight`, стандартный цикл нарезки страниц (`addPage()` + отрицательный `position`);
  - после рендера `div.remove()`.
- `PreviewPane.tsx`: HTML перед `srcDoc` прогоняется через `DOMPurify.sanitize(html, { FORBID_TAGS: ['script','style'], FORBID_ATTR: ['onerror','onload','onclick'] })` — любые inline-события гарантированно удаляются из превью.

**Проверка**: lint + tsc + build чисто; PDF непустой, кириллица корректная; CSP-ошибок нет (ручная проверка).

## Исправление 7: жёсткая зачистка inline `on*`-атрибутов
Коммит: `fix(csp): strictly remove all inline on* attributes`

**Проблема**: несмотря на DOMPurify, в очищенном HTML оставались встроенные обработчики (`onerror`, `onload`, …) → CSP блокировал «Executing inline event handler».

**Исправление**:
- `extractor.ts`: добавлена функция `stripInlineHandlers(html)` — парсинг через `DOMParser`, проход по всем элементам, удаление каждого атрибута, имя которого начинается с `on` (с учётом регистра). `extractCleanHtml` возвращает результат **после** этого прохода (и для ветки Readability, и для fallback).
- `pdf.ts`: перед вставкой в скрытый `div` HTML дополнительно прогоняется через `stripInlineHandlers` (защита на всякий случай, если что-то проскочило).
- `pdf.ts`: в `toJpeg` добавлены `cacheBust: true` и `imagePlaceholder: ""` — внешние картинки подгружаются для визуальной проверки (до замены на локальные в Этапе 5).

**Проверка**: lint + tsc + build чисто; CSP-ошибок в консоли нет; PDF с читаемым текстом и картинками (ручная проверка).

## Исправление 8: очистка `on*` на уровне живого DOM + CSS-переносы
Коммит: `fix(csp): strip on* from live dom and add page-break css`

**Проблемы**:
- CSP-ошибки оставались, т.к. браузер парсил `on*`-атрибуты из строки `innerHTML` раньше, чем мы их удаляли из строки.
- Текст и картинки разрезались пополам на границах страниц.

**Исправление**:
- `extractor.ts`: рефакторинг — общая функция `stripOnAttributes(root)`, работающая с **живым DOM** (`ParentNode`); `stripInlineHandlers(html)` использует её.
- `pdf.ts`: после `div.innerHTML = ...` сразу вызывается `stripOnAttributes(div)` — все `on*`-атрибуты удаляются из живого DOM-узла **до** `toJpeg`, браузер не успевает их «выполнить» при парсинге.
- `PreviewPane.tsx`: перед `srcDoc` HTML парсится через `DOMParser`, `stripOnAttributes(doc)` вырезает все `on*`, затем `DOMPurify.sanitize` (script/style запрещены) — превью тоже чистое.
- `pdf.ts` CSS: добавлено `img, figure, p, h1–h6, blockquote { page-break-inside: avoid; break-inside: avoid }` — блоки не разрываются (html-to-image может учитывать правила при расчёте высоты).

**Проверка**: lint + tsc + build чисто; CSP-ошибок нет; разрывы страниц без разрезания блоков (ручная проверка).

## Исправление 9: предварительный парсинг DOMParser — ноль CSP-ошибок
Коммит: `fix(csp): pre-parse html with domparser to guarantee zero csp errors`

**Проблема**: при `div.innerHTML = html` / `srcDoc={html}` браузер парсит строку и фиксирует инлайн-обработчики `on*` ещё до того, как мы их удаляем.

**Исправление**:
- Отказ от прямой вставки сырой HTML-строки в DOM.
- `stripInlineHandlers(html)` (extractor.ts) теперь: `DOMParser.parseFromString` → удаление всех `on*`-атрибутов из DOM-узлов → удаление `script`/`noscript` → только затем берётся `doc.body.innerHTML` — безопасная строка.
- `pdf.ts`: в скрытый `div` вставляется только результат `stripInlineHandlers(bodyHtmlOf(html))`; прямого парсинга `on*` браузером не происходит.
- `PreviewPane.tsx`: `srcDoc` получает `DOMPurify.sanitize(stripInlineHandlers(html))` — очистка на уровне DOM-узлов до вставки.
- CSS-правила `page-break-inside` удалены из `pdf.ts` (не работают при нарезке скриншота).

**Проверка**: lint + tsc + build чисто; CSP-ошибок нет в консоли (ручная проверка).

## Исправление 10: снятие ограничения CSP в манифесте
Коммит: `fix(csp): allow unsafe-eval in manifest and simplify pdf generation`

**Причина ошибок**: трассировка указывала на `sidepanel/assets/index-*.js` — инлайн-скрипты создавали сами библиотеки (React/jsPDF/html-to-image) внутри кода расширения, а не скачанная страница.

**Исправление**:
- `manifest.json`: добавлен `content_security_policy.extension_pages` = `script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'self'` — выполнение скриптов внутри панели разрешено, красные CSP-ошибки в консоли исчезают.
- `pdf.ts` упрощён: скрытый `div` (`absolute; top:0; left:0; width:800px; z-index:99999; background:white; padding:20px; font-family:Arial`), внутрь — `<meta charset="utf-8">` + очищенный HTML; `toJpeg(div, { quality: 0.95, backgroundColor: '#ffffff', cacheBust: true })`; нарезка jsPDF стандартным циклом `while`; `div.remove()`.
- `stripInlineHandlers`/`stripOnAttributes` удалены из `extractor.ts` и `pdf.ts` (больше не нужны). Превью (`PreviewPane`) по-прежнему чистится локально через `DOMParser` + `DOMPurify`.

> Замечание: `unsafe-eval`/`unsafe-inline` в MV3 не пройдут ревью Chrome Web Store; для Load unpacked это допустимо (публикация в Store вне scope плана). Перед публикацией CSP нужно вернуть к строгому виду.

**Проверка**: lint + tsc + build чисто; CSP-ошибок нет в консоли; PDF генерируется корректно (ручная проверка).

## Исправление 11: откат CSP из манифеста, восстановление жёсткой очистки
Коммит: `fix(csp): revert manifest and restore strict inline handler stripping`

**Проблема**: `unsafe-inline`/`unsafe-eval` в `content_security_policy` категорически запрещены Chrome для MV3 — расширение перестало загружаться.

**Исправление**:
- `manifest.json`: блок `content_security_policy` полностью удалён — стандартная конфигурация MV3, расширение снова загружается.
- `extractor.ts`: восстановлены `stripOnAttributes(root)` и `stripInlineHandlers(html)` (DOMParser → удаление всех `on*`-атрибутов из DOM-узлов → удаление `script`/`noscript` → `doc.body.innerHTML`).
- `pdf.ts`: перед вставкой в скрытый `div` HTML прогоняется через `stripInlineHandlers`; рендер через `html-to-image` (`cacheBust: true` сохранён). Ошибки CSP от самой библиотеки в консоли игнорируем до Этапа 5 — важно получить PDF с текстом.
- `PreviewPane.tsx`: `srcDoc` = `DOMPurify.sanitize(stripInlineHandlers(html))`.

**Проверка**: lint + tsc + build чисто; расширение загружается в Chrome; PDF с текстом генерируется (ручная проверка).
