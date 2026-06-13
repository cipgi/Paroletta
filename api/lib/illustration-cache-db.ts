import type {
  CachedIllustration,
  ImageCacheDb,
  ImageCacheScope,
} from "./image-generation";
import type { ImageObjectStorage } from "./image-storage";
import { parseStorageFilePath } from "./image-storage";
import { illustrations } from "../store";

type DbIllustration = {
  id: string;
  tag: string;
  semantic_tags: string[] | null;
  cache_key: string | null;
  file_path: string;
  mime_type: string | null;
  source: "generated" | "uploaded" | "mock" | null;
  storage_bucket: string | null;
  storage_path: string | null;
  byte_size: number | null;
  generation_model: string | null;
  generated_cost_usd: number | null;
  owner_user_id: string | null;
  sheet_id: string | null;
  created_at: string;
};

function toPublicFilePath(filePath: string) {
  const localPrefix = ".data/generated-images/";
  if (filePath.startsWith(localPrefix)) {
    return `/generated-images/${filePath.slice(localPrefix.length)}`;
  }
  return filePath;
}

async function mapDbIllustration(
  row: DbIllustration,
  imageStorage?: ImageObjectStorage
): Promise<CachedIllustration> {
  const parsedStoragePath = parseStorageFilePath(row.file_path);
  const storageBucket =
    row.storage_bucket ?? parsedStoragePath?.storageBucket ?? null;
  const storagePath = row.storage_path ?? parsedStoragePath?.storagePath ?? null;
  const signedFilePath =
    imageStorage && storageBucket && storagePath
      ? await imageStorage.getDisplayUrl({ storageBucket, storagePath })
      : null;

  return {
    id: row.id,
    tag: row.tag,
    semanticTags: row.semantic_tags ?? [row.tag],
    cacheKey: row.cache_key ?? row.tag,
    filePath: signedFilePath ?? toPublicFilePath(row.file_path),
    mimeType: row.mime_type,
    source: row.source ?? "uploaded",
    storageBucket,
    storagePath,
    byteSize: row.byte_size,
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
  db: PostgrestLikeClient,
  options: { imageStorage?: ImageObjectStorage; cacheScope?: ImageCacheScope } =
    {}
): ImageCacheDb {
  return {
    async findByCacheKey(cacheKey, methodScope) {
      const scope = methodScope ?? options.cacheScope;
      let query = db.from("illustrations").select("*") as PostgrestQuery;
      query = query.eq("cache_key", cacheKey);
      if (scope) {
        query = query
          .eq("owner_user_id", scope.ownerUserId)
          .eq("sheet_id", scope.sheetId);
      }
      const { data, error } = await query.maybeSingle();

      if (error) return null;
      return data
        ? mapDbIllustration(data as DbIllustration, options.imageStorage)
        : null;
    },
    async save(illustration, methodScope) {
      const scope = methodScope ?? options.cacheScope;
      const { data, error } = await (
        db.from("illustrations").upsert(
          {
            tag: illustration.tag,
            semantic_tags: illustration.semanticTags,
            cache_key: illustration.cacheKey,
            owner_user_id: scope?.ownerUserId ?? null,
            sheet_id: scope?.sheetId ?? null,
            file_path: illustration.filePath,
            mime_type: illustration.mimeType,
            source: illustration.source,
            storage_bucket: illustration.storageBucket ?? null,
            storage_path: illustration.storagePath ?? null,
            byte_size: illustration.byteSize ?? null,
            generation_model: illustration.generationModel,
            generated_cost_usd: illustration.generatedCostUsd ?? 0,
          },
          {
            onConflict: scope
              ? "owner_user_id,sheet_id,cache_key"
              : "cache_key",
          }
        ) as PostgrestMutation
      )
        .select("*")
        .single();

      if (error || !data) {
        const fallback: CachedIllustration = {
          ...illustration,
          id: illustration.cacheKey,
          generatedCostUsd: illustration.generatedCostUsd ?? 0,
          createdAt: new Date().toISOString(),
        };
        if (!scope && fallback.source !== "generated") {
          illustrations.push({
            tag: fallback.tag,
            semanticTags: fallback.semanticTags,
            cacheKey: fallback.cacheKey,
            filePath: fallback.filePath,
            mimeType: fallback.mimeType ?? null,
            source: fallback.source,
            storageBucket: fallback.storageBucket ?? null,
            storagePath: fallback.storagePath ?? null,
            byteSize: fallback.byteSize ?? null,
            fallbackReason: fallback.fallbackReason ?? null,
            generationModel: fallback.generationModel ?? null,
            generatedCostUsd: fallback.generatedCostUsd ?? 0,
          });
        }
        return fallback;
      }

      return mapDbIllustration(data as DbIllustration, options.imageStorage);
    },
  };
}

export function createMemoryImageCacheDb(): ImageCacheDb {
  return {
    async findByCacheKey(cacheKey, scope) {
      if (scope) return null;
      const found = illustrations.find(item => item.cacheKey === cacheKey);
      return found
        ? {
            tag: found.tag,
            semanticTags: found.semanticTags,
            cacheKey: found.cacheKey,
            filePath: found.filePath,
            mimeType: found.mimeType,
            source: found.source,
            storageBucket: found.storageBucket ?? null,
            storagePath: found.storagePath ?? null,
            byteSize: found.byteSize ?? null,
            fallbackReason: found.fallbackReason ?? null,
            generationModel: found.generationModel,
            generatedCostUsd: found.generatedCostUsd,
          }
        : null;
    },
    async save(illustration, scope) {
      if (scope) {
        return {
          ...illustration,
          id: illustration.cacheKey,
          createdAt: new Date().toISOString(),
        };
      }
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
