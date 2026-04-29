import { createRouter, publicQuery } from "./middleware";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { illustrations } from "@db/schema";
import { eq, like } from "drizzle-orm";

export const illustrationsRouter = createRouter({
  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(illustrations);
  }),

  byTag: publicQuery
    .input(z.object({ tag: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(illustrations)
        .where(eq(illustrations.tag, input.tag))
        .limit(1);
      if (rows[0]) return rows[0];
      // fallback fuzzy: trigram similarity approximate
      const fuzzy = await db
        .select()
        .from(illustrations)
        .where(like(illustrations.tag, `%${input.tag}%`))
        .limit(1);
      return fuzzy[0] ?? null;
    }),

  search: publicQuery
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(illustrations)
        .where(like(illustrations.tag, `%${input.q}%`))
        .limit(20);
    }),
});
