import { describe, expect, it } from "vitest";
import {
  deriveIssuePrefixBase,
  normalizeExplicitIssuePrefix,
} from "../services/issue-prefix.js";

describe("deriveIssuePrefixBase", () => {
  it("keeps the existing behaviour for names with Latin letters", () => {
    expect(deriveIssuePrefixBase("Aron & Sharon")).toBe("ARO");
    expect(deriveIssuePrefixBase("Paperclip")).toBe("PAP");
    expect(deriveIssuePrefixBase("Quick VOS 도구")).toBe("QUI");
    expect(deriveIssuePrefixBase("ab")).toBe("AB");
  });

  it("romanizes Hangul initial consonants instead of falling back to CMP", () => {
    // 셀(ㅅ) 러(ㄹ) 의(ㅇ, silent → skipped) 도(ㄷ)
    expect(deriveIssuePrefixBase("셀러의 도구함")).toBe("SRD");
    expect(deriveIssuePrefixBase("마케팅 채널")).toBe("MKT");
    expect(deriveIssuePrefixBase("페이퍼클립")).toBe("PPK");
  });

  it("derives a deterministic hash-based code when no usable letters exist", () => {
    const first = deriveIssuePrefixBase("아이오");
    const second = deriveIssuePrefixBase("아이오");
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Z]{3}$/);
    expect(deriveIssuePrefixBase("!!!")).toMatch(/^[A-Z]{3}$/);
    expect(deriveIssuePrefixBase("   ")).toMatch(/^[A-Z]{3}$/);
  });

  it("differs for different Hangul-only names", () => {
    expect(deriveIssuePrefixBase("아이오")).not.toBe(deriveIssuePrefixBase("오이아"));
  });
});

describe("normalizeExplicitIssuePrefix", () => {
  it("uppercases and accepts valid prefixes", () => {
    expect(normalizeExplicitIssuePrefix("sdt")).toBe("SDT");
    expect(normalizeExplicitIssuePrefix("  Vos2 ")).toBe("VOS2");
  });

  it("rejects prefixes that would not be URL-safe identifiers", () => {
    expect(normalizeExplicitIssuePrefix("셀러")).toBeUndefined();
    expect(normalizeExplicitIssuePrefix("1AB")).toBeUndefined();
    expect(normalizeExplicitIssuePrefix("A")).toBeUndefined();
    expect(normalizeExplicitIssuePrefix("TOOLONG1")).toBeUndefined();
    expect(normalizeExplicitIssuePrefix("")).toBeUndefined();
    expect(normalizeExplicitIssuePrefix(undefined)).toBeUndefined();
  });
});
