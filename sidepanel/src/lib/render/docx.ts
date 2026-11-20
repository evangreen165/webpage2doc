import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

type Block = Paragraph | Table;

const HEADING_LEVELS: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

type InlineCtx = { bold?: boolean; italic?: boolean };

function inlineRuns(node: Node, ctx: InlineCtx = {}): TextRun[] {
  const runs: TextRun[] = [];
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
      runs.push(new TextRun({ text: "[Картинка]", bold: ctx.bold, italics: ctx.italic }));
      return;
    }
    if (tag === "strong" || tag === "b") {
      runs.push(...inlineRuns(el, { bold: true, italic: ctx.italic }));
      return;
    }
    if (tag === "em" || tag === "i") {
      runs.push(...inlineRuns(el, { bold: ctx.bold, italic: true }));
      return;
    }
    runs.push(...inlineRuns(el, ctx));
  });
  return runs;
}

function cellParagraph(cell: Element): Paragraph {
  return new Paragraph({ children: inlineRuns(cell), spacing: { after: 60 } });
}

function tableFrom(tableEl: Element): Table {
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
      .map((cell) => new TableCell({ children: [cellParagraph(cell)] }));
    return new TableRow({ children: cells });
  });
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
  });
}

function walkBlocks(container: Node, out: Block[]): void {
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
          children: inlineRuns(el),
          spacing: { before: 240, after: 120 },
        }),
      );
      return;
    }
    if (tag === "style" || tag === "script" || tag === "noscript" || tag === "template") {
      return;
    }
    if (tag === "p") {
      out.push(new Paragraph({ children: inlineRuns(el), spacing: { after: 120 } }));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      let index = 0;
      el.querySelectorAll(":scope > li").forEach((li) => {
        index += 1;
        const children = inlineRuns(li);
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
          children: inlineRuns(el, { italic: true }),
          indent: { left: 720 },
          spacing: { after: 120 },
        }),
      );
      return;
    }
    if (tag === "table") {
      out.push(tableFrom(el));
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
      out.push(new Paragraph({ children: [new TextRun({ text: "[Картинка]" })] }));
      return;
    }

    walkBlocks(el, out);
  });
}

export async function renderDocx(html: string): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];
  if (doc.body) walkBlocks(doc.body, blocks);

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
