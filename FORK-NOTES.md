# Fork notes — `feat/korean-localization`

Machine-readable record of changes this fork carries on top of
`paperclipai/paperclip`. **Read this file before attempting an upstream merge.**

The intended reader is an AI agent resolving merge conflicts. Each entry states
what the change is, why it exists, how much of it may be thrown away, and how to
re-apply it. When a listed file conflicts, prefer **taking upstream wholesale and
re-applying the marked block** over hand-merging.

## Conventions

- Fork-local code carries the literal marker `FORK-LOCAL` in a comment.
  `git grep -n "FORK-LOCAL"` enumerates every insertion point.
- Files listed as **additive** do not exist upstream and can never conflict.
  They only break if an API they call is renamed.
- Files listed as **edited** exist upstream. Keep those hunks minimal.

---

## FL-001 — Project code badge on issue rows

**Status:** active · **Added:** 2026-09-09

### Why

Paperclip issue identifiers are company-scoped. `server/src/services/issues.ts`
composes them as `${company.issuePrefix}-${companyWideCounter}`, and the
`projects` table has no prefix column. A board therefore reads `CMPA-41 … CMPA-54`
with no indication of which project a row belongs to.

Changing the identifier format was rejected as unsafe. `/^[A-Z][A-Z0-9]*-\d+$/`
is hardcoded in `packages/shared/src/issue-references.ts` and eight other places
including UI mention autolinking, and several call sites derive the **company**
URL segment from the identifier via `identifier.split("-")[0]`
(`server/src/services/heartbeat.ts`, `server/src/services/workspace-runtime.ts`).
Adding a dash breaks autolinking; concatenating breaks routing. The counter is
also self-correcting (`greatest(counter, max(issue_number)) + 1`), so per-project
number ranges are impossible.

The badge is therefore a **display-layer-only** hint. No schema, no server, no
identifier change.

### Files

| File | Type | Notes |
| --- | --- | --- |
| `ui/src/lib/project-code.ts` | additive | Pure code derivation |
| `ui/src/lib/project-code.test.ts` | additive | Unit tests |
| `ui/src/components/ProjectCodeBadge.tsx` | additive | Renders the badge |
| `ui/src/components/IssueRow.tsx` | **edited** | 1 import + 1 JSX element |

### Re-apply procedure if `IssueRow.tsx` conflicts

1. Take upstream's `IssueRow.tsx` in full.
2. Add `import { ProjectCodeBadge } from "./ProjectCodeBadge"; // FORK-LOCAL (project badge)`
   next to the other component imports.
3. In the latest upstream `IssueRow`, add the same badge to **both** row
   presentations. In the task presentation, place it immediately before the
   `task-row-identifier` span and render it only when `showIdentifier` is true.
   In the legacy presentation, place it immediately after the whole
   `{desktopMetaLeading ?? ( … )}` expression — not inside its fallback:

   ```tsx
   <ProjectCodeBadge
     companyId={issue.companyId}
     projectId={issue.projectId}
     className="hidden shrink-0 px-1.5 py-0 font-mono text-(length:--text-nano) text-muted-foreground sm:inline-flex"
   />
   ```

   Placement matters: `ui/src/components/IssuesList.tsx` passes its own
   `desktopMetaLeading`, so a badge nested inside the fallback renders on the
   inbox but **never on the main issues board**.

4. If upstream removed `issue.projectId` or `issue.companyId` from the `Issue`
   type, **delete FL-001 entirely** rather than reworking it. It is a
   convenience, not a requirement.

### Constraints this change respects

- `ProjectCodeBadge` returns `null` when no `QueryClientProvider` is in scope.
  This is deliberate: `IssueRow` has render paths (including its own test suite)
  that mount without one. Calling `useQuery` directly inside `IssueRow` broke 19
  existing tests with "No QueryClient set". **Do not remove that guard.**
- The badge reuses `queryKeys.projects.list(companyId)` — the key the sidebar and
  mention picker already populate — so it issues no additional requests.
- `deriveProjectCode` duplicates `deriveIssuePrefixBaseFromName` from
  `server/src/services/companies.ts` instead of importing a shared helper,
  because hoisting it into `packages/shared` would mean editing `companies.ts`.
  If the server rule changes, sync by hand. One deliberate difference: the badge
  requires **three** Latin letters before preferring the Latin branch, so a
  mostly-Korean name containing a short English word (`윈도우 to 구글드라이브`)
  yields `DGG` rather than the misleading `TO`.

### Verification

```
cd ui && npx vitest run src/lib/project-code.test.ts src/components/IssueRow.test.tsx src/components/IssuesList.test.tsx
```

The old English-only `IssuesList` assertion has been updated to the localized
label. The focused IssueRow, IssuesList, and project-code tests now pass.

---

## FL-002 — Corrupted-text guards on inbound issue bodies

**Status:** active · **Added:** 2026-09-07

### Why

Agents running on Windows posted Korean comments that arrived destroyed, in two
opposite ways:

- **Mojibake (`U+FFFD`)** — bash/MinGW `curl` passes non-ASCII **argv** through
  CP949, which is then decoded as UTF-8.
- **Lossy encoding (`?`)** — a headless PowerShell has `$OutputEncoding` set to
  ASCII, so **piping** non-ASCII into a native command replaces every Hangul
  character with `?`. This loss is irreversible.

### Files

