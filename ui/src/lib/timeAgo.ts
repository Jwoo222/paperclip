import { i18n } from "@/i18n";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function timeAgo(date: Date | string, locale?: string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);
  const displayLocale = locale ?? i18n.resolvedLanguage ?? i18n.language ?? "en";
  const translate = i18n.getFixedT(displayLocale);

  if (seconds < MINUTE) return translate("commonControls.time.justNow");
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return translate("commonControls.time.minutesAgo", { count: m });
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return translate("commonControls.time.hoursAgo", { count: h });
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return translate("commonControls.time.daysAgo", { count: d });
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return translate("commonControls.time.weeksAgo", { count: w });
  }
  const mo = Math.floor(seconds / MONTH);
  return translate("commonControls.time.monthsAgo", { count: mo });
}
