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
| `skills/paperclip/SKILL.md` | **edited** | Per-shell guidance, appended at the very end of the file |

The SKILL.md paragraph ("Windows and Korean text") must stay **after the last
upstream heading**. Since upstream `1c07b5903` the runner build checks
`packages/paperclip-runner` capability inventory ids that embed SKILL.md heading
line numbers; inserting lines mid-file makes `check:capability-inventory` fail
with "stale source row". Appending at the end shifts no ids, so no generated
file has to be regenerated.

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

**Status:** active · **Re-applied:** 2026-09-24 on upstream `7b7c4d417`;
2026-10-05 on upstream `1c07b5903`

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

### 2026-10-05 merge of `1c07b5903` (209 upstream commits)

- 52 UI files conflicted (121 hunks). Each hunk kept upstream structure and
  behavior, then reused the existing key when ours had already translated the
  same English. Hunk-level resolution kept far more translation than taking
  upstream wholesale would have.
- New strings live in per-area fragments
  `ui/src/i18n/locales/{en,ko}/upgrade-2610-{shell,task,agents,skills,apps}.json`
  (top-level `upgrade2610<Area>`). Future merges should add a new dated
  fragment set the same way instead of editing older fragments, so parallel
  workers never touch the same locale file.
- Owner decision: translate **used screens only** for now. Left English on
  purpose (still resolved, just not localized): Slack/Email/GitHub chat endpoint
  setup, Remote MCP setup, MCP action test dialog, MCP config help, Cloud gates
  and sign-in, Browser Use Cloud task browser panels, AgentMail setup,
  workspace export recovery, the dev-only Design Guide.
- Literals asserted by source-contract tests stay English (e.g. "Run retry
  failed", "Retry queued", the AgentChannelsPanel connector list).
- `InstanceExperimentalSettings` cards now use
  `adminExtra.experimental.flags.<card>.<prop>` inside `admin-extra.json`,
  because that page's test mocks `@/i18n` with only that file.
- Fixed old ko copy: `newUi.k314ae71b8c8d` Artifacts → 산출물 (was 유물),
  `newUi.k73adffe32a9a`/`k14eb4b2e20d3` 에이전트와 채팅 (particle).
- Preview smoke (Korean, seeded copy) found English that predates this merge on
  everyday screens. Fixed in `upgrade-2610-dashboard.json` (dashboard banners,
  run cards, "N more runs"), `upgrade-2610-residual.json` (routines, company
  settings, mode badge, settings sidebar) and `upgrade2610Task.mobilePlaceholder`.
- Shipped app-definition copy: 32 new or changed strings from
  `packages/shared/src/app-definitions/*.json` were added to
  `app-catalog.json` (key = `k` + first 12 hex of SHA-256 of the English text).
  `ConnectionSetupFlow` now passes capability-profile descriptions through
  `localizeAppCatalogCopy`. After each merge, rerun the comparison of
  definition `description`/`tagline` strings against `en/app-catalog.json`.
- Still English, deliberately deferred: activity-feed verbs in
  `ui/src/lib/activity-format.ts` (English word order is baked into sentence
  assembly), skill descriptions and app connection names (stored data).

### 2026-10-29 merge of `cff331f6ca` (1048 upstream commits)

- 180 files conflicted (445 hunks; 158 UI files / 415 hunks). Resolved the same
  way as 2026-10-05: upstream structure first, then existing keys where the
  English is unchanged. Upstream deleted the old Pipelines screens; the fork's
  translated copies were dropped with them.
- Owner scope for this merge: translate what the new commits added, and
  resolve conflicts — not a full re-translation. New strings live in
  `ui/src/i18n/locales/{en,ko}/upgrade-1029-*.json` (top-level
  `upgrade1029<Area>`): `conflicts-{a..e}`, `new-components`, `new-pages`,
  `auto-merged`, `errors`, `shared`. Next merge: add a new dated set.
- New screens translated this time even where FL-004 had deferred the area:
  the Slack/GitHub chat endpoint setup pages added upstream
  (`upgrade1029NewPages.{githubIdentity,githubComplete,githubRecovery,slackDetails,slackTest,managedSlack,ownSlack}`).
  Remote MCP setup kept the 2026-10-05 deferral (existing keys only).
  Owner confirmed on 2026-10-29: keep these chat setup pages in Korean.
- `ui/src/api/errors.ts` is upstream's single error-copy table (toasts,
  connectivity banner, `QueryErrorState`). Its copy now resolves through
  `upgrade1029Errors.*` at call time (FORK-LOCAL). `describeError` titles use
  `upgrade1029Errors.couldNotAction` (ko `{{action}}에 실패했습니다`); callers
  pass either a translated noun phrase (`t("…loadThisCase")` → `케이스 불러오기`)
  or an English phrase listed in `ACTION_KEYS`. Add new English `action=`
  phrases to that table.
