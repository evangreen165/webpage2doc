import { jsPDF } from "jspdf";

const BASE_STYLE = `
body { font-family: Arial, sans-serif; color: black; line-height: 1.5; }
img { max-width: 100%; height: auto; }
h1, h2, h3, h4, h5, h6 { page-break-after: avoid; break-after: avoid; }
img, figure, p, table, tr { page-break-inside: avoid; break-inside: avoid; }
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
  host.style.position = "fixed";
  host.style.left = "0";
  host.style.top = "0";
  host.style.zIndex = "-9999";
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.width = "800px";
  host.style.background = "white";
  host.innerHTML = `<style>${BASE_STYLE}</style>${bodyHtmlOf(html)}`;
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    await pdf.html(host, {
      html2canvas: { scale: 2, useCORS: true, logging: false },
      autoPaging: "text",
      margin: [10, 10, 10, 10],
    });

    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
