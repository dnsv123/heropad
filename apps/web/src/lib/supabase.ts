// TODO: create a singleton Supabase client (anon key, RLS enforced).
// Server-only operations live in apps/api/src/lib/supabase-admin.ts.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error('Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  client = createClient(url, anon);
  return client;
}
