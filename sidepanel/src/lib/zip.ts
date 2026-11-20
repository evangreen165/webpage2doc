import JSZip from "jszip";

export type ZipEntry = { path: string; blob: Blob };

export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.blob);
  }
  return zip.generateAsync({ type: "blob" });
}
