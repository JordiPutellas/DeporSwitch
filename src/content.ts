chrome.runtime.onMessage.addListener((request, __sender, sendResponse) => {
  if (request.action === "getSKU") {
    const skuElement = document.querySelector('.Tabs_sku-reference__I0RlP span');
    if (skuElement) {
      sendResponse({ sku: skuElement.textContent });
    } else {
      sendResponse({ sku: null });
    }
  } else if (request.action === "getFirstResultUrl") {
    console.log('Received getFirstResultUrl action');
    const firstResultElement = document.querySelector('.ProductItemWrapper_product-wrapper-component__MfmoG a') as HTMLAnchorElement;
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
