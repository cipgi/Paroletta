import { z } from "zod";

import { createRouter, authedQuery } from "./middleware";
import { illustrations } from "./store";
import {
  buildSemanticCacheKey,
  normalizeSemanticTag,
} from "./lib/image-generation";

const publicIllustrations = () =>
  illustrations.filter(illustration => illustration.source !== "generated");

export const illustrationsRouter = createRouter({
  list: authedQuery.query(async () => publicIllustrations()),
  byTag: authedQuery
    .input(z.object({ tag: z.string() }))
    .query(async ({ input }) => {
      const normalizedTag = normalizeSemanticTag(input.tag);
      const visibleIllustrations = publicIllustrations();
      return (
        visibleIllustrations.find(i =>
          i.semanticTags.includes(normalizedTag)
        ) ??
        visibleIllustrations.find(i => i.tag === input.tag) ??
        visibleIllustrations.find(i => i.tag.includes(input.tag)) ??
        null
      );
    }),
  bySemanticTags: authedQuery
    .input(z.object({ tags: z.array(z.string()).min(1).max(12) }))
    .query(async ({ input }) => {
      const cacheKey = buildSemanticCacheKey(input.tags);
      return publicIllustrations().find(i => i.cacheKey === cacheKey) ?? null;
    }),
  search: authedQuery
    .input(z.object({ q: z.string() }))
    .query(async ({ input }) => {
      const normalizedQuery = normalizeSemanticTag(input.q);
      return publicIllustrations()
        .filter(
          i =>
            i.tag.includes(input.q) ||
            i.semanticTags.some(tag => tag.includes(normalizedQuery))
        )
        .slice(0, 20);
    }),
});
