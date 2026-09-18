// All runtime configuration comes from Vite env vars (see .env.example).
export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  functionsUrl: (import.meta.env.VITE_FUNCTIONS_URL ?? '').replace(/\/$/, ''),
  basePath: import.meta.env.BASE_URL ?? '/',
  mock: import.meta.env.VITE_MOCK === '1' || import.meta.env.VITE_MOCK === 'true',
} as const
