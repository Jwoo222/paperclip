#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  paperclip-upload-artifact.sh FILE [options]

Uploads a generated file from the current workspace to the current Paperclip
issue, then creates an attachment-backed artifact work product by default.

Required environment for live uploads:
  PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID, PAPERCLIP_TASK_ID, PAPERCLIP_RUN_ID

Options:
  --issue-id ID          Issue id to attach to (default: PAPERCLIP_TASK_ID)
  --company-id ID        Company id (default: PAPERCLIP_COMPANY_ID)
  --title TEXT           Work product title (default: file basename)
  --summary TEXT         Work product summary
  --content-type TYPE    Override detected upload content type
  --status STATUS        Work product status (default: ready_for_review)
  --chat-comment TEXT    Bind this file to an explicit external-chat response
  --retry-unknown-upload Retry after an unresolved transport failure (duplicate risk)
  --no-work-product      Only upload the issue attachment
  --no-primary           Do not mark the artifact work product primary for its type
  --output FORMAT        markdown or json (default: markdown)
  --dry-run              Print resolved upload settings without calling the API
  --help, -h             Show this help

Examples:
  bash scripts/paperclip-upload-artifact.sh dist/demo.mp4 \
    --title "Demo video render" \
    --summary "MP4 render for board review"

  bash scripts/paperclip-upload-artifact.sh out/walkthrough.webm \
    --title "Walkthrough video" \
    --content-type video/webm

  bash scripts/paperclip-upload-artifact.sh out/result.png \
    --title "Generated image" \
    --chat-comment "Here is the requested image."
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

# Node is present in Paperclip local runtimes; jq is not guaranteed.
# Escape non-ASCII JSON output so Windows curl does not corrupt body arguments.
artifact_json() {
  node -e '
const fs = require("node:fs");
const [action, ...args] = process.argv.slice(1);
const input = () => JSON.parse(fs.readFileSync(0, "utf8"));
const emit = value => process.stdout.write(JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) + "\n");
switch (action) {
  case "indeterminate": process.exit(input().outcome === "indeterminate" ? 0 : 1); break;
  case "field": {
    const value = input();
    const [key] = args;
    const result = key === "downloadPath" ? (value?.downloadPath ?? (value?.contentPath ? value.contentPath + "?download=1" : ""))
      : key === "openPath" ? (value?.openPath ?? value?.contentPath ?? "")
      : value?.[key] ?? (key === "byteSize" ? 0 : "");
    process.stdout.write(String(result)); break;
  }
  case "dry-run": {
    const [file, issueId, companyId, title, summary, contentType, status, chatComment, createWorkProduct, isPrimary] = args;
    emit({file, issueId, companyId, title, summary, contentType, status, chatComment: chatComment || null, createWorkProduct: createWorkProduct === "true", isPrimary: isPrimary === "true"}); break;
  }
  case "find": {
    const [runId, sha256, originalFilename, contentType] = args;
    const match = input().find(a => a.originatingRunId === runId && (a.sha256 ?? "").toLowerCase() === sha256.toLowerCase() && (a.originalFilename ?? "") === originalFilename && (a.contentType ?? "").toLowerCase() === contentType.toLowerCase());
    if (match) emit(match); break;
  }
  case "work-product": {
    const [title, summary, status, runId, contentType, isPrimary] = args;
    const a = input();
    emit({type: "artifact", provider: "paperclip", title, summary: summary || null, status, reviewState: "none", isPrimary: isPrimary === "true", healthStatus: "unknown", createdByRunId: runId,
      metadata: {attachmentId: a.id, contentType, byteSize: a.byteSize ?? 0, contentPath: a.contentPath, openPath: a.openPath ?? a.contentPath, downloadPath: a.downloadPath ?? (a.contentPath + "?download=1"), originalFilename: a.originalFilename || null}}); break;
  }
  case "comment": emit({body: args[0], attachmentIds: [args[1]]}); break;
  case "result": emit({attachment: JSON.parse(args[0]), workProduct: JSON.parse(args[1]), chatComment: JSON.parse(args[2])}); break;
  default: throw new Error("Unknown artifact JSON action");
}
' "$@"
}

