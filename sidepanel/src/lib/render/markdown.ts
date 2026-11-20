import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { DownloadedImage } from "../downloadImages";

export function renderMarkdown(html: string, images: DownloadedImage[]): string {
  const filenameByUrl = new Map(images.map((img) => [img.url, `images/${img.filename}`]));

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    hr: "---",
  });
  turndown.use(gfm);

  turndown.addRule("removeStyle", {
    filter: ["style", "script", "noscript", "template"],
    replacement: () => "",
  });

  turndown.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const src = (node as Element).getAttribute("src") ?? "";
      const alt = (node as Element).getAttribute("alt") ?? "";
      const target = filenameByUrl.get(src) ?? src;
      return alt ? `![${alt}](${target})` : `![](${target})`;
    },
  });

  turndown.addRule("mediaLink", {
    filter: (node) => {
      const tag = node.nodeName.toLowerCase();
      return tag === "iframe" || tag === "video";
    },
    replacement: (_content, node) => {
      const url = (node as Element).getAttribute("src") ?? "";
      return url ? `[Видео: ${url}]` : "";
    },
  });

  return turndown.turndown(html).trim() + "\n";
}
