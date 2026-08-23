import type { Resource } from "i18next";

import { assertValidLocaleMessages } from "./locale-validation";

export const SOURCE_LOCALE = "en" as const;
export const DEFAULT_LOCALE = "ko" as const;

const localeModules = import.meta.glob("./locales/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

type MessageTree = Record<string, unknown>;

function isMessageTree(value: unknown): value is MessageTree {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localeFromPath(path: string) {
  const rootMatch = path.match(/^\.\/locales\/([A-Za-z0-9_-]+)\.json$/);
  if (rootMatch) return { locale: rootMatch[1]!, isRoot: true };

  const fragmentMatch = path.match(/^\.\/locales\/([A-Za-z0-9_-]+)\/.+\.json$/);
  if (fragmentMatch) return { locale: fragmentMatch[1]!, isRoot: false };

  throw new Error(`Invalid locale file path: ${path}`);
}

function mergeMessages(target: MessageTree, source: MessageTree, path: string[] = []) {
  for (const [key, value] of Object.entries(source)) {
    const nextPath = [...path, key];
    if (!(key in target)) {
      target[key] = value;
      continue;
    }

    const existing = target[key];
    if (isMessageTree(existing) && isMessageTree(value)) {
      mergeMessages(existing, value, nextPath);
      continue;
    }

    throw new Error(`Duplicate locale message key: ${nextPath.join(".")}`);
  }
}

const mergedLocaleMessages: Record<string, MessageTree> = {};
const orderedLocaleModules = Object.entries(localeModules).sort(([leftPath], [rightPath]) => {
  const left = localeFromPath(leftPath);
  const right = localeFromPath(rightPath);
  if (left.isRoot !== right.isRoot) return left.isRoot ? -1 : 1;
  return leftPath.localeCompare(rightPath);
});

for (const [path, messages] of orderedLocaleModules) {
  if (!isMessageTree(messages)) {
    throw new Error(`Locale file must contain an object: ${path}`);
  }
  const { locale } = localeFromPath(path);
  const target = (mergedLocaleMessages[locale] ??= {});
  mergeMessages(target, messages);
}

export const localeMessages = mergedLocaleMessages;

if (!(SOURCE_LOCALE in localeMessages)) {
  throw new Error(`Missing source locale messages for ${SOURCE_LOCALE}`);
}
if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

const englishMessages = localeMessages[SOURCE_LOCALE]!;
for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages, englishMessages, { allowMissing: locale !== SOURCE_LOCALE });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages).sort((left, right) => left.localeCompare(right));

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = (typeof supportedLocales)[number];
