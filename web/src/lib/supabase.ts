import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let client: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
        "These are backend-only and must never be exposed to the browser.",
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}

/**
 * Server-only Supabase client using the service role key.
 *
 * WARNING: The service role key bypasses Row Level Security. Every operation
 * performed with this client must enforce ownership and authorization
 * explicitly in application code. Never import this file from browser code.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const value = Reflect.get(getSupabaseClient(), property);
    return typeof value === "function" ? value.bind(getSupabaseClient()) : value;
  },
});
