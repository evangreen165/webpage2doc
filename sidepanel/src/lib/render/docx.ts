import {
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DownloadedImage } from "../downloadImages";

type Block = Paragraph | Table;

const HEADING_LEVELS: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

type PreparedImage = { bytes: Uint8Array; width: number; height: number };

type PngImage = { pngDataUrl: string; width: number; height: number };

type InlineCtx = {
  bold?: boolean;
  italic?: boolean;
  imagesById: Map<string, PreparedImage>;
};

const MAX_IMAGE_WIDTH_PX = 640;

async function base64ToArrayBuffer(dataUrl: string): Promise<Uint8Array> {
  const response = await fetch(dataUrl);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

async function convertToPng(base64: string): Promise<PngImage> {
  const img = await loadImage(base64);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0);
  return {
    pngDataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

function inlineRuns(node: Node, ctx: InlineCtx): (TextRun | ImageRun)[] {
  const runs: (TextRun | ImageRun)[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) runs.push(new TextRun({ text, bold: ctx.bold, italics: ctx.italic }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      runs.push(new TextRun({ text: "\n", bold: ctx.bold, italics: ctx.italic }));
      return;
    }
    if (tag === "img") {
      const id = el.getAttribute("data-w2d-id") ?? "";
      const prepared = ctx.imagesById.get(id);
      if (prepared) {
        let width = prepared.width;
        let height = prepared.height;
        if (width > MAX_IMAGE_WIDTH_PX) {
          height = Math.round((height * MAX_IMAGE_WIDTH_PX) / width);
          width = MAX_IMAGE_WIDTH_PX;
        }
        runs.push(
          new ImageRun({
            type: "png",
            data: prepared.bytes,
            transformation: { width, height },
          }),
        );
      } else {
        runs.push(new TextRun({ text: "[Картинка]", bold: ctx.bold, italics: ctx.italic }));
      }
      return;
    }
    if (tag === "strong" || tag === "b") {
      runs.push(...inlineRuns(el, { ...ctx, bold: true }));
      return;
    }
    if (tag === "em" || tag === "i") {
      runs.push(...inlineRuns(el, { ...ctx, italic: true }));
      return;
    }
    runs.push(...inlineRuns(el, ctx));
  });
  return runs;
}

function cellParagraph(cell: Element, ctx: InlineCtx): Paragraph {
  return new Paragraph({ children: inlineRuns(cell, ctx), spacing: { after: 60 } });
}

function tableFrom(tableEl: Element, ctx: InlineCtx): Table {
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "444444" },
  };
  const rows = Array.from(tableEl.querySelectorAll("tr")).map((tr) => {
    const cells = Array.from(tr.children)
      .filter((c) => c.tagName === "TD" || c.tagName === "TH")
      .map((cell) => new TableCell({ children: [cellParagraph(cell, ctx)] }));
    return new TableRow({ children: cells });
  });
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
  });
}

function walkBlocks(container: Node, ctx: InlineCtx, out: Block[]): void {
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text) out.push(new Paragraph({ children: [new TextRun({ text })] }));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag in HEADING_LEVELS) {
      out.push(
        new Paragraph({
          heading: HEADING_LEVELS[tag],
          children: inlineRuns(el, ctx),
          spacing: { before: 240, after: 120 },
        }),
      );
      return;
    }
    if (tag === "style" || tag === "script" || tag === "noscript" || tag === "template") {
      return;
    }
    if (tag === "p") {
      out.push(new Paragraph({ children: inlineRuns(el, ctx), spacing: { after: 120 } }));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      let index = 0;
      el.querySelectorAll(":scope > li").forEach((li) => {
        index += 1;
        const children = inlineRuns(li, ctx);
        if (tag === "ol") {
          out.push(new Paragraph({ children: [new TextRun({ text: `${index}. ` }), ...children], spacing: { after: 60 } }));
        } else {
          out.push(new Paragraph({ children, bullet: { level: 0 }, spacing: { after: 60 } }));
        }
      });
      return;
    }
    if (tag === "blockquote") {
      out.push(
        new Paragraph({
          children: inlineRuns(el, { ...ctx, italic: true }),
          indent: { left: 720 },
          spacing: { after: 120 },
        }),
      );
      return;
    }
    if (tag === "table") {
      out.push(tableFrom(el, ctx));
      return;
    }
    if (tag === "hr") {
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" } },
          spacing: { before: 120, after: 120 },
        }),
      );
      return;
    }
    if (tag === "pre") {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: el.textContent ?? "", font: "Consolas", size: 18 })],
          spacing: { after: 120 },
        }),
      );
      return;
    }
    if (tag === "img") {
      const id = el.getAttribute("data-w2d-id") ?? "";
      if (ctx.imagesById.has(id)) {
        out.push(new Paragraph({ children: inlineRuns(el, ctx), spacing: { after: 120 } }));
      } else {
        out.push(new Paragraph({ children: [new TextRun({ text: "[Картинка]" })] }));
      }
      return;
    }

    walkBlocks(el, ctx, out);
  });
}

export async function renderDocx(html: string, images: DownloadedImage[]): Promise<Blob> {
  const imagesById = new Map(images.map((img) => [img.id, img]));
  const doc = new DOMParser().parseFromString(html, "text/html");

  const preparedById = new Map<string, PreparedImage>();
  const seen = new Set<string>();
  await Promise.all(
    Array.from(doc.querySelectorAll("img")).map(async (img) => {
      const id = img.getAttribute("data-w2d-id") ?? "";
      if (!id || seen.has(id)) return;
      const downloaded = imagesById.get(id);
      if (!downloaded) return;
      seen.add(id);
      try {
        const png = await convertToPng(downloaded.base64);
        preparedById.set(id, {
          bytes: await base64ToArrayBuffer(png.pngDataUrl),
          width: png.width,
          height: png.height,
        });
      } catch {
        // conversion failed → fall back to placeholder
      }
    }),
  );

  const blocks: Block[] = [];
  const ctx: InlineCtx = { imagesById: preparedById };
  if (doc.body) walkBlocks(doc.body, ctx, blocks);

  const document = new Document({
    sections: [
      {
        properties: {},
        children: blocks,
      },
    ],
  });

  return Packer.toBlob(document);
}
