import { authRouter } from "./auth-router";
import { sheetsRouter } from "./sheets-router";
import { illustrationsRouter } from "./illustrations-router";
import { subscriptionsRouter } from "./subscriptions-router";
import { aiRouter } from "./ai-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  sheets: sheetsRouter,
  illustrations: illustrationsRouter,
  subscriptions: subscriptionsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
