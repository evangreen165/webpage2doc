import html2pdf from "html2pdf.js";

const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
body { font-family: Arial, "Times New Roman", sans-serif; font-size: 12pt; line-height: 1.5; color: #111111; background: #ffffff; margin: 0; }
h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
img, table, figure { page-break-inside: avoid; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #444444; padding: 4pt; text-align: left; }
blockquote { margin: 1em 2em; font-style: italic; }
pre { white-space: pre-wrap; font-family: "Courier New", monospace; }
a { color: #111111; }
`;

function bodyHtmlOf(fullHtml: string): string {
  const doc = new DOMParser().parseFromString(fullHtml, "text/html");
  return doc.body?.innerHTML ?? fullHtml;
}

export async function renderPdf(html: string): Promise<Blob> {
  const host = document.createElement("div");
  host.id = "w2d-pdf-host";
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "800px";
  host.style.background = "#ffffff";
  host.innerHTML = `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${bodyHtmlOf(html)}</body></html>`;
  document.body.appendChild(host);

  try {
    const worker = html2pdf()
      .set({
        margin: 10,
        filename: "document.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 800 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["h1", "h2", "h3", "table", "img"] },
      })
      .from(host);

    return (await worker.outputPdf("blob")) as Blob;
  } finally {
    host.remove();
  }
}