- `ui/src/lib/task-list.ts` / `task-list-views.ts` labels are getters over
  `upgrade1029Shared.*`; several exported label arrays from the new
  components use the same getter pattern (shape unchanged).
- App catalog: 46 new definition/gallery strings added to `app-catalog.json`
  (rerun the comparison script described above after every merge).
- `ui/src/artifact-directions/**` (separate `artifact-directions.html` design
  lab) and the `design-sandbox` components stay English, like the Design Guide.
- Five clear mistranslations from key reuse were replaced with new keys
  (Resume ≠ 이력서, Reopened ≠ 재개장, branch ≠ 지점).
- Ko terms (owner decision 2026-10-29): artifact = 산출물, task/issue as a
  Paperclip item = 업무. Every 아티팩트 in `ko/*.json` became 산출물, and
  values whose English says task/issue moved 작업 → 업무 with particles fixed.
  작업 stays where it means an operation or process (background task,
  generation task, 작업자, 작업공간). Check new copy for both terms after
  each merge.
- FL-001: the new column layout (`TaskRowColumnCells`, `appearance="refreshed"`
  with `columnValues`) renders the identifier itself and has no badge. Only the
  dev design sandbox uses it today; add the badge there if a real board adopts it.

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

## FL-007 — Hermes adapter on Windows: junction skill links and file-based prompt

**Status:** active · **Added:** 2026-09-26 · **Issue:** CMPA-178 (decision B), CMPA-176

Two failures stopped every Hermes-adapter run on this machine after the
2026-09-24 upstream merge:

1. `ensurePaperclipSkillSymlink` (`packages/adapter-utils/src/server-utils.ts`)
   created directory symlinks. Without Developer Mode or admin rights that is
   `EPERM` on Windows, and the two Hermes agents share one `~/.hermes/skills`
   directory, so a hand-made workaround link was deleted by the other agent's
   reconcile within minutes. The default link function now creates a
   **junction** on `win32` (`fs.symlink(source, target, "junction")`).
   Junctions report `isSymbolicLink()` and `readlink()` like symlinks, so the
   existing reconcile, repair and cleanup logic is unchanged. Callers that pass
   their own `linkSkill` (Codex, Cursor) are unaffected. Skill sources are
   always directories, which is what a junction requires.
