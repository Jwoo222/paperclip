#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/paperclip-issue-update.sh [--issue-id ID] [--status STATUS] [--comment TEXT] [--dry-run]

Reads a multiline markdown comment from stdin when stdin is piped. This preserves
newlines when building the JSON payload for PATCH /api/issues/{issueId}.

Examples:
  scripts/paperclip-issue-update.sh --issue-id "$PAPERCLIP_TASK_ID" --status in_progress <<'MD'
  Investigating formatting

  - Pulled the raw comment body
  - Comparing it with the run transcript
  MD

  scripts/paperclip-issue-update.sh --issue-id "$PAPERCLIP_TASK_ID" --status done --dry-run <<'MD'
  Done

  - Fixed the issue update helper
  MD
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
comment_arg=""
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
    --comment)
      comment_arg="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$issue_id" ]]; then
  printf 'Missing issue id. Pass --issue-id or set PAPERCLIP_TASK_ID.\n' >&2
  exit 1
fi

comment=""
if [[ -n "$comment_arg" ]]; then
  comment="$comment_arg"
elif [[ ! -t 0 ]]; then
  comment="$(cat)"
fi

require_command node

# FORK-LOCAL (FL-002): on Korean Windows, Git Bash/MinGW curl.exe and native argv
# go through the ANSI code page, so Hangul in an argument arrives as mojibake.
# Keep the body in files end to end: bash writes the raw bytes, node builds the
# JSON (jq is not installed on this host), and curl sends it with @file.
native_temp_file() {
  local temp_path
  temp_path="$(mktemp)"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$temp_path"
  else
    printf '%s' "$temp_path"
  fi
}
comment_file="$(native_temp_file)"
payload_file="$(native_temp_file)"
trap 'rm -f "$comment_file" "$payload_file"' EXIT
printf '%s' "$comment" > "$comment_file"
node -e '
const fs = require("node:fs");
const [commentPath, outPath, status] = process.argv.slice(1);
const comment = fs.readFileSync(commentPath, "utf8");
const payload = { ...(status ? { status } : {}), ...(comment ? { comment } : {}) };
fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");
' "$comment_file" "$payload_file" "$status"
payload="$(cat "$payload_file")"

if [[ "$dry_run" == "1" ]]; then
  printf '%s\n' "$payload"
  exit 0
fi

if [[ -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_API_KEY:-}" || -z "${PAPERCLIP_RUN_ID:-}" ]]; then
  printf 'Missing PAPERCLIP_API_URL, PAPERCLIP_API_KEY, or PAPERCLIP_RUN_ID.\n' >&2
  exit 1
fi

# A successful PATCH always returns the updated issue JSON. An empty body or a
# connection-level failure means the write did NOT land, even when a pipeline
# exit code says otherwise, so verify the response instead of inferring success.
# Two attempts total: the shared heartbeat policy stops a control-plane write
# after two consecutive failures, so the helper must not send a third.
max_attempts=2
attempt=1
while :; do
  http_code=""
  body=""
  set +e
  response="$(
    curl -sS -m 30 -X PATCH \
      "$PAPERCLIP_API_URL/api/issues/$issue_id" \
      -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
      -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
      -H 'Content-Type: application/json' \
      --data-binary @"$payload_file" \
      -w '\n%{http_code}'
  )"
  curl_exit=$?
  set -e

  if [[ "$curl_exit" -eq 0 ]]; then
    http_code="${response##*$'\n'}"
    body="${response%$'\n'*}"
  fi

  if [[ "$curl_exit" -eq 0 && "$http_code" == 2* ]]; then
    if [[ -z "$body" ]]; then
      printf 'Issue update FAILED: HTTP %s with an empty response body. A real update echoes the issue JSON; treat this write as not saved.\n' "$http_code" >&2
      exit 1
    fi
    if [[ -n "$status" ]]; then
      returned_status="$(node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { try { const v = JSON.parse(s).status; if (v != null) process.stdout.write(String(v)); } catch {} });' <<<"$body" 2>/dev/null || true)"
      if [[ "$returned_status" != "$status" ]]; then
        printf 'Issue update FAILED: server echoed status %s instead of requested %s.\n' "${returned_status:-<none>}" "$status" >&2
        printf '%s\n' "$body" >&2
        exit 1
      fi
    fi
    printf '%s\n' "$body"
    exit 0
  fi

  # 4xx (other than 429) is a definitive rejection; retrying cannot change it.
  if [[ "$curl_exit" -eq 0 && "$http_code" == 4* && "$http_code" != "429" ]]; then
    printf 'Issue update rejected (HTTP %s).\n' "$http_code" >&2
    [[ -n "$body" ]] && printf '%s\n' "$body" >&2
    exit 1
  fi

  if (( attempt >= max_attempts )); then
    printf 'Issue update FAILED after %d attempts (curl exit %s, HTTP %s). The status/comment was NOT saved — report this write as failed, do not assume it landed.\n' "$max_attempts" "$curl_exit" "${http_code:-000}" >&2
    [[ -n "$body" ]] && printf '%s\n' "$body" >&2
    exit 1
  fi

  printf 'Issue update attempt %d/%d failed (curl exit %s, HTTP %s); retrying...\n' "$attempt" "$max_attempts" "$curl_exit" "${http_code:-000}" >&2
  sleep $((attempt * 2))
  attempt=$((attempt + 1))
done
