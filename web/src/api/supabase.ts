import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'

let client: Promise<SupabaseClient> | null = null

// Loaded lazily: only clinician screens need supabase-js, so the patient bundle stays small.
export function supabase(): Promise<SupabaseClient> {
  if (!client) {
    client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    )
  }
  return client
}
