import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { getSafeHttpErrorBody, logServerError } from "./lib/errors";
import { securityHeaders } from "./lib/security-headers";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(
  "*",
  securityHeaders({
    cspMode: env.securityCspMode,
    isProduction: env.isProduction,
  })
);
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      logServerError(error, { path, type, url: c.req.url });
    },
  });
});
app.all("/api/*", c => c.json(getSafeHttpErrorBody(404), 404));

export default app;

if (env.isProduction) {
  const { mkdir } = await import("node:fs/promises");
  const { serve } = await import("@hono/node-server");
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const { serveStaticFiles } = await import("./lib/vite");

  await mkdir(".data/generated-images", { recursive: true });
  app.use("/generated-images/*", serveStatic({ root: ".data" }));
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  let isShuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`Received ${signal}; shutting down gracefully.`);
    server.close(error => {
      if (error) {
        console.error("Error while closing the server:", error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