json_bool() {
  if [[ "${1:-0}" == "1" ]]; then
    printf 'true'
  else
    printf 'false'
  fi
}

detect_content_type() {
  local path="$1"
  local lower
  lower="$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')"

  case "$lower" in
    *.mp4|*.m4v) printf 'video/mp4' ;;
    *.webm) printf 'video/webm' ;;
    *.mov|*.qt) printf 'video/quicktime' ;;
    *.png) printf 'image/png' ;;
    *.jpg|*.jpeg) printf 'image/jpeg' ;;
    *.gif) printf 'image/gif' ;;
    *.webp) printf 'image/webp' ;;
    *.svg) printf 'image/svg+xml' ;;
    *.pdf) printf 'application/pdf' ;;
    *.txt|*.log) printf 'text/plain' ;;
    *.md|*.markdown) printf 'text/markdown' ;;
    *.json) printf 'application/json' ;;
    *.csv) printf 'text/csv' ;;
    *.html|*.htm) printf 'text/html' ;;
    *.zip) printf 'application/zip' ;;
    *)
      if command -v file >/dev/null 2>&1; then
        file --brief --mime-type "$path"
      else
        printf 'application/octet-stream'
      fi
      ;;
  esac
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- "$path" | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -- "$path" | awk '{print tolower($1)}'
  else
    printf 'Missing required command: sha256sum or shasum\n' >&2
    exit 1
  fi
}

sha256_text() {
  local value="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$value" | sha256sum | awk '{print tolower($1)}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$value" | shasum -a 256 | awk '{print tolower($1)}'
  else
    printf 'Missing required command: sha256sum or shasum\n' >&2
    exit 1
  fi
}

helper_state_directory() {
  printf '%s' "${PAPERCLIP_HELPER_STATE_DIR:-${PAPERCLIP_WORKSPACE_CWD:-$PWD}/.paperclip/artifact-helper}"
}

helper_response_file() {
  local directory
  directory="$(helper_state_directory)"
  # TMPDIR can name a controller-owned directory outside a CLI sandbox.
  local temp_path
  temp_path="$(umask 077; mkdir -p "$directory" && mktemp "$directory/response.XXXXXX")" || return 1
  # FORK-LOCAL: native curl cannot open MSYS /c/... paths with path conversion disabled.
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$temp_path"
  else
    printf "%s" "$temp_path"
  fi
}

request_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local response_file
  local status_code

  response_file="$(helper_response_file)"
  if [[ -n "$body" ]]; then
    status_code="$(
      curl -sS -X "$method" -w '%{http_code}' -o "$response_file" \
        "$url" \
        -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
        -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
        -H 'Content-Type: application/json' \
        --data-binary "$body"
    )" || { rm -f "$response_file"; return 1; }
  else
    status_code="$(
      curl -sS -X "$method" -w '%{http_code}' -o "$response_file" \
        "$url" \
        -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
        -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID"
    )" || { rm -f "$response_file"; return 1; }
  fi

  if [[ "$status_code" -lt 200 || "$status_code" -ge 300 ]]; then
    printf 'Request failed (%s): %s\n' "$status_code" "$url" >&2
    cat "$response_file" >&2
    printf '\n' >&2
    rm -f "$response_file"
    exit 1
  fi

  cat "$response_file"
  rm -f "$response_file"
}

