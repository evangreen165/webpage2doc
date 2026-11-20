import { FETCH_CONCURRENCY, MAX_BYTES, MAX_IMAGES } from "./config";
import type { ImageCandidate } from "./types";

export type DownloadedImage = {
  id: string;
  url: string;
  base64: string;
  blob: Blob;
  filename: string;
};

export type ImageDownloadResult = {
  images: DownloadedImage[];
  warnings: string[];
};

function extensionFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/avif") return "avif";
  if (mime === "image/bmp") return "bmp";
  return "img";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

async function sha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function downloadImages(candidates: ImageCandidate[]): Promise<ImageDownloadResult> {
  const warnings: string[] = [];
  const images: DownloadedImage[] = [];
  const seenHashes = new Set<string>();

  const networkCandidates = candidates.filter((candidate) => !candidate.url.startsWith("data:"));
  const capped = networkCandidates.slice(0, MAX_IMAGES);
  if (networkCandidates.length > MAX_IMAGES) warnings.push("image_limit_reached");

  let index = 0;
  const worker = async () => {
    while (index < capped.length) {
      const candidate = capped[index++];
      try {
        const response = await fetch(candidate.url, { credentials: "omit" });
        if (!response.ok) continue;
        const blob = await response.blob();
        if (blob.size > MAX_BYTES) {
          warnings.push("image_too_large");
          continue;
        }
        const hash = await sha256(blob);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
        const base64 = await blobToDataUrl(blob);
        images.push({
          id: candidate.id,
          url: candidate.url,
          base64,
          blob,
          filename: `${candidate.id}.${extensionFor(blob.type)}`,
        });
      } catch {
        // network error → skip
      }
    }
  };

  const workerCount = Math.min(FETCH_CONCURRENCY, capped.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  images.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  if (images.length < capped.length) warnings.push("image_fetch_failed");

  return { images, warnings };
}
