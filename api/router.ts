import { authRouter } from "./auth-router";
import { sheetsRouter } from "./sheets-router";
import { subscriptionsRouter } from "./subscriptions-router";
import { aiRouter } from "./ai-router";
import { organizationRouter } from "./organization-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  sheets: sheetsRouter,
  subscriptions: subscriptionsRouter,
  ai: aiRouter,
  organization: organizationRouter,
});

export type AppRouter = typeof appRouter;