upload_file() {
  local url="$1"
  local path="$2"
  local content_type="$3"
  local escaped_path
  local response_file
  local status_code
  local curl_status=0
  local indeterminate=0

  escaped_path="${path//\\/\\\\}"
  escaped_path="${escaped_path//\"/\\\"}"
  response_file="$(helper_response_file)"
  status_code="$(
    curl -sS -X POST -w '%{http_code}' -o "$response_file" \
      "$url" \
      -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
      -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
      -F "file=@\"${escaped_path}\";type=${content_type}"
  )" || curl_status=$?

  if [[ "$curl_status" -ne 0 ]]; then
    rm -f "$response_file"
    return 75
  fi

  if [[ "$status_code" -lt 200 || "$status_code" -ge 300 ]]; then
    printf 'Upload failed (%s): %s\n' "$status_code" "$url" >&2
    cat "$response_file" >&2
    printf '\n' >&2
    # The bridge uses a structured 409 outcome after a possibly committed
    # mutation. Keep the marker so the next invocation reconciles by listing.
    if [[ "$status_code" == "409" ]] && artifact_json indeterminate <"$response_file" >/dev/null 2>&1; then
      indeterminate=1
    fi
    rm -f "$response_file"
    if [[ "$status_code" == "408" || "$status_code" -ge 500 || "$indeterminate" == "1" ]]; then
      return 75
    fi
    return 1
  fi

  cat "$response_file"
  rm -f "$response_file"
}

operation_lock_path=""
operation_lock_owner=""
operation_lock_owner_file=""
operation_lock_held=0
operation_state_root=""

process_start_identity() {
  local pid="$1"
  ps -p "$pid" -o lstart= 2>/dev/null | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//'
}

release_operation_lock() {
  if [[ "$operation_lock_held" == "1" && -n "$operation_lock_path" ]]; then
    local current_owner=""
    current_owner="$(cat "$operation_lock_path" 2>/dev/null || true)"
    if [[ "$current_owner" == "$operation_lock_owner" ]]; then
      rm -f "$operation_lock_path"
    fi
    operation_lock_held=0
  fi
  if [[ -n "$operation_lock_owner_file" ]]; then
    rm -f "$operation_lock_owner_file"
  fi
}

acquire_operation_lock() {
  local operation_key="$1"
  local attempts=0

  umask 077
  operation_state_root="$(helper_state_directory)"
  mkdir -p "$operation_state_root"
  operation_lock_path="$operation_state_root/$operation_key.lock"
  operation_lock_owner="$$|$(process_start_identity "$$" || true)"
  # A hard link publishes the complete owner atomically without Windows symlink
  # privileges. Keep the owner file on the same filesystem as the lock.
  operation_lock_owner_file="$(mktemp "$operation_state_root/$operation_key.owner.XXXXXX")"
  printf '%s' "$operation_lock_owner" >"$operation_lock_owner_file"
  trap release_operation_lock EXIT
  while ! ln "$operation_lock_owner_file" "$operation_lock_path" 2>/dev/null; do
    local owner_pid=""
    local owner_start=""
    local current_lock_owner=""
    current_lock_owner="$(cat "$operation_lock_path" 2>/dev/null || true)"
    IFS='|' read -r owner_pid owner_start <<<"$current_lock_owner"
    if [[ "$owner_pid" =~ ^[0-9]+$ ]]; then
      local current_owner_start=""
      current_owner_start="$(process_start_identity "$owner_pid" || true)"
      if ! kill -0 "$owner_pid" 2>/dev/null ||
        [[ -n "$owner_start" && -n "$current_owner_start" && "$owner_start" != "$current_owner_start" ]]; then
        # Serialize stale-lock reclamation separately. Without this guard, two
        # contenders can both observe the old owner and the slower one can
        # delete the faster contender's newly acquired live lock.
        local reclaim_lock_path="$operation_lock_path.reclaim"
        if mkdir "$reclaim_lock_path" 2>/dev/null; then
          local guarded_owner=""
          guarded_owner="$(cat "$operation_lock_path" 2>/dev/null || true)"
          if [[ "$guarded_owner" == "$current_lock_owner" ]]; then
            rm -f "$operation_lock_path"
          fi
          rmdir "$reclaim_lock_path" 2>/dev/null || true
          continue
        fi
      fi
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge 400 ]]; then
      printf 'Another matching artifact upload is still in progress; retry after it finishes.\n' >&2
      exit 1
    fi
    sleep 0.05
  done
  operation_lock_held=1
}

