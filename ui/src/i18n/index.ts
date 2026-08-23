import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, SOURCE_LOCALE, supportedLocales } from "./locales";

export const LOCALE_STORAGE_KEY = "paperclip.locale";

function matchSupportedLocale(candidate: string | null | undefined) {
  if (!candidate) return null;
  const normalized = candidate.trim().replaceAll("_", "-").toLowerCase();
  const exact = supportedLocales.find((locale) => locale.toLowerCase() === normalized);
  if (exact) return exact;

  const language = normalized.split("-")[0];
  return supportedLocales.find((locale) => locale.toLowerCase() === language) ?? null;
}

export function resolveInitialLocale() {
  if (typeof window !== "undefined") {
    try {
      const stored = matchSupportedLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
      if (stored) return stored;
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }

  if (typeof navigator !== "undefined") {
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const matched = matchSupportedLocale(candidate);
      if (matched) return matched;
    }
  }

  return DEFAULT_LOCALE;
}

function applyDocumentLocale(locale: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = ["ar", "fa", "he", "ur"].includes(locale) ? "rtl" : "ltr";
}

const initialLocale = resolveInitialLocale();

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale,
  fallbackLng: SOURCE_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});
applyDocumentLocale(initialLocale);
i18n.on("languageChanged", applyDocumentLocale);

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export async function setLocale(locale: string) {
  const matched = matchSupportedLocale(locale);
  if (!matched) throw new Error(`Unsupported locale: ${locale}`);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, matched);
    } catch {
      // The in-memory language change still works when storage is unavailable.
    }
  }
  await i18n.changeLanguage(matched);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
