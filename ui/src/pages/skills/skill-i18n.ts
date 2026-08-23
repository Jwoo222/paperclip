import { i18n } from "@/i18n";

/** Translate static skill UI copy while keeping the English source as fallback. */
export function skillText(source: string) {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const localized = i18n.getResource(locale, "translation", ["skills", "phrases", source]);
  if (typeof localized === "string") return localized;

  const english = i18n.getResource("en", "translation", ["skills", "phrases", source]);
  return typeof english === "string" ? english : source;
}
