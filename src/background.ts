/* eslint-disable @typescript-eslint/no-explicit-any */
// background.ts - minimal fetch manager for DeporSwitch

type StartMsg = {
  action: "startFetch";
  domain: string;
  sku: string;
  requestId: string;
  mode?: "open" | "copy"; // 👈 NEW (optional for backwards-compat)
};
type AbortMsg = { action: "abortFetch"; requestId: string };

const pending = new Map<string, AbortController>();
const modes = new Map<string, "open" | "copy">(); // 👈 track mode per requestId

/**
 * Sanitize URL: strip query and hash, return origin + pathname or null
 */
function sanitizeUrl(raw: string | null, base?: string): string | null {
  if (!raw) return null;
  try {
    const u = base ? new URL(raw, base) : new URL(raw);
    return u.origin + u.pathname;
  } catch {
    // If parsing fails, return the raw string (fallback)
    return raw;
  }
}

/**
 * Persist sanitized PDP url under key `pdp_<domain>_<sku>`
 */
// function persistPdp(domain: string, sku: string, sanitizedUrl: string) {
//   // if (!sku) return;
//   // const key = `pdp_${domain}_${sku}`;
//   // const obj: Record<string, string> = {};
//   // obj[key] = sanitizedUrl;
//   // try {
//   //   chrome.storage.local.set(obj, () => {
//   //     // optional small log for debugging - remove if noisy
//   //     console.log(`[background] stored ${key} -> ${sanitizedUrl}`);
//   //   });
//   // } catch (e) {
//   //   console.warn("[background] storage set failed", e);
//   // }
//   console.log(`[background] persistPdp skipped (would store ${domain} / ${sku} -> ${sanitizedUrl})`);
// }

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
  const mode = modes.get(requestId); // 👈 include original mode
  try {
    chrome.runtime.sendMessage({
      action: "fetchComplete",
      requestId,
      domain,
      sku: normalizedSku,
      url: sanitizedUrl ?? null,
      error: err ?? null,
      mode, // 👈 send it back
    });
  } catch (e) {
    console.warn("[background] sendMessage(fetchComplete) failed", e);
  } finally {
    // Clean up mode mapping when we finish notifying
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
          // normalize SKU (trim) and use it consistently
          const { domain, sku: rawSku, requestId } = msg;
          const mode = msg.mode ?? "open"; // default to "open" for old callers
          modes.set(requestId, mode); // 👈 remember mode for this request
          const normalizedSku = rawSku ? rawSku.toString().trim() : "";
          const origin = `https://www.deporvillage.${domain}`;
          const searchUrl = `${origin}/catalogsearch/result?q=${encodeURIComponent(
            normalizedSku
          )}`;

          // create / store abort controller
          const controller = new AbortController();
          pending.set(requestId, controller);

          console.log(
            `[background] startFetch ${requestId} -> ${searchUrl} (sku='${normalizedSku}', mode='${mode}')`
          );

          try {
            // Try fetching the search/catalog page quickly
            const resp = await fetch(searchUrl, { signal: controller.signal });
            const text = await resp.text();

            // Quick string-based extraction
            // Quick string-based extraction (robusto: primer PDP link del HTML)
                let finalUrlRaw: string | null = null;
                try {
                  // 1) Sacar todos los href de anchors (rápido)
                  const hrefMatches = [...text.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi)];

                  for (const m of hrefMatches) {
                    const rawHref = (m[1] || "").trim().replace(/&amp;/g, "&");
                    if (!rawHref) continue;

                    const abs = rawHref.startsWith("http")
                        ? rawHref
                        : new URL(rawHref, origin).href;

                      try {
                        const u = new URL(abs);

                        if (u.origin !== origin) continue;

                        // 🔥 clave: en el catálogo nuevo, los PDP del listado llevan queryID
                        if (!u.searchParams.has("queryID")) continue;

                        // descartar basura
                        if (u.pathname.startsWith("/catalogsearch/")) continue;
                        if (u.pathname.startsWith("/stc/")) continue;
                        if (u.pathname.startsWith("/customer/")) continue;
                        if (u.pathname === "/") continue;

                        finalUrlRaw = abs;
                        console.log(`[background] quick-extract found (raw) ${finalUrlRaw}`);
                        break;
                      } catch {
                        continue;
                      }
                  }
                } catch (e) {
                  console.warn("[background] quick-extract error", e);
                }


            if (finalUrlRaw) {
              // sanitize, persist and notify
              const sanitizedFinal = sanitizeUrl(finalUrlRaw, origin);
              // if (sanitizedFinal && normalizedSku) {
              //   persistPdp(domain, normalizedSku, sanitizedFinal);
              // }

              notifyFetchComplete(
                requestId,
                domain,
                normalizedSku,
                sanitizedFinal,
                null
              );
              pending.delete(requestId);
              // ack immediately
              sendResponse({ ok: true });
              return;
            }

            // Quick extract failed -> fallback: open temporary inactive tab and ask content script
            console.log(
              `[background] quick-extract failed, opening background tab for ${searchUrl}`
            );

            let createdTabId: number | null = null;
            try {
              const created = await chrome.tabs.create({
                url: searchUrl,
                active: false,
              });
              createdTabId = created.id ?? null;
              // ack caller early; we'll send fetchComplete later
              sendResponse({ ok: true });
            } catch (errCreate) {
              console.warn(
                "[background] failed to create background tab",
                errCreate
              );
              // notify no result
              notifyFetchComplete(
                requestId,
                domain,
                normalizedSku,
                null,
                `tab_create_failed:${String(errCreate)}`
              );
              pending.delete(requestId);
              return;
            }

            // Wait for the tab to finish loading, then message content script
            const onUpdated = (
              updatedTabId: number,
              changeInfo: chrome.tabs.TabChangeInfo
            ) => {
              if (updatedTabId !== createdTabId) return;
              if (changeInfo.status !== "complete") return;

              chrome.tabs.onUpdated.removeListener(onUpdated);

              // If tab unexpectedly missing, notify null
              if (createdTabId == null) {
                notifyFetchComplete(
                  requestId,
                  domain,
                  normalizedSku,
                  null,
                  "no_tab"
                );
                pending.delete(requestId);
                return;
              }

              // Ask content script for the first result URL
              try {
                chrome.tabs.sendMessage(
                  createdTabId!,
                  { action: "getFirstResultUrl" },
                  (response) => {
                    const urlFromContent = response?.url ?? null;
                    const sanitized = sanitizeUrl(urlFromContent, origin);

                    // if (sanitized && normalizedSku) {
                    //   persistPdp(domain, normalizedSku, sanitized);
                    // }

                    notifyFetchComplete(
                      requestId,
                      domain,
                      normalizedSku,
                      sanitized ?? null,
                      null
                    );

                    // close temporary tab (best effort)
                    try {
                      if (createdTabId != null) {
                        chrome.tabs.remove(createdTabId).catch((e) => {
                          console.warn(
                            "[background] failed to remove temp tab",
                            e
                          );
                        });
                      }
                    } catch (e) {
                      console.warn(
                        "[background] error removing temp tab",
                        e
                      );
                    }

                    pending.delete(requestId);
                  }
                );
              } catch (e) {
                console.warn("[background] error messaging content script", e);
                notifyFetchComplete(
                  requestId,
                  domain,
                  normalizedSku,
                  null,
                  String(e)
                );
                try {
                  if (createdTabId != null) {
                    chrome.tabs
                      .remove(createdTabId)
                      .catch((err) => {
                        console.warn(
                          "[background] failed to remove temp tab after error",
                          err
                        );
                      });
                  }
                } catch (e2) {
                  console.warn(
                    "[background] error removing temp tab after error",
                    e2
                  );
                }
                pending.delete(requestId);
              }
            };

            chrome.tabs.onUpdated.addListener(onUpdated);

            // exit early; we'll notify later from the onUpdated handler
            return;
          } catch (errFetch: any) {
            const isAbort = errFetch && errFetch.name === "AbortError";
            console.warn(
              `[background] fetch error ${requestId}`,
              isAbort ? "aborted" : errFetch
            );
            notifyFetchComplete(
              requestId,
              domain,
              normalizedSku,
              null,
              isAbort ? "aborted" : String(errFetch)
            );
            pending.delete(requestId);
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
            modes.delete(requestId); // cleanup
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
