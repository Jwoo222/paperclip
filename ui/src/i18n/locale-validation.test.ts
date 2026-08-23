import { describe, expect, it } from "vitest";
import { i18n, t } from ".";
import { localeMessages, SOURCE_LOCALE } from "./locales";
import { validateLocaleMessages } from "./locale-validation";

const en = localeMessages[SOURCE_LOCALE]!;

describe("locale validation", () => {
  it("resolves English messages with key and default fallbacks", async () => {
    await i18n.changeLanguage("en");
    expect(t("app.noCompanies.title")).toBe("Create your first company");
    expect(t("app.missing", { defaultValue: "Fallback" })).toBe("Fallback");
    expect(t("app.missing")).toBe("app.missing");
  });

  it("accepts registered locale files", () => {
    expect(Object.keys(localeMessages)).toContain("en");
    for (const [locale, messages] of Object.entries(localeMessages)) {
      expect(
        validateLocaleMessages(messages, en, { allowMissing: locale !== SOURCE_LOCALE }),
        locale,
      ).toEqual([]);
    }
  });

  it("allows missing localized keys for English fallback and rejects extra nested keys", () => {
    expect(
      validateLocaleMessages(
        {
          app: {
            noCompanies: {
              title: "첫 회사를 만드세요",
              unexpected: "Unexpected",
            },
          },
        },
        en,
        { allowMissing: true },
      ),
    ).toEqual(
      expect.arrayContaining([
        "app.noCompanies.unexpected is not defined in English",
      ]),
    );
  });

  it("rejects non-string leaves", () => {
    expect(
      validateLocaleMessages(
        {
          app: {
            noCompanies: {
              title: ["Create your first company"],
            },
          },
        },
        en,
        { allowMissing: true },
      ),
    ).toEqual(expect.arrayContaining(["app.noCompanies.title must be a string"]));
  });

  it("preserves interpolation, printf placeholders, tags, and links", () => {
    const reference = {
      notice: "Hello {{name}}: %s <strong>open</strong> [docs](https://example.com/docs)",
    };

    expect(
      validateLocaleMessages(
        { notice: "{{name}}님: %s <strong>열기</strong> [문서](https://example.com/docs)" },
        reference,
      ),
    ).toEqual([]);

    expect(
      validateLocaleMessages(
        { notice: "안녕하세요 %d <em>열기</em> [문서](https://example.com/ko)" },
        reference,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("interpolation placeholders must match"),
        expect.stringContaining("printf placeholders must match"),
        expect.stringContaining("HTML tags must match"),
        expect.stringContaining("URLs must match"),
        expect.stringContaining("Markdown link targets must match"),
      ]),
    );
  });

  it("requires interpolation placeholders to match English", () => {
    const reference = {
      message: "Invite {{name}} to {{company}}",
    };

    expect(validateLocaleMessages({ message: "Invite {{name}}" }, reference)).toEqual([
      'message interpolation placeholders must match English exactly: expected ["company","name"], received ["name"]',
    ]);
  });

  it("rejects executable, raw HTML, and unexpected link payloads not present in English", () => {
    const reference = {
      script: "Create company",
      handler: "Create company",
      js: "Create company",
      data: "Create company",
      url: "Create company",
      html: "Create company",
    };

    expect(
      validateLocaleMessages(
        {
          script: "<script>alert(1)</script>",
          handler: '<span ONCLICK="alert(1)">Create</span>',
          js: "javascript:alert(1)",
          data: "data:text/html,hello",
          url: "https://example.test",
          html: "<strong>Create company</strong>",
        },
        reference,
      ),
    ).toEqual(
      expect.arrayContaining([
        "script contains disallowed <script",
        "handler contains disallowed event-handler attribute",
        "js contains disallowed javascript:",
        "data contains disallowed data:",
        "url contains disallowed unexpected URL",
        "html contains disallowed raw HTML tag",
      ]),
    );
  });

  it("caps localized string length relative to English", () => {
    expect(validateLocaleMessages({ message: "x".repeat(200) }, { message: "Short" })).toEqual([
      "message is too long: 200 characters exceeds 133",
    ]);
  });
});
