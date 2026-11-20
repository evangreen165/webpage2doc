import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const BASE_STYLE = `
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #444444; padding: 4pt; text-align: left; }
blockquote { margin: 1em 2em; font-style: italic; }
pre { white-space: pre-wrap; font-family: "Courier New", monospace; }
a { color: #111111; }
`;

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;

function bodyHtmlOf(fullHtml: string): string {
  const doc = new DOMParser().parseFromString(fullHtml, "text/html");
  return doc.body?.innerHTML ?? fullHtml;
}

export async function renderPdf(html: string): Promise<Blob> {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "800px";
  host.style.zIndex = "9999";
  host.style.opacity = "0.01";
  host.style.pointerEvents = "none";
  host.style.background = "white";
  host.style.fontFamily = "Arial, sans-serif";
  host.style.color = "black";
  host.style.fontSize = "14px";
  host.style.lineHeight = "1.5";
  host.innerHTML = `<style>${BASE_STYLE}</style>${bodyHtmlOf(html)}`;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll("*").forEach((el) => {
          Array.from(el.attributes).forEach((attr) => {
            if (attr.name.startsWith("on")) {
              el.removeAttribute(attr.name);
            }
          });
        });
      },
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = PAGE_WIDTH_MM;
    const pageHeight = PAGE_HEIGHT_MM;
    let heightLeft = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, 0, imgWidth, heightLeft);

    heightLeft -= pageHeight;
    let position = 0;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 1.0), "JPEG", 0, position, imgWidth, heightLeft + pageHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
