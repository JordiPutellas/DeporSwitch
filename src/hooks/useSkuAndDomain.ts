import { useEffect, useState } from "react";

type PageInfo = {
  sku: string | null;
  alternates: Record<string, string>;
};

/**
 * Runs inside the active tab (via chrome.scripting.executeScript) and returns
 * everything the popup needs from the page in a single hop.
 *
 * It must be fully self-contained: executeScript serializes the function, so it
 * cannot reference anything from the surrounding module scope.
 */
function extractPageInfo(): PageInfo {
  // ---- SKU (JSON-LD first, DOM fallback) ----
  const collect = (data: unknown, out: Record<string, unknown>[]): Record<string, unknown>[] => {
    if (!data) return out;
    if (Array.isArray(data)) {
      for (const item of data) collect(item, out);
      return out;
    }
    if (typeof data === "object") {
      const node = data as Record<string, unknown>;
      out.push(node);
      if (node["@graph"]) collect(node["@graph"], out);
    }
    return out;
  };

  const skuFromJsonLd = (): string | null => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    let fallback: string | null = null;
    for (const script of scripts) {
      try {
        const nodes = collect(JSON.parse(script.textContent ?? ""), []);
        for (const node of nodes) {
          const type = node["@type"];
          const types = Array.isArray(type) ? type : type ? [type] : [];
          const sku = ((node.sku as string) ?? "").toString().trim();
          if (!sku) continue;
          if (types.includes("ProductGroup")) return sku;
          if (types.includes("Product") && !fallback) fallback = sku;
        }
      } catch {
        // ignore invalid JSON-LD blocks
      }
    }
    return fallback;
  };

  const skuFromDom = (): string | null => {
    const selectors = [
      '[class*="sku-reference"] span',
      '[class*="SkuReference"] span',
      '[class*="sku-reference"]',
      '[data-testid*="sku" i]',
    ];
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return null;
  };

  // ---- Alternate/canonical URLs -> per-domain equivalent pages ----
  const domainFromHost = (host: string): string | null => {
    if (!/deporvillage\./i.test(host)) return null;
    return host.replace(/^www\./i, "").replace(/^deporvillage\./i, "");
  };

  const alternates: Record<string, string> = {};
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
    // First writer wins: a self-referencing canonical never overrides an
    // explicit alternate for the same domain.
    if (domain && !alternates[domain]) alternates[domain] = href;
  }

  return { sku: skuFromJsonLd() ?? skuFromDom(), alternates };
}

const useSkuAndDomain = () => {
  const [sku, setSku] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");
  // URLs equivalentes por dominio leídas de los <link rel="alternate"> de la
  // página actual. Sirven de ruta rápida (PDP, categorías y filtradas).
  const [alternates, setAlternates] = useState<Record<string, string>>({});

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      const url = tab?.url ?? "";
      const tabId = tab?.id;

      // Reset por defecto (evita estados raros si cambiamos de pestaña/URL no válida)
      setSku(null);
      setDomain("");
      setAlternates({});

      // Solo trabajamos con http(s)
      if (!/^https?:\/\//i.test(url)) return;

      // Parse URL de forma defensiva
      let host = "";
      try {
        host = new URL(url).hostname; // ej: www.deporvillage.com
      } catch {
        return;
      }

      // Solo intentamos leer si estamos en deporvillage
      if (!/deporvillage\./i.test(host)) return;

      // Calcular dominio (com/fr/it...)
      const computedDomain = host.replace(/^www\./i, "").replace(/^deporvillage\./i, "");
      setDomain(computedDomain);

      // Si no hay tabId, no podemos inyectar
      if (typeof tabId !== "number") return;

      // Leer SKU + alternates directamente de la pestaña activa. Usamos
      // executeScript (no messaging) para no depender de que el content script
      // declarativo estuviera ya inyectado en pestañas abiertas antes de
      // (re)cargar la extensión — esa es la causa habitual de "no hace nada".
      try {
        chrome.scripting.executeScript(
          { target: { tabId }, func: extractPageInfo },
          (results) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[DeporSwitch] executeScript failed:",
                chrome.runtime.lastError.message
              );
              return;
            }
            const info = results?.[0]?.result as PageInfo | undefined;
            if (!info) return;
            const receivedSku = (info.sku ?? "").toString().trim();
            if (receivedSku) setSku(receivedSku);
            if (info.alternates && typeof info.alternates === "object") {
              setAlternates(info.alternates);
            }
          }
        );
      } catch (e) {
        console.warn("[DeporSwitch] executeScript threw", e);
      }
    });
  }, []);

  return { sku, domain, alternates };
};

export default useSkuAndDomain;
