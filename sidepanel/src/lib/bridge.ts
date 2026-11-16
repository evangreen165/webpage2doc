import type { CollectRequest, Snapshot } from "./types";

const TIMEOUT_MS = 10_000;

function sendCollect(tabId: number): Promise<Snapshot | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "W2D_COLLECT" } satisfies CollectRequest, (response) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(response as Snapshot | undefined);
    });
  });
}

async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content-script.js"],
    });
    return true;
  } catch {
    return false;
  }
}

function makeError(code: "UNSUPPORTED_PAGE" | "EMPTY" | "TIMEOUT", message: string): Snapshot {
  return {
    ok: false,
    error: { code, message },
    title: "",
    url: "",
    html: "",
    images: [],
    videos: [],
    warnings: [],
  };
}

async function doCollect(tabId: number): Promise<Snapshot> {
  const direct = await sendCollect(tabId);
  if (direct) return direct;

  const injected = await injectContentScript(tabId);
  if (!injected) {
    return makeError("UNSUPPORTED_PAGE", "The extension cannot access this page.");
  }

  const second = await sendCollect(tabId);
  if (!second) {
    return makeError("EMPTY", "Content script did not respond.");
  }
  return second;
}

export async function collectFromTab(tabId: number): Promise<Snapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Snapshot>((resolve) => {
    timer = setTimeout(() => resolve(makeError("TIMEOUT", "Timed out while collecting the page.")), TIMEOUT_MS);
  });
  try {
    return await Promise.race([doCollect(tabId), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
