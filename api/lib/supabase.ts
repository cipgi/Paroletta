import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "./env";

if (!supabaseConfigured) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing.");
}

export const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "app" },
});

const serverDbKey = env.supabaseServiceRoleKey || env.supabasePublishableKey;

export const supabaseServerDb = createClient(env.supabaseUrl, serverDbKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "app" },
});
