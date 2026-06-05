// usePwaInstall — the single source of truth for "should we show an install CTA,
// and what happens when they tap it?"
//
// The whole point (per the brief): never render a dead button. The CTA only
// appears for visitors who can actually convert a website into an app right now:
//   • Android/Chromium → only after `beforeinstallprompt` fired (canInstall)
//   • iOS Safari       → no such event exists, so we offer manual instructions
//   • already installed / running standalone → show nothing
//   • recently dismissed → snoozed, show nothing
//
// Components read `canInstall` (+ `isIOS`) to decide whether to render at all.

import { useCallback, useEffect, useState } from "react";
import {
  fireInstallPrompt,
  getDeferredPrompt,
  subscribeInstallState,
  wasInstalledThisSession,
} from "./installState.js";

const SNOOZE_KEY = "pullup_install_snooze_until";
const DEFAULT_SNOOZE_DAYS = 14;

function detectStandalone() {
  if (typeof window === "undefined") return false;
  const displayStandalone =
    window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari exposes navigator.standalone instead of the display-mode query.
  const iosStandalone = window.navigator.standalone === true;
  return Boolean(displayStandalone || iosStandalone);
}

function detectIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as desktop Safari; sniff the touch-capable Mac.
  const iPadOS = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

function detectIOSSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  // Only real Safari can Add to Home Screen. Chrome/Firefox/in-app webviews on
  // iOS (CriOS/FxiOS/etc.) can't, so we don't promise them an install.
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|gsa|fban|fbav|instagram|line/i.test(ua);
  return detectIOS() && isSafari;
}

function isSnoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return until > Date.now();
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const [hasDeferred, setHasDeferred] = useState(Boolean(getDeferredPrompt()));
  const [isInstalled, setIsInstalled] = useState(detectStandalone() || wasInstalledThisSession());
  const [snoozed, setSnoozed] = useState(isSnoozed());

  const isIOS = detectIOS();
  const isIOSSafari = detectIOSSafari();

  useEffect(() => {
    const sync = () => {
      setHasDeferred(Boolean(getDeferredPrompt()));
      setIsInstalled(detectStandalone() || wasInstalledThisSession());
    };
    const unsubscribe = subscribeInstallState(sync);

    // React to the user installing/uninstalling without a reload.
    const mq = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
    const onDisplayChange = () => setIsInstalled(detectStandalone());
    if (mq?.addEventListener) mq.addEventListener("change", onDisplayChange);

    return () => {
      unsubscribe();
      if (mq?.removeEventListener) mq.removeEventListener("change", onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const outcome = await fireInstallPrompt();
    if (outcome === "accepted") setIsInstalled(true);
    return outcome;
  }, []);

  const dismiss = useCallback((days = DEFAULT_SNOOZE_DAYS) => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch {
      // Private mode etc. — just hide for this session.
    }
    setSnoozed(true);
  }, []);

  // canInstall = the moment is live AND worth showing.
  // Android/desktop: needs the captured prompt. iOS Safari: always installable
  // via the share sheet (no event), so we gate on Safari + not-installed only.
  const canInstall =
    !isInstalled && !snoozed && (hasDeferred || isIOSSafari);

  return { canInstall, isIOS, isIOSSafari, isInstalled, snoozed, promptInstall, dismiss };
}
