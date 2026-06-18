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

chrome.runtime.onMessage.addListener((request, __sender, sendResponse) => {
  if (request.action === "getSKU") {
    sendResponse({ sku: extractSku() });
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
