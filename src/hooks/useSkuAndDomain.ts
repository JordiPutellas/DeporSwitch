import { useState, useEffect } from "react";

const useSkuAndDomain = () => {
  const [sku, setSku] = useState<string | null>(null);
  const [domain, setDomain] = useState<string>("");

  useEffect(() => {
    // Obtener la URL del tab activo
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || "";
      const domain = new URL(url).hostname.replace("www.deporvillage", "");
      setDomain(domain);

      // Enviar mensaje al content script para obtener el SKU
      chrome.tabs.sendMessage(tabs[0].id!, { action: "getSKU" }, (response) => {
        if (response.sku) {
          setSku(response.sku);
        } else {
          setSku("SKU not found");
        }
      });
    });
  }, []);

  return { sku, domain };
};

export default useSkuAndDomain;
