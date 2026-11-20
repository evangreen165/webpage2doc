import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import type { Snapshot } from "./types";

export type ExtractionResult = {
  html: string;
  title?: string;
  usedFallback: boolean;
  warnings: string[];
};

const LAZY_ATTRS = ["data-src", "data-original", "data-lazy-src"];

const PURIFY_CONFIG = {
  ADD_TAGS: ["style", "table", "thead", "tbody", "tr", "th", "td", "img"],
  ADD_ATTR: ["style", "target"],
};

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

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body>${bodyHtml}</body></html>`;
}

export function stripOnAttributes(root: ParentNode): void {
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

export function stripInlineHandlers(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  stripOnAttributes(doc);
  doc.querySelectorAll("script, noscript").forEach((el) => el.remove());
  return doc.body.innerHTML;
}

export function extractCleanHtml(snapshot: Snapshot): ExtractionResult {
  const doc = new DOMParser().parseFromString(snapshot.html, "text/html");
  promoteLazyImages(doc);

  const idByUrl = new Map(snapshot.images.map((candidate) => [candidate.url, candidate.id]));
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;
    let absolute: string | null = null;
    try {
      absolute = new URL(src, snapshot.url).href;
    } catch {
      return;
    }
    const id = idByUrl.get(absolute);
    if (id) img.setAttribute("data-w2d-id", id);
  });

  const article = new Readability(doc.cloneNode(true) as Document).parse();

  if (article && article.content) {
    return {
      html: wrapHtml(DOMPurify.sanitize(article.content, PURIFY_CONFIG)),
      title: article.title,
      usedFallback: false,
      warnings: [],
    };
  }

  return {
    html: wrapHtml(DOMPurify.sanitize(doc.body?.innerHTML ?? "", PURIFY_CONFIG)),
    usedFallback: true,
    warnings: ["partial_content"],
  };
}
