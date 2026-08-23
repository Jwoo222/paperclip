import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import {
  getConfiguredRuntimeServicePortWarnings,
  readConfiguredRuntimeServicePorts,
  updateConfiguredRuntimeServicePort,
} from "./ExecutionWorkspaceDetail";

describe("execution workspace service port configuration", () => {
  it("reads commands and legacy services, then saves a fixed port without mutating the source config", () => {
    const runtimeConfig = {
      commands: [
        { id: "web", name: "Web app", kind: "service", command: "pnpm dev", port: { type: "auto" } },
        { id: "migrate", name: "Migrate", kind: "job", command: "pnpm db:migrate" },
      ],
      services: [{ name: "Legacy", command: "pnpm legacy", port: 3100 }],
    };

    const services = readConfiguredRuntimeServicePorts(runtimeConfig);
    expect(services).toEqual([
      { collection: "commands", index: 0, name: "Web app", port: null, invalidPort: false },
      { collection: "services", index: 0, name: "Legacy", port: 3100, invalidPort: false },
    ]);

    expect(updateConfiguredRuntimeServicePort({
      runtimeConfig,
      service: services[0]!,
      port: "4200",
    })).toEqual({
      commands: [
        { id: "web", name: "Web app", kind: "service", command: "pnpm dev", port: { type: "fixed", value: 4200 } },
        { id: "migrate", name: "Migrate", kind: "job", command: "pnpm db:migrate" },
      ],
      services: [{ name: "Legacy", command: "pnpm legacy", port: 3100 }],
    });
    expect(runtimeConfig.commands[0]?.port).toEqual({ type: "auto" });
  });

  it("warns when fixed ports collide in the same workspace configuration", () => {
    expect(getConfiguredRuntimeServicePortWarnings([
      { collection: "commands", index: 0, name: "Web", port: 3100, invalidPort: false },
      { collection: "commands", index: 1, name: "Admin", port: 3100, invalidPort: false },
      { collection: "services", index: 0, name: "Worker", port: 3200, invalidPort: false },
    ])).toEqual([
      t("workspaceUi.executionWorkspace.errors.duplicatePort", {
        port: 3100,
        services: "Web, Admin",
      }),
    ]);
  });

  it("localizes generated service names without changing configured names", () => {
    expect(readConfiguredRuntimeServicePorts({
      commands: [{ kind: "service", command: "pnpm dev" }],
    })[0]?.name).toBe(t("workspaceUi.executionWorkspace.runtime.defaultServiceName", { count: 1 }));
  });

  it("preserves auto-port metadata when switching between automatic and fixed ports", () => {
    const runtimeConfig = {
      commands: [{ name: "Web", kind: "service", command: "pnpm dev", port: { type: "auto", envKey: "APP_PORT" } }],
    };
    const [service] = readConfiguredRuntimeServicePorts(runtimeConfig);

    const fixed = updateConfiguredRuntimeServicePort({ runtimeConfig, service: service!, port: "4200" });
    expect(fixed.commands).toEqual([
      { name: "Web", kind: "service", command: "pnpm dev", port: { type: "fixed", envKey: "APP_PORT", value: 4200 } },
    ]);

    expect(updateConfiguredRuntimeServicePort({ runtimeConfig: fixed, service: service!, port: "" }).commands).toEqual([
      { name: "Web", kind: "service", command: "pnpm dev", port: { type: "auto", envKey: "APP_PORT" } },
    ]);
  });

  it("marks malformed and out-of-range configured ports as invalid", () => {
    expect(readConfiguredRuntimeServicePorts({
      commands: [
        { name: "Too high", kind: "service", port: { type: "fixed", value: 70000 } },
        { name: "Fractional", kind: "service", port: 3100.5 },
        { name: "String", kind: "service", port: { type: "fixed", value: "3100" } },
      ],
    })).toEqual([
      { collection: "commands", index: 0, name: "Too high", port: 70000, invalidPort: true },
      { collection: "commands", index: 1, name: "Fractional", port: 3100.5, invalidPort: true },
      { collection: "commands", index: 2, name: "String", port: null, invalidPort: true },
    ]);
  });
});
