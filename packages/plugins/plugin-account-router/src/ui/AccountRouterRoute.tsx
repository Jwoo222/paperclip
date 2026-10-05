import { useCallback, useEffect, useRef, useState } from "react";
import {
  useHostContext,
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import { PAGE_ROUTE_PATH, ROUTER_LINK_ACTION, ROUTER_STATE_ACTION } from "../manifest.js";
import type { RouterLinkResult, StateResult } from "../worker.js";
import { AccountRouterPage } from "./AccountRouterPage.js";
import { safeRouterUrl, viewFromActionError, viewFromStateResult, type AccountRouterView } from "./view.js";

interface PageState {
  view: AccountRouterView;
  routerUrl: string | null;
  retrying: boolean;
}

const LOADING: PageState = { view: { kind: "loading" }, routerUrl: null, retrying: false };

/**
 * Page container: the only place that calls the worker.
 *
 * - Reads once on entry (and on company change) and again only when the user
 *   presses "다시 확인". No polling, no automatic retry, no cache.
 * - Every request carries a generation number. A company switch or unmount
 *   bumps the generation, so a late response for the previous company is
 *   dropped instead of being shown under the new one.
 * - Only DTOs reach the page. Thrown bridge errors are reduced to a known
 *   denial code; their text is never rendered or logged.
 */
export function AccountRouterRoute(_props: PluginPageProps) {
  const { companyId } = useHostContext();
  const readState = usePluginAction(ROUTER_STATE_ACTION);
  const readLink = usePluginAction(ROUTER_LINK_ACTION);
  const [state, setState] = useState<PageState>(LOADING);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    (retry: boolean) => {
      if (inFlight.current) return;
      const gen = generation.current;
      inFlight.current = true;
      if (retry) setState((prev) => ({ ...prev, retrying: true }));

      const statePromise = readState().then(
        (result) => viewFromStateResult(result as StateResult),
        (error: unknown) => viewFromActionError(error),
      );
      const linkPromise = readLink().then(
        (result) => safeRouterUrl((result as RouterLinkResult | null)?.routerUrl),
        () => null,
      );

      void Promise.all([statePromise, linkPromise]).then(([view, routerUrl]) => {
        if (gen !== generation.current) return;
        inFlight.current = false;
        // Denied/unavailable views carry no account data, so they replace
        // whatever was shown before. The link follows the same rule.
        setState({ view, routerUrl: view.kind === "denied" ? null : routerUrl, retrying: false });
      });
    },
    [readState, readLink],
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    if (!companyId) {
      setState({ view: { kind: "denied", reason: "company_scope_required" }, routerUrl: null, retrying: false });
      return;
    }
    setState(LOADING);
    load(false);
    return () => {
      generation.current += 1;
      inFlight.current = false;
    };
  }, [companyId, load]);

  const onRetry = useCallback(() => load(true), [load]);

  return (
    <AccountRouterPage
      view={state.view}
      routerUrl={state.routerUrl}
      retrying={state.retrying}
      onRetry={companyId && state.view.kind !== "loading" ? onRetry : undefined}
    />
  );
}

function RouterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  );
}

const NAV_ITEM =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors";
const NAV_IDLE = "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const NAV_ACTIVE = "bg-sidebar-accent text-sidebar-accent-foreground";

/**
 * Sidebar entry. Navigation only: it never calls the worker. The SDK sidebar
 * slot has no badge/status channel, so critical state is shown on the page,
 * not here (see README "Sidebar").
 */
export function AccountRouterSidebarLink(_props: PluginSidebarProps) {
  const navigation = useHostNavigation();
  const location = useHostLocation();
  const active = location.pathname.split("/").includes(PAGE_ROUTE_PATH);
  return (
    <a
      {...navigation.linkProps(`/${PAGE_ROUTE_PATH}`)}
      aria-current={active ? "page" : undefined}
      className={`${NAV_ITEM} ${active ? NAV_ACTIVE : NAV_IDLE}`}
    >
      <span className="relative shrink-0">
        <RouterIcon />
      </span>
      <span className="min-w-0 flex-1 truncate">계정 라우터</span>
    </a>
  );
}
