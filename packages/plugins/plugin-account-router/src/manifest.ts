import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.account-router";
export const ROUTER_HEALTH_ACTION = "router-health";
export const ROUTER_STATE_ACTION = "router-state";
export const ROUTER_LINK_ACTION = "router-link";
export const PAGE_ROUTE_PATH = "account-router";
export const PAGE_SLOT_ID = "account-router-page";
export const SIDEBAR_SLOT_ID = "account-router-sidebar";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Account Router (read-only)",
  description:
    "Read-only bridge to the host-local GPT/Claude account router through the host HTTP bridge. Exposes router health and a sanitized account summary to board users of explicitly enabled companies. No switching, login, refresh, or settings changes. Reads need an instance-admin local-read grant on the host; without it they end as blocked_by_host.",
  author: "Paperclip",
  categories: ["connector"],
  // Only the host HTTP bridge (ctx.http.fetch) plus the page and sidebar
  // slots. Plugin config reads need no capability. The host serves the
  // loopback router origin only through its managed local read, which needs
  // an enabled instance-admin grant; otherwise reads end as `blocked_by_host`.
  capabilities: ["http.outbound", "ui.page.register", "ui.sidebar.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: {
        type: "boolean",
        default: false,
        title: "Expose account router status to this company",
        description:
          "Off by default. Only when true may board users of this company read router health and the sanitized account summary.",
      },
      routerUrl: {
        type: "string",
        maxLength: 2048,
        // https on any host, or http on loopback only. No credentials. The
        // worker re-validates and returns null for anything else.
        pattern: String.raw`^(https://[^\s/@]+|http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]{1,5})?)(/[^\s]*)?$`,
        title: "Existing router UI address (optional)",
        description:
          "Shown only as an external link to the existing router UI. Leave empty to disable the link. There is no default address.",
      },
    },
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: SIDEBAR_SLOT_ID,
        displayName: "계정 라우터",
        exportName: "AccountRouterSidebarLink",
      },
      {
        type: "page",
        id: PAGE_SLOT_ID,
        displayName: "계정 라우터",
        exportName: "AccountRouterRoute",
        routePath: PAGE_ROUTE_PATH,
      },
    ],
  },
};

export default manifest;
