import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileDown, Languages, Moon, Sun } from "lucide-react";
import { collectFromTab } from "./lib/bridge";
import { extractCleanHtml, type ExtractionResult } from "./lib/extractor";
import type { Snapshot } from "./lib/types";
import { PreviewPane } from "./components/PreviewPane";
import { renderMarkdown } from "./lib/render/markdown";
import { renderDocx } from "./lib/render/docx";
import { renderPdf } from "./lib/render/pdf";
import { downloadImages } from "./lib/downloadImages";
import { createZip } from "./lib/zip";
import { slugify } from "./lib/format";

type Theme = "light" | "dark";
type JobStatus = "idle" | "collecting" | "done" | "error";
type Format = "pdf" | "docx" | "md";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("w2d.theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("w2d.theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  return [theme, toggleTheme];
}

function Header() {
  const { t, i18n } = useTranslation();
  const [theme, toggleTheme] = useTheme();

  const toggleLanguage = () => {
    const next = i18n.language === "ru" ? "en" : "ru";
    i18n.changeLanguage(next);
    localStorage.setItem("w2d.lang", next);
  };

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          W2D
        </span>
        <h1 className="text-sm font-semibold">{t("app.name")}</h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? t("theme.light") : t("theme.dark")}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleLanguage}
          title={t("lang.switch")}
          className="flex items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-medium">{i18n.language === "ru" ? "RU" : "EN"}</span>
        </button>
      </div>
    </header>
  );
}

const WARNING_KEYS: Record<string, string> = {
  image_limit_reached: "warnings.imageLimitReached",
  image_fetch_failed: "warnings.imageFetchFailed",
  image_too_large: "warnings.imageTooLarge",
};

export default function App() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<JobStatus>("idle");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [clean, setClean] = useState<ExtractionResult | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>("pdf");
  const [zipEnabled, setZipEnabled] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);

  const generate = async () => {
    setStatus("collecting");
    setSnapshot(null);
    setClean(null);
    setDownloadWarnings([]);
    setErrorCode(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setErrorCode("NO_TAB");
        setStatus("error");
        return;
      }
      const snap = await collectFromTab(tab.id);
      if (!snap.ok) {
        setErrorCode(snap.error?.code ?? "GENERIC");
        setStatus("error");
        return;
      }
      setSnapshot(snap);
      setClean(extractCleanHtml(snap));
      setStatus("done");
    } catch {
      setErrorCode("GENERIC");
      setStatus("error");
    }
  };

  const download = async () => {
    if (!clean || !snapshot) return;
    setRendering(true);
    setDownloadWarnings([]);
    try {
      const { images, warnings } = await downloadImages(snapshot.images);
      setDownloadWarnings(warnings);

      let documentBlob: Blob;
      const ext = format === "md" ? "md" : format;
      if (format === "md") {
        documentBlob = new Blob([renderMarkdown(clean.html, images)], { type: "text/markdown;charset=utf-8" });
      } else if (format === "docx") {
        documentBlob = await renderDocx(clean.html, images);
      } else {
        documentBlob = await renderPdf(clean.html, images);
      }

      let blobToDownload = documentBlob;
      let filename: string;
      if (zipEnabled) {
        blobToDownload = await createZip([
          { path: `document.${ext}`, blob: documentBlob },
          ...images.map((img) => ({ path: `images/${img.filename}`, blob: img.blob })),
        ]);
        filename = `webpage2doc/${slugify(snapshot.title)}.zip`;
      } else {
        filename = `webpage2doc/${slugify(snapshot.title)}.${ext}`;
      }

      const url = URL.createObjectURL(blobToDownload);
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
      });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErrorCode("GENERIC");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <button
          type="button"
          onClick={generate}
          disabled={status === "collecting"}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          {t("actions.generate")}
        </button>

        {status === "collecting" && <p className="text-sm text-muted-foreground">{t("status.collecting")}</p>}

        {status === "error" && errorCode && (
          <p className="text-sm font-medium text-red-500">{t(`errors.${errorCode}` as never)}</p>
        )}

        {status === "done" && snapshot && clean && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-col gap-3">
              <h2 className="truncate text-sm font-semibold" title={snapshot.title}>
                {snapshot.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("results.found", { images: snapshot.images.length, videos: snapshot.videos.length })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-medium">
                  {t("format.label")}
                  <select
                    value={format}
                    onChange={(event) => setFormat(event.target.value as Format)}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="pdf">{t("format.pdf")}</option>
                    <option value="docx">{t("format.docx")}</option>
                    <option value="md">{t("format.md")}</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={zipEnabled}
                    onChange={(event) => setZipEnabled(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  {t("options.zip")}
                </label>
                <button
                  type="button"
                  onClick={download}
                  disabled={rendering}
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {t("actions.download")}
                </button>
              </div>
              {rendering && <p className="text-sm text-muted-foreground">{t("status.rendering")}</p>}
              {(snapshot.warnings.length > 0 || clean.usedFallback || downloadWarnings.length > 0) && (
                <div className="flex flex-col gap-1 rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide">{t("results.warnings")}</p>
                  <ul className="flex flex-col gap-1">
                    {clean.usedFallback && <li className="text-xs text-muted-foreground">{t("warnings.partialContent")}</li>}
                    {snapshot.warnings.map((warning) => (
                      <li key={warning} className="text-xs text-muted-foreground">
                        {warning}
                      </li>
                    ))}
                    {downloadWarnings.map((warning) => (
                      <li key={warning} className="text-xs text-muted-foreground">
                        {t((WARNING_KEYS[warning] ?? "errors.generic") as never)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("preview.title")}</p>
              <div className="min-h-0 flex-1">
                <PreviewPane html={clean.html} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
