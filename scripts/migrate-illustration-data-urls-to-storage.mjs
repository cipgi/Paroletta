import "dotenv/config";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_GENERATED_IMAGES_BUCKET || "generated-images";
const batchSize = Number.parseInt(
  process.env.ILLUSTRATION_MIGRATION_BATCH_SIZE || "100",
  10
);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const appDb = supabase.schema("app");

function parseDataUrl(value) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/u);
  if (!match) return null;
  return {
    mimeType: match[1],
    body: Buffer.from(match[2], "base64"),
  };
}

function extensionForMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function buildStoragePath(row, mimeType) {
  const cacheSource = row.cache_key || row.id;
  const digest = createHash("sha256").update(cacheSource).digest("hex");
  return `generated/legacy/${digest.slice(0, 2)}/${row.id}.${extensionForMimeType(mimeType)}`;
}

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });

  if (!error || /already exists/i.test(error.message || "")) return;
  throw new Error(`Could not create Storage bucket "${bucket}": ${error.message}`);
}

async function loadBatch() {
  const { data, error } = await appDb
    .from("illustrations")
    .select("id,cache_key,file_path,mime_type")
    .is("storage_path", null)
    .like("file_path", "data:image/%;base64,%")
    .limit(batchSize);

  if (error) throw new Error(`Could not read illustrations: ${error.message}`);
  return data || [];
}

async function migrateRow(row) {
  const parsed = parseDataUrl(row.file_path);
  if (!parsed) return { skipped: true };

  const mimeType = row.mime_type || parsed.mimeType;
  const storagePath = buildStoragePath(row, mimeType);
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, parsed.body, {
      cacheControl: "31536000",
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload failed for illustration ${row.id}: ${uploadError.message}`);
  }

  const { error: updateError } = await appDb
    .from("illustrations")
    .update({
      file_path: `storage://${bucket}/${storagePath}`,
      storage_bucket: bucket,
      storage_path: storagePath,
      byte_size: parsed.body.byteLength,
      mime_type: mimeType,
    })
    .eq("id", row.id);

  if (updateError) {
    throw new Error(`DB update failed for illustration ${row.id}: ${updateError.message}`);
  }

  return { skipped: false };
}

await ensureBucket();

let migrated = 0;
let skipped = 0;

for (;;) {
  const rows = await loadBatch();
  if (rows.length === 0) break;

  for (const row of rows) {
    const result = await migrateRow(row);
    if (result.skipped) skipped += 1;
    else migrated += 1;
  }

  console.log(`Migrated ${migrated} illustrations, skipped ${skipped}.`);
}

console.log(`Done. Migrated ${migrated} illustrations, skipped ${skipped}.`);
