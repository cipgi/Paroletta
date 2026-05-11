import { createClient } from "@supabase/supabase-js";
import { env, supabaseConfigured } from "./env";

if (!supabaseConfigured) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing."
  );
}

export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export const supabaseServerDb = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export function createSupabaseUserDb(accessToken: string) {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
