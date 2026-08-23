import { i18n } from "@/i18n";

/** Translate static skill UI copy while keeping the English source as fallback. */
export function skillText(source: string) {
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // i18next accepts a segment array at runtime so punctuation in the source
  // string is not interpreted as a nested key separator. Its public type still
  // narrows this parameter to string, hence the localized cast at this boundary.
  const phrasePath = ["skills", "phrases", source] as unknown as string;
  const localized = i18n.getResource(locale, "translation", phrasePath);
  if (typeof localized === "string") return localized;

  const english = i18n.getResource("en", "translation", phrasePath);
  return typeof english === "string" ? english : source;
}
