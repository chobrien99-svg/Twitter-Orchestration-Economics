import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 * Never import this from a client component.
 */
export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabase.url(), env.supabase.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
