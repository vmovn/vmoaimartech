/**
 * Force a real file download for a remote URL.
 *
 * The HTML `download` attribute is ignored for cross-origin links (storage,
 * CDN, provider-hosted media), so the browser just navigates/previews the
 * file instead. Fetching the bytes and saving a same-origin blob URL keeps
 * the intended filename and always downloads.
 */
export async function downloadRemoteFile(url: string, fileName?: string | null): Promise<void> {
  const name = (fileName ?? "").trim() || guessNameFromUrl(url);
  try {
    const res = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    // CORS-blocked or offline: fall back to opening the file directly.
    triggerAnchor(url, name, true);
  }
}

function triggerAnchor(href: string, name: string, newTab = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener noreferrer";
  if (newTab) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function guessNameFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "download";
  } catch {
    return "download";
  }
}
