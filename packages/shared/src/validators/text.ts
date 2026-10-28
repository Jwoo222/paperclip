import { z } from "zod";

export function normalizeEscapedLineBreaks(value: string): string {
  // Recover legacy single-line payloads that encoded their own line breaks.
  // A real multiline body already has decoded transport newlines; decoding
  // it again corrupts literal escapes in JSON, code, paths and agent prompts.
  if (/[\r\n]/.test(value)) return value;
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

const MOJIBAKE_MIN_REPLACEMENTS = 8;
const MOJIBAKE_MIN_RATIO = 0.1;

const LOSSY_MIN_QUESTION_MARKS = 6;
const LOSSY_MIN_RATIO = 0.15;

export const MOJIBAKE_ERROR_CODE = "text_mojibake_detected";
export const LOSSY_ENCODING_ERROR_CODE = "text_lossy_encoding_detected";

/**
 * Detects text that was mis-decoded before it reached the API — typically
 * CP949/EUC-KR bytes read as UTF-8, where every Hangul syllable collapses into
 * one or two U+FFFD replacement characters. Healthy text never carries this
 * density of replacement characters, so the check is intentionally strict:
 * both an absolute count and a ratio against visible characters must trip.
 */
export function looksLikeMojibake(value: string): boolean {
  const replacements = value.split("�").length - 1;
  if (replacements < MOJIBAKE_MIN_REPLACEMENTS) return false;
  const visible = value.replace(/\s+/g, "").length;
  return replacements / Math.max(visible, 1) >= MOJIBAKE_MIN_RATIO;
}

/**
 * Detects text whose non-ASCII characters were destroyed during *encoding* —
 * every unmappable character becomes "?" (U+003F), so unlike mojibake the
 * original bytes are gone. On Windows this is what a headless PowerShell does
 * when text is piped to a native command: `$OutputEncoding` defaults to ASCII,
 * so Hangul collapses to runs of "?".
 *
 * Ordinary prose never reaches this shape, so three conditions must all hold:
 * an absolute count, a high ratio against visible characters, and at least one
 * run of consecutive "?" (which real punctuation essentially never produces).
 */
export function looksLikeLossyEncoding(value: string): boolean {
  const questionMarks = value.split("?").length - 1;
  if (questionMarks < LOSSY_MIN_QUESTION_MARKS) return false;
  if (!/\?\?/.test(value)) return false;
  const visible = value.replace(/\s+/g, "").length;
  return questionMarks / Math.max(visible, 1) >= LOSSY_MIN_RATIO;
}

export function rejectMojibake(value: string, ctx: z.RefinementCtx) {
  if (looksLikeMojibake(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      params: { code: MOJIBAKE_ERROR_CODE },
      message:
        "Text contains a high density of U+FFFD replacement characters, which means it was corrupted before it reached the API " +
        "(usually CP949/EUC-KR bytes decoded as UTF-8; in a bash/MinGW shell this happens when non-ASCII text is passed as a curl argument). " +
        "Re-send the body from a UTF-8 file or stdin (curl --data-binary @file or @-), e.g. scripts/paperclip-issue-update.sh. " +
        "본문이 손상된 인코딩으로 도착했습니다. 한글을 curl 인자에 넣지 말고 UTF-8 파일이나 stdin(--data-binary @-)으로 다시 보내세요.",
    });
    return;
  }
  if (looksLikeLossyEncoding(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      params: { code: LOSSY_ENCODING_ERROR_CODE },
      message:
        "Text contains runs of \"?\" where non-ASCII characters should be, which means they were lost during encoding and cannot be recovered " +
        "(on Windows this happens when text is piped to a native command from PowerShell, whose $OutputEncoding defaults to ASCII). " +
        "Do not pipe the body: write it to a UTF-8 file and send it as an argument (curl.exe --data-binary \"@file\"), " +
        "or use Invoke-RestMethod with -Body ([Text.Encoding]::UTF8.GetBytes($json)). See scripts/paperclip-issue-update.ps1. " +
        "한글이 인코딩 과정에서 물음표로 소실됐습니다. PowerShell 파이프(|)로 보내지 말고, UTF-8 파일에 쓴 뒤 인자로 전달하거나 Invoke-RestMethod 에 UTF-8 바이트로 보내세요.",
    });
  }
}

export const multilineTextSchema = z
  .string()
  .transform(normalizeEscapedLineBreaks)
  .superRefine(rejectMojibake);
