import type { ImageCandidate, Snapshot, VideoCandidate } from "../sidepanel/src/lib/types";

function toAbsolute(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return null;
  }
}

function bestFromSrcset(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const part of srcset.split(",")) {
    const tokens = part.trim().split(/\s+/);
    const rawUrl = tokens[0];
    if (!rawUrl) continue;
    const descriptor = tokens.slice(1).join(" ");
    let score = 1;
    const w = descriptor.match(/([\d.]+)w/);
    const x = descriptor.match(/([\d.]+)x/);
    if (w) score = Math.round(parseFloat(w[1]) * 10);
    else if (x) score = Math.round(parseFloat(x[1]) * 100);
    if (score > bestScore) {
      bestScore = score;
      best = rawUrl;
    }
  }
  return best;
}

function bestImageUrl(img: HTMLImageElement): string | null {
  const dataSrc = img.getAttribute("data-src") ?? img.getAttribute("data-original") ?? img.getAttribute("data-lazy-src");
  if (dataSrc) return toAbsolute(dataSrc);
  const srcset = bestFromSrcset(img.getAttribute("srcset"));
  if (srcset) return toAbsolute(srcset);
  if (img.currentSrc) return toAbsolute(img.currentSrc);
  return toAbsolute(img.getAttribute("src"));
}

function collectImages(): ImageCandidate[] {
  const found: Array<{ url: string; alt: string }> = [];
  const seen = new Set<string>();

  const add = (url: string | null, alt: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    found.push({ url, alt });
  };

  document.querySelectorAll("img").forEach((img) => {
    add(bestImageUrl(img), img.getAttribute("alt") ?? "");
  });

  document.querySelectorAll("picture source").forEach((source) => {
    add(toAbsolute(source.getAttribute("src")), "");
    add(toAbsolute(bestFromSrcset(source.getAttribute("srcset"))), "");
  });

  return found.map((item, index) => ({
    id: `img-${String(index + 1).padStart(4, "0")}`,
    url: item.url,
    ...(item.alt ? { alt: item.alt } : {}),
  }));
}

function collectBackgroundImages(): string[] {
  const urls = new Set<string>();
  for (const el of document.querySelectorAll("body *")) {
    const backgroundImage = getComputedStyle(el).backgroundImage;
    if (!backgroundImage || backgroundImage === "none") continue;
    for (const match of backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/gi)) {
      const abs = toAbsolute(match[1]);
      if (abs) urls.add(abs);
    }
  }
  return [...urls];
}

function collectVideos(): VideoCandidate[] {
  const seen = new Set<string>();
  const out: VideoCandidate[] = [];
  const add = (url: string | null, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(title ? { url, title } : { url });
  };

  document.querySelectorAll("video").forEach((video) => {
    add(toAbsolute(video.getAttribute("src")), video.getAttribute("title") ?? undefined);
  });
  document.querySelectorAll("video source").forEach((source) => {
    add(toAbsolute(source.getAttribute("src")));
  });
  document.querySelectorAll("iframe").forEach((frame) => {
    add(toAbsolute(frame.getAttribute("src")), frame.getAttribute("title") ?? undefined);
  });

  return out;
}

export function collectSnapshot(): Snapshot {
  const base: Snapshot = {
    ok: true,
    title: document.title,
    url: location.href,
    lang: document.documentElement.lang || undefined,
    html: document.documentElement.outerHTML,
    images: [],
    videos: [],
    warnings: [],
  };

  if (location.protocol !== "http:" && location.protocol !== "https:") {
    return { ...base, ok: false, error: { code: "UNSUPPORTED_PAGE", message: "Unsupported page protocol." } };
  }

  if (!document.body) {
    return { ...base, ok: false, error: { code: "EMPTY", message: "Document has no body." } };
  }

  const images = collectImages();
  const backgroundImages = collectBackgroundImages();
  for (const url of backgroundImages) {
    if (!images.some((img) => img.url === url)) {
      images.push({ id: `img-${String(images.length + 1).padStart(4, "0")}`, url });
    }
  }

  return {
    ...base,
    images,
    videos: collectVideos(),
  };
}
