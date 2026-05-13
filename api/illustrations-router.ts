import { z } from "zod";

import { createRouter, publicQuery } from "./middleware";
import { illustrations } from "./store";
import {
  buildSemanticCacheKey,
  normalizeSemanticTag,
} from "./lib/image-generation";

export const illustrationsRouter = createRouter({
  list: publicQuery.query(async () => illustrations),
  byTag: publicQuery
    .input(z.object({ tag: z.string() }))
    .query(async ({ input }) => {
      const normalizedTag = normalizeSemanticTag(input.tag);
      return (
        illustrations.find(i => i.semanticTags.includes(normalizedTag)) ??
        illustrations.find(i => i.tag === input.tag) ??
        illustrations.find(i => i.tag.includes(input.tag)) ??
        null
      );
    }),
  bySemanticTags: publicQuery
    .input(z.object({ tags: z.array(z.string()).min(1).max(12) }))
    .query(async ({ input }) => {
      const cacheKey = buildSemanticCacheKey(input.tags);
      return illustrations.find(i => i.cacheKey === cacheKey) ?? null;
    }),
  search: publicQuery
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      const normalizedQuery = normalizeSemanticTag(input.q);
      return illustrations
        .filter(
          i =>
            i.tag.includes(input.q) ||
            i.semanticTags.some(tag => tag.includes(normalizedQuery))
        )
        .slice(0, 20);
    }),
});
