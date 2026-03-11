export const PRIVACY_MODE_STORAGE_KEY = "avenire:settings:privacy-mode";

export function readPrivacyModeFromStorage() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(PRIVACY_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
