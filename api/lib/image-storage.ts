import { createHash, randomUUID } from "node:crypto";

import { env } from "./env";

export const DEFAULT_GENERATED_IMAGES_BUCKET = "generated-images";
const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

type StorageUploadResult = {
  data: unknown;
  error: unknown;
};

type StorageSignedUrlResult = {
  data: { signedUrl?: string } | null;
  error: unknown;
};

type StorageBucketClient = {
  upload(
    path: string,
    body: Buffer,
    options?: {
      cacheControl?: string;
      contentType?: string;
      upsert?: boolean;
    }
  ): Promise<StorageUploadResult>;
  createSignedUrl(
    path: string,
    expiresIn: number
  ): Promise<StorageSignedUrlResult>;
};

type SupabaseStorageClient = {
  storage: {
    from(bucket: string): StorageBucketClient;
  };
};

export type StoredGeneratedImage = {
  filePath: string;
  storageBucket: string;
  storagePath: string;
  byteSize: number;
};

export type ImageObjectStorage = {
  uploadGeneratedImage(input: {
    cacheKey: string;
    bytes: string;
    mimeType: string;
  }): Promise<StoredGeneratedImage>;
  getDisplayUrl(input: {
    storageBucket: string;
    storagePath: string;
  }): Promise<string | null>;
};

export function getGeneratedImagesBucket() {
  return process.env.SUPABASE_GENERATED_IMAGES_BUCKET?.trim()
    ? process.env.SUPABASE_GENERATED_IMAGES_BUCKET.trim()
    : DEFAULT_GENERATED_IMAGES_BUCKET;
}

export function getImageSignedUrlExpiresInSeconds() {
  const configured = Number.parseInt(
    process.env.SUPABASE_IMAGE_SIGNED_URL_SECONDS ?? "",
    10
  );
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS;
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  if ("message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function buildGeneratedImageStoragePath(cacheKey: string, mimeType: string) {
  const digest = createHash("sha256").update(cacheKey).digest("hex");
  const extension = extensionForMimeType(mimeType);
  return `generated/${digest.slice(0, 2)}/${digest}/${randomUUID()}.${extension}`;
}

export function buildStorageFilePath(bucket: string, path: string) {
  return `storage://${bucket}/${path}`;
}

export function parseStorageFilePath(filePath: string) {
  const match = filePath.match(/^storage:\/\/([^/]+)\/(.+)$/u);
  if (!match) return null;
  return {
    storageBucket: match[1],
    storagePath: match[2],
  };
}

export function createSupabaseImageObjectStorage(
  supabase: SupabaseStorageClient
): ImageObjectStorage {
  const getDisplayUrl = async (input: {
    storageBucket: string;
    storagePath: string;
  }) => {
    if (!env.supabaseServiceRoleKey) return null;
    const { data, error } = await supabase.storage
      .from(input.storageBucket)
      .createSignedUrl(
        input.storagePath,
        getImageSignedUrlExpiresInSeconds()
      );

    if (error || !data?.signedUrl) {
      console.error("[image-storage] signed URL creation failed", {
        bucket: input.storageBucket,
        path: input.storagePath,
        error,
      });
      return null;
    }

    return data.signedUrl;
  };

  return {
    async uploadGeneratedImage(input) {
      const storageBucket = getGeneratedImagesBucket();
      const storagePath = buildGeneratedImageStoragePath(
        input.cacheKey,
        input.mimeType
      );
      const body = Buffer.from(input.bytes, "base64");
      const { error } = await supabase.storage
        .from(storageBucket)
        .upload(storagePath, body, {
          cacheControl: "31536000",
          contentType: input.mimeType,
          upsert: false,
        });

      if (error) {
        throw new Error(
          `Supabase Storage upload failed: ${getErrorMessage(error) || "unknown error"}`
        );
      }

      const filePath =
        (await getDisplayUrl({ storageBucket, storagePath })) ??
        buildStorageFilePath(storageBucket, storagePath);

      return {
        filePath,
        storageBucket,
        storagePath,
        byteSize: body.byteLength,
      };
    },

    getDisplayUrl,
  };
}