file_path=""
issue_id="${PAPERCLIP_TASK_ID:-}"
company_id="${PAPERCLIP_COMPANY_ID:-}"
title=""
summary=""
content_type=""
status="ready_for_review"
chat_comment=""
create_work_product=1
is_primary=1
output_format="markdown"
dry_run=0
retry_unknown_upload=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue-id)
      issue_id="${2:-}"
      shift 2
      ;;
    --company-id)
      company_id="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --summary)
      summary="${2:-}"
      shift 2
      ;;
    --content-type)
      content_type="${2:-}"
      shift 2
      ;;
    --status)
      status="${2:-}"
      shift 2
      ;;
    --chat-comment)
      chat_comment="${2:-}"
      shift 2
      ;;
    --no-work-product)
      create_work_product=0
      shift
      ;;
    --retry-unknown-upload)
      retry_unknown_upload=1
      shift
      ;;
    --no-primary)
      is_primary=0
      shift
      ;;
    --output)
      output_format="${2:-}"
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
    --*)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$file_path" ]]; then
        printf 'Unexpected positional argument: %s\n' "$1" >&2
        usage >&2
        exit 1
      fi
      file_path="$1"
      shift
      ;;
  esac
done

if [[ -z "$file_path" ]]; then
  printf 'Missing file path.\n' >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$file_path" ]]; then
  printf 'Artifact file does not exist: %s\n' "$file_path" >&2
  exit 1
fi

# Normalize native backslashes before basename/hash/upload. Otherwise basename
# treats the whole Windows path as a filename and sha256sum escapes its digest.
if command -v cygpath >/dev/null 2>&1; then
  file_path="$(cygpath -m "$file_path")"
fi

if [[ "$output_format" != "markdown" && "$output_format" != "json" ]]; then
  printf 'Unsupported output format: %s\n' "$output_format" >&2
  exit 1
fi

if [[ -n "$chat_comment" && "$create_work_product" != "1" ]]; then
  printf '%s\n' '--chat-comment requires the attachment-backed work product created by this helper.' >&2
  exit 1
fi

require_command curl
require_command node

if [[ -z "$title" ]]; then
  title="$(basename "$file_path")"
fi

if [[ -z "$content_type" ]]; then
  content_type="$(detect_content_type "$file_path")"
fi

if [[ "$dry_run" == "1" ]]; then
  create_work_product_json="$(json_bool "$create_work_product")"
  is_primary_json="$(json_bool "$is_primary")"
  artifact_json dry-run "$file_path" "$issue_id" "$company_id" "$title" "$summary" "$content_type" "$status" "$chat_comment" "$create_work_product_json" "$is_primary_json"
  exit 0
fi

if [[ -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_API_KEY:-}" || -z "${PAPERCLIP_RUN_ID:-}" ]]; then
  printf 'Missing PAPERCLIP_API_URL, PAPERCLIP_API_KEY, or PAPERCLIP_RUN_ID.\n' >&2
  exit 1
fi

if [[ -z "$issue_id" || -z "$company_id" ]]; then
  printf 'Missing issue or company id. Pass --issue-id/--company-id or set PAPERCLIP_TASK_ID/PAPERCLIP_COMPANY_ID.\n' >&2
  exit 1
fi

api_root="${PAPERCLIP_API_URL%/}"
case "$api_root" in
  */api) api_base="$api_root" ;;
  *) api_base="$api_root/api" ;;
esac
file_sha256="$(sha256_file "$file_path")"
original_filename="$(basename "$file_path")"
operation_key="$(
  sha256_text "$api_base|$company_id|$issue_id|$PAPERCLIP_RUN_ID|$original_filename|$file_sha256|$content_type"
)"
acquire_operation_lock "$operation_key"
trap release_operation_lock EXIT

attachment=""
reused_attachment=0
unknown_upload_marker="$operation_state_root/$operation_key.uncertain"
lookup_attempts=1
if [[ -f "$unknown_upload_marker" && "$retry_unknown_upload" != "1" ]]; then
  lookup_attempts=20
