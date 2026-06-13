import { describe, expect, it, vi } from "vitest";

import { createSupabaseImageCacheDb } from "./illustration-cache-db";
import type { ImageObjectStorage } from "./image-storage";

const dbRow = {
  id: "illustration-id",
  tag: "Target",
  semantic_tags: ["ruolo:target"],
  cache_key: "ruolo:target",
  file_path: "storage://generated-images/generated/test.png",
  mime_type: "image/png",
  source: "generated" as const,
  storage_bucket: "generated-images",
  storage_path: "generated/test.png",
  byte_size: 123,
  generation_model: "gpt-image-2",
  generated_cost_usd: 0,
  owner_user_id: "owner-id",
  sheet_id: "sheet-id",
  created_at: "2026-01-01T00:00:00.000Z",
};

describe("Supabase illustration cache db", () => {
  it("maps Storage-backed cache rows to signed display URLs", async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: dbRow, error: null })),
      single: vi.fn(),
    };
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => query),
        upsert: vi.fn(),
      })),
    };
    const imageStorage: ImageObjectStorage = {
      async uploadGeneratedImage() {
        throw new Error("upload should not be called");
      },
      async getDisplayUrl(input) {
        expect(input).toEqual({
          storageBucket: "generated-images",
          storagePath: "generated/test.png",
        });
        return "https://storage.example/signed-url";
      },
    };

    const cache = createSupabaseImageCacheDb(db, { imageStorage });
    const result = await cache.findByCacheKey("ruolo:target");

    expect(result?.filePath).toBe("https://storage.example/signed-url");
    expect(result?.storageBucket).toBe("generated-images");
    expect(result?.storagePath).toBe("generated/test.png");
    expect(result?.byteSize).toBe(123);
  });

  it("filters cache hits by owner and sheet scope before signing URLs", async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: dbRow, error: null })),
      single: vi.fn(),
    };
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => query),
        upsert: vi.fn(),
      })),
    };

    const cache = createSupabaseImageCacheDb(db, {
      cacheScope: { ownerUserId: "owner-id", sheetId: "sheet-id" },
    });
    await cache.findByCacheKey("ruolo:target");

    expect(query.eq).toHaveBeenCalledWith("cache_key", "ruolo:target");
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", "owner-id");
    expect(query.eq).toHaveBeenCalledWith("sheet_id", "sheet-id");
  });

  it("persists Storage metadata when saving generated illustrations", async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(),
      single: vi.fn(async () => ({ data: dbRow, error: null })),
    };
    const upsert = vi.fn(() => ({
      select: vi.fn(() => query),
    }));
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(),
        upsert,
      })),
    };
    const imageStorage: ImageObjectStorage = {
      async uploadGeneratedImage() {
        throw new Error("upload should not be called");
      },
      async getDisplayUrl() {
        return "https://storage.example/signed-url";
      },
    };

    const cache = createSupabaseImageCacheDb(db, { imageStorage });
    const result = await cache.save({
      tag: "Target",
      semanticTags: ["ruolo:target"],
      cacheKey: "ruolo:target",
      filePath: "storage://generated-images/generated/test.png",
      mimeType: "image/png",
      source: "generated",
      storageBucket: "generated-images",
      storagePath: "generated/test.png",
      byteSize: 123,
      generationModel: "gpt-image-2",
      generatedCostUsd: 0,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        file_path: "storage://generated-images/generated/test.png",
        storage_bucket: "generated-images",
        storage_path: "generated/test.png",
        byte_size: 123,
      }),
      { onConflict: "cache_key" }
    );
    expect(result.filePath).toBe("https://storage.example/signed-url");
  });

  it("persists generated cache rows with owner and sheet scope", async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(),
      single: vi.fn(async () => ({ data: dbRow, error: null })),
    };
    const upsert = vi.fn(() => ({
      select: vi.fn(() => query),
    }));
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(),
        upsert,
      })),
    };

    const cache = createSupabaseImageCacheDb(db, {
      cacheScope: { ownerUserId: "owner-id", sheetId: "sheet-id" },
    });
    await cache.save({
      tag: "Target",
      semanticTags: ["ruolo:target"],
      cacheKey: "ruolo:target",
      filePath: "storage://generated-images/generated/test.png",
      mimeType: "image/png",
      source: "generated",
      storageBucket: "generated-images",
      storagePath: "generated/test.png",
      byteSize: 123,
      generationModel: "gpt-image-2",
      generatedCostUsd: 0,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_user_id: "owner-id",
        sheet_id: "sheet-id",
      }),
      { onConflict: "owner_user_id,sheet_id,cache_key" }
    );
  });
});
