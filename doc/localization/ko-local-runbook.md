# Korean local development runbook

## Start

From PowerShell:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\windows\start-paperclip-ko.ps1
```

The launcher uses these local-only defaults:

- source checkout: the current repository and branch
- data root: `%LOCALAPPDATA%\Paperclip-KO`
- instance: `default`
- web address: `http://127.0.0.1:3100`
- deployment mode: `local_trusted`, loopback only
- company deletion: disabled through the process environment

The default browser opens automatically after the health check succeeds. A desktop shortcut can
target this script through `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <script-path>`.

Close the launcher window or press `Ctrl+C` to stop the foreground server.

## Validate

```powershell
Invoke-RestMethod http://127.0.0.1:3100/api/health
corepack pnpm paperclipai doctor --data-dir "$env:LOCALAPPDATA\Paperclip-KO"
corepack pnpm --filter @paperclipai/ui typecheck
corepack pnpm check:token-gates
corepack pnpm audit --prod --audit-level high
```

This branch pins patched transitive dependencies so the production audit has no moderate, high, or
critical findings. Two low findings remain: one apparent package-name false positive for the local `cli`
workspace and one install-time dependency under the unused SQLite peer toolchain. Re-run the audit
after dependency updates because advisory results can change.

If a nested repository script resolves the Codex-bundled pnpm instead of the repository's pinned
pnpm 9.15.4, create and prepend a local Corepack shim before running the script:

```powershell
$paperclipCorepackBin = "$env:LOCALAPPDATA\Paperclip-KO\corepack-bin"
New-Item -ItemType Directory -Force -Path $paperclipCorepackBin | Out-Null
corepack enable pnpm --install-directory $paperclipCorepackBin
$env:PATH = "$paperclipCorepackBin;$env:PATH"
pnpm --version
```

The expected version is `9.15.4`.

## Codex agent defaults

Use an isolated Codex home under `%LOCALAPPDATA%\Paperclip-KO\codex-home` and authenticate it
separately with `codex login --device-auth`. Recommended agent adapter settings:

```json
{
  "command": "<absolute path to the npm-installed codex executable>",
  "cwd": "<agent workspace>",
  "model": "gpt-5.6-luna",
  "modelReasoningEffort": "medium",
  "dangerouslyBypassApprovalsAndSandbox": false,
  "extraArgs": ["--sandbox", "workspace-write", "--approve-for-me"],
  "env": {
    "CODEX_HOME": "<absolute path to Paperclip-KO\\codex-home>"
  }
}
```

Do not point an agent at the desktop app's shared `~/.codex` home and do not store API keys in
source files. Keep agents paused until their scope, workspace, and human-approval rules have been
reviewed.
