export function detectMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const ua = String(navigator.userAgent || navigator.vendor || "");
  const platform = String(
    navigator.userAgentData?.platform || navigator.platform || "",
  ).toLowerCase();
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const esIPadOS = platform === "macintel" && maxTouchPoints > 1;
  const esAndroid = /android/i.test(ua);
  const esIOS = /iphone|ipod|ipad/i.test(ua) || esIPadOS;
  const esWindowsPhone = /windows phone|iemobile/i.test(ua);
  const byWidth =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 900px)").matches
      : false;
  const byTouch =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : maxTouchPoints > 0;

  if (typeof navigator.userAgentData?.mobile === "boolean") {
    if (navigator.userAgentData.mobile) return true;
    if (!esAndroid && !esIOS && !esWindowsPhone) return false;
  }

  return esAndroid || esIOS || esWindowsPhone || (byWidth && byTouch);
}

export function getTicketPrintWidth(isMobile = false) {
  return isMobile ? "72mm" : "58mm";
}
