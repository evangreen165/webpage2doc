type PreviewPaneProps = {
  html: string;
};

export function PreviewPane({ html }: PreviewPaneProps) {
  return (
    <iframe
      title="preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
      className="h-full w-full rounded-md border bg-white"
    />
  );
}
