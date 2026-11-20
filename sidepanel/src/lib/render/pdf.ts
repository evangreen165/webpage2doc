import { jsPDF } from "jspdf";

const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
body { font-family: Arial, "Times New Roman", sans-serif; font-size: 12pt; line-height: 1.5; color: #111111; background: #ffffff; margin: 0; }
h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
img { page-break-inside: avoid; break-inside: avoid; max-width: 100%; }
figure, p { page-break-inside: avoid; break-inside: avoid; }
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
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "800px";
  iframe.style.height = "1000px";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  try {
    const contentDocument = iframe.contentDocument;
    if (!contentDocument) throw new Error("iframe document is not available");

    contentDocument.open();
    contentDocument.write(
      `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${bodyHtmlOf(html)}</body></html>`,
    );
    contentDocument.close();

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    await pdf.html(contentDocument.body, {
      html2canvas: { scale: 2, useCORS: true },
      autoPaging: "text",
      margin: 10,
      windowWidth: 800,
    });

    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}
