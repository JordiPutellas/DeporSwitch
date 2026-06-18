/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import useSkuAndDomain from "./hooks/useSkuAndDomain";
import { copyToClipboard } from "./utils";
import "./Popup.css";
import logo from "../public/logo.png";

type DomainState = {
  requestId?: string;
  finalUrl?: string | null;
  error?: string | null;
};

const domains = [
  "com",
  "fr",
  "it",
  "dk",
  "pl",
  "nl",
  "pt",
  "de",
  "net",
  "be",
  "cz",
  "at",
  "co.uk",
  "ch",
];

const makeRequestId = (domain: string) =>
  `${Date.now()}-${domain}-${Math.random().toString(36).slice(2, 8)}`;

const defaultState: DomainState = { finalUrl: null };

/** defensive sanitizer: remove query and hash; allow relative/raw via base domain */
function sanitizeUrl(raw: string | null, domain?: string): string | null {
  if (!raw) return null;
  try {
    const base = domain ? `https://www.deporvillage.${domain}` : undefined;
    const u = base ? new URL(raw, base) : new URL(raw);

    // si es búsqueda, conserva el ?q=
    if (u.pathname.startsWith("/catalogsearch/result")) {
      return u.origin + u.pathname + u.search;
    }

    // si es PDP, quitamos query/hash
    return u.origin + u.pathname;
  } catch {
    return raw;
  }
}

/** promise wrapper for chrome.storage.local.get */
// function getFromStorage(key: string): Promise<string | null> {
//   return new Promise((resolve) => {
//     try {
//       chrome.storage.local.get([key], (res) => {
//         resolve(res?.[key] ?? null);
//       });
//     } catch {
//       resolve(null);
//     }
//   });
// }

