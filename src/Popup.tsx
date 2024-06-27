import React, { useState, useEffect, MouseEvent } from "react";
import useSkuAndDomain from "./hooks/useSkuAndDomain";
import DomainButtonList from "./components/DomainButtonList";
import { createSearchTab } from "./actions";
import { copyToClipboard } from "./utils";
import "./Popup.css";
import logo from "../public/logo.png";

const Popup = () => {
  const { sku, domain } = useSkuAndDomain();
  const domains = ["com", "it", "fr", "net", "pt", "de", "nl", "dk", "pl"];
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    };
    const handleMouseDownListener = handleMouseDown as unknown as EventListener;
    window.addEventListener("mousedown", handleMouseDownListener);
    return () => {
      window.removeEventListener("mousedown", handleMouseDownListener);
    };
  }, []);

  const handleDomainClick = (domain: string, event: MouseEvent) => {
    const isMiddleClick = event.button === 1;

    if (sku && sku !== "SKU not found") {
      createSearchTab(sku, domain, !isMiddleClick);
    } else {
      const currentUrl = `https://www.deporvillage.${domain}`;
      chrome.tabs.create({ url: currentUrl, active: !isMiddleClick });
    }
  };

  const handleSkuClick = async () => {
    if (sku && sku !== "SKU not found") {
      try {
        await copyToClipboard(sku);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Error al copiar el SKU al portapapeles", err);
      }
    }
  };

  const skuStyles = {
    cursor: "pointer",
    textDecoration: copied ? "underline" : "none",
    color: copied ? "green" : "white",
    transition: "color 0.3s ease, textDecoration 0.3s ease",
  } as React.CSSProperties;

  return (
    <div className="popup">
      <div className="header">
        <img src={logo} alt="Logo" className="logo" />
        <h1>DeporSwitch</h1>
      </div>
      <p>Current Domain: {domain}</p>
      {sku && sku !== "SKU not found" && (
        <p onClick={handleSkuClick} style={skuStyles}>
          SKU: {sku}
        </p>
      )}
      <DomainButtonList domains={domains} onClick={handleDomainClick} />
    </div>
  );
};

export default Popup;
