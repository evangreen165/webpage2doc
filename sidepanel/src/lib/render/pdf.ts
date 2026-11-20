import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

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

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;
const SCALE = 2;

function bodyHtmlOf(fullHtml: string): string {
  const doc = new DOMParser().parseFromString(fullHtml, "text/html");
  return doc.body?.innerHTML ?? fullHtml;
}

export async function renderPdf(html: string): Promise<Blob> {
  const host = document.createElement("div");
  host.id = "w2d-pdf-host";
  host.style.position = "absolute";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.width = "800px";
  host.style.background = "#ffffff";
  host.innerHTML = `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${bodyHtmlOf(html)}</body></html>`;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 800,
      logging: false,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const imageWidthMm = CONTENT_WIDTH_MM;
    const imageHeightMm = (canvas.height / canvas.width) * imageWidthMm;
    const imageData = canvas.toDataURL("image/jpeg", 0.95);

    let heightLeft = imageHeightMm;
    let position = 0;

    pdf.addImage(imageData, "JPEG", MARGIN_MM, MARGIN_MM + position, imageWidthMm, imageHeightMm);
    heightLeft -= CONTENT_HEIGHT_MM;

    while (heightLeft > 0) {
      position -= CONTENT_HEIGHT_MM;
      pdf.addPage();
      pdf.addImage(imageData, "JPEG", MARGIN_MM, MARGIN_MM + position, imageWidthMm, imageHeightMm);
      heightLeft -= CONTENT_HEIGHT_MM;
    }

    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
