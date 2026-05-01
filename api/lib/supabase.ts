import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "./env";

if (!supabaseConfigured) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_ANON_KEY is missing.");
}

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
