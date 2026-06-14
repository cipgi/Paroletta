import { createClient } from "@supabase/supabase-js";
import { env, supabaseAdminConfigured, supabaseConfigured } from "./env";

const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseKey = "missing-supabase-key";

if (!supabaseConfigured) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing."
  );
}

if (!supabaseAdminConfigured) {
  console.warn(
    "[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing; admin database operations will fail."
  );
}

export const supabase = createClient(
  env.supabaseUrl || fallbackSupabaseUrl,
  env.supabasePublishableKey || fallbackSupabaseKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export const supabaseServerDb = createClient(
  env.supabaseUrl || fallbackSupabaseUrl,
  env.supabasePublishableKey || fallbackSupabaseKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export const supabaseAdmin = createClient(
  env.supabaseUrl || fallbackSupabaseUrl,
  env.supabaseServiceRoleKey || fallbackSupabaseKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "app" },
  }
);

export function createSupabaseUserDb(accessToken: string) {
  return createClient(
    env.supabaseUrl || fallbackSupabaseUrl,
    env.supabasePublishableKey || fallbackSupabaseKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "app" },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
}