const Popup: React.FC = () => {
  const { sku } = useSkuAndDomain();

  // normalized sku used for storage keys / messaging
  const rawSku = (sku ?? "").toString();
  const normalizedSku = rawSku.trim();
  const hasSku =
    normalizedSku !== "" && normalizedSku.toLowerCase() !== "sku not found";

  const [states, setStates] = useState<Record<string, DomainState>>(() => {
    const s: Record<string, DomainState> = {};
    for (const d of domains) s[d] = { ...defaultState };
    return s;
  });

  // sku copy feedback
  const [skuCopied, setSkuCopied] = useState(false);

  // ref to latest states to avoid stale closures in message handlers
  const statesRef = useRef(states);
  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  // Listen for background fetchComplete messages
  useEffect(() => {
    const handler = (message: any) => {
      if (!message || message.action !== "fetchComplete") return;
      const { domain, requestId, url, error, mode } = message as any;
      if (!domain) return;

      const sanitized = sanitizeUrl(url, domain);

      setStates((prev) => {
        const curPrev = prev[domain] ?? { ...defaultState };
        const next: DomainState = {
          ...curPrev,
          requestId: undefined,
          finalUrl: sanitized ?? null,
          error: error ?? null,
        };
        return { ...prev, [domain]: next };
      });

      // Behavior based on mode:
      // - "open" or missing mode (backwards-compat): open tab + copy
      // - "copy": just copy (no tab)
      if ((mode === "open" || mode === undefined) && sanitized && requestId) {
        try {
          chrome.tabs.create({ url: sanitized, active: true });
        } catch {
          /* ignore */
        }
        copyToClipboard(sanitized).catch(() => {});
      } else if (mode === "copy" && sanitized && requestId) {
        copyToClipboard(sanitized).catch(() => {});
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      try {
        chrome.runtime.onMessage.removeListener(handler);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const startFetchFor = (
    domain: string,
    providedRequestId?: string,
    mode: "open" | "copy" = "open"
  ): string | undefined => {
    if (!hasSku) return undefined;
    const req = providedRequestId ?? makeRequestId(domain);

    setStates((prev) => {
      const cur = prev[domain] ?? { ...defaultState };
      if (cur.requestId && cur.requestId === req) return prev;

      const next: DomainState = { ...cur, requestId: req };

      try {
        chrome.runtime.sendMessage({
          action: "startFetch",
          domain,
          sku: normalizedSku,
          requestId: req,
          mode,
        });
      } catch (e) {
        console.warn("startFetch sendMessage failed", e);
      }

      return { ...prev, [domain]: next };
    });

    return req;
  };

  const openDomainRoot = (domain: string) => {
    const url = `https://www.deporvillage.${domain}/`;
    try {
      chrome.tabs.create({ url, active: true });
    } catch {
      /* ignore */
    }
  };

  const handleDomainClick = (domain: string) => {
    if (!hasSku) {
      openDomainRoot(domain);
      return;
    }
    // Start fetch; tab will open when matching fetchComplete arrives
    startFetchFor(domain, undefined, "open");
  };

  const handleSkuClick = async () => {
    if (!sku) return;
    try {
      await copyToClipboard(sku);
      setSkuCopied(true);
      setTimeout(() => setSkuCopied(false), 800);
    } catch (e) {
      console.error("copy SKU failed", e);
    }
  };

  // Copy logic: prefer in-memory finalUrl, then trigger a "copy" fetch and let the global listener copy it.
  // As a safety net, after a short timeout, fall back to storage/search/domain if nothing arrived.
  const handleCopy = async (domain: string) => {
    const origin = `https://www.deporvillage.${domain}`;
    const domainRoot = `${origin}/`;
    const searchUrl = `${origin}/catalogsearch/result?q=${encodeURIComponent(
      normalizedSku
    )}`;

    // 1) If we already have a finalUrl in memory, use it
    const inStateRaw = statesRef.current?.[domain]?.finalUrl ?? null;
    const inStateSan = sanitizeUrl(inStateRaw, domain);
    if (inStateSan) {
      await copyToClipboard(inStateSan);
      return;
    }

    // 2) Trigger a "copy" fetch. The global listener will copy upon fetchComplete.
    if (hasSku) {
      startFetchFor(domain, undefined, "copy");

      // 3) Safety fallback after ~1.2s if nothing copied/arrived
      setTimeout(async () => {
        const afterRaw = statesRef.current?.[domain]?.finalUrl ?? null;
        const afterSan = sanitizeUrl(afterRaw, domain);
        if (afterSan) {
          await copyToClipboard(afterSan);
          return;
        }

        // Try storage (normalized, then raw)
        // const keys = [
        //   `pdp_${domain}_${normalizedSku}`,
        //   `pdp_${domain}_${rawSku}`,
        // ];
        // for (const key of keys) {
        //   const stored = await getFromStorage(key);
        //   const storedSan = sanitizeUrl(stored, domain);
        //   if (storedSan) {
        //     await copyToClipboard(storedSan);
        //     return;
        //   }
        // }

        // Fallback to catalog search / domain root
        if (hasSku) {
          await copyToClipboard(searchUrl);
        } else {
          await copyToClipboard(domainRoot);
        }
      }, 1200);

      return;
    }

    // 4) No SKU → copy domain root
    await copyToClipboard(domainRoot);
  };

  return (
    <div className="popup">
      <div className="header">
        <img src={logo} alt="Logo" className="logo" />
        <h1>DeporSwitch</h1>
      </div>

      {hasSku && (
        <p
          className={`sku-line ${skuCopied ? "copied" : ""}`}
          onClick={handleSkuClick}
          style={{
            cursor: "pointer",
          }}
          title="Click to copy SKU"
        >
          SKU: <strong>{sku}</strong>
        </p>
      )}

      <div className="domain-list">
        {domains.map((d) => {
          return (
            <div className="domain-row" key={d}>
              <button
                className="domain-btn"
                onClick={() => handleDomainClick(d)}
                title={
                  hasSku ? `Search and open .${d}` : `Open deporvillage.${d}`
                }
              >
                <span className="dot">.</span>
                {d}
              </button>

              <button
                className="copy-btn"
                onClick={() => handleCopy(d)}
                title="Copy URL"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Popup;
