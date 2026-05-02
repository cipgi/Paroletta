import { createRouter, publicQuery } from "./middleware";
import { z } from "zod";
import { illustrations } from "./store";

export const illustrationsRouter = createRouter({
  list: publicQuery.query(async () => illustrations),
  byTag: publicQuery.input(z.object({ tag: z.string() })).query(async ({ input }) => illustrations.find((i)=>i.tag===input.tag) ?? illustrations.find((i)=>i.tag.includes(input.tag)) ?? null),
  search: publicQuery.input(z.object({ q: z.string() })).query(async ({ input }) => illustrations.filter((i)=>i.tag.includes(input.q)).slice(0,20)),
});
