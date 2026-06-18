/* eslint-disable @typescript-eslint/no-explicit-any */
// background.ts - fetch manager for DeporSwitch

type StartMsg = {
  action: "startFetch";
  domain: string;
  sku: string;
  requestId: string;
  mode?: "open" | "copy";
};
type AbortMsg = { action: "abortFetch"; requestId: string };

const pending = new Map<string, AbortController>();
const modes = new Map<string, "open" | "copy">();

/**
 * Sanitize URL: strip query and hash, return origin + pathname or null
 */
function sanitizeUrl(raw: string | null, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    return u.origin + u.pathname;
  } catch {
    return raw;
  }
}

/**
 * Extract the first product PDP url from the server-rendered search HTML.
 *
 * Search results live inside the `plp-product-list` container. Scoping the
 * search to it is important: the "no results" page still renders product cards
 * inside recommendation carousels, and we must NOT treat those as a match.
 */
function extractFirstProductUrl(html: string, origin: string): string | null {
  const listIdx = html.indexOf("plp-product-list");
  if (listIdx === -1) return null;

  const area = html.slice(listIdx);
  const match = area.match(
    /data-testid="product-card"[\s\S]*?<a\s[^>]*?href="([^"]+)"/i
  );
  if (!match) return null;

  const rawHref = match[1].trim().replace(/&amp;/g, "&");
  try {
    return rawHref.startsWith("http") ? rawHref : new URL(rawHref, origin).href;
  } catch {
    return null;
  }
}

/**
 * Send fetchComplete to other parts of the extension
 */
function notifyFetchComplete(
  requestId: string,
  domain: string,
  normalizedSku: string,
  sanitizedUrl: string | null,
  err?: string | null
) {
  const mode = modes.get(requestId);
  try {
    chrome.runtime.sendMessage({
      action: "fetchComplete",
      requestId,
      domain,
      sku: normalizedSku,
      url: sanitizedUrl ?? null,
      error: err ?? null,
      mode,
    });
  } catch (e) {
    console.warn("[background] sendMessage(fetchComplete) failed", e);
  } finally {
    modes.delete(requestId);
  }
}

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener(
  (msg: StartMsg | AbortMsg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg.action === "startFetch") {
          const { domain, sku: rawSku, requestId } = msg;
          const mode = msg.mode ?? "open";
          modes.set(requestId, mode);
          const normalizedSku = rawSku ? rawSku.toString().trim() : "";
          const origin = `https://www.deporvillage.${domain}`;
          const searchUrl = `${origin}/catalogsearch/result?q=${encodeURIComponent(
            normalizedSku
          )}`;

          const controller = new AbortController();
          pending.set(requestId, controller);

          console.log(
            `[background] startFetch ${requestId} -> ${searchUrl} (sku='${normalizedSku}', mode='${mode}')`
          );

          try {
            const resp = await fetch(searchUrl, { signal: controller.signal });
            const html = await resp.text();

            const finalUrlRaw = extractFirstProductUrl(html, origin);
            pending.delete(requestId);

            if (finalUrlRaw) {
              // Found the matching product: open its PDP directly.
              notifyFetchComplete(
                requestId,
                domain,
                normalizedSku,
                sanitizeUrl(finalUrlRaw, origin),
                null
              );
            } else {
              // No product matched (or markup changed): fall back to the search
              // page so the user lands somewhere useful instead of nothing.
              notifyFetchComplete(
                requestId,
                domain,
                normalizedSku,
                searchUrl,
                null
              );
            }

            sendResponse({ ok: true });
            return;
          } catch (errFetch: any) {
            const isAbort = errFetch && errFetch.name === "AbortError";
            console.warn(
              `[background] fetch error ${requestId}`,
              isAbort ? "aborted" : errFetch
            );
            pending.delete(requestId);

            // On a network/Cloudflare failure (non-abort), still let the click do
            // something: open the search page in a real tab (the browser can solve
            // any challenge there).
            notifyFetchComplete(
              requestId,
              domain,
              normalizedSku,
              isAbort ? null : searchUrl,
              isAbort ? "aborted" : null
            );
            sendResponse({ ok: true });
            return;
          }
        }

        if (msg.action === "abortFetch") {
          const { requestId } = msg;
          const controller = pending.get(requestId);
          if (controller) {
            controller.abort();
            pending.delete(requestId);
            modes.delete(requestId);
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: "not_found" });
          }
          return;
        }
      } catch (e) {
        console.error("[background] handler error", e);
        sendResponse({ ok: false, error: String(e) });
        return;
      }
    })();

    // indicate we will call sendResponse asynchronously
    return true;
  }
);
