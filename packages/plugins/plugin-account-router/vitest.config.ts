import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Worker/manifest specs run in node. UI specs (`*.ui-spec.tsx`) opt into
    // jsdom with a per-file `@vitest-environment jsdom` docblock.
    include: ["tests/**/*.spec.ts", "tests/**/*.ui-spec.tsx"],
    environment: "node",
  },
});
