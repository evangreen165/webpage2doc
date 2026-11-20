import DOMPurify from "dompurify";

type PreviewPaneProps = {
  html: string;
};

const PREVIEW_PURIFY_CONFIG = {
  FORBID_TAGS: ["script", "style"],
  FORBID_ATTR: ["onerror", "onload", "onclick"],
};

export function PreviewPane({ html }: PreviewPaneProps) {
  const sanitized = DOMPurify.sanitize(html, PREVIEW_PURIFY_CONFIG);
  return (
    <iframe
      title="preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={sanitized}
      className="h-full w-full rounded-md border bg-white"
    />
  );
}