| File | Type | Notes |
| --- | --- | --- |
| `packages/shared/src/validators/text.ts` | **edited** | Detectors + `superRefine` |
| `packages/shared/src/validators/text.test.ts` | additive | Unit tests |
| `skills/paperclip/scripts/paperclip-issue-update.sh` | additive | bash helper |
| `skills/paperclip/scripts/paperclip-issue-update.ps1` | additive | PowerShell helper |
| `skills/paperclip/SKILL.md` | **edited** | Per-shell guidance |

`multilineTextSchema` is the single chokepoint used by `addIssueCommentSchema`,
`updateIssueSchema.comment`, and `upsertIssueDocumentSchema.body`, so one edit
covers all three routes. **Keep it that way** — do not add the refinement to the
individual route schemas.

Both detectors require an absolute count *and* a density ratio *and* (for the
lossy one) a run of consecutive `?`, so ordinary Korean prose with question marks
passes. Verified against live API traffic.

---

## FL-003 — Issue prefix derivation for non-Latin company names

**Status:** active · **Added:** 2026-09-07

### Why

The upstream rule strips non-Latin characters from a company name and takes the
first three. A Korean-only name yields an empty string and falls back to `CMP`,
so every Korean company collapsed onto `CMP`, `CMPA`, `CMPAA`, …

`deriveIssuePrefixBase` now falls back to romanized Hangul initials
(`셀러의 도구함` → `SRD`), then a stable FNV-1a hash.

### Files

| File | Type |
| --- | --- |
| `server/src/services/issue-prefix.ts` | **edited**; upstream moved prefix derivation here |
| `server/src/services/companies.ts` | **edited**; supports an explicit prefix at creation |
| `packages/shared/src/validators/company.ts` | **edited** |
| `server/src/__tests__/company-issue-prefix.test.ts` | additive |
| `server/src/__tests__/companies-service.test.ts` | **edited** |

### Constraint

Applies to **new companies only**. `updateCompanySchema` deliberately does *not*
accept `issuePrefix`: the live company `셀러의 도구함` keeps `CMPA`, because its
existing issue identifiers and every link and comment referencing them must keep
resolving. Do not "fix" this by adding prefix updates.

The creation form may submit an explicit prefix, which is normalized and validated
before the first issue is created. Existing company prefixes stay fixed on this
self-hosted fork.

---

## FL-004 — Korean UI on the current upstream screens

**Status:** active · **Re-applied:** 2026-09-24 on upstream `7b7c4d417`

The upstream UI changed across hundreds of files after this fork's earlier
localization. Keep the upstream components and behavior first, then re-apply
Korean display copy with `t()` and matching `en`/`ko` locale keys. New screens
use `ui/src/i18n/locales/{en,ko}/new-ui.json`. Never translate API payload
values, persisted names, string-union discriminants, routes, or provider IDs.

`SidePanelLauncher` uses `data-side-panel-search` for its search target so a
translated accessible label does not break keyboard focus. The source-contract
test expands `tNewUi` keys before checking the English reference copy.

The 2026-09-24 candidate passed UI typecheck, production UI build, locale
validation, and 6,672 of 6,673 UI tests on the first stable full run. The sole
failure was an English locale entry containing JSX indentation in “Loading
connection options…”. After normalizing that entry, the complete affected test
file passed (23/23). The remaining English literals found on newly added UI
screens were product/provider names, `UTC`, and test fixtures.

After the cutover, a Korean Chrome smoke check exposed English copy on the new
Apps Browse cards, Skills controls, and Audit filters. The follow-up patch
translates shipped app descriptions at display time, preserving stored app
definitions and company-authored descriptions. It also translates the visible
Browse, Skills, Audit, and sidebar controls. Skill instructions and audit event
identifiers remain source data, so their original text is shown. The patch
passed 77 focused UI tests, 10 locale validation tests, UI typecheck, a
production build, and a six-route Korean browser smoke check with no page
errors before being applied to the live checkout.
The Audit feed also reuses the existing translated activity verbs for recorded
actions; raw event codes remain visible as technical identifiers.

## FL-005 — Restorable embedded PostgreSQL backup on Windows

**Status:** active · **Added:** 2026-09-24

The JavaScript backup fallback in `packages/db/src/backup-lib.ts` emitted `COPY`
data and omitted table `CHECK` constraints, while its restore path ignored the
`COPY` rows. An isolated restore of a live backup therefore lacked required data
and failed on migration 0255. The fallback now restores streamed `COPY` data
and writes `CHECK` constraints. `backup-lib.test.ts` covers both. A fresh live
backup was restored into an isolated database, then migrations 0212–0283
completed without changing the live database.

---

## FL-006 — Windows dependency installation on this upstream revision

**Status:** active · **Added:** 2026-09-24

The upstream `package.json` pins newer Codex and Claude adapter dependencies
than its `pnpm-lock.yaml`. `pnpm install --frozen-lockfile` failed with
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. The lockfile was regenerated with pnpm
9.15.4 to match `package.json`, then frozen installation succeeded.

The root postinstall creates local plugin SDK links. On Windows without
Developer Mode, directory symlinks failed with `EPERM`, so
`scripts/link-plugin-dev-sdk.mjs` now creates directory junctions on Windows.
Running it twice confirmed the links are reusable. An optional `cpu-features`
native install also reported a missing compiler, but the completed dependency
installation did not depend on that optional module.

---

## Not in this file

`start-paperclip.cmd` is a machine-specific launcher (absolute paths, CP949
encoding, CRLF). It is intentionally untracked and must not be committed.
