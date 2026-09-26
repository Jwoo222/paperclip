import englishCatalog from "@/i18n/locales/en/app-catalog.json";
import { t } from "@/i18n";

const keyByEnglishCopy = new Map(
  Object.entries(englishCatalog.appCatalog).map(([key, value]) => [value, key]),
);

/** Translate only shipped catalog copy; leave company-authored descriptions intact. */
export function localizeAppCatalogCopy(value: string): string {
  const key = keyByEnglishCopy.get(value);
  return key ? t(`appCatalog.${key}`) : value;
}
