import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { companies, createDb, issues } from "@paperclipai/db";
import { buildHostServices } from "../services/plugin-host-services.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDatabase = support.supported ? describe : describe.skip;

describeDatabase("plugin host issue pagination", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let companyId: string;
  let services: ReturnType<typeof buildHostServices>;
  let expectedIds: string[];

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-plugin-pagination-");
    db = createDb(tempDb.connectionString);
    const [company] = await db.insert(companies).values({
      name: "Pagination fixture",
      issuePrefix: `PG${randomUUID().slice(0, 6).toUpperCase()}`,
    }).returning();
    companyId = company!.id;
    expectedIds = Array.from({ length: 7 }, () => randomUUID());
    await db.insert(issues).values(expectedIds.map((id, index) => ({
      id,
      companyId,
      title: `Pagination issue ${index}`,
      status: index === 6 ? "done" : "todo",
      priority: index < 3 ? "high" : "low",
      createdAt: new Date(Date.UTC(2026, 0, index + 1)),
      updatedAt: new Date(Date.UTC(2026, 0, index + 1)),
    })));
    services = buildHostServices(db, "pagination-test-plugin", "pagination-test", {
      forPlugin: () => ({ emit: vi.fn(), subscribe: vi.fn(), clear: vi.fn() }),
    } as never);
  }, 20_000);

  afterAll(async () => {
    services?.dispose();
    await tempDb?.cleanup();
  });

  it("returns every issue exactly once across full and partial pages", async () => {
    const all = await services.issues.list({ companyId });
    expect(all).toHaveLength(expectedIds.length);
    const collected: string[] = [];
    for (const offset of [0, 3, 6, 9]) {
      const page = await services.issues.list({ companyId, limit: 3, offset });
      expect(page.map((row) => row.id)).toEqual(all.slice(offset, offset + 3).map((row) => row.id));
      collected.push(...page.map((row) => row.id));
    }
    expect(collected).toEqual(all.map((row) => row.id));
    expect(new Set(collected).size).toBe(expectedIds.length);
  });

  it("applies offset once when no limit is supplied", async () => {
    const all = await services.issues.list({ companyId });
    const tail = await services.issues.list({ companyId, offset: 2 });
    expect(tail.map((row) => row.id)).toEqual(all.slice(2).map((row) => row.id));
  });

  it("paginates after status filtering", async () => {
    const params = { companyId, status: "todo" };
    const all = await services.issues.list(params);
    expect(all).toHaveLength(6);
    const second = await services.issues.list({ ...params, limit: 2, offset: 2 });
    expect(second.map((row) => row.id)).toEqual(all.slice(2, 4).map((row) => row.id));
  });

  it("keeps zero limit empty", async () => {
    expect(await services.issues.list({ companyId, limit: 0, offset: 2 })).toEqual([]);
  });

  it("normalizes fractional windows before sending them to the issue service", async () => {
    const all = await services.issues.list({ companyId });
    const page = await services.issues.list({ companyId, limit: 2.9, offset: 2.9 });
    expect(page.map((row) => row.id)).toEqual(all.slice(2, 4).map((row) => row.id));
  });

  it("preserves numeric-string window normalization at the host boundary", async () => {
    const all = await services.issues.list({ companyId });
    const page = await services.issues.list({ companyId, limit: "2", offset: "2" } as never);
    expect(page.map((row) => row.id)).toEqual(all.slice(2, 4).map((row) => row.id));
  });

  it("keeps the plugin origin read guard even for an empty window", async () => {
    await expect(services.issues.list({
      companyId,
      originKind: "plugin:another-plugin",
      limit: 0,
    })).rejects.toThrow("Plugin may only use originKind values under plugin:pagination-test");
  });
});
