import devServer from "@hono/vite-dev-server";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function redactVersionMetadata(code: string): string {
  const semverPattern = '\\d+\\.\\d+\\.\\d+(?:[-+][^"\\s]+)?';

  return code
    .replace(
      new RegExp(
        `(\\b(?:version|reconcilerVersion)(?::|=)|__reactRouterVersion=)"${semverPattern}"`,
        "g"
      ),
      '$1"0.0.0"'
    )
    .replace(
      new RegExp(`((?:!==|===|!=|==)\\s*)"${semverPattern}"`, "g"),
      '$1"0.0.0"'
    )
    .replace(new RegExp(`([,(]\\s*)"${semverPattern}"`, "g"), '$1"0.0.0"');
}

function redactDependencyVersionMetadata() {
  return {
    name: "redact-dependency-version-metadata",
    enforce: "post" as const,
    renderChunk: redactVersionMetadata,
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; code?: string }>
    ) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && chunk.code) {
          chunk.code = redactVersionMetadata(chunk.code);
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(),
    redactDependencyVersionMetadata(),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  esbuild: {
    legalComments: "none",
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        generatedCode: "es2015",
      },
    },
  },
});
