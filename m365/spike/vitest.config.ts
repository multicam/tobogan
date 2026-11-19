import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Same mapping as tsconfig "paths".
      "@/": root,
      // `server-only` throws unless resolved with the react-server condition,
      // which Next.js sets for server code. Resolve it to the package's own
      // empty module here rather than enabling that condition for react/next.
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Server code only: TSX pages and components are UI, verified by `next build`.
      include: ["lib/**/*.ts", "auth.ts", "app/**/*.ts"],
      exclude: ["**/*.tsx", "next.config.ts", "test/**"],
      reporter: [["text", { skipFull: false }]],
      thresholds: {
        "lib/m365/**": { lines: 100, functions: 100, statements: 100, branches: 95 },
        "{auth.ts,app/**/*.ts}": { lines: 90, functions: 90, statements: 90, branches: 90 },
      },
    },
  },
});
