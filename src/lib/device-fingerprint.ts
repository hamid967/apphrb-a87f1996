// Lightweight device fingerprint (privacy-friendly, no external libs)
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "hbs.device.fp";
  let fp = localStorage.getItem(key);
  if (fp) return fp;
  const bits = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.platform,
  ].join("|");
  let h = 0;
  for (let i = 0; i < bits.length; i++) h = (h * 31 + bits.charCodeAt(i)) | 0;
  fp = "dev_" + Math.abs(h).toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  localStorage.setItem(key, fp);
  return fp;
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  const br = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${br} • ${os}`;
}
