# Account Router Plugin (read-only, phase 1)

Paperclip plugin that reads the status of the existing host-local GPT/Claude
account router (`tools/codex-auth-router`, `web_server.py`) without replacing
it. This package is **phase 1 of the integration: a read-only bridge.** It
does not complete the integration on its own.

> **Live connection is not possible yet.** The plugin talks to the router only
> through the host HTTP bridge (`ctx.http.fetch`). The current host refuses
> loopback and private targets on purpose, so every read on a real instance
> returns `{ "connection": "error", "reason": "blocked_by_host" }`. Reads
> become possible only after a host-managed local read connector is designed,
> approved, and shipped in core. Do not work around this from the plugin.

What it does:

- `router-health` action: asks the router's fixed health endpoint.
- `router-state` action: returns an allowlisted summary of router accounts.
- `router-link` action: returns the validated router UI address from company
  config (`{ "routerUrl": string | null }`). Config only; never calls the router.
- UI: a company sidebar link and a page at `/:companyPrefix/account-router`
  (see [UI](#ui)).

What it never does:

- No account switching, usage refresh (which would call models), auto
  switching, sync, rename, disable, archive, settings changes, login, or
  credential import. It sends no POST requests to the router at all.
- No direct network access: no `node:http`/`https`/`net`, no sockets, no
  global `fetch`. A test scans the worker sources for these.
- No iframe embedding and no changes to the router's security headers
  (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), CSRF, or remote gate.
- No scheduled jobs, agent tools, webhooks, API routes, or data handlers.
- No polling, automatic retry, or persistent cache in the UI.
- No caching, logging, or returning of raw router responses or host error text.
- No reading of router code, auth files, or the account vault.

## Target and transport

| Item | Value |
| --- | --- |
| Transport | Host bridge `ctx.http.fetch` only (`http.outbound` capability) |
| Origin | `http://127.0.0.1:8765` (constant) |
| Paths | `/codex-router/api/health`, `/codex-router/api/state` (constants) |
| Method | `GET` only, `Accept: application/json`, no `Origin`, CSRF, or forwarding headers |
| Attempts | One per call. A host refusal is final: no retry, no fallback transport |
| Redirects | Refused (`redirect_blocked`); the host does not follow them either |
| Content type | Must be `application/json` |

Origin and paths are compile-time constants. Nothing in plugin config or
action params can change the target, so there is no URL, path, or
redirect-based SSRF surface in the plugin.

### What the host bridge does and does not guarantee

Checked against `server/src/services/plugin-host-services.ts` and
`packages/plugins/sdk/src/worker-rpc-host.ts`:

| Limit | Host behavior | Plugin behavior |
| --- | --- | --- |
| Private/loopback targets | Refused before connecting (`isPrivateIP`) | Mapped to `blocked_by_host` |
| Timeout | Host aborts after 30 s; worker RPC waits up to 30 s | Worker stops waiting after 3 s (`timeout`). The host request is **not** cancelled |
| Response size | Host buffers up to 200 MB, then passes the whole body | Plugin rejects over 4 KiB (health) / 256 KiB (state) **after** receiving it. Host memory is not protected by this |
| Redirects | Node `http.request`, never followed; 3xx returned as-is | 3xx refused |
| `redirect`/`signal` options | Not forwarded over RPC | Not relied on |

## Who can read

Every read is fail-closed and passes all of these checks before any host call:

1. **Board user only.** The caller identity comes from the host-built action
   context (`context.actor`), never from params. `agent` and `system` actors
   are refused (`board_user_required`). The host bridge route has already
   authenticated the request and checked company access.
2. **Host-authorized company.** The company must come from the host scope
   (`context.actor.companyId`). Calls without a company scope are refused
   (`company_scope_required`), and a params `companyId` that differs from the
   host scope is refused (`company_mismatch`).
3. **Company explicitly enabled.** The plugin's company config must contain
   `enabled: true` (strict boolean). The default is off for every company.
   Only an instance admin can write plugin config. Missing, non-boolean, or
   unreadable config is refused (`company_not_enabled`).

Reads are exposed as actions, not `getData` handlers, because only
`performAction` receives the host-authenticated actor.

## Returned data

`router-health`:

```json
{ "connection": "online", "service": "codex-router-web", "version": 1, "checkedAt": "..." }
```

`router-state`:

```json
{
  "connection": "online",
  "fetchedAt": "...",
  "accounts": [
    {
      "provider": "codex",
      "alias": "main-codex",
      "active": true,
      "needsLogin": false,
      "disabled": false,
      "usage": {
        "checkedAt": "...",
        "failed": false,
        "primary": { "usedPercent": 42.5, "resetsAt": "...", "windowSeconds": 18000 },
        "secondary": { "usedPercent": 10, "resetsAt": "...", "windowSeconds": 604800 }
      }
    }
  ],
  "omittedAccountCount": 0,
  "job": { "status": "running" }
}
```

Only the fields above are copied. Everything else in the router response is
dropped, including `csrf`, `login` (verification URL, `userCode`), account
`email` and `plan`, `targets` (including file `path`), `settings`, `history`,
`events` and job `message` free text, `legacyOpen`, `remoteEnabled`, and the
public `url`. Aliases must match the router's own alias rule (1-48 letters,
digits, `_`, `.`, `-`), so an email or path in the label is dropped and counted
in `omittedAccountCount`. Unknown job statuses become `"unknown"`.

When the router cannot be read, the action returns a status object with a
code only:

```json
{ "connection": "error", "reason": "blocked_by_host", "checkedAt": "..." }
```

| `reason` | `connection` | Meaning |
| --- | --- | --- |
| `blocked_by_host` | `error` | Host refused the request (loopback/private target or missing capability). Expected today |
| `offline` | `offline` | Host could not complete the request |
| `timeout` | `offline` | No answer within 3 s, or host RPC timeout |
| `redirect_blocked` | `error` | Router answered with a 3xx |
| `rejected_by_router` | `error` | Router answered 401/403 |
| `http_error` | `error` | Any other non-200 status |
| `unexpected_content_type` | `error` | Not JSON |
| `too_large` | `error` | Body over the size limit |
| `invalid_json` | `error` | Body is not valid JSON |
| `schema_mismatch` | `error` | JSON does not have the expected shape |

Access denials are thrown (the bridge responds with an error) and are never
turned into a status object.

## UI

| Slot | Export | Behavior |
| --- | --- | --- |
| `sidebar` | `AccountRouterSidebarLink` | Host-navigated link to the page. Never calls the worker |
| `page` (`routePath: account-router`) | `AccountRouterRoute` | Container for the approved `AccountRouterPage` view |

The page container (`src/ui/AccountRouterRoute.tsx`):

- Calls `router-state` and `router-link` through `usePluginAction` once on
  entry and once per company change. Afterwards only the "다시 확인" button
  reads again, one request at a time. No polling, no automatic retry, no
  cache; nothing is written to storage.
- Company switch clears shown data and the link at once. Each request carries
  a generation number, so a late answer for the previous company is dropped.
- A thrown bridge error keeps only a known denial code
  (`company_not_enabled`, ...). Its message is never rendered or logged.
  Denied and unavailable views carry no account data.
- The "기존 라우터 열기" link appears only when company config has a
  `routerUrl` that passes validation (https, or http on loopback, no
  credentials, at most 2048 chars). There is no default address.

**Sidebar critical marker: not supported.** The SDK `sidebar` slot only
renders a component; it has no badge or status channel. Showing router state
there would mean the sidebar calling `router-state` on every app load, an
extra router read that this plugin does not make. Critical alerts are shown on
the page only.

## Install, enable, disable

Installing this plugin on a live instance is **not recommended now**: it can
only return `blocked_by_host`. Production install and enabling a company need
a separate approval, and are instance-admin operations. Nothing in this
package's build or tests installs or enables it.

When approved later:

- Enable one company: instance admin writes company config
  `{"enabled": true}` through the plugin config API. Optionally add
  `"routerUrl": "https://..."` to show the "기존 라우터 열기" link.
- Turn off one company: write `{"enabled": false}` (or `{}`). Reads for that
  company are refused on the next call; nothing is cached.
- Whole instance: disable or uninstall the plugin through the plugin API.
- The plugin holds no state, so disabling or uninstalling leaves nothing to
  clean up and does not affect the router.
- `rejected_by_router` means the router's own authorization refused the read.
  Check the router; do not work around it from the plugin.

## Gates before later phases

- **Host-managed local read connector (core change, needs approval):** the
  only supported path to a live read. See the connector proposal on CMPA-211.
  No plugin-side transport may replace it.
- **Any write action** (switching, refresh, settings, login) is out of scope
  for this plugin line and needs its own design and approval.

## Development

```bash
pnpm --filter @paperclipai/plugin-account-router typecheck
pnpm --filter @paperclipai/plugin-account-router test
pnpm --filter @paperclipai/plugin-account-router build
```

`test` runs the worker specs (node) and the UI specs (`tests/ui/*.ui-spec.tsx`,
jsdom via a per-file docblock) with one config. `build` writes
`dist/manifest.js`, `dist/worker.js`, and `dist/ui/index.js`.

A `Python/` directory may exist here from an accidental local Python install
(Windows Python install manager with an empty `LOCALAPPDATA`). It is ignored
by `.gitignore`, excluded from `files`, and not part of any build input.

Tests use a mocked host bridge only; nothing opens a socket. A
production-like mock reproduces today's host refusal of loopback targets, and
a test-only "allowing" mock stands in for a future connector to check
response handling: fixed origin and headers, redirect refusal, timeouts, size
limits, bad content type, bad JSON, schema mismatch, caller gate, and
secret-marker absence. No test touches the real router or any account.
