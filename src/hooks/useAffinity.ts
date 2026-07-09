/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";

/** Affinity profile as returned by DY.ServerUtil.getUserAffinities:
 *  a set of groups (categories_0/1/2, color, keywords), each a map of
 *  { label: score } with score in 0..1. */
export type AffinityProfile = Record<string, Record<string, number>>;

type AffinityResult = { available: boolean; profile?: AffinityProfile };

/**
 * Runs in the PAGE MAIN WORLD (executeScript world: "MAIN"), the only place
 * Dynamic Yield's globals (window.DY) exist — the popup and the isolated content
 * script can't see them.
 *
 * It resolves the current user's affinity profile using the exact call DY
 * support gave us. Crucially, this is also our access gate: only sessions DY
 * authorizes (corporate login) return a profile; everyone else resolves
 * { available: false } and the feature stays completely hidden.
 *
 * Must be fully self-contained — executeScript serializes it with toString().
 */
function fetchAffinityProfile(): Promise<AffinityResult> {
  return new Promise((resolve) => {
    try {
      const dy = (window as any).DY;
      if (
        !dy ||
        typeof dy.API !== "function" ||
        !dy.ServerUtil ||
        typeof dy.ServerUtil.getUserAffinities !== "function"
      ) {
        resolve({ available: false });
        return;
      }

      let settled = false;
      const finish = (r: AffinityResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      // Guard against DY never invoking the callback.
      const timer = setTimeout(() => finish({ available: false }), 5000);

      dy.API("callback", () => {
        try {
          dy.ServerUtil.getUserAffinities((err: unknown, profile: any) => {
            clearTimeout(timer);
            if (err || !profile || typeof profile !== "object") {
              finish({ available: false });
              return;
            }
            finish({ available: true, profile });
          }, 5);
        } catch {
          clearTimeout(timer);
          finish({ available: false });
        }
      });
    } catch {
      resolve({ available: false });
    }
  });
}

/**
 * Reads the DY affinity profile of the active Deporvillage tab. `available` is
 * only true for sessions DY authorizes, so the UI can hide the feature entirely
 * for everyone else.
 */
const useAffinity = () => {
  const [available, setAvailable] = useState(false);
  const [profile, setProfile] = useState<AffinityProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      const url = tab?.url ?? "";
      const tabId = tab?.id;

      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        setLoading(false);
        return;
      }

      if (!/deporvillage\./i.test(host) || typeof tabId !== "number") {
        setLoading(false);
        return;
      }

      try {
        chrome.scripting.executeScript(
          { target: { tabId }, world: "MAIN", func: fetchAffinityProfile },
          (results) => {
            setLoading(false);
            if (chrome.runtime.lastError) return;
            const res = results?.[0]?.result as AffinityResult | undefined;
            if (res?.available && res.profile) {
              setAvailable(true);
              setProfile(res.profile);
            }
          }
        );
      } catch {
        setLoading(false);
      }
    });
  }, []);

  return { available, profile, loading };
};

export default useAffinity;
