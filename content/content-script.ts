import { collectSnapshot } from "./collector";
import type { CollectRequest } from "../sidepanel/src/lib/types";

chrome.runtime.onMessage.addListener((message: CollectRequest, _sender, sendResponse) => {
  if (!message || message.type !== "W2D_COLLECT") return;
  const snapshot = collectSnapshot();
  sendResponse(snapshot);
  return false;
});
