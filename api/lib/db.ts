import { supabase } from "./supabase";

const appSchemaDb = supabase.schema("app");

function isInvalidAppSchemaError(message?: string) {
  return typeof message === "string" && message.toLowerCase().includes("invalid schema") && message.includes("app");
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
  const primary = await run((name: string) => appSchemaDb.from(name));
  if (!primary.error || !isInvalidAppSchemaError(primary.error?.message)) return primary;
  // Fallback for deployments where schema switching via `.schema("app")`
  // is not available and the default API schema is already configured.
  // NOTE: using `from("app.table")` makes PostgREST look for a literal
  // table named `app.table` inside `public`, which causes
  // "Could not find the table 'public.app.<table>' in the schema cache".
  return run((name: string) => supabase.from(name));
}

export function getSupabaseUserIdFromUnionId(unionId: string): string | null {
  if (!unionId.startsWith("supabase:")) return null;
  return unionId.slice("supabase:".length) || null;
}
