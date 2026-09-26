import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n";
import { appDefinitionDescription } from "@/pages/apps/app-definition-display";
import { appCopyFor } from "./app-gallery-copy";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("app catalog localization", () => {
  it("translates shipped connector descriptions and preserves company-authored text", async () => {
    const shipped = "Connect Airtable's provider-hosted MCP server.";
    const custom = "Custom description written by this company";

    await i18n.changeLanguage("ko");
    expect(appDefinitionDescription({ description: shipped })).toBe("Airtable에 연결합니다.");
    expect(appDefinitionDescription({ description: custom })).toBe(custom);
    expect(appCopyFor("gmail").tagline).toContain("메일");

    await i18n.changeLanguage("en");
    expect(appDefinitionDescription({ description: shipped })).toBe(shipped);
  });
});
