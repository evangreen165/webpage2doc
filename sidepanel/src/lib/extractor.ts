import { Readability } from "@mozilla/readability";
import type { Snapshot } from "./types";

export type ExtractionResult = {
  html: string;
  title?: string;
  usedFallback: boolean;
  warnings: string[];
};

const LAZY_ATTRS = ["data-src", "data-original", "data-lazy-src"];

function promoteLazyImages(doc: Document): void {
  doc.querySelectorAll("img").forEach((img) => {
    for (const attr of LAZY_ATTRS) {
      const value = img.getAttribute(attr);
      if (value && !img.getAttribute("src")) {
        img.setAttribute("src", value);
        break;
      }
    }
    const dataSrcset = img.getAttribute("data-srcset");
    if (dataSrcset && !img.getAttribute("srcset")) {
      img.setAttribute("srcset", dataSrcset);
    }
  });
  doc.querySelectorAll("source").forEach((source) => {
    const dataSrcset = source.getAttribute("data-srcset");
    if (dataSrcset && !source.getAttribute("srcset")) {
      source.setAttribute("srcset", dataSrcset);
    }
  });
}

function sanitize(root: ParentNode): void {
  root.querySelectorAll("script, style, noscript, template, link, meta").forEach((el) => el.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
    for (const attrName of ["href", "src", "action", "xlink:href"]) {
      const value = el.getAttribute(attrName);
      if (value && /^\s*(?:javascript|vbscript|data:text\/html)\s*:/i.test(value)) {
        el.removeAttribute(attrName);
      }
    }
  });
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${bodyHtml}</body></html>`;
}

export function extractCleanHtml(snapshot: Pick<Snapshot, "html">): ExtractionResult {
  const doc = new DOMParser().parseFromString(snapshot.html, "text/html");
  promoteLazyImages(doc);

  const article = new Readability(doc.cloneNode(true) as Document).parse();

  if (article && article.content) {
    const contentDoc = new DOMParser().parseFromString(article.content, "text/html");
    sanitize(contentDoc);
    return {
      html: wrapHtml(contentDoc.body?.innerHTML ?? ""),
      title: article.title,
      usedFallback: false,
      warnings: [],
    };
  }

  sanitize(doc);
  return {
    html: wrapHtml(doc.body?.innerHTML ?? ""),
    usedFallback: true,
    warnings: ["partial_content"],
  };
}
