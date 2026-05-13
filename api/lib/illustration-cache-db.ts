import type { CachedIllustration, ImageCacheDb } from "./image-generation";
import { illustrations } from "../store";

type DbIllustration = {
  id: string;
  tag: string;
  semantic_tags: string[] | null;
  cache_key: string | null;
  file_path: string;
  mime_type: string | null;
  source: "generated" | "uploaded" | "mock" | null;
  generation_model: string | null;
  generated_cost_usd: number | null;
  created_at: string;
};

function toPublicFilePath(filePath: string) {
  const localPrefix = ".data/generated-images/";
  if (filePath.startsWith(localPrefix)) {
    return `/generated-images/${filePath.slice(localPrefix.length)}`;
  }
  return filePath;
}

function mapDbIllustration(row: DbIllustration): CachedIllustration {
  return {
    id: row.id,
    tag: row.tag,
    semanticTags: row.semantic_tags ?? [row.tag],
    cacheKey: row.cache_key ?? row.tag,
    filePath: toPublicFilePath(row.file_path),
    mimeType: row.mime_type,
    source: row.source ?? "uploaded",
    generationModel: row.generation_model,
    generatedCostUsd: row.generated_cost_usd,
    createdAt: row.created_at,
  };
}

type PostgrestLikeClient = {
  from(table: string): {
    select(columns?: string): unknown;
    upsert(values: unknown, options?: unknown): unknown;
  };
};

type PostgrestQuery = {
  eq(column: string, value: unknown): PostgrestQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  single(): Promise<{ data: unknown; error: unknown }>;
};

type PostgrestMutation = {
  select(columns?: string): PostgrestQuery;
};

export function createSupabaseImageCacheDb(
  db: PostgrestLikeClient
): ImageCacheDb {
  return {
    async findByCacheKey(cacheKey) {
      const query = db.from("illustrations").select("*") as PostgrestQuery;
      const { data, error } = await query
        .eq("cache_key", cacheKey)
        .maybeSingle();

      if (error) return null;
      return data ? mapDbIllustration(data as DbIllustration) : null;
    },
    async save(illustration) {
      const { data, error } = await (
        db.from("illustrations").upsert(
          {
            tag: illustration.tag,
            semantic_tags: illustration.semanticTags,
            cache_key: illustration.cacheKey,
            file_path: illustration.filePath,
            mime_type: illustration.mimeType,
            source: illustration.source,
            generation_model: illustration.generationModel,
            generated_cost_usd: illustration.generatedCostUsd,
          },
          { onConflict: "cache_key" }
        ) as PostgrestMutation
      )
        .select("*")
        .single();

      if (error || !data) {
        const fallback: CachedIllustration = {
          ...illustration,
          id: illustration.cacheKey,
          createdAt: new Date().toISOString(),
        };
        illustrations.push({
          tag: fallback.tag,
          semanticTags: fallback.semanticTags,
          cacheKey: fallback.cacheKey,
          filePath: fallback.filePath,
          mimeType: fallback.mimeType ?? null,
          source: fallback.source,
          generationModel: fallback.generationModel ?? null,
          generatedCostUsd: fallback.generatedCostUsd ?? null,
        });
        return fallback;
      }

      return mapDbIllustration(data as DbIllustration);
    },
  };
}

export function createMemoryImageCacheDb(): ImageCacheDb {
  return {
    async findByCacheKey(cacheKey) {
      const found = illustrations.find(item => item.cacheKey === cacheKey);
      return found
        ? {
            tag: found.tag,
            semanticTags: found.semanticTags,
            cacheKey: found.cacheKey,
            filePath: found.filePath,
            mimeType: found.mimeType,
            source: found.source,
            generationModel: found.generationModel,
            generatedCostUsd: found.generatedCostUsd,
          }
        : null;
    },
    async save(illustration) {
      const existingIndex = illustrations.findIndex(
        item => item.cacheKey === illustration.cacheKey
      );
      if (existingIndex >= 0) {
        illustrations[existingIndex] = illustration;
      } else {
        illustrations.push(illustration);
      }
      return {
        ...illustration,
        id: illustration.cacheKey,
        createdAt: new Date().toISOString(),
      };
    },
  };
}
