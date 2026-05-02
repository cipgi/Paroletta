import { supabase } from "./supabase";

const appSchemaDb = supabase.schema("app");

function isInvalidAppSchemaError(error: any) {
  const message = typeof error?.message === "string" ? error.message : "";
  const details = typeof error?.details === "string" ? error.details : "";
  const combined = `${message} ${details}`.toLowerCase();
  return combined.includes("invalid schema") && combined.includes("app");
}

/**
 * Default app DB accessor (schema switching).
 */
export const appDb = () => appSchemaDb;

/**
 * Runs a query against schema `app` first, then retries using fully-qualified
 * table names when a deployment does not allow schema switching.
 */
export async function queryAppTable(
  run: (from: (name: string) => any) => Promise<{ data: any; error: any }>,
): Promise<{ data: any; error: any }> {
  let primary: { data: any; error: any } | null = null;
  try {
    primary = await run((name: string) => appSchemaDb.from(name));
  } catch (error: any) {
    if (!isInvalidAppSchemaError(error)) throw error;
    primary = { data: null, error };
  }

  if (!primary.error || !isInvalidAppSchemaError(primary.error)) return primary;

  // Fallback for deployments where schema `app` is not exposed to PostgREST.
  // Retry first on default schema, then via fully-qualified table name.
  const defaultSchemaResult = await run((name: string) => supabase.from(name));
  if (!defaultSchemaResult.error) return defaultSchemaResult;

  return run((name: string) => supabase.from(`app.${name}`));
}

export function getSupabaseUserIdFromUnionId(unionId: string): string | null {
  if (!unionId.startsWith("supabase:")) return null;
  return unionId.slice("supabase:".length) || null;
}
