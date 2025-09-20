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
    return u.origin + u.pathname;
  } catch {
    return raw;
  }
}

/** promise wrapper for chrome.storage.local.get */
function getFromStorage(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (res) => {
        resolve(res?.[key] ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

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
      const { domain, requestId, url, error } = message as any;
      if (!domain) return;

      const sanitized = sanitizeUrl(url, domain);

      // get current in-ref state
      const cur = statesRef.current[domain] ?? { ...defaultState };
      const shouldOpen = !!(
        cur.requestId &&
        requestId &&
        cur.requestId === requestId
      );

      // update state
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

      // Only open tab (and copy) if this corresponds to the requestId we started
      if (shouldOpen && sanitized) {
        try {
          chrome.tabs.create({ url: sanitized, active: true });
        } catch {
          /* ignore */
        }
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
    providedRequestId?: string
  ): string | undefined => {
    if (!hasSku) return undefined;
    const req = providedRequestId ?? makeRequestId(domain);

    setStates((prev) => {
      const cur = prev[domain] ?? { ...defaultState };
      if (cur.requestId && cur.requestId === req) return prev;

      const next: DomainState = { ...cur, requestId: req };

      try {
        // send normalized SKU to background
        chrome.runtime.sendMessage({
          action: "startFetch",
          domain,
          sku: normalizedSku,
          requestId: req,
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
    // start fetch; popup will open when matching fetchComplete arrives
    startFetchFor(domain);
  };

  const handleSkuClick = async () => {
    if (!sku) return;
    try {
      await copyToClipboard(sku);
      setSkuCopied(true);
      setTimeout(() => setSkuCopied(false), 1400);
    } catch (e) {
      console.error("copy SKU failed", e);
    }
  };

  // Copy logic: prefer in-memory finalUrl, then storage (try normalized and raw), fallback to search or domain root
  const handleCopy = async (domain: string) => {
    const origin = `https://www.deporvillage.${domain}`;
    const domainRoot = `${origin}/`;
    const searchUrl = `${origin}/catalogsearch/result?q=${encodeURIComponent(
      normalizedSku
    )}`;

    // 1) in-memory state
    const inStateRaw = statesRef.current?.[domain]?.finalUrl ?? null;
    const inStateSan = sanitizeUrl(inStateRaw, domain);
    console.log("handleCopy start", {
      domain,
      inStateRaw,
      inStateSan,
      normalizedSku,
    });

    if (inStateSan) {
      await copyToClipboard(inStateSan);
      console.log("copied (state)", inStateSan);
      return;
    }

    // 2) storage (try normalized then raw key)
    if (hasSku) {
      const keys = [
        `pdp_${domain}_${normalizedSku}`,
        `pdp_${domain}_${rawSku}`,
      ];
      for (const key of keys) {
        const stored = await getFromStorage(key);
        const storedSan = sanitizeUrl(stored, domain);
        if (storedSan) {
          await copyToClipboard(storedSan);
          console.log("copied (storage)", key, storedSan);
          return;
        }
      }

      // 3) fallback to catalog search URL
      await copyToClipboard(searchUrl);
      console.log("copied fallback search/catalog", searchUrl);
      return;
    }

    // 4) no SKU -> domain root
    await copyToClipboard(domainRoot);
    console.log("copied domain root", domainRoot);
  };

  return (
    <div className="popup">
      <div className="header">
        <img src={logo} alt="Logo" className="logo" />
        <h1>DeporSwitch</h1>
      </div>

      {hasSku && (
        <p
          className="sku-line"
          onClick={handleSkuClick}
          style={{
            cursor: "pointer",
            color: skuCopied ? "green" : undefined,
            textDecoration: skuCopied ? "underline" : undefined,
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
