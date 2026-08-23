import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

type SubNavKey = "connected" | "gateways" | "activity";

const ITEMS: { key: SubNavKey; labelKey: string; href: string }[] = [
  { key: "connected", labelKey: "integrations.common.connections", href: "/apps/connections" },
  { key: "gateways", labelKey: "integrations.common.gateways", href: "/apps/gateways" },
  { key: "activity", labelKey: "integrations.common.activity", href: "/activity" },
];

/**
 * Shared Apps section sub-navigation (Connected · Gateways · Activity). Keeps
 * the Gateways surface reachable as a first-class Apps tab per the PAP-11178
 * design of record, rather than buried under the Advanced developer door.
 */
export function AppsSubNav({ active }: { active: SubNavKey }) {
  const { t } = useTranslation();
  return (
    <nav className="flex items-center gap-6 border-b border-border text-sm" aria-label={t("integrations.common.appsSections")}>
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "-mb-px border-b-2 pb-2.5 pt-1 font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
