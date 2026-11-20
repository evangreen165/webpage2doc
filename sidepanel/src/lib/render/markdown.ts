import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export function renderMarkdown(html: string): string {
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
