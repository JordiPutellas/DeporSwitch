type JsonLdNode = {
  "@type"?: string | string[];
  sku?: string;
  "@graph"?: JsonLdNode[];
};

function collectJsonLdNodes(data: unknown, out: JsonLdNode[] = []): JsonLdNode[] {
  if (!data) return out;
  if (Array.isArray(data)) {
    for (const item of data) collectJsonLdNodes(item, out);
    return out;
  }
  if (typeof data === "object") {
    const node = data as JsonLdNode;
    out.push(node);
    if (node["@graph"]) collectJsonLdNodes(node["@graph"], out);
  }
  return out;
}

function getSkuFromJsonLd(): string | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  let fallbackProductSku: string | null = null;

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const nodes = collectJsonLdNodes(parsed);

      for (const node of nodes) {
        const type = node["@type"];
        const types = Array.isArray(type) ? type : type ? [type] : [];
        const sku = (node.sku ?? "").toString().trim();
        if (!sku) continue;

        if (types.includes("ProductGroup")) return sku;
        if (types.includes("Product") && !fallbackProductSku) {
          fallbackProductSku = sku;
        }
      }
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  return fallbackProductSku;
}

function getSkuFromDom(): string | null {
  const selectors = [
    '[class*="sku-reference"] span',
    '[class*="SkuReference"] span',
    '[class*="sku-reference"]',
    '[data-testid*="sku" i]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text) return text;
  }

  return null;
}

function extractSku(): string | null {
  return getSkuFromJsonLd() ?? getSkuFromDom();
}

/**
 * Turn a deporvillage hostname into the short domain key used across the
 * extension (e.g. "www.deporvillage.co.uk" -> "co.uk"). Returns null for any
 * host that is not a deporvillage domain.
 */
function domainFromHost(host: string): string | null {
  if (!/deporvillage\./i.test(host)) return null;
  return host.replace(/^www\./i, "").replace(/^deporvillage\./i, "");
}

/**
 * Collect the per-domain equivalent URLs that Deporvillage already renders in
 * the page <head> as `rel="alternate"` hreflang links (plus the canonical).
 *
 * These links exist on PDPs, category pages and even filtered listings, so they
 * let us jump straight to the matching page on another domain without running a
 * SKU search. The domain key is derived from each href's hostname, which means
 * we don't have to hardcode the hreflang -> domain mapping (es -> com, da ->
 * dk, en -> net, nl-be -> be ...): the href already carries the right domain.
 */
function getAlternateUrls(): Record<string, string> {
  const out: Record<string, string> = {};
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="alternate"][hreflang][href], link[rel="canonical"][href]'
  );

  for (const link of links) {
    const href = link.href; // absolute + entity-decoded by the DOM
    if (!href) continue;

    let host = "";
    try {
      host = new URL(href).hostname;
    } catch {
      continue;
    }

    const domain = domainFromHost(host);
    if (!domain) continue;

    // First writer wins so a self-referencing canonical never overrides an
    // explicit alternate for the same domain.
    if (!out[domain]) out[domain] = href;
  }

  return out;
}

chrome.runtime.onMessage.addListener((request, __sender, sendResponse) => {
  if (request.action === "getSKU") {
    sendResponse({ sku: extractSku() });
  } else if (request.action === "getAlternateUrls") {
    sendResponse({ alternates: getAlternateUrls() });
  } else if (request.action === "getFirstResultUrl") {
    const firstResultElement = document.querySelector(
      '[data-testid="product-card"] a[href]:not([href*="/catalogsearch/"])'
    ) as HTMLAnchorElement | null;

    if (!firstResultElement) {
      const legacyResult = document.querySelector(
        '[class*="product-wrapper"] a[href]:not([href*="/catalogsearch/"])'
      ) as HTMLAnchorElement | null;
      sendResponse({ url: legacyResult?.href ?? null });
      return;
    }

    sendResponse({ url: firstResultElement.href });
  }
});
