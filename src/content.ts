// src/content.ts (minimal change: new SKU selector)
chrome.runtime.onMessage.addListener((request, __sender, sendResponse) => {
  if (request.action === "getSKU") {
    // UPDATED selector — minimal change
    const skuElement = document.querySelector('.ProductDetailsDescription_sku-reference__w1NR9 span');
    if (skuElement) {
      sendResponse({ sku: skuElement.textContent });
    } else {
      sendResponse({ sku: null });
    }
  } else if (request.action === "getFirstResultUrl") {
    console.log('Received getFirstResultUrl action');
    const firstResultElement = document.querySelector('[data-testid="plp-product-list"] [data-testid="product-card"] a[href]:not([href*="/catalogsearch/"])') as HTMLAnchorElement;
    if (firstResultElement) {
      const firstResultUrl = firstResultElement.href;
      console.log(`Extracted first result URL: ${firstResultUrl}`);
      sendResponse({ url: firstResultUrl });
    } else {
      console.log('No first result element found');
      sendResponse({ url: null });
    }
  }
});
