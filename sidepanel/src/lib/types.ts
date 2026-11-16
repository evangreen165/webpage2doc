export type CollectRequest = { type: "W2D_COLLECT" };

export type ImageCandidate = { id: string; url: string; alt?: string };

export type VideoCandidate = { url: string; title?: string };

export type SnapshotErrorCode = "UNSUPPORTED_PAGE" | "EMPTY" | "TIMEOUT";

export type Snapshot = {
  ok: boolean;
  error?: { code: SnapshotErrorCode; message: string };
  title: string;
  url: string;
  lang?: string;
  html: string;
  images: ImageCandidate[];
  videos: VideoCandidate[];
  warnings: string[];
};
