/**
 * FORK-LOCAL (korean-localization). Not present upstream.
 *
 * Why this exists
 * ---------------
 * Paperclip issue identifiers are company-scoped: `identifier` is composed as
 * `${company.issuePrefix}-${companyWideCounter}` in server/src/services/issues.ts.
 * Projects have no prefix column, so a board full of `CMPA-41 … CMPA-54` gives no
 * hint about which project a row belongs to.
 *
 * Changing the identifier format is not an option: `/^[A-Z][A-Z0-9]*-\d+$/` is
 * hardcoded in packages/shared/src/issue-references.ts plus UI mention/autolink
 * parsing, and several places derive the *company* URL segment from the
 * identifier via `identifier.split("-")[0]`. So the project hint is added at the
 * display layer only — no schema, no server, no identifier change.
 *
 * Merge guidance for a future upstream-merge agent
 * ------------------------------------------------
 * This file is additive and upstream will never touch it. Its only consumer is a
 * ~5-line block in ui/src/components/IssueRow.tsx marked with the same
 * `FORK-LOCAL (project badge)` tag. If that file conflicts during a merge, take
 * upstream's version wholesale and re-apply the tagged block; nothing else here
 * depends on IssueRow internals.
 *
 * `deriveProjectCode` intentionally mirrors `deriveIssuePrefixBaseFromName` in
 * server/src/services/companies.ts so a project badge reads like a company
 * prefix. It is duplicated rather than shared because hoisting it into
 * packages/shared would require editing companies.ts, a file upstream changes
 * often. Keep the two in sync by hand if the server rule ever changes.
 */
import type { Project } from "@paperclipai/shared";

/**
 * Hangul initial consonants (choseong) in Unicode order, romanized. "ㅇ" is
 * silent in initial position and is skipped.
 */
const CHOSEONG_ROMAN = [
  "G", "K", "N", "D", "T", "R", "M", "B", "P", "S", "S", "", "J", "J", "C", "K", "T", "P", "H",
] as const;

const CODE_FALLBACK = "PRJ";

function hangulInitials(name: string): string {
  let out = "";
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) continue;
    const roman = CHOSEONG_ROMAN[Math.floor((code - 0xac00) / 588)] ?? "";
    if (!roman) continue;
    out += roman;
    if (out.length === 3) break;
  }
  return out;
}

function hashedCode(name: string): string {
  // FNV-1a (32-bit) folded into three base-26 letters: stable for the same name.
  let hash = 0x811c9dc5;
  for (const ch of name) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 3; i += 1) {
    out += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26);
  }
  return out;
}

/**
 * Derives a short, stable display code from a project name. Names containing
 * Latin letters keep their first three; Korean-only names use romanized Hangul
 * initials, then a stable hash, so distinct projects never collapse onto one
 * placeholder the way company prefixes used to.
 */
export function deriveProjectCode(name: string): string {
  const latin = name.toUpperCase().replace(/[^A-Z]/g, "");
  // Deliberate divergence from the server rule: a mostly-Korean name that
  // happens to contain a short English word ("윈도우 to 구글드라이브") would
  // otherwise yield that word — "TO" — which reads like a mistake. Requiring
  // three Latin letters sends such names to the Hangul branch instead.
  if (latin.length >= 3) return latin.slice(0, 3);
  const initials = hangulInitials(name);
  if (initials.length === 3) return initials;
  const trimmed = name.trim();
  if (trimmed.length === 0) return CODE_FALLBACK;
  // A one- or two-letter Latin name ("AB") is still better than a hash.
  if (latin.length > 0) return latin;
  return hashedCode(trimmed);
}

export interface ProjectCodeEntry {
  code: string;
  name: string;
}

/**
 * Builds a `projectId -> { code, name }` lookup. Two projects can derive the
 * same three letters, so collisions get a numeric suffix. Projects are ordered
 * by id first, which keeps the suffix assignment stable across refetches
 * regardless of the order the API returns rows in.
 */
export function buildProjectCodeMap(
  projects: readonly Pick<Project, "id" | "name">[] | undefined,
): Map<string, ProjectCodeEntry> {
  const map = new Map<string, ProjectCodeEntry>();
  if (!projects?.length) return map;
  const used = new Map<string, number>();
  for (const project of [...projects].sort((a, b) => a.id.localeCompare(b.id))) {
    const base = deriveProjectCode(project.name ?? "");
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    map.set(project.id, {
      code: seen === 0 ? base : `${base}${seen + 1}`,
      name: project.name ?? "",
    });
  }
  return map;
}
