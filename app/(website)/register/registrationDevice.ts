export const REGISTRATION_FINGERPRINT_VERSION = 1;

export interface RegistrationDeviceIdentity {
  browser_fingerprint: string;
  fingerprint_version: number;
}

interface UserAgentDataLike {
  brands?: Array<{
    brand: string;
    version: string;
  }>;
  mobile?: boolean;
  platform?: string;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function bucket(value: number, size: number, maximum: number) {
  if (!Number.isFinite(value) || value <= 0)
    return 0;

  return Math.min(maximum, Math.round(value / size) * size);
}

function bucketHardwareConcurrency(value: number | undefined) {
  if (!value || value <= 0)
    return 0;

  if (value <= 2)
    return value;
  if (value <= 4)
    return 4;
  if (value <= 8)
    return 8;
  if (value <= 16)
    return 16;

  return 32;
}

function bucketTouchPoints(value: number | undefined) {
  if (!value || value <= 0)
    return 0;
  if (value === 1)
    return 1;
  if (value <= 5)
    return 5;

  return 10;
}

function getUserAgentData() {
  return (window.navigator as Navigator & { userAgentData?: UserAgentDataLike })
    .userAgentData;
}

function getBrowserFamily() {
  const userAgentData = getUserAgentData();
  const brands = userAgentData?.brands
    ?.filter(({ brand }) => !/not.?a.?brand/i.test(brand))
    .map(({ brand, version }) => `${brand.toLowerCase()}/${version.split(".")[0]}`)
    .sort();

  if (brands?.length)
    return brands.join(",");

  const { userAgent } = window.navigator;
  const patterns: Array<[string, RegExp]> = [
    ["edge", /Edg(?:A|iOS)?\/(\d+)/],
    ["firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ];

  for (const [family, pattern] of patterns) {
    const match = userAgent.match(pattern);
    if (match)
      return `${family}/${match[1]}`;
  }

  if (userAgent.includes("Safari/") && userAgent.includes("Version/")) {
    const version = userAgent.split("Version/")[1]?.split(".")[0];
    if (version && /^\d+$/.test(version))
      return `safari/${version}`;
  }

  return "other";
}

function getPlatformFamily() {
  const platform = getUserAgentData()?.platform?.trim().toLowerCase();
  if (platform)
    return platform;

  const { userAgent } = window.navigator;
  if (/android/i.test(userAgent))
    return "android";
  if (/iphone|ipad|ipod/i.test(userAgent))
    return "ios";
  if (/windows/i.test(userAgent))
    return "windows";
  if (/macintosh|mac os x/i.test(userAgent))
    return "macos";
  if (/cros/i.test(userAgent))
    return "chromeos";
  if (/linux/i.test(userAgent))
    return "linux";

  return (window.navigator.platform || "other").trim().toLowerCase();
}

function collectCoarseBrowserSignals() {
  const screenWidth = window.screen?.width ?? 0;
  const screenHeight = window.screen?.height ?? 0;
  const shortScreenSide = Math.min(screenWidth, screenHeight);
  const longScreenSide = Math.max(screenWidth, screenHeight);
  const navigatorWithMemory = window.navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    version: REGISTRATION_FINGERPRINT_VERSION,
    browser: getBrowserFamily(),
    platform: getPlatformFamily(),
    mobile: getUserAgentData()?.mobile ?? bucketTouchPoints(window.navigator.maxTouchPoints) > 0,
    languages: Array.from(window.navigator.languages || [window.navigator.language])
      .filter(Boolean)
      .slice(0, 3)
      .map(language => language.toLowerCase()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    screen: {
      short_side: bucket(shortScreenSide, 100, 10000),
      long_side: bucket(longScreenSide, 100, 10000),
      color_depth: bucket(window.screen?.colorDepth ?? 0, 8, 64),
      dpr: bucket(window.devicePixelRatio, 0.5, 8),
    },
    hardware_concurrency: bucketHardwareConcurrency(window.navigator.hardwareConcurrency),
    device_memory: bucket(navigatorWithMemory.deviceMemory ?? 0, 1, 32),
    touch_points: bucketTouchPoints(window.navigator.maxTouchPoints),
  };
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export async function getRegistrationDeviceIdentity(): Promise<RegistrationDeviceIdentity> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Secure browser cryptography is unavailable");
  }

  const browserFingerprint = await sha256Hex(
    JSON.stringify(collectCoarseBrowserSignals()),
  );

  return {
    browser_fingerprint: browserFingerprint,
    fingerprint_version: REGISTRATION_FINGERPRINT_VERSION,
  };
}
