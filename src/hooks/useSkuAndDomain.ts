import { useEffect, useState } from "react";

const useSkuAndDomain = () => {
  const [sku, setSku] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      const url = tab?.url ?? "";
      const tabId = tab?.id;

      // Reset por defecto (evita estados raros si cambiamos de pestaña/URL no válida)
      setSku(null);
      setDomain("");

      // Solo trabajamos con http(s)
      if (!/^https?:\/\//i.test(url)) return;

      // Parse URL de forma defensiva
      let host = "";
      try {
        host = new URL(url).hostname; // ej: www.deporvillage.com
      } catch {
        return;
      }

      // Solo intentamos leer SKU si estamos en deporvillage
      if (!/deporvillage\./i.test(host)) return;

      // Calcular dominio (com/fr/it...)
      const computedDomain = host.replace(/^www\./i, "").replace(/^deporvillage\./i, "");
      setDomain(computedDomain);

      // Si no hay tabId, no podemos mensajear
      if (!tabId) return;

      // Pedir SKU al content script (manejar receiver inexistente + response undefined)
      try {
        chrome.tabs.sendMessage(tabId, { action: "getSKU" }, (response) => {
          if (chrome.runtime.lastError) {
            // content script no inyectado en esta pestaña/URL
            return;
          }
          const received = (response?.sku ?? "").toString().trim();
          if (received) setSku(received);
        });
      } catch {
        // ignore
      }
    });
  }, []);

  return { sku, domain };
};

export default useSkuAndDomain;
