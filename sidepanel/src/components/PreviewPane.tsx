import DOMPurify from "dompurify";
import { stripInlineHandlers } from "../lib/extractor";

type PreviewPaneProps = {
  html: string;
};

const PREVIEW_PURIFY_CONFIG = {
  FORBID_TAGS: ["script", "style"],
  FORBID_ATTR: ["onerror", "onload", "onclick"],
};

function cleanPreview(html: string): string {
  return DOMPurify.sanitize(stripInlineHandlers(html), PREVIEW_PURIFY_CONFIG);
}

export function PreviewPane({ html }: PreviewPaneProps) {
  return (
    <iframe
      title="preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={cleanPreview(html)}
      className="h-full w-full rounded-md border bg-white"
    />
  );
}