2. `packages/adapters/hermes/src/server/execute.ts` passed the whole rendered
   prompt (instructions bundle + wake payload, 50-100 KB) as a `-q` argument.
   Since the 2026-09-26 Hermes update the launcher is `hermes.cmd`, which the
   adapter runs through `cmd.exe`, whose command line is capped at 8191 chars
   (`The command line is too long.`). The prompt is now written to a private
   scratch file under `%TEMP%\paperclip-hermes-prompts\` and passed with
   `--query-file` (Hermes CLI `hermes_cli/_parser.py`, present in the
   installed build `d0288be5b3`). The file is removed when the process exits.

Agent config on this instance: `위키 총괄` no longer overrides `hermesCommand`
(`hermes.exe` disappeared with the launcher change); both Hermes agents resolve
`hermes` from `PATH` (`E:\AX_WORKSPACE\runtime\Hermes\bin`). Backups of the
pre-change files: `E:\AX_WORKSPACE\backups\paperclip-hermes-adapter-fix-20260926\`.

---

## FL-008 — Upstream files that the 2026-09-26 reimport dropped

**Status:** fixed · **Added:** 2026-10-05

The 2026-09-26 reconstruction commit `3e8645713` copied the execution tree
through a `.gitignore`-respecting path, so 49 files that upstream **tracks but
also matches its own ignore rules** vanished from the fork tree: `.agents/skills/**`
(40 maintainer skill files), `packages/plugins/plugin-llm-wiki/tests/screenshots/*`
and `server/src/types/express.d.ts`. The live checkout still had them on disk
as ignored files, which hid the loss. In the 2026-10-05 merge the deletion side
won and the server typecheck reported 1,325 errors (`Property 'actor' does not
exist on type 'Request'`). They were restored from upstream `1c07b5903`.

Check after any tree reconstruction or merge:

```
comm -23 <(git ls-tree -r --name-only <upstream> | sort) <(git ls-tree -r --name-only HEAD | sort)
```

Every listed path must be an intentional fork deletion; today there are none.

---

## FL-009 — Server and helper-script fork changes re-applied on `cff331f6ca`

**Status:** active · **Added:** 2026-10-29

Upstream split `server/src/services/heartbeat.ts` into `heartbeat/*.ts`, so the
fork's heartbeat edits (committed in `b46be8c4c` / `57ce3450c5`) were re-applied
by hand on upstream's files. `git grep -n "FORK-LOCAL" -- server skills` lists
every block. Prefer taking upstream and re-applying these again over hand-merging.

| Change | Where now | Notes |
| --- | --- | --- |
| CMPA-487 issue adapter override compatibility | `heartbeat.ts` (right after `parseIssueAssigneeAdapterOverrides`) | Filtered once at the source, so router overrides, runtime/environment selection and the session fingerprint all see the filtered config. A task whose override is skipped may get one fresh session after the upgrade. |
| CMPA-277 pending-card recipient | `heartbeat/queue.ts` (`isPendingCardRecipient`, claim gate, `holderIsInteractionRecipient`, `blockedInteractionWake`) and the `issueThreadInteractions` import in `modules/run-dispatch/adapters/postgres.ts` | The auto-merge silently dropped that import (runtime `ReferenceError`); check it after every merge. `contextSnapshot` is persisted at claim only when the card path enriched it. |
| Legacy reassignment handoff (live patch 2026-10-01) | `modules/wake-queue/adapters/postgres.ts` pre-drain facts | Combined with upstream's `queuedOperatorStop` term. |
| CMPA-644 plugin issue listing window | `plugin-host-services.ts` `issues.list` | Upstream still slices the SQL page again (offset applied twice); kept alongside upstream's `readCondition`. |
| FL-002 issue-update helper | `skills/paperclip/scripts/paperclip-issue-update.sh` | Upstream added its own helper with the same name (retry, status echo check — SKILL.md relies on it). Kept upstream's interface; body goes through files and `node` instead of `jq` + argv (no `jq` here; argv mangles Hangul). |
| Upload-artifact response file | `skills/paperclip/scripts/paperclip-upload-artifact.sh` | Upstream's `helper_response_file` plus `cygpath -m` for native curl. |

| Hermes versioned skill relink (2026-10-29, after cutover) | `packages/adapters/hermes/src/server/skills.ts` `releaseStalePaperclipSkillLink` | Company skills now live in `<instance>/skills/<companyId>/__versions__/<skillId>/<versionId>`; a new version is a new directory while the old one still exists, and `ensurePaperclipSkillSymlink` only repairs dead links, so Hermes runs failed "occupied by another installation" after every skill update. A link into the same company skill root is now moved; any other live link still fails as upstream intends. Test: `index.test.ts` "moves a link from an older Paperclip-managed version". |

Dropped because upstream now covers them: the attention-feed indexed lookup
(2026-10-20 desk fix; upstream #15697 does the same) and the run-list
`jsonb_to_record` / default-200 backport (upstream `heartbeat/run-state.ts`).

Build notes for this revision: `packages/paperclip-runner` needs
`pnpm run build:typescript` (no cargo) before the server typechecks or starts,
and its scripts call `pnpm` by name, so a `pnpm` shim must be on `PATH`.
`packages/plugins/sdk` needs a `tsc` build too. The UI is served from
`ui/dist` (`pnpm run build` in `ui/`).

A freshly restored database has no planner statistics: the run list took 3.7 s
until `ANALYZE heartbeat_runs` (0.5 s after). Run `ANALYZE` after restoring a
backup or applying many migrations.

---

## Merging on this machine (Windows) — practical notes

1. **Commit the live checkout first.** Agents and desk sessions apply patches
   to the execution checkout without committing. On 2026-10-05 nineteen files
   (CMPA-487 heartbeat/adapter-override work, the account-router plugin, skill
   helper scripts) were committed as `ad590ee08` and `b46be8c4c` before
   branching. Files edited after the server started are on disk but not
   running until the next restart.
2. **Merge in a new worktree, never in the execution checkout.** The server
   runs from source through `tsx`; cut over by changing `PAPERCLIP_REPO` in
   `E:\AX_WORKSPACE\runtime\launchers\start-paperclip.cmd` and restarting.
3. **Runner build:** `build:binary` needs Rust `cargo`, which this machine does
   not have and the local adapters do not need. `pnpm --filter … typecheck`
   from the repo root also fails here with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
   Verify the server with `cd server && node ../node_modules/typescript/bin/tsc --noEmit`
   after `node ../../../scripts/ensure-plugin-build-deps.mjs` in
   `packages/plugins/sdk`.
4. **Run tests from the repo root.** Several server tests read
   `skills/paperclip/*` by relative path, and `locale-validation.test.ts` needs
   `npx vitest run --root ui …` from the root.
5. **Known environment-only failures** (not merge regressions):
   - Hermes `command-resolution.test.ts` (uses a `#!/bin/sh` fake CLI) and the
     symlink-conflict test in `src/index.test.ts` (needs Developer Mode).
   - `file-delivery-bridges.test.ts` (3 tests): the native runner file handoff
     verifies descriptors through `/proc/self/fd` or `/dev/fd`, which Windows
     lacks (`paperclip_runner_file_handoff_descriptor_unverifiable`), and the
     Bash helper hits "Sandbox callback bridge entrypoint upload sha mismatch".
     The same 3 fail identically on the 2026-10-05 checkout.
   - Under full-suite load, `ui/src/lib/sentry.test.ts` (2 tests) can time out;
     it passes 29/29 alone.
   - `companies-service.test.ts` "does not auto-provision bundled built-in
     agents": the test uses the default home `C:\Users\03jwo\.paperclip`, which
     is a junction to `E:\AX_WORKSPACE\runtime\paperclip-user-profile`, and the
     upstream instruction-path guard (#14420) rejects any link in the path. The
     production instance uses `--data-dir E:\AX_WORKSPACE\runtime\Paperclip-KO`,
     whose path has no links, and all 22 agents use managed instruction
     bundles, so production is not affected.
6. **Preview before cutover.** `paperclipai worktree init` fails on Windows
   with `EPERM` renaming its port-reservation lock owner file. Instead restore
   the latest hourly backup into an isolated embedded Postgres, run
   `applyPendingMigrations`, `quarantineSeededWorktreeExecutionState` and
   `pauseSeededScheduledRoutines` from `cli/src/commands/worktree.ts`, then
   pause agents and disable plugins in that copy before starting it with
   `HEARTBEAT_SCHEDULER_ENABLED=false`. Do not copy the production secrets key.
7. Claude prompt-cache directories under the instance hold junctions to
   `<execution checkout>/skills/*`; keep the previous checkout on disk after a
   cutover.
8. **Hermes skill junction after a cutover.** `ensurePaperclipSkillSymlink`
   leaves a link alone when it points at another directory that still exists,
   and `reconcileHermesPaperclipSkills` then fails with "is occupied by another
   installation". Because the previous checkout is kept on disk, the junction
   `C:\Users\03jwo\.hermes\skills\paperclip` kept pointing at it and the first
   Hermes run after the 2026-10-05 cutover failed. Remove only the junctions in
   that folder whose target is under the previous checkout's `skills\`; the
   next Hermes run recreates them against the new checkout.
9. **Graceful restart and PostgreSQL 18 on Windows.** On 2026-10-05 the
   Ctrl+C from `restart-paperclip-graceful.ps1` ended the server and plugin
   workers without a logged shutdown; the postmaster exited but an orphaned
   `postgres.exe --forkchild="io_worker"` kept the inherited listen socket, so
   port 54329 stayed "LISTENING" under the dead postmaster PID and
   `postmaster.pid` said `stopping`. Check the parent PID before assuming the
   database is still running. A second orphaned io_worker from an older
   embedded cluster under the previous checkout path also made the script's
   leftover-process check stop the restart.

---

## Not in this file

`start-paperclip.cmd` is a machine-specific launcher (absolute paths, CP949
encoding, CRLF). It is intentionally untracked and must not be committed.
