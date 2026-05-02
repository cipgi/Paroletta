import { supabase } from "./supabase";

/**
 * Use fully-qualified table names instead of PostgREST schema switching.
 *
 * Some deployments do not expose the `app` schema via `Accept-Profile`, causing
 * `Invalid schema: app` errors and blocking patient/sheet flows.
 */
export const appDb = () => ({
  from: (table: string) => supabase.from(`app.${table}`),
});

export function getSupabaseUserIdFromUnionId(unionId: string): string | null {
  if (!unionId.startsWith("supabase:")) return null;
  return unionId.slice("supabase:".length) || null;
}
