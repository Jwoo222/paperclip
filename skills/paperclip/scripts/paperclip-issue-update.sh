#!/usr/bin/env bash
#
# Update a Paperclip issue (status and/or comment) with a multiline markdown
# body read from stdin.
#
# The body is always sent with `--data-binary @file`, never as a curl argument.
# On Windows the Git-bundled curl.exe (MinGW build) receives non-ASCII argv
# through the ANSI code page (CP949 on Korean Windows): Korean turns into
# U+FFFD mojibake and characters such as "—" become "?". Passing the body
# through a file or stdin bypasses that conversion entirely. JSON encoding is
# done with node because jq is not guaranteed to be installed.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/paperclip-issue-update.sh [--issue-id ID] [--status STATUS] [--dry-run] <<'MD'
  Markdown body...
  MD

Reads the comment body from stdin. Use a quoted heredoc (<<'MD') so nothing is
expanded by the shell.

  --status given   -> PATCH /api/issues/{id}          {status, comment}
  --status absent  -> POST  /api/issues/{id}/comments {body}

Options:
  --issue-id ID    Issue id or identifier (default: PAPERCLIP_TASK_ID)
  --status STATUS  backlog | todo | in_progress | in_review | done | blocked | cancelled
  --dry-run        Print the resolved request without sending it
  -h, --help       Show this help

Required environment:
  PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID
  PAPERCLIP_TASK_ID unless --issue-id is given
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

issue_id="${PAPERCLIP_TASK_ID:-}"
status=""
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue-id)
      issue_id="${2:-}"
      shift 2
      ;;
    --status)
      status="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command node
require_command curl

if [[ -z "$issue_id" ]]; then
  printf 'No issue id. Pass --issue-id or set PAPERCLIP_TASK_ID.\n' >&2
  exit 1
fi

if [[ -n "$status" ]]; then
  case "$status" in
    backlog|todo|in_progress|in_review|done|blocked|cancelled) ;;
    *)
      printf 'Invalid --status: %s\n' "$status" >&2
      exit 1
      ;;
  esac
fi

body_file="$(mktemp)"
json_file="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "$body_file" "$json_file" "$response_file"' EXIT

# Raw bytes from stdin land in the file untouched (UTF-8 in, UTF-8 out).
cat > "$body_file"

if [[ ! -s "$body_file" ]]; then
  printf 'Empty body on stdin. Provide the markdown via a heredoc or a pipe.\n' >&2
  exit 1
fi

node -e '
const fs = require("node:fs");
const [bodyPath, outPath, status] = process.argv.slice(1);
const body = fs.readFileSync(bodyPath, "utf8").replace(/\r\n/g, "\n").replace(/\s+$/u, "");
if (!body) { process.stderr.write("Body is empty after trimming.\n"); process.exit(1); }
const payload = status ? { status, comment: body } : { body };
fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");
' "$body_file" "$json_file" "$status"

if [[ -n "$status" ]]; then
  method="PATCH"
  path_suffix="/api/issues/${issue_id}"
else
  method="POST"
  path_suffix="/api/issues/${issue_id}/comments"
fi

if [[ "$dry_run" -eq 1 ]]; then
  printf '%s %s\n' "$method" "$path_suffix"
  cat "$json_file"
  printf '\n'
  exit 0
fi

if [[ -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_API_KEY:-}" || -z "${PAPERCLIP_RUN_ID:-}" ]]; then
  printf 'Missing PAPERCLIP_API_URL, PAPERCLIP_API_KEY, or PAPERCLIP_RUN_ID.\n' >&2
  exit 1
fi

# Accept both ".../api" and bare origins for PAPERCLIP_API_URL.
api_base="${PAPERCLIP_API_URL%/}"
api_base="${api_base%/api}"
url="${api_base}${path_suffix}"

status_code="$(
  curl -sS -X "$method" -w '%{http_code}' -o "$response_file" \
    "$url" \
    -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
    -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data-binary @"$json_file"
)"

if [[ "$status_code" -lt 200 || "$status_code" -ge 300 ]]; then
  printf 'Paperclip API %s %s failed with HTTP %s:\n' "$method" "$path_suffix" "$status_code" >&2
  cat "$response_file" >&2
  printf '\n' >&2
  exit 1
fi

cat "$response_file"
printf '\n'
