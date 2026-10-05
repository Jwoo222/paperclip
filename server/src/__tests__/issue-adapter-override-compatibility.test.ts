import { describe, expect, it } from "vitest";
import { resolveIssueAdapterConfigOverride } from "../services/issue-adapter-override-compatibility.js";

const gpt = { model: "gpt-6-luna", effort: "low" };

describe("issue adapter override compatibility", () => {
  it.each(["hermes_local", "codex_local"])("preserves GPT overrides on %s", (type) => {
    expect(resolveIssueAdapterConfigOverride(gpt, type)).toEqual({ adapterConfig: gpt, skippedReasons: [] });
  });
  it("skips the whole incompatible config without mutating the stored override", () => {
    expect(resolveIssueAdapterConfigOverride(gpt, "claude_local")).toEqual({
      adapterConfig: null, skippedReasons: ["model_family_mismatch"],
    });
    expect(gpt).toEqual({ model: "gpt-6-luna", effort: "low" });
    expect(resolveIssueAdapterConfigOverride(gpt, "hermes_local").adapterConfig).toEqual(gpt);
  });
  it.each(["hermes_local", "codex_local"])("ignores legacy Claude designation on %s", (type) => {
    expect(resolveIssueAdapterConfigOverride({ model: "claude-opus-4-6" }, type).skippedReasons).toEqual(["model_family_mismatch"]);
  });
  it.each(["claude-opus-4-6", "claude-opus-5-5", "anthropic/claude-opus-5-5"])("keeps legacy compatible model %s", (model) => {
    expect(resolveIssueAdapterConfigOverride({ model }, "claude_local").adapterConfig).toEqual({ model });
  });
  it.each(["gpt-6-luna", "openai/gpt-6-luna", "o3", "o4-mini"])("recognizes GPT model %s", (model) => {
    expect(resolveIssueAdapterConfigOverride({ model }, "codex_local").adapterConfig).toEqual({ model });
  });
  it.each(["alias", "", null, 42])("does not forward unknown model %s to a fixed-family adapter", (model) => {
    expect(resolveIssueAdapterConfigOverride({ model }, "claude_local")).toEqual({
      adapterConfig: null, skippedReasons: ["unknown_model_family"],
    });
  });
  it("drops retired modelProfile while retaining compatible fields", () => {
    const stored = { modelProfile: "cheap", model: "gpt-6-luna", effort: "low" };
    expect(resolveIssueAdapterConfigOverride(stored, "hermes_local")).toEqual({
      adapterConfig: gpt, skippedReasons: ["obsolete_model_profile"],
    });
    expect(stored.modelProfile).toBe("cheap");
  });
  it("makes cancelled modelProfile-only tasks safe to reopen", () => {
    expect(resolveIssueAdapterConfigOverride({ modelProfile: "cheap" }, "hermes_local")).toEqual({
      adapterConfig: null, skippedReasons: ["obsolete_model_profile"],
    });
  });
  it("leaves non-model configuration and other adapter types unchanged", () => {
    expect(resolveIssueAdapterConfigOverride({ effort: "low" }, "codex_local").adapterConfig).toEqual({ effort: "low" });
    expect(resolveIssueAdapterConfigOverride({ model: "custom" }, "opencode_local").adapterConfig).toEqual({ model: "custom" });
    expect(resolveIssueAdapterConfigOverride(null, "claude_local").skippedReasons).toEqual([]);
  });
});
