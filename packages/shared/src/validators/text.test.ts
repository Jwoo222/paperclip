import { describe, expect, it } from "vitest";
import {
  LOSSY_ENCODING_ERROR_CODE,
  MOJIBAKE_ERROR_CODE,
  looksLikeLossyEncoding,
  looksLikeMojibake,
  multilineTextSchema,
} from "./text.js";

// Shape of a CP949-encoded Korean body that was decoded as UTF-8: runs of U+FFFD
// with the occasional accidental Greek/Cyrillic letter, and "?" where the
// original encoder had no mapping (e.g. an em dash).
const mangled =
  "**CMPA-5** (blocked) ? Quick VOS " +
  "�α��� ���� ��� ".repeat(3);

describe("looksLikeMojibake", () => {
  it("flags CP949-decoded-as-UTF-8 style text", () => {
    expect(looksLikeMojibake(mangled)).toBe(true);
  });

  it("accepts ordinary Korean, English, and a stray replacement character", () => {
    expect(looksLikeMojibake("Quick VOS 셀프 가입·사용 흐름 완성 — 완료")).toBe(false);
    expect(looksLikeMojibake("Plain English body with no issues at all.")).toBe(false);
    expect(looksLikeMojibake("one bad byte � inside a long enough sentence should pass")).toBe(false);
    expect(looksLikeMojibake("")).toBe(false);
  });
});

describe("looksLikeLossyEncoding", () => {
  it("flags PowerShell ASCII-pipe damage (the real CMPA-50 comments)", () => {
    expect(looksLikeLossyEncoding("?????. ?? ??? ??????. resume: true")).toBe(true);
    expect(looksLikeLossyEncoding("?, ?????.")).toBe(true);
    expect(looksLikeLossyEncoding("?????????? ??? ??? ?????")).toBe(true);
  });

  it("leaves ordinary punctuation alone", () => {
    expect(looksLikeLossyEncoding("Really? Are you sure? I think so.")).toBe(false);
    expect(looksLikeLossyEncoding("어떻게 할까요? 확인 부탁드립니다.")).toBe(false);
    expect(looksLikeLossyEncoding("What?? Seriously?")).toBe(false);
    expect(looksLikeLossyEncoding("???")).toBe(false);
    expect(looksLikeLossyEncoding("")).toBe(false);
  });
});

describe("multilineTextSchema", () => {
  it("rejects corrupted bodies with an actionable message", () => {
    const result = multilineTextSchema.safeParse(mangled);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.code).toBe("custom");
      expect(issue?.message).toContain("--data-binary");
      expect(issue?.code === "custom" ? issue.params : undefined).toMatchObject({ code: MOJIBAKE_ERROR_CODE });
    }
  });

  it("rejects lossy-encoded bodies with PowerShell-specific guidance", () => {
    const result = multilineTextSchema.safeParse("?????. ?? ??? ??????. resume: true");
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue?.code).toBe("custom");
      expect(issue?.message).toContain("Invoke-RestMethod");
      expect(issue?.code === "custom" ? issue.params : undefined).toMatchObject({
        code: LOSSY_ENCODING_ERROR_CODE,
      });
    }
  });

  it("still normalizes escaped line breaks for healthy text", () => {
    expect(multilineTextSchema.parse("a\\nb")).toBe("a\nb");
    expect(multilineTextSchema.parse("한글 본문 — 그대로")).toBe("한글 본문 — 그대로");
    expect(multilineTextSchema.parse("정말요? 확인해 주시겠어요?")).toBe("정말요? 확인해 주시겠어요?");
  });
});
