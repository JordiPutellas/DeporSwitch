import { copyToClipboard } from "./utils";

const handleTabUpdate = (tabId: number, active: boolean) => {
  const tabUpdateListener = (tabIdUpdated: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    if (tabId === tabIdUpdated && changeInfo.status === "complete") {
      chrome.tabs.sendMessage(
        tabId,
        { action: "getFirstResultUrl" },
        (response) => {
          if (response && response.url) {
            chrome.tabs.update(tabId, { url: response.url, active: active });
            copyToClipboard(response.url);
            console.log(`First result URL copied to clipboard: ${response.url}`);
          } else {
            console.error("First result URL not found or response is null");
          }
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        }
      );
    }
  };

  chrome.tabs.onUpdated.addListener(tabUpdateListener);
};

export const createSearchTab = (sku: string, newDomain: string, active: boolean) => {
  if (sku) {
    const searchUrl = `https://www.deporvillage.${newDomain}/catalogsearch/result?q=${sku}`;
    console.log(`Generated search URL: ${searchUrl}`);

    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      if (tab && tab.id) {
        handleTabUpdate(tab.id, active);
      } else {
        console.error("Failed to create tab");
      }
    });
  } else {
    console.error("SKU is not defined");
  }
};
