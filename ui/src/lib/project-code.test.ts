import { describe, expect, it } from "vitest";
import { buildProjectCodeMap, deriveProjectCode } from "./project-code";

describe("deriveProjectCode", () => {
  it("uses the first three Latin letters when the name has any", () => {
    expect(deriveProjectCode("Quick VOS")).toBe("QUI");
    expect(deriveProjectCode("Onboarding")).toBe("ONB");
    expect(deriveProjectCode("ab")).toBe("AB");
  });

  it("ignores a short English word inside an otherwise Korean name", () => {
    // "TO" would read like a mistake, so the Hangul branch wins instead.
    expect(deriveProjectCode("윈도우 to 구글드라이브 마이그레이션")).toBe("DGG");
  });

  it("romanizes Hangul initials when there are no Latin letters", () => {
    expect(deriveProjectCode("상품탐색툴")).toBe("SPT");
    expect(deriveProjectCode("메세지 요약")).toBe("MSJ");
  });

  it("is stable and distinguishes names the initials cannot separate", () => {
    expect(deriveProjectCode("아이오")).toBe(deriveProjectCode("아이오"));
    expect(deriveProjectCode("아이오")).not.toBe(deriveProjectCode("오이아"));
    expect(deriveProjectCode("아이오")).toMatch(/^[A-Z]{3}$/);
  });

  it("never returns an empty code", () => {
    expect(deriveProjectCode("")).toBe("PRJ");
    expect(deriveProjectCode("   ")).toBe("PRJ");
    expect(deriveProjectCode("!!!")).toMatch(/^[A-Z]{3}$/);
  });
});

describe("buildProjectCodeMap", () => {
  it("maps ids to codes and keeps the original name for the tooltip", () => {
    const map = buildProjectCodeMap([
      { id: "b", name: "Quick VOS" },
      { id: "a", name: "Onboarding" },
    ]);
    expect(map.get("b")).toEqual({ code: "QUI", name: "Quick VOS" });
    expect(map.get("a")).toEqual({ code: "ONB", name: "Onboarding" });
  });

  it("disambiguates colliding codes deterministically, whatever the input order", () => {
    const forward = buildProjectCodeMap([
      { id: "a", name: "Quick VOS" },
      { id: "b", name: "Quick Start" },
    ]);
    const reversed = buildProjectCodeMap([
      { id: "b", name: "Quick Start" },
      { id: "a", name: "Quick VOS" },
    ]);
    expect(forward.get("a")?.code).toBe("QUI");
    expect(forward.get("b")?.code).toBe("QUI2");
    expect(reversed.get("a")?.code).toBe(forward.get("a")?.code);
    expect(reversed.get("b")?.code).toBe(forward.get("b")?.code);
  });

  it("handles missing input without throwing", () => {
    expect(buildProjectCodeMap(undefined).size).toBe(0);
    expect(buildProjectCodeMap([]).size).toBe(0);
  });
});
