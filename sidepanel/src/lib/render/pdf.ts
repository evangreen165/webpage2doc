import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { stripInlineHandlers, stripOnAttributes } from "../extractor";

const BASE_STYLE = `
img { max-width: 100%; height: auto; }
img, figure, p, h1, h2, h3, h4, h5, h6, blockquote { page-break-inside: avoid; break-inside: avoid; }
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
  host.style.position = "absolute";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "800px";
  host.style.zIndex = "99999";
  host.style.background = "white";
  host.style.padding = "20px";
  host.style.color = "black";
  host.style.fontFamily = "Arial, sans-serif";
  host.innerHTML = `<meta charset="utf-8"><style>${BASE_STYLE}</style>${stripInlineHandlers(bodyHtmlOf(html))}`;
  stripOnAttributes(host);
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const dataUrl = await toJpeg(host, {
      quality: 0.95,
      backgroundColor: "#ffffff",
      cacheBust: true,
      imagePlaceholder: "",
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(dataUrl);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
    const pageHeight = pdf.internal.pageSize.getHeight();

    let heightLeft = imgHeight;
    pdf.addImage(dataUrl, "JPEG", 0, 0, pdfWidth, imgHeight);
    heightLeft -= pageHeight;

    let position = 0;
    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(dataUrl, "JPEG", 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output("blob");
  } finally {
    host.remove();
  }
}
