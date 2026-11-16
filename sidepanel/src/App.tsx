import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Languages, Moon, Sun } from "lucide-react";
import { collectFromTab } from "./lib/bridge";
import type { Snapshot } from "./lib/types";

type Theme = "light" | "dark";
type JobStatus = "idle" | "collecting" | "done" | "error";

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

export default function App() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<JobStatus>("idle");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const generate = async () => {
    setStatus("collecting");
    setSnapshot(null);
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
      setStatus("done");
    } catch {
      setErrorCode("GENERIC");
      setStatus("error");
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4">
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

        {status === "done" && snapshot && (
          <div className="flex flex-col gap-3">
            <h2 className="truncate text-sm font-semibold" title={snapshot.title}>
              {snapshot.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("results.found", { images: snapshot.images.length, videos: snapshot.videos.length })}
            </p>
            {snapshot.warnings.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide">{t("results.warnings")}</p>
                <ul className="flex flex-col gap-1">
                  {snapshot.warnings.map((warning) => (
                    <li key={warning} className="text-xs text-muted-foreground">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