fi
for ((lookup_attempt = 1; lookup_attempt <= lookup_attempts; lookup_attempt++)); do
  existing_attachments="$(request_json GET "$api_base/issues/$issue_id/attachments")"
  attachment="$(
    artifact_json find "$PAPERCLIP_RUN_ID" "$file_sha256" "$original_filename" "$content_type" <<<"$existing_attachments"
  )"
  if [[ -n "$attachment" ]]; then
    reused_attachment=1
    rm -f "$unknown_upload_marker"
    break
  fi
  if [[ "$lookup_attempt" -lt "$lookup_attempts" ]]; then
    sleep 0.25
  fi
done

if [[ -z "$attachment" && -f "$unknown_upload_marker" && "$retry_unknown_upload" != "1" ]]; then
  printf '%s\n' 'A previous matching upload ended without a definitive response, and Paperclip has not exposed its durable attachment yet.' >&2
  printf '%s\n' 'Retry this command later. If the upload definitely did not commit, pass --retry-unknown-upload to accept the duplicate-file risk.' >&2
  exit 1
fi

if [[ -z "$attachment" ]]; then
  rm -f "$unknown_upload_marker"
  : >"$unknown_upload_marker"
  upload_status=0
  attachment="$(
    upload_file \
      "$api_base/companies/$company_id/issues/$issue_id/attachments" \
      "$file_path" \
      "$content_type"
  )" || upload_status=$?
  if [[ "$upload_status" -ne 0 ]]; then
    if [[ "$upload_status" -ne 75 ]]; then
      rm -f "$unknown_upload_marker"
    fi
    exit 1
  fi
fi

attachment_id="$(artifact_json field id <<<"$attachment")"
content_path="$(artifact_json field contentPath <<<"$attachment")"
download_path="$(artifact_json field downloadPath <<<"$attachment")"
if [[ -z "$attachment_id" || -z "$content_path" || -z "$download_path" ]]; then
  printf 'Upload response did not include attachment path metadata.\n' >&2
  printf '%s\n' "$attachment" >&2
  exit 1
fi
rm -f "$unknown_upload_marker"

work_product="null"
if [[ "$create_work_product" == "1" ]]; then
  is_primary_json="$(json_bool "$is_primary")"
  work_product_payload="$(
    artifact_json work-product "$title" "$summary" "$status" "$PAPERCLIP_RUN_ID" "$content_type" "$is_primary_json" <<<"$attachment"
  )"

  work_product="$(
    request_json \
      POST \
      "$api_base/issues/$issue_id/work-products" \
      "$work_product_payload"
  )"
fi

chat_response="null"
if [[ -n "$chat_comment" ]]; then
  chat_comment_payload="$(
    artifact_json comment "$chat_comment" "$attachment_id"
  )"
  chat_response="$(
    request_json \
      POST \
      "$api_base/issues/$issue_id/comments" \
      "$chat_comment_payload"
  )"
  chat_comment_id="$(artifact_json field id <<<"$chat_response")"
  if [[ -z "$chat_comment_id" ]]; then
    printf 'Chat attachment response did not include a comment id.\n' >&2
    exit 1
  fi
fi

if [[ "$output_format" == "json" ]]; then
  artifact_json result "$attachment" "$work_product" "$chat_response"
  exit 0
fi

work_product_id="$(artifact_json field id <<<"$work_product")"

if [[ "$reused_attachment" == "1" ]]; then
  printf 'Reused matching artifact from this run\n\n'
else
  printf 'Uploaded artifact\n\n'
fi
printf -- '- Attachment: [%s](%s)\n' "$title" "$content_path"
printf -- '- Download: [%s](%s)\n' "$title" "$download_path"
printf -- '- Attachment ID: `%s`\n' "$attachment_id"
if [[ -n "$work_product_id" ]]; then
  printf -- '- Work product ID: `%s`\n' "$work_product_id"
fi
if [[ -n "$chat_comment" ]]; then
  printf -- '- Paperclip comment binding: saved. External publication requires an authorized active chat origin; this helper does not confirm provider delivery.\n'
fi
printf '\nFinal comment snippet:\n\n'
printf -- '- Artifact: [%s](%s)\n' "$title" "$content_path"
