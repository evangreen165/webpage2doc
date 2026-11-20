import DOMPurify from "dompurify";

type PreviewPaneProps = {
  html: string;
};

const PREVIEW_PURIFY_CONFIG = {
  FORBID_TAGS: ["script", "style"],
  FORBID_ATTR: ["onerror", "onload", "onclick"],
};

function cleanPreview(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "SCRIPT") el.remove();
  });
  return DOMPurify.sanitize(doc.body.innerHTML, PREVIEW_PURIFY_CONFIG);
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
