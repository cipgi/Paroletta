import { supabase } from "./supabase";

export const appDb = () => supabase.schema("app");

export function getSupabaseUserIdFromUnionId(unionId: string): string | null {
  if (!unionId.startsWith("supabase:")) return null;
  return unionId.slice("supabase:".length) || null;
}

